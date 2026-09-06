import type { MeshLink, NodeKind, NodeTelemetry } from './types';

/**
 * Static geographic seed for the LoRa mesh. 
 * Coordinates are ordered upstream -> downstream, with the Central
 * Gateway at the headwaters monitoring station.
 */
export interface SeedNode {
  id: string;
  kind: NodeKind;
  name: string;
  lat: number;
  lng: number;
  parent: string | null;
}

// 1. UPDATED TO 4-NODE DIAMOND
export const SEED_NODES: SeedNode[] = [
  { id: 'GW-01', kind: 'gateway', name: 'Central Gateway (North)', lat: 7.2600, lng: 80.5950, parent: null },
  { id: 'RT-01', kind: 'router', name: 'West Router (Primary)', lat: 7.2500, lng: 80.5850, parent: 'GW-01' },
  { id: 'RT-02', kind: 'router', name: 'East Router (Backup)', lat: 7.2500, lng: 80.6050, parent: 'GW-01' },
  { id: 'SN-01', kind: 'sensor', name: 'River Sensor (South)', lat: 7.2400, lng: 80.5950, parent: 'RT-01' }
];

/** 
 * The hardware's ideal "Routing Table". 
 * This is the closest/best node they will always try to use first.
 */
export const PRIMARY_ROUTES: Record<string, string> = {
  'RT-01': 'GW-01',
  'RT-02': 'GW-01',
  'SN-01': 'RT-01', // Sensor ideally wants to use the West Router
};

export const DANGER_LEVEL_CM = 320;
export const WARN_LEVEL_CM = 270;

/**
 * Compute the active mesh links by comparing what the hardware ACTUALLY used
 * versus what it WANTED to use based on its Primary Routing Table.
 */
export function computeLinks(nodes: NodeTelemetry[]): MeshLink[] {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const links: MeshLink[] = [];
  const added = new Set<string>();

  const push = (fromId: string, toId: string, active: boolean) => {
    const key = `${fromId}->${toId}-${active}`;
    if (added.has(key)) return;
    added.add(key);
    links.push({ from_id: fromId, to_id: toId, active });
  };

  const sensors = nodes.filter((n) => n.kind === 'sensor');

  for (const sensor of sensors) {
    let currentNode: NodeTelemetry | undefined = sensor;

    while (currentNode && currentNode.is_active && currentNode.parent_node_id) {
      const actualParentId = currentNode.parent_node_id; 
      const primaryParentId = PRIMARY_ROUTES[currentNode.node_id]; 
      
      const actualParent = byId.get(actualParentId);
      // STRICT CHECK: Is the node it is trying to send to actually alive?
      const isActualParentAlive = actualParent && actualParent.is_active;

      // 1. Draw the actual physical attempt
      if (isActualParentAlive) {
        push(currentNode.node_id, actualParentId, true); // Success: Solid Blue
      } else {
        push(currentNode.node_id, actualParentId, false); // Failed: Dashed Red
      }

      // 2. Draw the failed primary link (if the system failed over)
      if (primaryParentId && actualParentId !== primaryParentId) {
        push(currentNode.node_id, primaryParentId, false); 
      }
      
      // 3. ONLY continue tracing to the gateway if the parent received the data!
      if (isActualParentAlive) {
        currentNode = actualParent;
      } else {
        break; // Stop drawing! The signal died here.
      }
    }
  }

  return links;
}

/**
 * Walk the active links from a given node up to the gateway and return the
 * ordered list of node ids along the active path (inclusive).
 */
export function activePathToGateway(
  nodeId: string,
  nodes: NodeTelemetry[],
  links: MeshLink[],
): string[] {
  const activeFrom = new Map<string, string>();
  for (const l of links) {
    if (l.active) activeFrom.set(l.from_id, l.to_id);
  }
  const path: string[] = [nodeId];
  let cur = nodeId;
  const guard = new Set<string>();
  while (true) {
    if (guard.has(cur)) break; // cycle guard
    guard.add(cur);
    const next = activeFrom.get(cur);
    if (!next) break;
    path.push(next);
    cur = next;
    if (nodes.find((n) => n.node_id === cur)?.kind === 'gateway') break;
  }
  return path;
}
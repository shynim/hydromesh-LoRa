// Shared domain types for the HydroMesh flood-warning dashboard.

export type NodeKind = 'gateway' | 'sensor' | 'router';

export interface NodeTelemetry {
  node_id: string;
  kind: NodeKind;
  name: string;
  lat: number;
  lng: number;
  parent_node_id: string | null;
  battery_percent: number;
  is_charging: boolean;
  is_active: boolean;
  water_level_cm: number | null; // only present for the river sensor node
  rssi: number; // signal strength dBm
  last_seen: number; // epoch ms
}

/** Payload shape posted by an ESP32 gateway to POST /api/node-update */
export interface Esp32Payload {
  node_id: string;
  kind?: NodeKind;
  name?: string;
  lat: number;
  lng: number;
  parent_node_id: string | null;
  battery_percent: number;
  is_charging: boolean;
  is_active: boolean;
  water_level_cm?: number | null;
  rssi?: number;
  last_seen?: number;
}

export interface MeshLink {
  from_id: string;
  to_id: string;
  active: boolean; // true = live route segment, false = dead/down link
}

export interface NetworkStats {
  total: number;
  active: number;
  critical: number; // battery < 20% OR recently recovered
  dead: number; // !is_active
  alerts: number; // water_level >= danger threshold
}

export type WsMessage =
  | { type: 'telemetry'; payload: NodeTelemetry }
  | { type: 'snapshot'; payload: NodeTelemetry[] };

export interface LevelPoint {
  t: number; // epoch ms
  label: string; // display label
  level: number; // water level cm
}

export type HistoryRange = 'live' | 'daily' | 'weekly' | 'custom';

export type LogKind = 'tx' | 'rx' | 'alert' | 'sys';

export interface LogEntry {
  id: number;
  ts: number;
  raw: string;
  kind: LogKind;
}

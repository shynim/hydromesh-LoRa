import { memo, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MeshLink, NodeTelemetry } from '@/types';
import { SEED_NODES } from '@/mesh';

interface MapViewProps {
  nodes: NodeTelemetry[];
  links: MeshLink[];
}

/**
 * Build a clean, solid glowing color blip — no inner text or icons.
 * Green = active, Yellow = low battery, Red/Grey = dead.
 */
function buildDivIcon(node: NodeTelemetry): L.DivIcon {
  const active = node.is_active;
  const low = node.battery_percent < 20;
  const blipColor = active ? (low ? '#f59e0b' : '#22c55e') : '#737373';
  const ringColor = active ? blipColor : '#ef4444';

  const pingHtml = active
    ? `<span class="node-ping" style="background:${ringColor};opacity:.4;animation:pulseRing 2s ease-out infinite"></span>`
    : '';
  const deadRing = !active
    ? `<span class="node-ping" style="border:2px solid #ef4444;opacity:.5;animation:pulseRing 2.5s ease-out infinite"></span>`
    : '';

  const batteryBadge = buildBatteryBadge(node);

  // FLATTENED 2D BLIP: Removed radial-gradient, box-shadow, and glowClass
  const html = `
    <div style="position:relative;width:16px;height:16px;display:flex;align-items:center;justify-content:center;">
      ${pingHtml}
      ${deadRing}
      <div class="node-blip" style="width:14px;height:14px;background-color:${blipColor};border:2px solid #ffffff;border-radius:50%;box-sizing:border-box;"></div>
      ${batteryBadge}
    </div>`;
    
  return L.divIcon({
    className: 'node-marker',
    html,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function buildBatteryBadge(node: NodeTelemetry): string {
  const pct = Math.max(0, Math.min(100, Math.round(node.battery_percent)));
  const charging = node.is_charging;
  const low = pct < 20 && !charging;

  const fillColor = charging ? '#22c55e' : (low ? '#ef4444' : '#ffffff');
  const textColor = charging ? '#4ade80' : (low ? '#f87171' : '#f8fafc');

  const exactHeight = 10; 
  const batteryWidth = 20;
  
  // 1. Horizontal Battery with Inside Bolt
  const batteryIcon = `
    <div style="display:flex; align-items:center;">
      <!-- Main Battery Body -->
      <div style="position:relative; width:${batteryWidth}px; height:${exactHeight}px; border:1px solid #94a3b8; border-radius:2.5px; padding:1px; box-sizing:border-box; display:flex; align-items:center;">
        
        <!-- The Fill -->
        <div style="height:100%; width:${pct}%; background:${fillColor}; border-radius:1px; transition:width 0.4s ease, background 0.3s ease;"></div>
        
        <!-- The Charging Bolt (Overlaid absolutely in the center of the battery) -->
        ${charging ? `
          <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:10;">
            <!-- Height kept at 18 to make it cross the battery -->
            <svg viewBox="0 0 24 24" width="10" height="18" preserveAspectRatio="none">
              <polygon fill="#022c22" points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
        ` : ''}

      </div>
      <!-- Positive Terminal (Small Nub) -->
      <div style="width:1.5px; height:5px; background:#94a3b8; border-radius:0 2px 2px 0;"></div>
    </div>`;

  // 2. Text strictly sized and aligned
  // COMPACT: Changed font-weight to 400 (normal) and margin-left to 4px
  const percentageText = `
    <div style="display:flex; align-items:center; font-family:sans-serif; font-size:${exactHeight + 1}px; font-weight:400; color:${textColor}; line-height:1; margin-left:4px;">
      ${pct}%
    </div>`;

  // 3. Shifted higher using negative top margin to force it above the blip
  return `
    <div class="node-battery-badge" style="position:absolute; top:-22px; left:9px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; z-index:1000; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5)); pointer-events:none;">
      
      <!-- COMPACT CONTAINER: Height reduced to 20px, padding reduced to 3px 6px -->
      <div style="background:rgba(15, 23, 42, 0.9); backdrop-filter:blur(4px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:3px 6px; display:flex; align-items:center; justify-content:center; height:20px; box-sizing:border-box;">
        ${batteryIcon}
        ${percentageText}
      </div>

      <!-- Bubble Pointer (Tail) -->
      <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:5px solid rgba(15, 23, 42, 0.9); margin-top:-0.5px;"></div>
      
    </div>`;
}

function MapViewInner({ nodes, links }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<Map<string, L.Marker>>(new Map());
  const linkLayerRef = useRef<L.LayerGroup | null>(null);
  const nodeLayerRef = useRef<L.LayerGroup | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (ready || !containerRef.current || mapRef.current) return;
    if (typeof window === 'undefined') return;
    
    // CHANGE 1: We check the physical DOM element's height instead of the React state
    if (containerRef.current.clientHeight < 50) return;

    const map = L.map(containerRef.current, {
      center: [46.82, -121.725],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'map-tiles'
    }).addTo(map);
    
    linkLayerRef.current = L.layerGroup().addTo(map);
    nodeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const bounds = L.latLngBounds(SEED_NODES.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.25));
    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current.clear();
      linkLayerRef.current = null;
      nodeLayerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && ready) {
      mapRef.current.invalidateSize();
    }
  }, [size, ready]);

  useEffect(() => {
    const layer = nodeLayerRef.current;
    if (!layer || !ready) return;
    const existing = markerRef.current;

    for (const node of nodes) {
      const latlng: L.LatLngExpression = [node.lat, node.lng];
      let marker = existing.get(node.node_id);
      if (!marker) {
        marker = L.marker(latlng, { icon: buildDivIcon(node), zIndexOffset: node.kind === 'gateway' ? 1000 : 500 });
        marker.addTo(layer);
        existing.set(node.node_id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(buildDivIcon(node));
      }
    }
  }, [nodes, ready]);

  useEffect(() => {
    const layer = linkLayerRef.current;
    if (!layer || !ready) return;
    const byId = new Map(nodes.map((n) => [n.node_id, n] as const));
    layer.clearLayers();

    for (const link of links) {
      const from = byId.get(link.from_id);
      const to = byId.get(link.to_id);
      if (!from || !to) continue;
      const latlngs: L.LatLngExpression[] = [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ];
      if (link.active) {
        L.polyline(latlngs, { color: '#2f9eff', weight: 2.5, opacity: 0.85, smoothFactor: 1 }).addTo(layer);
      } else {
        L.polyline(latlngs, { color: '#ef4444', weight: 2, opacity: 0.8, dashArray: '8 6', className: 'mesh-dead' }).addTo(layer);
      }
    }
  }, [links, nodes, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 200 }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-ash-300">
          Initialising mesh map…
        </div>
      )}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col gap-1.5 rounded-lg border border-ash-600/60 bg-ash-900/90 px-3 py-2 backdrop-blur">
        <LegendRow color="#22c55e" label="Active" />
        <LegendRow color="#f59e0b" label="Low Battery" />
        <LegendRow color="#ef4444" label="Dead Node" />
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-ash-600/60 bg-ash-900/90 px-3 py-1.5 backdrop-blur">
        <span className="font-mono text-[10px] text-ash-200">
          {nodes.filter((n) => n.is_active).length}/{nodes.length} nodes online ·{' '}
          {links.filter((l) => l.active).length} active hops
        </span>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="text-[10px] text-ash-200">{label}</span>
    </div>
  );
}

function LegendLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 w-2.5 items-center justify-center">
        <div className="h-[2px] w-full bg-[#2f9eff]" />
      </div>
      <span className="text-[10px] text-ash-200">{label}</span>
    </div>
  );
}

export const MapView = memo(MapViewInner);

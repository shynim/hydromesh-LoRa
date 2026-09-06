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
  water_level_cm: number | null;
  rssi: number;
  last_seen: number;
}

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

export type WsMessage =
  | { type: 'telemetry'; payload: NodeTelemetry }
  | { type: 'snapshot'; payload: NodeTelemetry[] };

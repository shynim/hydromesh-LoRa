import Database from 'better-sqlite3';
import type { NodeTelemetry } from './types.js';

export type DB = Database.Database;

/**
 * SQLite schema:
 *  - node_telemetry: append-only raw log of every telemetry packet received.
 *  - node_state:     latest state per node (upserted) for fast snapshots.
 */
export function openDb(): DB {
  const dbPath = process.env.DB_PATH || 'data/hydromesh.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS node_telemetry (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at   INTEGER NOT NULL,
      node_id       TEXT    NOT NULL,
      kind          TEXT    NOT NULL,
      name          TEXT,
      lat           REAL    NOT NULL,
      lng           REAL    NOT NULL,
      parent_node_id TEXT,
      battery_percent REAL NOT NULL,
      is_charging   INTEGER NOT NULL,
      is_active     INTEGER NOT NULL,
      water_level_cm REAL,
      rssi          INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tel_node_time ON node_telemetry(node_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_tel_time ON node_telemetry(received_at);

    CREATE TABLE IF NOT EXISTS node_state (
      node_id       TEXT PRIMARY KEY,
      kind          TEXT    NOT NULL,
      name          TEXT,
      lat           REAL    NOT NULL,
      lng           REAL    NOT NULL,
      parent_node_id TEXT,
      battery_percent REAL NOT NULL,
      is_charging   INTEGER NOT NULL,
      is_active     INTEGER NOT NULL,
      water_level_cm REAL,
      rssi          INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
  `);

  return db;
}

const insertTelStmt = (db: DB) =>
  db.prepare(
    `INSERT INTO node_telemetry
      (received_at, node_id, kind, name, lat, lng, parent_node_id, battery_percent, is_charging, is_active, water_level_cm, rssi, last_seen)
     VALUES (@received_at, @node_id, @kind, @name, @lat, @lng, @parent_node_id, @battery_percent, @is_charging, @is_active, @water_level_cm, @rssi, @last_seen)`,
  );

const upsertStateStmt = (db: DB) =>
  db.prepare(
    `INSERT INTO node_state
      (node_id, kind, name, lat, lng, parent_node_id, battery_percent, is_charging, is_active, water_level_cm, rssi, last_seen, updated_at)
     VALUES (@node_id, @kind, @name, @lat, @lng, @parent_node_id, @battery_percent, @is_charging, @is_active, @water_level_cm, @rssi, @last_seen, @updated_at)
     ON CONFLICT(node_id) DO UPDATE SET
       kind=excluded.kind, name=excluded.name, lat=excluded.lat, lng=excluded.lng,
       parent_node_id=excluded.parent_node_id, battery_percent=excluded.battery_percent,
       is_charging=excluded.is_charging, is_active=excluded.is_active,
       water_level_cm=excluded.water_level_cm, rssi=excluded.rssi,
       last_seen=excluded.last_seen, updated_at=excluded.updated_at`,
  );

export function insertTelemetry(db: DB, t: NodeTelemetry): void {
  const now = Date.now();
  const ins = insertTelStmt(db);
  const ups = upsertStateStmt(db);
  ins.run({
    received_at: now,
    node_id: t.node_id,
    kind: t.kind,
    name: t.name,
    lat: t.lat,
    lng: t.lng,
    parent_node_id: t.parent_node_id,
    battery_percent: t.battery_percent,
    is_charging: t.is_charging ? 1 : 0,
    is_active: t.is_active ? 1 : 0,
    water_level_cm: t.water_level_cm,
    rssi: t.rssi,
    last_seen: t.last_seen,
  });
  ups.run({
    node_id: t.node_id,
    kind: t.kind,
    name: t.name,
    lat: t.lat,
    lng: t.lng,
    parent_node_id: t.parent_node_id,
    battery_percent: t.battery_percent,
    is_charging: t.is_charging ? 1 : 0,
    is_active: t.is_active ? 1 : 0,
    water_level_cm: t.water_level_cm,
    rssi: t.rssi,
    last_seen: t.last_seen,
    updated_at: now,
  });
}

interface StateRow {
  node_id: string;
  kind: string;
  name: string;
  lat: number;
  lng: number;
  parent_node_id: string | null;
  battery_percent: number;
  is_charging: number;
  is_active: number;
  water_level_cm: number | null;
  rssi: number;
  last_seen: number;
}

function rowToTelemetry(r: StateRow): NodeTelemetry {
  return {
    node_id: r.node_id,
    kind: r.kind as NodeTelemetry['kind'],
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    parent_node_id: r.parent_node_id,
    battery_percent: r.battery_percent,
    is_charging: !!r.is_charging,
    is_active: !!r.is_active,
    water_level_cm: r.water_level_cm,
    rssi: r.rssi,
    last_seen: r.last_seen,
  };
}

export function getRecentSnapshot(db: DB): NodeTelemetry[] {
  const rows = db.prepare('SELECT * FROM node_state ORDER BY last_seen DESC').all() as StateRow[];
  return rows.map(rowToTelemetry);
}

export interface HistoryPoint {
  t: number;
  label: string;
  level: number;
}

export function getHistory(db: DB, nodeId: string, days: number): HistoryPoint[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      'SELECT last_seen AS t, water_level_cm AS level FROM node_telemetry WHERE node_id = ? AND water_level_cm IS NOT NULL AND last_seen >= ? ORDER BY last_seen ASC',
    )
    .all(nodeId, since) as { t: number; level: number }[];
  return rows.map((r) => ({
    t: r.t,
    level: r.level,
    label: new Date(r.t).toLocaleString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));
}

import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, insertTelemetry, getRecentSnapshot, getHistory } from './db.js';
import { broadcastTelemetry, setupWs } from './ws.js';
import type { Esp32Payload, NodeTelemetry } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

// Serve the built frontend (dist/) so a single process serves UI + API + WS.
const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));

const db = openDb();

// POST /api/node-update — telemetry endpoint an ESP32 LoRa gateway posts to.
app.post('/api/node-update', (req, res) => {
  const p = req.body as Partial<Esp32Payload>;
  if (!p || !p.node_id || typeof p.lat !== 'number' || typeof p.lng !== 'number') {
    return res.status(400).json({ error: 'missing required fields: node_id, lat, lng' });
  }

  const telemetry: NodeTelemetry = {
    node_id: p.node_id,
    kind: p.kind ?? 'router',
    name: p.name ?? p.node_id,
    lat: p.lat,
    lng: p.lng,
    parent_node_id: p.parent_node_id ?? null,
    battery_percent: clampNum(p.battery_percent, 0, 100, 100),
    is_charging: !!p.is_charging,
    is_active: p.is_active !== false,
    water_level_cm: p.water_level_cm ?? null,
    rssi: p.rssi ?? -80,
    last_seen: p.last_seen ?? Date.now(),
  };

  insertTelemetry(db, telemetry);
  broadcastTelemetry(telemetry);
  res.json({ ok: true, node_id: telemetry.node_id });
});

// GET /api/nodes — latest snapshot of every node.
app.get('/api/nodes', (_req, res) => {
  res.json(getRecentSnapshot(db));
});

// GET /api/history?node_id=&days= — historical water-level logs.
app.get('/api/history', (req, res) => {
  const nodeId = (req.query.node_id as string) || 'SN-01';
  const days = Math.min(30, Math.max(1, Number(req.query.days || 1)));
  res.json(getHistory(db, nodeId, days));
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const server = http.createServer(app);
setupWs(server);

server.listen(PORT, () => {
  console.log(`\n  HydroMesh backend listening on http://localhost:${PORT}`);
  console.log(`  POST  /api/node-update   <- ESP32 gateway telemetry`);
  console.log(`  GET   /api/nodes         <- latest node snapshot`);
  console.log(`  GET   /api/history       <- historical water levels`);
  console.log(`  WS    ws://localhost:${PORT}  <- live telemetry stream\n`);
});

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

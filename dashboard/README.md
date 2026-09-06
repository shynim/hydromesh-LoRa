# HydroMesh — Early Flood Warning Dashboard

A real-time, full-stack Early Flood Warning Dashboard for a LoRa mesh network.
The frontend is a fixed, non-scrolling dark-mode operations dashboard built with
Vite + React + Tailwind + Lucide. The backend is an Express.js server with an
SQLite database and a WebSocket stream that mirrors live ESP32 gateway telemetry
to the browser.

```
┌───────────────────┬──────────────────────────────────────┐
│                   │   Leaflet map (dark OSM tiles)        │
│  Network health   │   LoRa mesh nodes + routing links     │
│  + live packet    │                                       │
│   terminal log    ├──────────────────────────────────────┤
│   (sidebar)       │   River water-level chart (Recharts)  │
│                   │   Live / Historical modes             │
└───────────────────┴──────────────────────────────────────┘
```

## Features

**Sidebar (~25%)**
- Network health stats: Total / Active / Critical / Dead nodes + Active Alerts
- Live scrolling terminal log of raw incoming packets (timestamps, RX/TX/alert colour-coded)

**Map (top right)**
- OpenStreetMap dark-matter tiles via Leaflet
- 5 seeded nodes along a river: 1 Central Gateway, 1 River Sensor, 3 Mesh Routers
- `L.divIcon` markers with a colour-coded health dot (green/grey-red) and a battery
  percentage badge (charging-bolt icon when charging, flashing red when < 20%)
- `L.polyline` mesh links showing the active routing path sensor → routers → gateway
- When a router goes dead, the mesh **reroutes** through fallback parents and the
  broken link is redrawn as a dashed animated red line

**River chart (bottom right)**
- Recharts smooth area chart, live mode updates every ~2s with scrolling animation
- Toggle bar: **Live** ↔ **Historical**
- Historical mode: 24H / 7D quick filters + custom datetime range picker
- Warning (270cm) and Danger (320cm) reference lines

**Backend (`server/`)**
- `POST /api/node-update` — accepts ESP32 gateway JSON telemetry
- `GET  /api/nodes` — latest per-node snapshot
- `GET  /api/history?node_id=&days=` — historical water-level logs
- WebSocket (`ws://localhost:4000`) pushes every incoming payload to the frontend
- SQLite stores an append-only telemetry log + a upserted latest-state table

### Expected ESP32 payload (`POST /api/node-update`)

```json
{
  "node_id": "SN-01",
  "kind": "sensor",
  "name": "River Sensor",
  "lat": 46.7965,
  "lng": -121.698,
  "parent_node_id": "RT-03",
  "battery_percent": 91,
  "is_charging": false,
  "is_active": true,
  "water_level_cm": 248.3,
  "rssi": -74,
  "last_seen": 1721600000000
}
```

`water_level_cm` is only present for the river sensor node; `kind` is one of
`gateway | router | sensor`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server (frontend only, auto-simulator fallback) |
| `npm run build` | Production build into `dist/` |
| `npm run server` | Start the Express + SQLite + WebSocket backend on `:4000` |
| `npm run simulate` | Run the ESP32 gateway simulator that POSTs telemetry to the backend |
| `npm run typecheck` | Typecheck the frontend |
| `npm run typecheck:server` | Typecheck the backend |

## Running the full stack

1. `npm run build` — build the frontend into `dist/`
2. `npm run server` — serves `dist/` + REST API + WebSocket on `http://localhost:4000`
3. (optional) `npm run simulate` — in another terminal, push live ESP32 telemetry

If the backend isn't running, the dashboard automatically falls back to a
built-in browser telemetry simulator so the UI is always live.

## Tech

- Frontend: Vite, React, TypeScript, Tailwind CSS, Lucide React, Leaflet, Recharts
- Backend: Express, better-sqlite3, ws (WebSocket), tsx
- Map tiles: CARTO dark-matter / OpenStreetMap (free)

/**
 * simulate-esp32.ts
 *
 * Mimics an ESP32 LoRa gateway collecting telemetry from a mesh of remote
 * sensor/router nodes and POSTing batched updates to the HydroMesh backend.
 * Run with:  npm run simulate
 */
import type { Esp32Payload, NodeKind } from './types.js';

const API = process.env.API_URL || 'http://localhost:4000/api/node-update';
const TICK_MS = 2200;

interface Seed {
  id: string;
  kind: NodeKind;
  name: string;
  lat: number;
  lng: number;
  parent: string | null;
  battery: number;
  charging: boolean;
}

// 1. THE DIAMOND MESH
const seeds: Seed[] = [
  { id: 'GW-01', kind: 'gateway', name: 'Central Gateway (North)', lat: 7.2600, lng: 80.5950, parent: null, battery: 100, charging: true },
  { id: 'RT-01', kind: 'router', name: 'West Router (Primary)', lat: 7.2500, lng: 80.5850, parent: 'GW-01', battery: 86, charging: false },
  { id: 'RT-02', kind: 'router', name: 'East Router (Backup)', lat: 7.2500, lng: 80.6050, parent: 'GW-01', battery: 92, charging: false },
  { id: 'SN-01', kind: 'sensor', name: 'River Sensor (South)', lat: 7.2400, lng: 80.5950, parent: 'RT-01', battery: 91, charging: false },
];

let tick = 0;
let waterLevel = 215;

function nextWater(): number {
  const rise = Math.sin(tick / 26) * 3.2;
  const drift = 0.25;
  const noise = (Math.random() - 0.5) * 4.5;
  const surge = tick % 60 === 0 && Math.random() > 0.6 ? 18 : 0;
  let v = waterLevel + rise * 0.08 + drift + noise * 0.4 + surge * 0.5;
  v = Math.max(150, Math.min(380, v));
  waterLevel = v;
  return Math.round(v * 10) / 10;
}

// 2. NEW BATTERY DRAIN LOGIC
function nextBattery(prev: number, charging: boolean, drainRate: number): number {
  if (charging) return Math.min(100, prev + 0.4);
  return Math.max(0, Math.round((prev - drainRate - Math.random() * 0.12) * 10) / 10);
}

async function post(payload: Esp32Payload): Promise<void> {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`POST failed (${res.status}) for ${payload.node_id}`);
  } catch (err) {
    console.error(`POST error for ${payload.node_id}:`, (err as Error).message);
  }
}

async function loop() {
  console.log(`\n  ESP32 simulator -> ${API}\n  Press Ctrl+C to stop.\n`);
  
  const interval = setInterval(async () => {
    tick += 1;
    const now = Date.now();
    
    // PHASE 1: MATH FIRST. Calculate battery drain for the entire network before anyone sends anything.
    for (const s of seeds) {
      const drainRate = s.id === 'RT-01' ? 3.5 : 0.1;
      if (s.battery > 5) {
        s.battery = nextBattery(s.battery, s.charging, drainRate);
      } else {
        s.battery = 5.0; // Freeze at 5%
      }
    }

    // Determine the exact state of the network for this specific tick
    const rt01 = seeds.find(node => node.id === 'RT-01');
    const isRt01Dead = rt01 ? rt01.battery <= 5 : false;

    // PHASE 2 & 3: ROUTE AND SEND. Process bottom-up (Sensor -> Gateway)
    const reversedSeeds = [...seeds].reverse();
    for (const s of reversedSeeds) {
      const dead = s.battery <= 5;
      
      // Determine correct route based on the network state we already calculated
      let currentParent = s.parent;
      if (s.id === 'SN-01') {
        currentParent = isRt01Dead ? 'RT-02' : 'RT-01'; 
      }

      const payload: Esp32Payload = {
        node_id: s.id,
        kind: s.kind,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        parent_node_id: currentParent,
        battery_percent: s.battery,
        is_charging: s.charging,
        is_active: !dead, 
        rssi: dead ? -120 : Math.max(-110, Math.min(-35, -72 + Math.round((Math.random() - 0.5) * 8))),
        last_seen: now,
      };
      
      if (s.kind === 'sensor') payload.water_level_cm = nextWater();
      
      // Send sequentially
      await post(payload);
      
      const lvl = payload.water_level_cm != null ? ` LVL=${payload.water_level_cm}cm` : '';
      console.log(
        `  [${String(tick).padStart(3, '0')}] TX ${s.id} bat=${s.battery.toFixed(1)}% ${dead ? 'DOWN' : 'UP'}${lvl}`
      );
    }
  }, TICK_MS);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n  Simulator stopped.');
    process.exit(0);
  });
}

void loop();
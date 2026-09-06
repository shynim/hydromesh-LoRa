import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { NodeTelemetry, WsMessage } from './types.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function setupWs(server: Server): void {
  wss = new WebSocketServer({ server, path: '/' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
}

export function broadcastTelemetry(node: NodeTelemetry): void {
  const msg: WsMessage = { type: 'telemetry', payload: node };
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

export function broadcastSnapshot(nodes: NodeTelemetry[]): void {
  const msg: WsMessage = { type: 'snapshot', payload: nodes };
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

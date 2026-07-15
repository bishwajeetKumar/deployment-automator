import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeploymentSession } from './agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(path.resolve(__dirname, '../config.json'), 'utf8'));
const PORT = process.env.PORT || 8787;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set — the agent will fail to start.');
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/config', (_req, res) => res.json(CONFIG));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const send = (event) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  };
  let session = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send({ type: 'error', message: 'Invalid JSON' });
    }
    try {
      switch (msg.type) {
        case 'start':
          session = new DeploymentSession(send);
          session.start(msg.params);
          send({ type: 'status', message: 'Deployment run started' });
          break;
        case 'user_message':
          session?.sendUserText(msg.text);
          break;
        case 'permission_response':
          session?.resolvePermission(msg.id, msg.approved, msg.note);
          break;
        case 'stop':
          await session?.stop();
          break;
        default:
          send({ type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      send({ type: 'error', message: String(err) });
    }
  });

  ws.on('close', () => {
    session?.stop().catch(() => {});
  });
});

server.listen(PORT, () => {
  console.log(`deployment-automator server listening on http://localhost:${PORT}`);
});

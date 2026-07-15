import { query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH =
  ['../plugin', '../../../deployment-automator']
    .map((p) => path.resolve(__dirname, p))
    .find((p) => existsSync(path.join(p, '.claude-plugin', 'plugin.json'))) ||
  path.resolve(__dirname, '../plugin');
const CONFIG = JSON.parse(readFileSync(path.resolve(__dirname, '../config.json'), 'utf8'));

const SYSTEM_APPEND = `
You are the engine of a deployment console UI. Drive the jules-deploy skill end to end.

UI protocol (strict):
- Announce each phase on its own line exactly as: PHASE: <number> — <short title>
- All runtime inputs (pools, action, release branch, SNOW ticket, DL) are supplied in the first
  user message. Do NOT re-ask for them and do NOT use any question tool.
- Whenever the workflow requires a human decision — confirming the build trigger parameters,
  accepting/rejecting unallowed Splunk error-code findings, the B/G swap go/no-go, and sending
  the notification email — output ONE line: APPROVAL_REQUIRED: <clear question with context>
  then STOP your turn and wait. The user replies "APPROVED" or "DENIED: <reason>".
- Report notable progress in short plain-text lines; the UI streams them live.
- SAFETY: never confirm a "prod validation testing complete" prompt that appears AFTER the B/G
  swap — it triggers a rollback. Surface it with APPROVAL_REQUIRED and let the human decide.
- Never store or echo credentials. If any site shows a login page, output
  APPROVAL_REQUIRED: Please complete SSO login in the browser window, then reply APPROVED.
- Finish with a final line: RESULT: SUCCESS  or  RESULT: FAILED — <reason>

Deployment configuration (from server config.json):
${JSON.stringify(CONFIG, null, 2)}
Values containing "TBD" are unknown; if one is required, ask for it via APPROVAL_REQUIRED.
`;

function userMsg(text) {
  return {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
    session_id: ''
  };
}

class AsyncQueue {
  constructor() {
    this.items = [];
    this.resolvers = [];
    this.closed = false;
  }
  push(item) {
    const r = this.resolvers.shift();
    if (r) r({ value: item, done: false });
    else this.items.push(item);
  }
  close() {
    this.closed = true;
    for (const r of this.resolvers.splice(0)) r({ value: undefined, done: true });
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift(), done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.resolvers.push(resolve));
      }
    };
  }
}

function buildInitialPrompt(p) {
  return [
    'Start a Jules blue/green production deployment using the jules-deploy skill.',
    '',
    `Pools (deployTargets): ${p.pools.join(', ')}`,
    `Action: ${p.action}`,
    `Release branch: ${p.releaseBranch}`,
    `SNOW ticket: ${p.snowTicket}`,
    `Notification DL: ${p.notificationDl || CONFIG.notification_dl}`,
    'deployEnvs: PROD-PCI',
    '',
    'Follow every phase and safety rule of the skill and the UI protocol.'
  ].join('\n');
}

export class DeploymentSession {
  constructor(send) {
    this.send = send; // (event) => void, pushes JSON events to the UI
    this.inputQueue = null;
    this.q = null;
    this.pendingPermissions = new Map(); // requestId -> resolve
    this.running = false;
  }

  start(params) {
    if (this.running) throw new Error('A deployment is already running');
    this.running = true;
    this.inputQueue = new AsyncQueue();
    this.inputQueue.push(userMsg(buildInitialPrompt(params)));

    this.q = query({
      prompt: this.inputQueue,
      options: {
        systemPrompt: { type: 'preset', preset: 'claude_code', append: SYSTEM_APPEND },
        plugins: [{ type: 'local', path: PLUGIN_PATH }],
        skills: 'all',
        mcpServers: {
          playwright: {
            command: 'npx',
            args: [
              '@playwright/mcp@latest',
              '--browser=chrome',
              '--user-data-dir=' + path.join(process.env.HOME || '.', '.deployment-automator', 'browser-profile')
            ]
          }
        },
        allowedTools: ['Read', 'Glob', 'Grep', 'Skill', 'TodoWrite', 'mcp__playwright'],
        canUseTool: this.canUseTool.bind(this),
        permissionMode: 'default',
        maxTurns: 500,
        env: { ...process.env }
      }
    });

    this.loop().catch((err) => {
      this.send({ type: 'error', message: String(err) });
      this.running = false;
    });
  }

  async canUseTool(toolName, input, { requestId, decisionReason }) {
    // Everything not auto-allowed (notably Bash and Write) is gated by the UI.
    return new Promise((resolve) => {
      if (this.pendingPermissions.has(requestId)) return; // idempotent redelivery
      this.pendingPermissions.set(requestId, resolve);
      this.send({
        type: 'permission_request',
        id: requestId,
        toolName,
        input,
        reason: decisionReason || null
      });
    });
  }

  resolvePermission(id, approved, note) {
    const resolve = this.pendingPermissions.get(id);
    if (!resolve) return;
    this.pendingPermissions.delete(id);
    resolve(
      approved
        ? { behavior: 'allow', updatedInput: undefined }
        : { behavior: 'deny', message: note || 'Denied by operator' }
    );
  }

  sendUserText(text) {
    if (this.inputQueue) this.inputQueue.push(userMsg(text));
  }

  async loop() {
    for await (const m of this.q) {
      if (m.type === 'assistant') {
        for (const block of m.message.content || []) {
          if (block.type === 'text') this.send({ type: 'agent_text', text: block.text });
          if (block.type === 'tool_use') {
            this.send({
              type: 'tool',
              name: block.name,
              summary: JSON.stringify(block.input).slice(0, 400)
            });
          }
        }
      } else if (m.type === 'system' && m.subtype === 'init') {
        this.send({ type: 'status', message: 'Agent session initialized', mcp: m.mcp_servers });
      } else if (m.type === 'result') {
        this.send({
          type: 'done',
          success: m.subtype === 'success',
          result: m.result || m.subtype,
          costUsd: m.total_cost_usd
        });
        this.running = false;
      }
    }
  }

  async stop() {
    try {
      if (this.q) await this.q.interrupt();
    } finally {
      if (this.inputQueue) this.inputQueue.close();
      if (this.q) this.q.close();
      this.running = false;
      this.send({ type: 'status', message: 'Deployment stopped by operator' });
    }
  }
}

import React, { useEffect, useMemo, useRef, useState } from 'react';

const PHASES = [
  'Inputs',
  'Trigger build',
  'Monitor jet log',
  'Verify green app',
  'Splunk monitoring',
  'B/G swap',
  'Post-swap guard',
  'Email notification'
];

const ACTIONS = ['REDEPLOY', 'BUILD, DEPLOY'];

export default function App() {
  const [config, setConfig] = useState(null);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [events, setEvents] = useState([]);
  const [approval, setApproval] = useState(null); // { question }
  const [permissions, setPermissions] = useState([]); // [{id, toolName, input, reason}]
  const [result, setResult] = useState(null); // { success, text }
  const wsRef = useRef(null);
  const feedRef = useRef(null);

  const [form, setForm] = useState({
    pools: [],
    customPool: '',
    action: 'REDEPLOY',
    releaseBranch: '',
    snowTicket: '',
    notificationDl: ''
  });

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        setForm((f) => ({
          ...f,
          notificationDl: String(c.notification_dl || '').startsWith('TBD') ? '' : c.notification_dl
        }));
      })
      .catch(() => setConfig({ default_pools: ['na-5z', 'na-5t', 'na-82'] }));
  }, []);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => handleEvent(JSON.parse(e.data));
    return () => ws.close();
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo(0, feedRef.current.scrollHeight);
  }, [events]);

  function pushEvent(kind, text) {
    setEvents((ev) => [...ev, { kind, text, ts: new Date().toLocaleTimeString() }]);
  }

  function handleEvent(m) {
    switch (m.type) {
      case 'agent_text': {
        for (const line of m.text.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          const ph = t.match(/^PHASE:\s*(\d+)/i);
          if (ph) setPhase(Math.min(Number(ph[1]), PHASES.length));
          const ap = t.match(/^APPROVAL_REQUIRED:\s*(.+)/i);
          if (ap) setApproval({ question: ap[1] });
          const res = t.match(/^RESULT:\s*(SUCCESS|FAILED.*)/i);
          if (res) setResult({ success: /^SUCCESS/i.test(res[1]), text: res[1] });
          pushEvent(ph ? 'phase' : ap ? 'approval' : 'agent', t);
        }
        break;
      }
      case 'tool':
        pushEvent('tool', `${m.name} ${m.summary || ''}`);
        break;
      case 'permission_request':
        setPermissions((p) => [...p, m]);
        break;
      case 'status':
        pushEvent('status', m.message);
        break;
      case 'error':
        pushEvent('error', m.message);
        break;
      case 'done':
        setRunning(false);
        pushEvent('status', `Run finished (${m.success ? 'ok' : 'error'})${m.costUsd ? ` — $${m.costUsd.toFixed(2)}` : ''}`);
        if (!result && m.result) setResult({ success: m.success, text: String(m.result).slice(0, 300) });
        break;
      default:
        break;
    }
  }

  const send = (obj) => wsRef.current?.send(JSON.stringify(obj));

  const pools = useMemo(() => {
    const extra = form.customPool
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set([...form.pools, ...extra])];
  }, [form.pools, form.customPool]);

  const canStart =
    connected && !running && pools.length > 0 && form.releaseBranch && form.snowTicket;

  function start() {
    setEvents([]);
    setResult(null);
    setPhase(1);
    setRunning(true);
    send({
      type: 'start',
      params: {
        pools,
        action: form.action,
        releaseBranch: form.releaseBranch,
        snowTicket: form.snowTicket,
        notificationDl: form.notificationDl
      }
    });
  }

  function answerApproval(approved) {
    const note = approved ? 'APPROVED' : prompt('Reason for denial?') || 'DENIED';
    send({ type: 'user_message', text: approved ? 'APPROVED' : `DENIED: ${note}` });
    setApproval(null);
  }

  function answerPermission(id, approved) {
    send({ type: 'permission_response', id, approved, note: approved ? '' : 'Denied by operator' });
    setPermissions((p) => p.filter((x) => x.id !== id));
  }

  function togglePool(p) {
    setForm((f) => ({
      ...f,
      pools: f.pools.includes(p) ? f.pools.filter((x) => x !== p) : [...f.pools, p]
    }));
  }

  return (
    <div className="app">
      <header>
        <h1>Deployment automator</h1>
        <span className={`conn ${connected ? 'ok' : 'bad'}`}>
          {connected ? 'connected' : 'disconnected'}
        </span>
      </header>

      {result && (
        <div className={`banner ${result.success ? 'ok' : 'bad'}`}>
          {result.success ? 'Deployment succeeded' : 'Deployment failed'} — {result.text}
        </div>
      )}

      <div className="layout">
        <section className="panel form">
          <h2>Parameters</h2>
          <label>Pools (deployTargets)</label>
          <div className="pills">
            {(config?.default_pools || []).map((p) => (
              <button
                key={p}
                className={`pill ${form.pools.includes(p) ? 'sel' : ''}`}
                onClick={() => togglePool(p)}
                disabled={running}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            placeholder="other pools, comma-separated (e.g. na-82)"
            value={form.customPool}
            onChange={(e) => setForm({ ...form, customPool: e.target.value })}
            disabled={running}
          />
          <label>Action</label>
          <div className="pills">
            {ACTIONS.map((a) => (
              <button
                key={a}
                className={`pill ${form.action === a ? 'sel' : ''}`}
                onClick={() => setForm({ ...form, action: a })}
                disabled={running}
              >
                {a}
              </button>
            ))}
          </div>
          <label>Release branch</label>
          <input
            placeholder="release/x.y.z"
            value={form.releaseBranch}
            onChange={(e) => setForm({ ...form, releaseBranch: e.target.value })}
            disabled={running}
          />
          <label>SNOW ticket</label>
          <input
            placeholder="CHG0012345"
            value={form.snowTicket}
            onChange={(e) => setForm({ ...form, snowTicket: e.target.value })}
            disabled={running}
          />
          <label>Notification DL</label>
          <input
            placeholder="dl-team@company.com"
            value={form.notificationDl}
            onChange={(e) => setForm({ ...form, notificationDl: e.target.value })}
            disabled={running}
          />
          <div className="env">deployEnvs: <b>PROD-PCI</b> (fixed)</div>
          {!running ? (
            <button className="primary" disabled={!canStart} onClick={start}>
              Start deployment
            </button>
          ) : (
            <button className="danger" onClick={() => send({ type: 'stop' })}>
              Stop run
            </button>
          )}
        </section>

        <section className="panel main">
          <h2>Progress</h2>
          <ol className="timeline">
            {PHASES.map((p, i) => (
              <li key={p} className={i + 1 < phase ? 'done' : i + 1 === phase ? 'active' : ''}>
                {p}
              </li>
            ))}
          </ol>

          {approval && (
            <div className="gate">
              <p>{approval.question}</p>
              <button className="primary" onClick={() => answerApproval(true)}>Approve</button>
              <button className="danger" onClick={() => answerApproval(false)}>Deny</button>
            </div>
          )}

          {permissions.map((pr) => (
            <div className="gate tool" key={pr.id}>
              <p>
                Tool permission: <b>{pr.toolName}</b>
                {pr.reason ? ` — ${pr.reason}` : ''}
              </p>
              <pre>{JSON.stringify(pr.input, null, 2).slice(0, 600)}</pre>
              <button className="primary" onClick={() => answerPermission(pr.id, true)}>Allow</button>
              <button className="danger" onClick={() => answerPermission(pr.id, false)}>Deny</button>
            </div>
          ))}

          <h2>Live log</h2>
          <div className="feed" ref={feedRef}>
            {events.map((e, i) => (
              <div key={i} className={`row ${e.kind}`}>
                <span className="ts">{e.ts}</span>
                <span className="txt">{e.text}</span>
              </div>
            ))}
            {events.length === 0 && <div className="row status"><span className="txt">Waiting for a run…</span></div>}
          </div>
        </section>
      </div>
    </div>
  );
}

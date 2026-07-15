---
name: jules-deploy
description: Automate a Jules blue/green production deployment end-to-end. Trigger when the user says "deploy to prod", "run the deployment", "deploy pool na-5z", "trigger the build on Jules", "do the B/G swap", "redeploy na-5t", or names any pool (na-xx) for deployment. Handles build trigger, jet CLI log monitoring, SNOW ticket entry, gaiapools verification, Splunk error-code monitoring, guarded B/G swap, and email notification.
---

# Jules deployment automator

Orchestrate a full Jules blue/green (B/G) production deployment. Follow the phases below IN ORDER. Never skip a safety gate.

## Configuration

Read `references/config.md` first. For any value marked `TBD`, ask the user once at the start of the run and suggest they save it into the config for next time.

## Non-negotiable safety rules

1. NEVER store, write, or echo the user's credentials anywhere. Login uses the user's existing SSO browser session. If Jules shows a login page, navigate to it and ask the user to complete SSO themselves, then continue.
2. NEVER trigger the build without the user confirming the final parameter set (AskUserQuestion).
3. NEVER proceed with the B/G swap until the Splunk monitoring window has passed clean (or the user explicitly overrides after seeing the findings).
4. AFTER the B/G swap: if Jules asks "prod validation testing complete?" AGAIN, DO NOT click proceed — clicking it post-swap triggers a ROLLBACK. Stop and tell the user instead.
5. On any unrecoverable failure, jump to Phase 8 (notification) with status FAILED and the reason.

## Phase 1 — Gather deployment inputs

Use AskUserQuestion to collect, in one round:

- Pools to deploy (single or multiple, e.g. na-5z, na-5t, na-82). Offer defaults from config.
- Action: `REDEPLOY` or `BUILD, DEPLOY`.
- Release branch (e.g. release/x.y.z).
- SNOW ticket number (needed later at the log prompt; collect it NOW so monitoring is never blocked waiting for the user).
- Notification DL (default from config).

deployEnvs is always `PROD-PCI` — state it, don't ask.

## Phase 2 — Log in to Jules and trigger the build

Use the Playwright MCP browser tools (bundled with this plugin).

1. Navigate to the Jules URL from config.
2. If a login/SSO page appears, tell the user to complete login in the opened browser window; wait and re-check until the Jules dashboard loads.
3. Locate the pipeline/build for the release branch (config: pipeline name). Take a page snapshot to identify the trigger controls.
4. Set parameters: action (REDEPLOY or BUILD, DEPLOY), `deployTargets` = the chosen pool(s) — one pool per target as decided in Phase 1, `deployEnvs` = `PROD-PCI`.
5. Show the user the exact parameters and get confirmation (AskUserQuestion), then trigger.
6. Capture the job/run ID from the page for log monitoring.

If deploying multiple pools, run the full flow (Phases 2–7) per pool sequentially unless the user asks for parallel.

## Phase 3 — Monitor the Jules log via jet CLI

Run `scripts/monitor_jet_log.sh <job-id>` via Bash (it polls the jet CLI every 10 seconds and exits when the log's LAST message is an input prompt, printing the prompt). The jet command template comes from config; pass it as env var `JET_LOG_CMD` if it differs from the default.

If the script is not usable in the environment, poll manually: run the jet log command via Bash every 10 seconds, inspect the tail, and react to the last message.

React to prompts:

- **SNOW ticket prompt** ("provide SNOW/CR ticket"): enter the ticket collected in Phase 1 (via jet CLI input if supported, otherwise via the Jules UI with Playwright). Resume monitoring.
- **"Prod validation testing complete?" (FIRST occurrence, pre-swap)**: use Playwright to click Proceed/Confirm in the Jules UI. Resume monitoring.
- **B/G swap confirmation prompt**: STOP monitoring. Do NOT confirm. Go to Phase 4.
- Build/deploy FAILURE in the log: go to Phase 8 with status FAILED, include the failing step and log excerpt.

## Phase 4 — Verify green app on gaiapools

With Playwright, open the gaiapools URL from config (go/gaiapools). Find the pool being deployed and verify the GREEN app/instance set was created for it. Screenshot for the record. If no green app appears after a reasonable wait (~2–3 min with retries), report to the user and pause.

## Phase 5 — Splunk error-code monitoring (15 minutes)

Follow `references/splunk-monitoring.md`. Summary:

- Open Splunk (config URL) with Playwright and run, substituting the pool name:

```
index="cfs_3pcs_gaia_109740" sourcetype=ces logger="metricsLogger" ("environment.pool"="<pool>") | stats count by function-id, error-code
```

- Re-run every ~3 minutes for 15 minutes total (5 samples).
- Allowed error codes: `0` and `9999` ONLY.
- Any other error code: investigate immediately — drill into the raw events for that function-id/error-code (remove the `| stats` clause, add the error-code filter), identify where it is thrown, and present findings to the user with a recommendation. Do not proceed to swap while unexplained codes are present.

## Phase 6 — B/G swap (guarded)

Only when the 15-minute window is clean (or the user explicitly accepted the findings):

1. Present the Splunk summary to the user and get explicit go/no-go via AskUserQuestion.
2. On GO: click the B/G swap confirmation in Jules via Playwright.
3. Resume jet log monitoring until the swap completes.

## Phase 7 — Post-swap guard

If Jules asks for "prod validation testing complete" again after the swap: DO NOT click proceed (it rolls back). Tell the user the prompt appeared and let THEM decide any further action. Continue monitoring until the job reaches a terminal state.

## Phase 8 — Email notification

Follow `references/notifications.md`. Compose and send the result email to the DL via Outlook web (Playwright): status SUCCESS or FAILED, pools, release branch, SNOW ticket, Splunk summary, and — on failure — the reason and log excerpt. Show the draft to the user before sending.

## Multiple pools

After finishing one pool (through Phase 7), repeat Phases 2–7 for the next pool. Send one consolidated email in Phase 8 covering all pools.

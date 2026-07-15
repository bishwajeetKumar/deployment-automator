# deployment-automator

Automates Jules blue/green production deployments end to end.

## What it does

Invoke the `jules-deploy` skill (say "deploy na-5z to prod" or similar). It will:

1. Ask for pools (single/multiple, e.g. na-5z, na-5t), action (REDEPLOY or BUILD, DEPLOY), release branch, SNOW ticket, and DL — deployEnvs is fixed to PROD-PCI.
2. Open Jules in a browser (Playwright MCP, bundled) using your SSO session, find the build, confirm parameters with you, and trigger it with deployTargets = your pools.
3. Poll the jet CLI log every 10 seconds for input prompts.
4. Enter the SNOW ticket when asked.
5. Confirm the first "prod validation testing complete" prompt.
6. Stop at the B/G swap prompt, verify the green app on go/gaiapools.
7. Monitor Splunk for 15 minutes (query every ~3 min): only error codes 0 and 9999 are allowed; anything else gets investigated before proceeding.
8. On a clean window (and your go-ahead), perform the B/G swap.
9. Post-swap: if "prod validation testing complete" appears again, it will NOT click proceed (that would roll back).
10. Email the result (success/failure with reasons) to your DL via Outlook web, after showing you the draft.

## Setup

1. Install the plugin.
2. Edit `skills/jules-deploy/references/config.md` — fill in the `TBD` values (Jules URL, pipeline, jet log command, Splunk URL, notification DL). Anything left TBD is asked at runtime.
3. First run: complete SSO login in the browser window when prompted. The Playwright profile persists the session for later runs.

## Security

No credentials are stored anywhere in this plugin. All sites are accessed via your own SSO browser session; the skill pauses and asks you to log in when needed. Every destructive step (build trigger, B/G swap, email send) requires your explicit confirmation.

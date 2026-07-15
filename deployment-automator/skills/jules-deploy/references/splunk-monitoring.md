# Splunk error-code monitoring procedure

## Base query

Substitute `<pool>` with the pool under deployment (e.g. na-82):

```
index="cfs_3pcs_gaia_109740" sourcetype=ces logger="metricsLogger" ("environment.pool"="<pool>") | stats count by function-id, error-code
```

Use index/sourcetype from `config.md` if the user changed them.

## Monitoring loop (15 minutes)

1. Open the Splunk search page via Playwright; if a login page appears, ask the user to complete SSO.
2. Set the time range to "Last 15 minutes" (or since deployment start).
3. Run the query. Read the stats table (function-id, error-code, count) from the page.
4. Record the sample with a timestamp.
5. Wait `monitor_sample_interval_minutes` (default 3), re-run. Repeat until `monitor_window_minutes` (default 15) has elapsed — 5 samples total.
6. Keep a running table across samples; show the user a brief update after each sample.

## Evaluation

- Allowed error codes: `0` and `9999`. These are healthy; ignore them.
- ANY other error code = unallowed. Do NOT wait for the window to finish — investigate immediately.

## Investigating an unallowed error code

1. Drill into raw events:

```
index="cfs_3pcs_gaia_109740" sourcetype=ces logger="metricsLogger" ("environment.pool"="<pool>") error-code="<bad-code>"
```

2. From the raw events identify: which function-id throws it, the message/stack, first-seen time (before or after deployment?), and volume trend (rising, flat, one-off).
3. Compare against the pool NOT being deployed if possible — if the same code exists at similar rates on other pools, it likely pre-dates this deployment.
4. Present findings to the user: code, function-id, likely origin, whether it correlates with the deployment, and a recommendation (hold / proceed / rollback).
5. Do not proceed to the B/G swap while an unexplained unallowed code is present, unless the user explicitly overrides.

## Verdict

- All 5 samples show only codes 0/9999 → CLEAN. Proceed to the swap gate.
- Otherwise → NOT CLEAN. User decides after seeing the investigation.

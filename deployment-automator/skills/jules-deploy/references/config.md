# Deployment automator config

Edit the values below. Anything left as `TBD` will be asked at runtime.

| Key | Value | Notes |
|-----|-------|-------|
| jules_url | TBD | e.g. https://jules.walmart.com |
| pipeline | TBD | Pipeline/repo whose build gets triggered |
| release_branch_pattern | TBD | e.g. release/x.y.z |
| deploy_envs | PROD-PCI | Fixed |
| default_pools | na-5z, na-5t, na-82 | Quick-pick list; any pool may be named at runtime |
| jet_log_cmd | jet logs --job {JOB_ID} | Command template to fetch the Jules job log; {JOB_ID} is substituted |
| gaiapools_url | go/gaiapools | Green app verification |
| splunk_url | TBD | Splunk web search page |
| splunk_index | cfs_3pcs_gaia_109740 | |
| splunk_sourcetype | ces | |
| allowed_error_codes | 0, 9999 | All other codes require investigation |
| monitor_window_minutes | 15 | Splunk monitoring duration |
| monitor_sample_interval_minutes | 3 | Re-run query cadence |
| notification_dl | TBD | DL email for success/failure notification |
| outlook_url | https://outlook.office.com/mail | Used to send the notification |

## Credentials

No credentials are stored in this plugin, ever. Jules, Splunk, gaiapools, and Outlook are accessed through the user's existing SSO browser session (persistent Playwright profile). If any site presents a login page, pause and let the user complete SSO manually.

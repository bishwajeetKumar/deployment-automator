# Deployment notification email

Send via Outlook web (Playwright): open `outlook_url` from config, compose a new mail to `notification_dl`. If Outlook shows a login page, ask the user to complete SSO. ALWAYS show the user the draft and get confirmation before clicking Send.

## Subject

- Success: `[SUCCESS] PROD-PCI deployment — <pools> — <release branch>`
- Failure: `[FAILED] PROD-PCI deployment — <pools> — <release branch>`

## Body template

```
Deployment summary
------------------
Status:          SUCCESS | FAILED
Pools:           <na-5z, na-5t, ...>
Release branch:  <release/x.y.z>
Action:          <REDEPLOY | BUILD, DEPLOY>
Deploy env:      PROD-PCI
SNOW ticket:     <ticket>
Started:         <timestamp>
Completed:       <timestamp>

Splunk monitoring (15 min):
<per-pool: CLEAN (only codes 0/9999) | findings table>

B/G swap: <completed | not performed>

[On failure]
Failure reason:  <step + reason>
Log excerpt:
<relevant jet log lines>

[Always]
Notes: <anything the user should know, e.g. post-swap validation prompt appeared and was intentionally NOT confirmed>
```

Keep the mail plain-text and factual. Attach the gaiapools screenshot if the client allows.

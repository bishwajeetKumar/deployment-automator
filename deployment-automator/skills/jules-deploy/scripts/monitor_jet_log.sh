#!/usr/bin/env bash
# Poll the Jules job log via jet CLI every 10s.
# Exits 0 printing the prompt line when the LAST log message asks for input.
# Exits 2 on job failure keywords, 3 on jet CLI error.
#
# Usage: monitor_jet_log.sh <JOB_ID>
# Env:   JET_LOG_CMD  command template, default: "jet logs --job {JOB_ID}"
#        POLL_SECS    default 10
#        MAX_MINUTES  safety cap, default 120

set -u
JOB_ID="${1:?usage: monitor_jet_log.sh <JOB_ID>}"
CMD_TMPL="${JET_LOG_CMD:-jet logs --job {JOB_ID}}"
POLL="${POLL_SECS:-10}"
MAX_ITER=$(( ${MAX_MINUTES:-120} * 60 / POLL ))

CMD="${CMD_TMPL//\{JOB_ID\}/$JOB_ID}"

PROMPT_RE='(input required|waiting for input|please provide|confirm|proceed\?|snow|cr ticket|validation testing|b/g swap|swap confirmation)'
FAIL_RE='(FAILED|FAILURE|ERROR: build|deployment failed|aborted)'

i=0
last_line=""
while [ "$i" -lt "$MAX_ITER" ]; do
  out="$($CMD 2>&1)" || { echo "JET_CLI_ERROR: $out" >&2; exit 3; }
  tail_line="$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -n 1)"

  if [ "$tail_line" != "$last_line" ]; then
    echo "[$(date '+%H:%M:%S')] $tail_line"
    last_line="$tail_line"
  fi

  if printf '%s' "$tail_line" | grep -qiE "$PROMPT_RE"; then
    echo "INPUT_PROMPT_DETECTED: $tail_line"
    exit 0
  fi
  if printf '%s' "$tail_line" | grep -qiE "$FAIL_RE"; then
    echo "JOB_FAILURE_DETECTED: $tail_line"
    exit 2
  fi

  sleep "$POLL"
  i=$((i+1))
done

echo "TIMEOUT: no input prompt within ${MAX_MINUTES:-120} minutes" >&2
exit 4

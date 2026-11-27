#!/usr/bin/env bash
# PID 1 of a GPU pod, as root. It never lets a job reach a key, takes one job, and deletes its own pod when the runner
# ends or the time is up, so a pod never outlives its work even when GitHub or the gate fails (R4).
set -uo pipefail

SECRET=/root/ax-secret
IDLE_LIMIT=$(( ${AX_IDLE_LIMIT_MIN:-13} * 60 ))   # no job taken: online wait twice, plus the watch's grace
JOB_LIMIT=$(( ${AX_JOB_LIMIT_MIN:-20} * 60 ))     # from the moment the runner took its job: past gpu-smoke's own 15 minutes
log() { echo "[ax-pod] $(date -u +%H:%M:%S) $*"; }

# 1. Keys leave the environment. RunPod puts its own RUNPOD_API_KEY in every pod; it goes to a root-only file, used only
#    to delete this pod. The runner starts from an environment built from a short list, so no step can read either.
umask 077
mkdir -p "$SECRET"
printf '%s' "${RUNPOD_API_KEY:-}" > "$SECRET/key"
printf '%s' "${JIT_CONFIG:?JIT_CONFIG is missing}" > "$SECRET/jit"
POD_ID="${RUNPOD_POD_ID:-}"
umask 022
mkdir -p /opt/ax
printf 'AX_REPO=%q\nAX_RUN_ID=%q\n' "${AX_REPO:?}" "${AX_RUN_ID:?}" > /opt/ax/expect.env
unset JIT_CONFIG RUNPOD_API_KEY AX_REPO AX_RUN_ID
for v in $(compgen -e | grep -E '^RUNPOD_'); do unset "$v"; done

self_delete() {
  log "deleting this pod ($1)"
  local code tries=0
  while [ "$tries" -lt 20 ]; do
    code="$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $(cat "$SECRET/key")" "https://api.runpod.io/v2/pods/$POD_ID")"
    log "delete answered $code"
    case "$code" in 2??|404) break ;; esac
    # Fall back to the GraphQL call the same key can make.
    code="$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $(cat "$SECRET/key")" -H 'Content-Type: application/json' \
      -d "{\"query\":\"mutation { podTerminate(input: {podId: \\\"$POD_ID\\\"}) }\"}" 'https://api.runpod.io/graphql')"
    log "graphql terminate answered $code"
    case "$code" in 2??) break ;; esac
    tries=$((tries + 1)); sleep 15
  done
  # RunPod restarts a container whose PID 1 exits, so wait here for the pod to be removed.
  exec sleep infinity
}

# The injected key's scope, measured from inside the pod (the spec's acceptance item): can it list pods, and may it
# reach a pod that is not this one? A 404 for a pod that does not exist means the key may touch other pods.
{
  key="$(cat "$SECRET/key")"
  list="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" 'https://api.runpod.io/v2/pods?limit=1')"
  other="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $key" 'https://api.runpod.io/v2/pods/ax-scope-probe-none')"
  printf 'RunPod key injected into this pod: list pods -> %s; delete a pod that is not this one -> %s (403 means pod-scoped, 404 means it may reach other pods)\n' "$list" "$other"
} > /opt/ax/key-scope.txt 2>&1
chmod 0644 /opt/ax/key-scope.txt
unset key

# (`--disableupdate` is a config.sh option; a JIT runner is not configured with it and run.sh does not take it, so a runner
#  that wants to update is stopped by the pod itself: the image pins the runner version and is rebuilt monthly.)
# 2. One runner, one job, as the non-root user, from an environment built from a list.
rm -f /run/ax/job-started
cd /opt/actions-runner || self_delete "no runner"
runuser -u pwuser -- env -i \
  HOME=/home/pwuser USER=pwuser LANG=C.UTF-8 LC_ALL=C.UTF-8 \
  PATH=/usr/local/bin:/usr/bin:/bin \
  NVIDIA_DRIVER_CAPABILITIES=all NVIDIA_VISIBLE_DEVICES=all \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/ax/job-started.sh \
  bash -c 'cd /opt/actions-runner && exec ./run.sh --jitconfig "$(cat)"' < "$SECRET/jit" &
runner=$!
rm -f "$SECRET/jit"
log "runner started (pid $runner)"

# 3. Self-delete: when the runner exits, when no job comes in time, or when the job runs past its limit.
began=$(date +%s)
took=""
while kill -0 "$runner" 2>/dev/null; do
  now=$(date +%s)
  if [ -z "$took" ] && [ -f /run/ax/job-started ]; then took=$now; log "the runner took its job"; fi
  if [ -z "$took" ] && [ $(( now - began )) -gt "$IDLE_LIMIT" ]; then self_delete "no job in $((IDLE_LIMIT / 60)) minutes"; fi
  if [ -n "$took" ] && [ $(( now - took )) -gt "$JOB_LIMIT" ]; then self_delete "the job ran past $((JOB_LIMIT / 60)) minutes"; fi
  sleep 5
done
wait "$runner"
self_delete "the runner exited with $?"

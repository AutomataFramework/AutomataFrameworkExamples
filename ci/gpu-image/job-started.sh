#!/usr/bin/env bash
# The runner's ACTIONS_RUNNER_HOOK_JOB_STARTED script: it runs before any step of a job, and a non-zero exit fails the
# job. A pod takes only the one job it was started for (R1): this repo, this run, `gpu.yml`, the job `gpu-smoke`, and for
# a pull request a branch of this repo. A fork's job asking for `runs-on: self-hosted` therefore runs nothing here.
set -u
# shellcheck disable=SC1091
# (The two paths can be moved by a test; on a pod they are never set.)
. "${AX_EXPECT_FILE:-/opt/ax/expect.env}"
fail() { echo "ax job-started hook: refused: $*" >&2; exit 1; }

[ "${GITHUB_REPOSITORY:-}" = "$AX_REPO" ] || fail "repository ${GITHUB_REPOSITORY:-unset}"
[ "${GITHUB_RUN_ID:-}" = "$AX_RUN_ID" ] || fail "run ${GITHUB_RUN_ID:-unset}, not the run this pod was started for"
case "${GITHUB_WORKFLOW_REF:-}" in "$AX_REPO/.github/workflows/gpu.yml@"*) ;; *) fail "workflow ${GITHUB_WORKFLOW_REF:-unset}" ;; esac
[ "${GITHUB_JOB:-}" = "gpu-smoke" ] || fail "job ${GITHUB_JOB:-unset}"
if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
  head="$(node -e 'const e=JSON.parse(require("fs").readFileSync(process.env.GITHUB_EVENT_PATH,"utf8"));process.stdout.write(e.pull_request.head.repo.full_name)' 2>/dev/null)" ||
    fail "the pull request's head repository could not be read"
  [ "$head" = "$AX_REPO" ] || fail "head repository $head is not $AX_REPO"
fi
date +%s > "${AX_FLAG_FILE:-/run/ax/job-started}"
echo "ax job-started hook: ok (run $GITHUB_RUN_ID, job $GITHUB_JOB)"

# GPU sweep: off GitHub's timer

Lane 3 (it changes what deletes RunPod pods, in both repos). Staged: this spec, a plan audit, the build, an
implementation audit, then merge under the standing merge permission. Expected duration: about 2 hours.

## Why

The lane 3 catch-up audit of PRs #5, #7 and #8 found that `gpu.yml`'s 30-minute `schedule` (the sweep) has never run
since the workflow appeared at 05:41 UTC, and that PR #8's 24-hour first-run grace in `preflight` hides this until about
05:41 UTC on 2026-11-28. The approved GPU design allows 2 hours.

## Cause (measured 2026-11-27, 13:4x UTC)

Nothing in this repo. GitHub is not starting or is badly delaying schedules for this organisation:

- `gpu.yml` is on `main`, parses (GitHub names it `gpu`), and its state is `active`. Its push, pull request and merge
  queue runs all start. `GET .../actions/runs?event=schedule` answers `total_count: 0` for this repo.
- The Site repo (created 2026-11-13) has a daily `17 4 * * *` cron. Its scheduled runs start between 11:55 and 14:56
  UTC, 8 to 10 hours late, and none ran on 11-17 or 11-21.
- Many commits reached `main` since 05:41 (GitHub's documented "a push to the default branch resyncs schedules") with no
  effect. `PUT .../workflows/gpu/enable` was sent at 13:48 UTC; whether the 14:07 slot then runs is recorded in the pull
  request, but nothing below depends on it.
- GitHub community threads report the same (no fix from GitHub; an outside timer is the workaround):
  https://github.com/orgs/community/discussions/185355, https://github.com/orgs/community/discussions/201738.

## Decision (owner, 2026-11-27 13:49 UTC, decision card in the project thread)

"Use the Editors 10-minute job": the Editors CI gate's Cloudflare Worker, whose cron runs every 10 minutes and already
holds a RunPod key with pod delete rights, also deletes Examples pods (`ax-ci-*`) older than Examples' sweep age. No new
key, no new cost. This changes one line of both designs: Examples' "Editors uses `ae-ci-*`" separation and Editors'
`this-repo` line "the sweep touches only `ae-ci-`".

## What changes

### Unit 1, Editors (`tools/ci/gate-worker/gate.ts`, its test, `this-repo`)

- `sweep` also lists pods whose name starts `ax-ci-`. One older than **50 minutes** (Examples' `SWEEP_AGE_MIN`) is
  deleted with `DELETE /v2/pods/<id>`. Its age is read as Examples' own sweep reads it (`podAgeMs`): the time in its
  label (`ax-ci-<run>-<attempt>-<8 base-36 time chars><random>`), else RunPod's `createdAt`; a pod with neither is left
  alone (Examples' own sweep deletes it).
- It never touches the Editors ledger for an `ax-ci-` pod (Editors' `remove` books `stopped` in its own ledger, so these
  go through a plain delete). Examples' ledger closes the entry at its next `pod-start`, which already closes entries for
  pods found gone.
- It asks GitHub nothing about an `ax-ci-` pod (the Editors App cannot read Examples).
- The reply names what it deleted (`swept examples ax-ci-...`), and a refused delete is retried on the next cron.
- No change to `wrangler.toml`, `setup.sh` or any workflow: the cron exists, and `gate-worker.yml` deploys a change to
  `tools/ci` on `main`.
- The existing test "deletes pods of ended runs ... and nothing else" keeps `ax-ci-1-1-k` as an *old* Examples pod
  today and asserts it stays; it changes on purpose (named in the pull request), and gains a young `ax-ci-` pod that
  must stay.

### Unit 2, Examples (`scripts/gpu/preflight.ts`, `scripts/gpu/cli/preflight.ts`, `tests/gpu/preflight.test.ts`)

- New failing step **"No leftover pod"**: reads the pod list with the Examples RunPod key and fails naming every
  `ax-ci-*` pod older than 60 minutes (the 50-minute sweep age plus one 10-minute cron). This checks the outcome the
  sweep exists for, whoever runs the sweep.
- **"Sweep ran lately"** goes back to the design: no 24-hour first-run grace, and the design's word "warns": a
  scheduled sweep older than 2 hours, or none, is a `::warning::` annotation and a summary line, never a failure, since
  GitHub's timer is now a third line behind the pod's self-delete and the Editors cron. `workflowCreated` and
  `SWEEP_FIRST_RUN_HOURS` are removed.
- `gpu.yml` keeps its `schedule` and its `sweep` job unchanged (harmless if it runs); no workflow file changes.

## Acceptance criteria

1. Editors: a unit test with a stand-in pod list shows the sweep deletes an `ax-ci-` pod 51 minutes old (by
   label time, and by `createdAt` when the name has no time), keeps one 49 minutes old, keeps `ruken-runner`, and
   leaves the Editors ledger unchanged. Reverting the change fails it.
2. Editors: `bun test`, `bun check`, `pnpm lint && pnpm fmt:check` pass; CI on the gate is green.
3. Examples: a unit test shows "No leftover pod" fails naming a 61-minute `ax-ci-` pod and passes with a 59-minute one
   and with `ruken-runner`/`ae-ci-` pods of any age; "Sweep ran lately" is a warning (not a failure) at 3 hours and when
   none ran, with no first-run grace. Reverting either change fails a test.
4. Examples: `pnpm test` passes; `ci` and `gpu` are green.
5. After the Editors merge deploys, the Worker's log or a manual `ax-ci-` check shows the cron sees Examples pods
   (read-only evidence: the cron's reply text, or the RunPod pod list with no `ax-ci-` pod older than 60 minutes).
6. Neither diff touches a workflow file, `wrangler.toml` or `setup.sh`.

## Out of scope

- Moving Examples' ledger close into the Worker, or any new key, Worker or timer.
- Merged branches left behind: Examples has `delete_branch_on_merge` on and no branch but `main` (checked 13:47 UTC),
  so it does not have Framework's problem.

## Open product decisions

None.

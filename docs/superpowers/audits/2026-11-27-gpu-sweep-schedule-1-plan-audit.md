# Plan audit, round 1: GPU sweep off GitHub's timer

- Spec: `docs/superpowers/specs/2026-11-27-gpu-sweep-schedule-design.md` at **0ecbcd6** (branch `claude/project-thread-q0rioz`, PR #14).
- Read against: Examples `main` at 574510e (`scripts/gpu/*`, `gpu.yml`, `this-repo`), Editors `main` at 84c5ade
  (`tools/ci/gate-worker/gate.ts`, `apis.ts`, `wrangler.toml`, `gate-worker.yml`, `tests/ci/gate.test.ts`, `this-repo`),
  the approved design `/mnt/project-files/specs/2026-11-27-examples-gpu-runners-design.md`, and the owner's card (13:49 UTC).
- Lane 3. Audited 2026-11-27 13:52 UTC.

**Verdict: FAIL, 1 red.** The direction is sound and matches the owner's choice; one acceptance criterion lets the
build pass its test while the Editors cron never deletes an Examples pod in the usual case. Five notes.

## Verified (no finding)

- **The Editors cron exists and fires every 10 minutes.** Cloudflare API `GET .../workers/scripts/automata-editors-gate/schedules`
  answers `*/10 * * * *` (created 2026-11-27 04:45:54Z). `wrangler.toml` `[triggers] crons` agrees.
- **The Editors key can see and delete `ax-ci-` pods.** `allPods` (`apis.ts:155`) pages `GET /v2/pods` with no name filter,
  and the current sweep test's stand-in list already holds `ax-ci-1-1-k` and other pods (`gate.test.ts:206`). One RunPod
  account, so the key reaches every pod.
- **Age is read the same way.** Examples `podAgeMs` (`scripts/gpu/gate.ts:22`) uses `labelTime` (`names.ts`: 8 base-36
  chars after `ax-ci-<run>-<attempt>-`, optional `-<digit>` suffix), else `createdAt`. The spec copies this.
- **50 minutes is safe for a live pod.** `SWEEP_AGE_MIN = 50` is the three timeouts plus 3 (`config.ts:33`); a pod
  self-deletes at `JOB_LIMIT_MIN = 35` after its job or `IDLE_LIMIT_MIN = 13` without one. The 60-minute leftover bar
  (50 + one 10-minute cron) cannot catch a pod still working.
- **Examples' cap is not over-booked when Editors deletes its pod.** `reconcile` closes the entry at the next
  `pod-start` with that later time, but `costOf` caps every entry at `MAX_LIFE_MS = SWEEP_AGE_MIN` (`budget.ts:23-28`),
  so a pod deleted by Editors is booked at most 50 minutes whatever the gap. The spec's ledger claim holds.
- **Editors' ledger stays clean** only if the `ax-ci-` delete skips `remove()` (`gate.ts:237`, which calls
  `ledger.stopped`). The spec says a plain delete; AC1 checks the ledger is unchanged.
- **`gate-worker.yml` deploys the change** (`push` to `main`, `paths: tools/ci/**`), so AC6 (no workflow, `wrangler.toml`
  or `setup.sh` change) is reachable.
- **"Warns" restores the design.** The approved design line 95: "`preflight` warns when the sweep's last run is older
  than 2 hours." PR #8's failure and 24-hour grace were the departure; the spec returns to the design, not a weakened check.
- **The deletes are 404-safe on both sides** (Examples `deletePod`, `runpod.ts:76-79`; Editors `remove`), so both
  sweeps racing on one pod is harmless.

## Red

### R1. AC1 does not test the usual case: Examples pods and no Editors pod

- UNIT: spec, "Unit 1" and acceptance criterion 1 (and then `tools/ci/gate-worker/gate.ts` `sweep`, `tests/ci/gate.test.ts`).
- VERDICT: red.
- REQUIREMENT: the owner's decision ("the Editors 10-minute job also deletes Examples pods"); spec Unit 1, first bullet.
- REASON: today's `sweep` returns `"no pod"` before any delete when no `ae-ci-` pod exists, and builds the GitHub App
  token before any delete, so an `ax-ci-` branch added after either step never runs when Editors is idle (most of the time),
  or when GitHub refuses the App; AC1's stand-in list (the existing test extended) holds `ae-ci-` pods, so it passes anyway.
- EVIDENCE: `gate.ts:297-302`: `const mine = pods.filter((p) => runOf(p.name)); if (!mine.length) return reply(200, "no pod"); ... const gh = await github(...)`.
  `runOf` matches only `ae-ci-` (`gate.ts:98`). The test at `gate.test.ts:195-230` mixes `ae-ci-77/78/79` pods with `ax-ci-1-1-k`.
- EXPECTED: an old `ax-ci-` pod is deleted when it is the only pod of either repo, and when the GitHub App call fails.
- FIX: add to AC1: "with a pod list of only an `ax-ci-` pod 51 minutes old and `ruken-runner`, and with the GitHub token
  call failing, the sweep deletes the `ax-ci-` pod and its reply names it", and say in Unit 1 that the `ax-ci-` pass runs
  before the `ae-ci-` early return and needs no GitHub call. Files: the spec only.

## Notes (not blocking)

- **N1. Replacement pods.** Examples names a replacement `<label>-2`; `labelTime` accepts the `-\d` suffix. Editors'
  copy of the parse must too, or such a pod falls back to `createdAt`. Add a `...-2` pod to AC1.
- **N2. Examples `this-repo` says the separation.** `.claude/skills/this-repo/SKILL.md:50` says Editors' pods are
  `ae-ci-*` and never to touch another prefix; after this change the Editors Worker also deletes old `ax-ci-` pods. Add
  the file to Unit 2 (an edit named in the PR body), as Unit 1 already does for Editors.
- **N3. "No leftover pod" is not a monitor.** `preflight` runs only on `workflow_dispatch` and on a push to `main` that
  changes the gate (`plan.ts:32-37`, `gpu.yml:274`). Say so in the spec, so nobody reads it as a standing alarm. Also say
  what it does with an `ax-ci-` pod with no label time and no `createdAt` (`podAgeMs` gives Infinity: it fails, which is right).
- **N4. A warning needs a third result.** `Result` is `{ ok: boolean }` and the CLI prints only `passed`/`FAILED`
  (`cli/preflight.ts`). Name the shape (for example `warn: true`) so the test in AC3 has something to assert.
- **N5. Two copies of the label format.** Editors cannot import Examples' `names.ts`. A comment in each copy pointing at
  the other, and an Examples test that pins the label shape, keep them from drifting.

## Not checked

- Whether the 14:07 UTC `schedule` slot ran after the 13:48 re-enable: the slot had not come at audit time, and the spec
  does not depend on it.
- The Editors Worker's live cron replies (no log read); AC5 covers this after the deploy.

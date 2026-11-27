# Examples CI installs bun (unit E1-0)

Lane 3 (it changes a CI workflow file). Staged: this spec, a plan audit, the build, an implementation audit, then
merge under the Owner's standing merge permission. Expected duration: about 1 hour. Not a unit in the approved
slice 1a plan: it was added on 2026-11-27 (build prompt `16-E1-0-examples-ci-bun.md` in the project's files), and the
coordinator has told the Owner. It must merge before E1.

## Why

E1 moves Examples' tests to `bun test` (the `test` script becomes bun). On `main` today (6ea9bae) `ci.yml` installs
only Node (`actions/setup-node`), so `pnpm test` would fail the moment E1 changes the script. A workflow never shares
a pull request with what uses it, so the workflow gets bun first, alone.

## What changes

One file: `.github/workflows/ci.yml`. No other file, no test, no script.

- One new step, `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0` with `bun-version: 1.4.4`,
  the exact pin and version Framework's `ci.yml` uses on its `main` (checked 2026-11-27: lines 88-90, 107-109,
  125-127, 175-177 of Framework's `ci.yml`).
- It goes into each job that runs `pnpm test`, before that step: `checks` and `games`. No other job runs `pnpm test`
  (`plan`, `commit-authors` and `gate` do not; `gpu.yml` and `private-names.yml` do not either).
- Where it goes in each job is set by the tests on `main`, which must stay unchanged and green
  (`tests/workflows/gpu.test.ts`). Two of its "this break is caught" cases find exact text in `ci.yml` and throw if
  that text is gone:
  - "a variable" needs `node-version: 24.21.0`, then `pnpm install`, then `pnpm test`, back to back in `checks`. So in
    `checks` bun goes **after `pnpm/action-setup` and before `actions/setup-node`**.
  - "a job without a timeout" needs the whole start of `games`, from `timeout-minutes: 15` to `- name: Every game`,
    unchanged. So in `games` bun goes **after `pnpm check:games` and right before `pnpm test`**.
- Nothing else changes. Today's `test` script is still Node's runner, so runs behave as before plus one install step;
  `games` stays left out by `plan` until `harness/run.ts` exists (E1).

## Acceptance criteria

1. The pull request's diff touches `.github/workflows/ci.yml` only (`git diff --name-only main...HEAD`, after the
   live-state file is deleted).
2. `ci.yml` has exactly two `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0` steps, each with
   `bun-version: 1.4.4`: one in `checks`, one in `games`, each before that job's `pnpm test`.
3. `pnpm test` on the branch passes with `tests/` unchanged from `main` (253 tests on `main` at 6ea9bae, all pass).
4. CI on the pull request is green: `gate` and `private-names` (the required checks), and the `checks` job's log shows
   the setup-bun step installing bun 1.4.4.
5. A fresh session's implementation audit of the final commit passes before the merge.

## Known limit, for E1 and E2 (not fixed here)

In `games`, bun is installed only after `pnpm check:games`. If a game's or example's `check` needs bun (for example
`bun check`), `games` fails on it. Moving bun earlier in `games` breaks the "a job without a timeout" test's exact
text, so it needs that test changed first (lane 1, its own pull request), then the workflow (lane 3). This matters
only once `games` runs (E1) and something under `games/` or `examples/` has a `check` (E2a or E3). Reported to the
coordinator; not built ahead of its user.

## Out of scope

The `test` script, the tests' imports, `tests/expect.ts`, `CLAUDE.md` and `this-repo` wording (all E1); `gpu.yml`'s
`build-games` (U2-2 shape, unchanged).

## Merge

Draft until the implementation audit passes, then merged with a merge commit on green under the standing merge
permission recorded in `docs/superpowers/history.md` ("Standing permissions", 2026-11-27 04:32 UTC, all repos, lane 3
included).

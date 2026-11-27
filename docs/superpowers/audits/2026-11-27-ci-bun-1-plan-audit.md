# Plan audit, round 1: Examples CI installs bun (unit E1-0)

Examined: pull request #15 at d4a7afc, spec `docs/superpowers/specs/2026-11-27-ci-bun-design.md` (sha256 starting
`512c3f8fe4c5`), against build prompt `16-E1-0-examples-ci-bun.md`, the approved slice 1a plan (E1, E2, E3, U2-2),
`main` at 6ea9bae and Framework `main` at 2273a46. Lane 3 (the build changes a workflow file).

**Verdict: PASS, 0 red, 3 notes.**

## What was checked

| Claim in the spec | How it was checked | Result |
|---|---|---|
| Framework pins `oven-sh/setup-bun@0c5077e…` v2.2.0, bun 1.4.4 | `git show origin/main:.github/workflows/ci.yml` in Framework | Lines 88-90, 107-109, 125-127, 175-177, as stated |
| Only `checks` and `games` run `pnpm test` | read `ci.yml`, `gpu.yml`, `private-names.yml` | True |
| 253 tests on `main`, all pass | `pnpm test` at d4a7afc (tests equal `main`) | 253 pass, 0 fail |
| The stated positions keep `tests/workflows/` green | applied both steps exactly as the spec places them, ran `pnpm test`, reverted | 253 pass, 0 fail |
| Bun earlier in `games` breaks an unchanged test | put bun right after `pnpm/action-setup` in both jobs, ran `pnpm test`, reverted | 1 fail: "fails on a job without a timeout" (its `broken()` throws, text gone) |
| `pinProblems` and `ciProblems` accept the new step | read `workflow-rules.ts` | Full-commit pin passes; no rule names bun |
| Standing merge permission is in `history.md` | `docs/superpowers/history.md` "Standing permissions" | 2026-11-27 04:32 UTC entry, all repos, lane 3 included |
| Criterion 1 (diff is `ci.yml` only) can hold | PR #15 holds the spec only; the build is its own pull request from `main` (`staged-path`: the spec merges first) | Consistent |

## The builder's known limit: solve now or not?

**Not now. The spec is right to leave it.** In slice 1a a game's or example's `check` is `automata check`
(Framework `packages/create-automata/template/package.json`), and `automata` is a Node program
(`packages/tools/src/bin.ts` starts `#!/usr/bin/env node`; nothing under `packages/tools/src` starts bun). The plan
defines `pnpm check:games` as "each game's and example's `check`" (plan line 260), and E2's examples and E3's sample
follow that template. So nothing planned in E1, E2a, E2b or E3 runs bun inside `pnpm check:games`, and moving bun
earlier would be built ahead of its user, at the cost of two extra pull requests (a lane 1 test change, then a lane 3
workflow change) and a second lane 3 audit pair. The limit is written in the spec, so a later unit that does add bun
to a `check` will find it.

## Notes (not blocking, for the builder and E1)

- **N1, E1 must add `check:games`.** `package.json` on `main` has no `check:games` script, while `ci.yml`'s `games`
  job runs it. `games` is left out until `harness/run.ts` exists, so nothing fails today, but E1 (which adds
  `harness/run.ts` and owns `package.json`) turns `games` on and must add the script in the same pull request, or
  `games` and so `gate` fail. Outside this unit; for the coordinator to carry into E1's brief.
- **N2, the `games` bun step first runs in E1.** `games` is skipped on this pull request, so criterion 4 can only
  show bun installing in `checks`. Criterion 2 (text) is the only check on the `games` step until E1's first run.
  E1's done check should name the `games` log showing bun 1.4.4.
- **N3, a rule could hold it later.** No rule in `workflow-rules.ts` says "every job that runs `pnpm test` installs
  bun first". When E1 tightens `tests/workflows/` (its own lane 1 change, like U2-3), that rule would stop a later
  edit from dropping the step. Not for this unit: the prompt keeps `tests/` unchanged.

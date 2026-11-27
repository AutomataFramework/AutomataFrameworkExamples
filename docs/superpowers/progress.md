# Progress

Last updated: 2026-11-27 13:39 UTC (from `date`). The project's one roadmap is `/mnt/project-files/roadmap/roadmap.md`;
slice 1a's plan is Framework's `docs/superpowers/specs/2026-11-27-shell-plan.md`.

| Stage | Where it is |
|---|---|
| Slice 0: games kit, CI gate, private-names, fork guard, GPU check on RunPod | done 2026-11-27 (last merge #8, `be2e8b1`) |
| Slice 1a: harness, small examples, 2D sample | building |

## Slice 1a units

| Unit | Lane | Where it is |
|---|---|---|
| U2-1 Pod settings and loosened tests | 3 | done, #9 (`e33f1cc`) |
| U2-2 The `games` and `build-games` jobs | 3 | done, #10 (`f76116d`) and #11 (`a21f337`), implementation audit passed |
| U2-3 Workflow tests tightened | 1 | done, #12 (`b8149ba`) |
| E1-0, E1, E1w, E2a, E2b, E3, E4, E5-1, E5-2, E5-3, E6, E6w | 1 to 3 | not started; build prompts in `/mnt/project-files/specs/shell-build-prompts/` |

The `games` and `build-games` jobs stay left out until `harness/run.ts` exists (E1).

## Waiting

- E1 waits on Owner step O1 (first publish of the five new `@automataframework/*` packages): not run at 13:35 UTC.
- E1-0 (bun in `ci.yml`, lane 3) must merge before E1: `ci.yml` installs only Node today.
- O7 (the test repo `newcomer-check` and its credential) is asked when E1 starts; E1w waits on it.

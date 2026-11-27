# Progress

Last updated: 2026-11-27 03:51 UTC (from `date`).

## Active milestone: slice 0, setup

### Current work

- The setup pull request: the games kit, the CI gate on GitHub's runners, the licence split and its check, and the
  private-names check.
- Next: the GPU runners on RunPod (lane 3, staged: spec, plan audit, build, implementation audit, the Owner's OK).

### Remaining

- RunPod GPU runners that a fork's pull request cannot start and that never see a secret, and one measured GPU run.
- A pull request from a real fork that runs no RunPod job and sees no secret.
- The Owner runs `setup/examples-slice0.sh` (fork approval, the `main` ruleset with `gate` and `private-names`, the
  merge queue) after `setup/slice0-keys.sh`.
- The first push to `main` after #1 runs `private-names` with its self-test from the secret: record that run's link
  here (the roadmap's planted-name done check).
- `LICENSE` says "Automata Framework" and `games/CONTENT-LICENSE.md` says "McThayDT": the Owner says which holder
  both name (lane 3).

### Blockers

- None yet.

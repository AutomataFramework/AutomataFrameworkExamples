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
- Branch protection on `main` requiring `gate` and `private-names` (the Owner's batch).

### Blockers

- None yet.

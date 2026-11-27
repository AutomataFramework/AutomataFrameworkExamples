# Progress

Last updated: 2026-11-27 03:51 UTC (from `date`).

## Active milestone: slice 0, setup

### Current work

- The setup pull request: the games kit, the CI gate on GitHub's runners, the licence split and its check, and the
  private-names check.
- The GPU runners on RunPod (lane 3): built on branch `claude/project-thread-u5i846`, waiting for its implementation audit.
  `gpu` stays red until the Owner runs `setup/examples-gpu.sh` (the App, the public image, the ruleset) and the image is built.

### Remaining

- Turn off `ruleMix.firstTimeSetup` in `.claude/hooks/rules.json`: the first pull request after #1 (the GPU spec's).
- RunPod GPU runners that a fork's pull request cannot start and that never see a secret, and one measured GPU run.
- A pull request from a real fork that runs no RunPod job and sees no secret.
- The Owner runs `setup/examples-slice0.sh` (fork approval, the `main` ruleset with `gate` and `private-names`, the
  merge queue) after `setup/slice0-keys.sh`.
- Private-names planted-name check done: run https://github.com/AutomataFramework/AutomataFrameworkExamples/actions/runs/45941501832
  on `main`, self-test passed, "No private name in 96 places looked at (2 names)".
- `LICENSE` says "Automata Framework" and `games/CONTENT-LICENSE.md` says "McThayDT": the Owner says which holder
  both name (lane 3).

### Blockers

- None yet.

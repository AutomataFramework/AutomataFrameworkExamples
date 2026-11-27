---
name: this-repo
description: Use when working in AutomataFrameworkExamples: its layout, its CI, its checks and what is public here.
---

# This repo

## Layout

- `games/`: the 2D and 3D sample games (from slice 1a), under the code names "2D sample" and "3D sample". Its
  `CONTENT-LICENSE.md` makes every content file below it all rights reserved.
- `scripts/`: dependency-free checks run by Node 24 (it runs TypeScript files as they are):
  `check-commit-authors.ts` (the same file in every repo of the project), `check-content-license.ts` and
  `check-private-names.ts`.
- `tests/`: their tests, on Node's own test runner (`pnpm test`). `tests/expect.ts` is a tiny stand-in for Vitest's
  `expect` until slice 1a brings the game stack.
- `docs/superpowers/`: `progress.md`, `history.md`, `roadmap.md` (a pointer: the one roadmap is in the project's files),
  `live/` and, later, `specs/` and `audits/`.

## Public and private

- This repo is public. The samples' real names, and anything else in the `PRIVATE_NAMES` secret, never appear in a
  file, a path, a commit message, a pull request's words or a branch name. Write "2D sample" and "3D sample".
- Code is MIT (`LICENSE`). Story, art, music, sound, models and fonts are content: each sits under a folder with a
  `CONTENT-LICENSE.md` saying "All rights reserved", never at the root.

## CI

- `ci.yml` on GitHub's runners: `checks` (the tests and the content-licence check), `commit-authors`, and `gate`,
  the aggregate that `main` requires.
- `private-names.yml`: `private-names`, also required. The script always comes from the base commit (`main` for a
  pull request, on `pull_request_target`; the queue's base in a merge-queue run), run against the change's files
  checked out as data. In a merge-queue run GitHub takes the workflow file itself from the queue's merge commit, so an
  edit to that file is trusted only after its review, when a maintainer queues it. A change to the script takes effect
  after it merges. Its self-test plants the first secret name in a throwaway repo (file, prompt, commit message,
  description, branch) and fails unless all are found, so a green run proves the secret is read without showing it.
- A fork's pull request is not checked for private names on the pull request: `pull_request_target` runs start for
  forks whatever the approval settings, so pass or fail would let a fork search the list a few runs per name. Its
  `private-names` run passes with a notice and no step reads the secret (`tests/workflows/private-names.test.ts`
  checks this). The check that counts is the merge-queue run, which only a maintainer starts; it checks the queued
  files and commit messages, and its log names the file and line, which is fine since a maintainer chose to queue it.
- The fork-PR approval policy (the Owner's batch) holds the `pull_request` workflows of a fork's pull request until
  the Owner approves them; it does not hold `pull_request_target` runs.
- A story file (`.json`, `.md`) counts as content only under a content-named folder (`content`, `story`, `assets`,
  ...) or wherever a `CONTENT-LICENSE.md` covers it. A future `examples/<name>/` that holds story text puts it in
  such a folder.
- GPU work (`.github/workflows/gpu.yml`, `fork-guard.yml`, `scripts/gpu/`, `ci/gpu-image/`): RunPod pods named `ax-ci-*`,
  started by jobs on GitHub's runners with scripts from the trusted base (never from the change), for same-repo pull
  requests, the merge queue and `main` only. Only `gpu-smoke` runs on the pod, with no secret. The Editors repo's pods
  are `ae-ci-*`, and the owner has an unrelated `ruken-runner` pod: never touch any pod without our `ax-ci-` prefix. The Editors gate's 10-minute cron also deletes `ax-ci-` pods older than 50 minutes, because GitHub's timer never starts this repo's scheduled sweep (owner, 2026-11-27).
- Examples has its own GitHub App: variable `EXAMPLES_CI_APP_ID`, secret `EXAMPLES_CI_APP_KEY` (administration and
  variables write, installed on this repo only). Not shared with Editors.
- Spend: the RunPod key cannot read billing, so a ledger of one variable per pod (`AX_CI_LEDGER_*`) folded into a
  monthly total (`AX_CI_SPENT_YYYY_MM`) counts only our pods. Cap $25 a month, at most 3 pods at once.
- A fork's pull request starts no pod and reads no secret: `fork-guard.yml` (on `pull_request_target`, so the base
  branch's copy runs) drafts it and fails it, and `gpu` fails for it. A fork's change reaches a pod only after a
  maintainer pushes it to a branch of this repo.
- Never queue a pull request that has two checks of the same name. `gpu` must not be cancelled: a cancelled `gpu`
  fails the aggregate by design.

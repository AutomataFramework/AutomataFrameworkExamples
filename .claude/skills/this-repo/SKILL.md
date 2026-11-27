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
- Known limit: `pull_request_target` runs start for a fork's pull request whatever the fork-approval setting, so a
  fork can always run this check. For a fork, the check says only that a name was found, never where, so one run
  answers one yes-or-no question about everything the fork sent, not which guess matched.
- The fork-PR approval policy (the Owner's batch) holds every other workflow of a fork's pull request until the Owner
  approves it.
- A story file (`.json`, `.md`) counts as content only under a content-named folder (`content`, `story`, `assets`,
  ...) or wherever a `CONTENT-LICENSE.md` covers it. A future `examples/<name>/` that holds story text puts it in
  such a folder.
- GPU work (from the slice 0 GPU pull request): RunPod pods named `ax-ci-*`, started by a job on GitHub's runners
  for same-repo pull requests and `main` only. The Editors repo's pods are `ae-ci-*`; never touch them, nor any pod
  without our prefix. Both repos share one org GitHub App: variable `AUTOMATA_CI_APP_ID`, secret
  `AUTOMATA_CI_APP_KEY`.

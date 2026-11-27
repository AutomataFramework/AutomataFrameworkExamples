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
- `private-names.yml`: `private-names`, also required. It runs on `pull_request_target`, so `main`'s copy of the
  workflow and the script run, against the pull request's files checked out as data. A change to it takes effect only
  after it merges. Its self-test plants the first secret name in a throwaway repo (file, prompt, commit message,
  description, branch) and fails unless all are found, so a green run proves the secret is read without showing it.
  Known limit: a fork can learn whether a word it guesses is on the list from the pass or fail.
- A fork's pull request needs the Owner's approval before any workflow runs (the repo's fork-PR approval policy,
  set in the Owner's batch).
- GPU work (from the slice 0 GPU pull request): RunPod pods named `ax-ci-*`, started by a job on GitHub's runners
  for same-repo pull requests and `main` only. The Editors repo's pods are `ae-ci-*`; never touch them, nor any pod
  without our prefix. Both repos share one org GitHub App: variable `AUTOMATA_CI_APP_ID`, secret
  `AUTOMATA_CI_APP_KEY`.

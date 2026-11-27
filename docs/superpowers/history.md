# History

Finished milestones and their decision records, setup, rule changes, standing permissions, approved screens and lessons.

## Setup

2026-11-27: first-time setup from the Owner's games kit (https://mcthaydt.com/prompts/claude-md-games/, read that day),
pull request #1. The setup check in `release`, item by item:

- **The Owner's batch of commands:** added, as `setup/examples-slice0.sh` in the project's files (the fork-PR approval
  policy, and a `main` ruleset requiring `gate` and `private-names`, with no force-push or delete, and the merge
  queue with merge commits). The secrets `PRIVATE_NAMES` and `RUNPOD_API_KEY` are in `setup/slice0-keys.sh`; the org
  GitHub App is in the Editors repo's batch. Not yet run.
- **Stack and checks pass on `main`:** `pnpm install --frozen-lockfile` and `pnpm test` pass in CI on the pull request;
  lint, typecheck and build are "none yet" until slice 1a. Read again on `main` after the merge.
- **The CI gate:** added. `ci.yml` triggers include `ready_for_review`; `plan` decides which checks apply (a change to
  Markdown people read only, `CLAUDE.md` and `docs/`, skips `checks`); `gate` is the aggregate.
- **The gate required on `main`:** missing until the Owner's batch runs (no protection or ruleset on 2026-11-27).
- **Branches need not be up to date; every push to `main` runs in full and is never cancelled:** added in `ci.yml`
  (the ruleset's `strict_required_status_checks_policy` is false).
- **Merge queue:** added to the Owner's batch (merge commits). Until it runs, the session that merges runs the queue
  by hand.
- **Graphify:** missing; this repo is not indexed.
- **`commit-authors` inside the gate:** added (`scripts/check-commit-authors.ts`, the same file as the Site's, which
  also takes off the footer the cloud tool appends to pull request bodies).
- **Restart handoff:** none named; nothing to restore.
- **Auto-merge and branch deletion:** present (`allow_auto_merge` true, `delete_branch_on_merge` true; squash and
  rebase merges off), read 2026-11-27.
- **Session tools** (starting, messaging, choosing a model for and archiving sessions): present, through the project's
  coordinator and its thread tools.
- **Superpowers:** **7.0.2**.
- **Compaction hook:** added (`.claude/settings.json` `SessionStart` with matcher `compact` prints
  `.claude/after-compaction.md`).
- **Rule hooks:** added; `node .claude/hooks/rules.mjs --check` reports no blanks and `mergeGreen on` (required
  statuses `gate` and `private-names`). `ruleMix.firstTimeSetup` stays on in #1, because with it off the hook refuses every further commit of this
  setup branch (it mixes rules and CI with scripts and tests); the first pull request after #1 turns it off.
- **`verify`:** missing. It is the kit's template; there is nothing to start until slice 1a.

## GPU runners (slice 0)

2026-11-27, measured from a GitHub runner (the RunPod key has pods read and write only): `/v1/billing/pods` and the GPU
catalog both refuse it (billing:read and catalog:read missing). So spend is a ledger of our own pods, cap $25 a month
for Examples and $25 for Editors (the Owner's $50 slice 0 cap, split), not RunPod's bill. A probe that listed all pods
put another pod's details in public Actions logs; those logs were deleted the same day and the probe removed.
Decisions: Examples has its own GitHub App (`EXAMPLES_CI_APP_ID`/`KEY`), a ledger variable per pod folded into a
monthly total (a close adds its cost to the total before its variable is removed, so a cancelled run counts a pod once),
and `ruleMix.firstTimeSetup` is turned off in the pull request after the GPU one, not in it.

## Standing permissions

- 2026-11-27, the Owner (the approved roadmap, slice 0): first-time setup of this repo's rules and CI (lane 2), and
  RunPod CI for this repo within the $50 a month cap until slice 0's cost card sets it.
- 2026-11-27 04:32 UTC, the Owner (decision card cmsg_015qSNRrgZWSCwn9M1iFmFZJ9QujpQkXKX9q1L2Vb1usdd): sessions may merge any pull
  request in Framework, Examples, Editors and Site, lane 3 included, once its required reviews pass and CI is green;
  report after. Fork code never runs on a pod, even after queueing.

## Approved screens

None yet.

## Flaky tests

None yet.

## Lessons

None yet.

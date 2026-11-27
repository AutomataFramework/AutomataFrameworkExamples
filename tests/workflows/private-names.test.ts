// The private-names workflow must never let a fork's pull request reach the secret: `pull_request_target` runs start
// for forks whatever the approval settings, so a fork that saw pass or fail could test guesses against the list.
// This reads the workflow as text (no YAML parser until slice 1a) and checks the fork condition on every step.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const text = readFileSync(new URL('../../.github/workflows/private-names.yml', import.meta.url), 'utf8')
const FORK =
  "FORK: ${{ github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name != github.repository }}"

/** The job's steps, each as its own text, split at the `      - ` that starts a step. */
const steps = text
  .slice(text.indexOf('    steps:'))
  .split(/\n(?= {6}- )/)
  .slice(1)

describe('a fork never reaches PRIVATE_NAMES', () => {
  test('the job marks a fork pull request', () => {
    expect(text).toContain(FORK)
  })
  test('every step but the notice is skipped for a fork', () => {
    expect(steps.length > 3).toBe(true)
    for (const step of steps) {
      const notice = step.includes("if: env.FORK == 'true'")
      expect(notice || step.includes("if: env.FORK != 'true'")).toBe(true)
      if (notice) expect(step).not.toContain('secrets.')
    }
  })
  test('the secret is named only in steps a fork skips', () => {
    const withSecret = steps.filter((step) => step.includes('secrets.PRIVATE_NAMES'))
    expect(withSecret).toHaveLength(2)
    for (const step of withSecret) expect(step).toContain("if: env.FORK != 'true'")
    expect(text.split('secrets.').length - 1).toBe(2)
  })
  test('a merge-queue run checks commit messages too', () => {
    expect(text).toContain(
      "format('{0}..{1}', github.event.merge_group.base_sha, github.event.merge_group.head_sha)",
    )
  })
})

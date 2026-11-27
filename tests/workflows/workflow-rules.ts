// Rules for every workflow file in .github/workflows, as functions from a workflow's text to a list of problems; the
// tests run them on the real files (no problem) and on a copy broken on purpose for each rule (a problem).
// No YAML parser until slice 1a: the files are read as text, split at the job headers.
import { jobsOf, needsOf } from './gpu-rules.ts'

/** Every `uses:` is a full commit, so a moved tag cannot change what runs. */
export function pinProblems(text: string): string[] {
  const p: string[] = []
  for (const m of text.matchAll(/uses: ([^@\s]+)@(\S+)/g)) if (!/^[0-9a-f]{40}$/.test(m[2])) p.push(`${m[1]} is not pinned to a commit`)
  for (const m of text.matchAll(/uses: (\S+)/g)) if (!m[1].includes('@')) p.push(`${m[1]} has no version at all`)
  if (/uses: docker:\/\//.test(text)) p.push('a docker:// action is not pinned by digest')
  return p
}

/** Every upload names a retention of 1 to 3 days, never the 90-day default. */
export function retentionProblems(text: string): string[] {
  const p: string[] = []
  for (const u of text.matchAll(/uses: actions\/upload-artifact@[^\n]*\n((?: {8,}.+\n)*)/g)) {
    if (!/retention-days: [123]\n/.test(u[1])) p.push('an upload without a retention of 1 to 3 days')
  }
  return p
}

/** ci.yml: no secret or variable anywhere, no `pull_request_target`, and `gate` waits for every other job. */
export function ciProblems(text: string): string[] {
  const p: string[] = []
  const jobs = jobsOf(text)
  if (/secrets\.(?!GITHUB_TOKEN)|\bvars\./.test(text)) p.push('ci.yml reads a secret or a variable')
  if (/pull_request_target/.test(text)) p.push('ci.yml runs on pull_request_target')
  if (/self-hosted/.test(text)) p.push('ci.yml asks for a self-hosted runner')
  const gate = jobs.get('gate') ?? ''
  if (!gate) return [...p, 'ci.yml has no gate job']
  if (!/^ {4}if: always\(\)$/m.test(gate)) p.push('gate has no `if: always()`')
  const waits = needsOf(gate)
  for (const id of jobs.keys()) {
    if (id !== 'gate' && !waits.includes(id)) p.push(`gate does not wait for ${id}`)
    if (id !== 'gate' && !gate.includes(`needs.${id}.result`)) p.push(`gate does not read ${id}'s result`)
    if (!/^ {4}runs-on: ubuntu-latest$/m.test(jobs.get(id)!)) p.push(`job ${id} does not run on \`ubuntu-latest\``)
    if (!/timeout-minutes: \d+/.test(jobs.get(id)!)) p.push(`job ${id} has no timeout-minutes`)
  }
  for (const w of waits) if (!jobs.has(w)) p.push(`gate waits for ${w}, which is not a job`)
  return p
}

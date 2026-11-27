// Runs `preflight` with the real keys; exits 1 naming each refused call.
import { caller } from '../http.ts'
import { GITHUB } from '../github.ts'
import { preflight } from '../preflight.ts'
import { addSummary, deps, fetchFn, need } from './env.ts'

const { d } = await deps()
// The sweep's last run is read with the workflow's own token (it has `actions: read`); the App is not given that.
const own = caller(fetchFn, GITHUB, () => `Bearer ${need('GITHUB_TOKEN')}`, new Map(), { 'x-github-api-version': '2022-11-28' })
const runs = await own<{ workflow_runs: { created_at: string; conclusion: string | null }[] }>(
  'GET',
  `/repos/${d.repo}/actions/workflows/gpu.yml/runs?event=schedule&status=completed&per_page=1`,
)
const wf = await own<{ created_at: string }>('GET', `/repos/${d.repo}/actions/workflows/gpu.yml`)
const last = runs.status === 200 ? runs.body.workflow_runs[0] : undefined

const results = await preflight({
  rp: d.rp,
  gh: d.gh,
  vars: d.vars,
  repo: d.repo,
  otherRepo: 'AutomataFramework/AutomataFrameworkEditors',
  fetchFn,
  image: d.image,
  now: Date.now(),
  workflowCreated: wf.status === 200 ? Date.parse(wf.body.created_at) : null,
  lastSweep: last ? Date.parse(last.created_at) : null,
})
const lines = results.map((r) => `- ${r.ok ? 'passed' : 'FAILED'}: ${r.name}: ${r.detail}`)
addSummary(lines.join('\n') + '\n')
console.log(lines.join('\n'))
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  for (const f of failed) console.log(`::error::preflight: ${f.name}: ${f.detail}`)
  process.exit(1)
}

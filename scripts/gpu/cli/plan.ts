// Job `plan`: decides whether the GPU check applies and whether the change is a fork's. It uses only the workflow's
// own GITHUB_TOKEN (read-only), never a RunPod or App key, so it can run on anything.
import { readFileSync } from 'node:fs'
import { plan, queuePr } from '../decide.ts'
import { caller, ok } from '../http.ts'
import { GITHUB } from '../github.ts'
import { fetchFn, need, setOutput } from './env.ts'

const event = need('GITHUB_EVENT_NAME')
const repo = need('GITHUB_REPOSITORY')
const payload = JSON.parse(readFileSync(need('GITHUB_EVENT_PATH'), 'utf8'))
const gh = caller(fetchFn, GITHUB, () => `Bearer ${need('GITHUB_TOKEN')}`, new Map(), { 'x-github-api-version': '2022-11-28' })

let headRepo: string | null = null
let files: string[] | null = null
if (event === 'pull_request') {
  headRepo = payload.pull_request?.head?.repo?.full_name ?? null
  const n = payload.pull_request?.number
  const r = await gh<{ filename: string }[]>('GET', `/repos/${repo}/pulls/${n}/files?per_page=100`)
  // A list GitHub cannot give (too long, or an error) runs the check, never less.
  files = r.status === 200 && Array.isArray(r.body) && r.body.length < 100 ? r.body.map((f) => f.filename) : null
} else if (event === 'merge_group') {
  const n = queuePr(String(payload.merge_group?.head_ref ?? ''))
  if (n !== null) {
    const pr = ok('GET pull', await gh<{ head: { repo: { full_name: string } | null } }>('GET', `/repos/${repo}/pulls/${n}`))
    headRepo = pr.head.repo?.full_name ?? null
  }
} else {
  headRepo = repo // a push to main or a dispatch is this repo's own code
}

// The preflight runs on a dispatch and on a push to main that changes the gate: this workflow, its scripts or its image.
let preflight = event === 'workflow_dispatch'
if (event === 'push' && /[1-9a-f]/.test(String(payload.before ?? '0'))) {
  const r = await gh<{ files?: { filename: string }[] }>('GET', `/repos/${repo}/compare/${payload.before}...${payload.after}`)
  // A list GitHub cannot give runs the preflight: more checking, never less.
  preflight = r.status !== 200 || !r.body.files || r.body.files.some((f) => /^(\.github\/workflows\/gpu\.yml|scripts\/gpu\/|ci\/gpu-image\/)/.test(f.filename))
}

const p = plan({ event, actor: process.env.GITHUB_ACTOR ?? '', repo, headRepo, files })
console.log(JSON.stringify(p))
setOutput('apply', String(p.apply))
setOutput('fork', String(p.fork))
setOutput('passes', String(p.passes))
setOutput('why', p.why)
setOutput('preflight', String(preflight))

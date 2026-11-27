// `preflight`: calls every endpoint the gate uses, with the real keys, reading or making a thing and removing it at
// once. It fails naming the refused call, so a key missing a permission shows up here and not in a pull request.
import { makeJit } from './github.ts'
import type { Call, Fetch } from './http.ts'
import type { Vars } from './budget.ts'

export type Result = { name: string; ok: boolean; detail: string }

/** GitHub supports a runner for about 30 days after a newer release; past that it is refused work. */
export const RUNNER_WINDOW_DAYS = 30

export type Preflight = {
  rp: Call
  gh: Call
  vars: Vars
  repo: string
  otherRepo: string
  fetchFn: Fetch
  image: string
  now: number
  /** When the sweep last ran, or null when it never has. */
  lastSweep: number | null
}

async function step(name: string, run: () => Promise<string>): Promise<Result> {
  try {
    return { name, ok: true, detail: await run() }
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

function must(what: string, status: number, wanted: (s: number) => boolean = (s) => s >= 200 && s < 300): void {
  if (!wanted(status)) throw new Error(`${what} answered ${status}`)
}

export async function preflight(p: Preflight): Promise<Result[]> {
  const out: Result[] = []
  out.push(
    await step('RunPod: GET /v2/pods', async () => {
      const r = await p.rp<{ pods: unknown[] }>('GET', '/v2/pods?limit=1')
      must('GET /v2/pods', r.status)
      return 'the key can read pods'
    }),
  )
  out.push(
    await step('GitHub: GET runners', async () => {
      const r = await p.gh('GET', `/repos/${p.repo}/actions/runners?per_page=1`)
      must('GET runners', r.status)
      return 'the App can list runners'
    }),
  )
  out.push(
    await step('GitHub: POST generate-jitconfig', async () => {
      const name = `ax-ci-preflight-${p.now.toString(36)}`
      const { runnerId } = await makeJit(p.gh, p.repo, name, name)
      const gone = await p.gh('DELETE', `/repos/${p.repo}/actions/runners/${runnerId}`)
      must('DELETE runner', gone.status)
      return 'a runner config was made and its runner removed unused'
    }),
  )
  out.push(
    await step('GitHub: repository variables', async () => {
      const name = 'AX_CI_PREFLIGHT'
      await p.vars.set(name, String(p.now))
      if ((await p.vars.get(name)) !== String(p.now)) throw new Error('a variable written was not read back')
      await p.vars.remove(name)
      return 'the App can write and remove repository variables'
    }),
  )
  out.push(
    await step("GitHub: the App cannot read Editors", async () => {
      const r = await p.gh('GET', `/repos/${p.otherRepo}`)
      if (r.status >= 200 && r.status < 300) throw new Error(`GET ${p.otherRepo} answered ${r.status}: the App reaches another repo`)
      return `GET ${p.otherRepo} answered ${r.status}`
    }),
  )
  out.push(
    await step('Sweep ran lately', async () => {
      if (p.lastSweep === null) throw new Error('the sweep has never run')
      const hours = (p.now - p.lastSweep) / 3_600_000
      if (hours > 2) throw new Error(`the sweep last ran ${hours.toFixed(1)} hours ago (GitHub may have turned schedules off)`)
      return `the sweep ran ${hours.toFixed(1)} hours ago`
    }),
  )
  out.push(
    await step('Pod image: runner version', async () => {
      if (!p.image) throw new Error('no image is set')
      const have = await imageRunnerVersion(p.fetchFn, p.image)
      const mine = await release(p.gh, `tags/v${have}`)
      const latest = await release(p.gh, 'latest')
      const days = (Date.parse(latest.published_at) - Date.parse(mine.published_at)) / 86_400_000
      if (days > RUNNER_WINDOW_DAYS) {
        throw new Error(`the image's runner ${have} is ${days.toFixed(0)} days behind ${latest.tag_name}: rebuild the image`)
      }
      return `runner ${have}; latest is ${latest.tag_name}`
    }),
  )
  return out
}

async function release(gh: Call, which: string): Promise<{ tag_name: string; published_at: string }> {
  const r = await gh<{ tag_name: string; published_at: string }>('GET', `/repos/actions/runner/releases/${which}`)
  must(`GET actions/runner release ${which}`, r.status)
  return r.body
}

/** The runner version the image says it carries (a label on its config), read from the registry anonymously. */
export async function imageRunnerVersion(fetchFn: Fetch, ref: string): Promise<string> {
  const m = /^ghcr\.io\/([^:@]+)(?::[^@]+)?@(sha256:[0-9a-f]{64})$/.exec(ref)
  if (!m) throw new Error(`the image is not pinned by digest: ${ref}`)
  const json = async (url: string, headers: Record<string, string> = {}): Promise<any> => {
    const r = await fetchFn(url, { headers })
    if (r.status !== 200) throw new Error(`GET ${url.replace(/\?.*/, '')} answered ${r.status}`)
    return JSON.parse(await r.text())
  }
  const { token } = await json(`https://ghcr.io/token?scope=repository:${m[1]}:pull`)
  const auth = { authorization: `Bearer ${token}`, accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' }
  const manifest = await json(`https://ghcr.io/v2/${m[1]}/manifests/${m[2]}`, auth)
  const config = await json(`https://ghcr.io/v2/${m[1]}/blobs/${manifest.config.digest}`, auth)
  const v = config.config?.Labels?.['org.automata.runner-version']
  if (typeof v !== 'string' || !/^\d+\.\d+\.\d+$/.test(v)) throw new Error('the image has no org.automata.runner-version label')
  return v
}

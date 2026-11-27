import { describe, expect, test } from 'bun:test'
import { githubVars } from '../../scripts/gpu/budget.ts'
import { caller } from '../../scripts/gpu/http.ts'
import { preflight, type Preflight } from '../../scripts/gpu/preflight.ts'
import { deps } from './fakes.ts'

function setup(overrides: Partial<Preflight> = {}) {
  const { d, w, fetchFn } = deps()
  // The stand-in's registry answers for the image check.
  const reg: typeof fetchFn = async (url, init) => {
    const r = (b: unknown) => ({ status: 200, text: async () => JSON.stringify(b) })
    if (url.startsWith('https://ghcr.io/token')) return r({ token: 't' })
    // ghcr measured 2026-11-27: no Accept header gives 404; the image is an index, so the platform's manifest is a second fetch.
    if (url.includes('/manifests/') && !String(init?.headers?.accept).includes('application/vnd.oci.image.index.v1+json')) return { status: 404, text: async () => '{}' }
    if (url.includes('/manifests/sha256:a')) return r({ manifests: [{ digest: 'sha256:11arm', platform: { os: 'linux', architecture: 'arm64' } }, { digest: 'sha256:11amd', platform: { os: 'linux', architecture: 'amd64' } }] })
    if (url.includes('/manifests/sha256:11amd')) return r({ config: { digest: 'sha256:c' } })
    if (url.includes('/blobs/')) return r({ config: { Labels: { 'org.automata.runner-version': '2.338.2' } } })
    if (url.includes('/repos/actions/runner/releases/tags/v2.338.2')) return r({ tag_name: 'v2.338.2', published_at: '2026-11-01T00:00:00Z' })
    if (url.includes('/repos/actions/runner/releases/latest')) return r({ tag_name: 'v2.340.0', published_at: '2026-11-20T00:00:00Z' })
    if (url.includes('AutomataFrameworkEditors')) return { status: 404, text: async () => '{}' }
    return fetchFn(url, init)
  }
  const gh = caller(reg, 'https://api.github.com', () => 't', new Map(), {}, async () => {})
  const p: Preflight = {
    rp: d.rp,
    gh,
    vars: githubVars(gh, d.repo),
    repo: d.repo,
    otherRepo: 'AutomataFramework/AutomataFrameworkEditors',
    fetchFn: reg,
    image: 'ghcr.io/automataframework/ci-gpu@sha256:' + 'a'.repeat(64),
    now: d.now(),
    lastSweep: d.now() - 30 * 60_000,
    ...overrides,
  }
  return { p, w }
}

describe('preflight', () => {
  test('passes with the right keys', async () => {
    const { p } = setup()
    const results = await preflight(p)
    expect(results.filter((r) => !r.ok)).toEqual([])
    expect(results.length > 5).toBe(true)
  })
  test('makes a runner config and removes its runner unused, and leaves no variable behind', async () => {
    const { p, w } = setup()
    await preflight(p)
    expect(w.runners).toHaveLength(0)
    expect(w.variables.size).toBe(0)
  })
  test('fails naming the call when RunPod refuses the key (a stand-in key)', async () => {
    const { p } = setup({ rp: caller(async () => ({ status: 403, text: async () => '{"detail":"this API key does not grant pods:read"}' }), 'https://api.runpod.io', () => 'x', new Map(), {}, async () => {}) })
    const failed = (await preflight(p)).filter((r) => !r.ok)
    // The leftover check reads the same pod list, so it fails with it.
    expect(failed.map((f) => f.name)).toEqual(['RunPod: GET /v2/pods', 'No leftover pod'])
    expect(failed[0].detail).toContain('403')
  })
  test('fails naming the call when the App cannot write variables', async () => {
    const { p } = setup()
    const base = p.gh
    p.gh = async (m, path, b) => (path.includes('/actions/variables') ? { status: 403, body: { message: 'Resource not accessible' } as never } : base(m, path, b))
    p.vars = githubVars(p.gh, p.repo)
    const failed = (await preflight(p)).filter((r) => !r.ok)
    expect(failed.map((f) => f.name)).toEqual(['GitHub: repository variables'])
    expect(failed[0].detail).toContain('403')
  })
  test('fails when the App can read Editors', async () => {
    const { p } = setup()
    const base = p.gh
    p.gh = async (m, path, b) => (path.includes('AutomataFrameworkEditors') ? { status: 200, body: {} as never } : base(m, path, b))
    expect((await preflight(p)).filter((r) => !r.ok).map((f) => f.name)).toEqual(['GitHub: the App cannot read Editors'])
  })
  test('only warns when the scheduled sweep is older than 2 hours or never ran, with no first-run grace', async () => {
    const { p } = setup()
    const sweep = async (lastSweep: number | null) => (await preflight({ ...p, lastSweep })).find((r) => r.name === 'Sweep ran lately')!
    for (const lastSweep of [p.now - 3 * 3_600_000, null]) {
      const r = await sweep(lastSweep)
      expect(r.ok).toBe(true)
      expect(r.warning).toBe(true)
    }
    expect((await sweep(null)).detail).toContain('never started')
    expect((await sweep(p.now - 1.9 * 3_600_000)).warning).toBe(undefined)
  })
  test('fails naming an ax-ci pod older than the sweep age plus one Editors cron, and only ax-ci pods', async () => {
    const { p, w } = setup()
    const at = (min: number) => new Date(p.now - min * 60_000).toISOString()
    const pod = (name: string, min: number) => ({ id: name.replace(/-/g, ''), name, cost: 1, createdAt: at(min), gpu: 'x' })
    w.pods.push(pod('ax-ci-1-1-k', 59), pod('ae-ci-2-1-k', 600), pod('ruken-runner', 6000))
    expect((await preflight(p)).filter((r) => !r.ok)).toEqual([])
    w.pods.push(pod('ax-ci-3-1-k', 61))
    const failed = (await preflight(p)).filter((r) => !r.ok)
    expect(failed.map((f) => f.name)).toEqual(['No leftover pod'])
    expect(failed[0].detail).toContain('ax-ci-3-1-k')
    expect(failed[0].detail.includes('ax-ci-1-1-k')).toBe(false)
  })
  test('fails when the image runner is more than 30 days behind the latest release', async () => {
    const { p } = setup()
    const fetchFn = p.fetchFn
    p.fetchFn = async (url, init) => (url.includes('releases/latest') ? { status: 200, text: async () => JSON.stringify({ tag_name: 'v2.400.0', published_at: '2027-01-10T00:00:00Z' }) } : fetchFn(url, init))
    const base = p.gh
    p.gh = async (m, path, b) => (path.includes('releases/latest') ? { status: 200, body: { tag_name: 'v2.400.0', published_at: '2027-01-10T00:00:00Z' } as never } : base(m, path, b))
    const failed = (await preflight(p)).filter((r) => !r.ok)
    expect(failed[0].name).toBe('Pod image: runner version')
    expect(failed[0].detail).toContain('rebuild the image')
  })
  test('fails on an image that is not pinned by digest', async () => {
    const { p } = setup({ image: 'ghcr.io/automataframework/ci-gpu:latest' })
    expect((await preflight(p)).filter((r) => !r.ok)[0].detail).toContain('not pinned by digest')
  })
})

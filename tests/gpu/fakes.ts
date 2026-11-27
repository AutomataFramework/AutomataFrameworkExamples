// Stand-in RunPod and GitHub APIs, one world behind one fetch, so the gate's real callers run against them.
import type { Vars } from '../../scripts/gpu/budget.ts'
import { githubVars } from '../../scripts/gpu/budget.ts'
import type { Deps } from '../../scripts/gpu/gate.ts'
import { caller, type Fetch } from '../../scripts/gpu/http.ts'
import type { Event } from '../../scripts/gpu/runpod.ts'

export type FakePod = { id: string; name: string; cost: number; createdAt: string; gpu: string }
export type FakeRunner = { id: number; name: string; status: string; labels: { name: string }[] }

export function world(start = Date.parse('2026-11-27T12:00:00Z')) {
  const w = {
    clock: start,
    pods: [] as FakePod[],
    runners: [] as FakeRunner[],
    variables: new Map<string, string>(),
    jobs: [] as { name: string; status: string; conclusion: string | null }[],
    /** GPUs with stock; any other card is refused with 422. */
    stock: new Set(['NVIDIA GeForce RTX 4090', 'NVIDIA RTX A6000', 'NVIDIA L4', 'NVIDIA A40', 'NVIDIA GeForce RTX 5090']),
    /** A create answers this status for every card when set. */
    createStatus: null as number | null,
    /** Pod ids whose delete is refused with 500. */
    refuseDelete: new Set<string>(),
    /** Runner names that come online as soon as a pod of that name exists. */
    autoOnline: true,
    /** Extra labels GitHub puts on a new runner. */
    extraLabels: [] as string[],
    cancelled: [] as string[],
    requests: [] as string[],
    created: [] as { gpu: string; name: string; body: any }[],
    n: 0,
  }

  const json = (status: number, body: unknown = null) => ({ status, text: async () => (body === null ? '' : JSON.stringify(body)) })

  const fetchFn: Fetch = async (url, init = {}) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const path = u.pathname + u.search
    w.requests.push(`${method} ${u.host}${u.pathname}`)
    const body = init.body ? JSON.parse(init.body) : undefined

    if (u.host === 'api.runpod.io') {
      if (method === 'GET' && u.pathname === '/v2/pods') return json(200, { pods: w.pods, pagination: { nextCursor: null, hasNextPage: false } })
      if (method === 'POST' && u.pathname === '/v2/pods') {
        if (w.createStatus !== null) return json(w.createStatus, { detail: 'refused' })
        w.created.push({ gpu: body.gpu.id, name: body.name, body })
        if (!w.stock.has(body.gpu.id)) return json(422, { detail: `no stock for ${body.gpu.id}` })
        const pod: FakePod = { id: `pod${++w.n}xxxxxxxx`, name: body.name, cost: 0.89, createdAt: new Date(w.clock).toISOString(), gpu: body.gpu.id }
        w.pods.push(pod)
        if (w.autoOnline) w.runners.push({ id: 1000 + w.n, name: body.name, status: 'online', labels: [{ name: 'self-hosted' }, { name: body.name.replace(/-2$/, '') }] })
        return json(201, pod)
      }
      const del = /^\/v2\/pods\/(.+)$/.exec(u.pathname)
      if (method === 'DELETE' && del) {
        if (w.refuseDelete.has(del[1])) return json(500, { detail: 'boom' })
        const i = w.pods.findIndex((p) => p.id === del[1])
        if (i < 0) return json(404, { detail: 'gone' })
        w.pods.splice(i, 1)
        return json(204)
      }
    }

    if (u.host === 'api.github.com') {
      const repo = /^\/repos\/[^/]+\/[^/]+/.exec(u.pathname)?.[0] ?? ''
      const rest = u.pathname.slice(repo.length)
      if (method === 'GET' && rest === '/installation') return json(200, { id: 7 })
      if (method === 'GET' && rest === '/actions/runners') return json(200, { runners: w.runners })
      if (method === 'POST' && rest === '/actions/runners/generate-jitconfig') {
        const r: FakeRunner = { id: 5000 + ++w.n, name: body.name, status: 'offline', labels: [...body.labels, 'self-hosted', ...w.extraLabels].map((name: string) => ({ name })) }
        w.runners.push(r)
        return json(201, { runner: r, encoded_jit_config: `jit-for-${body.name}` })
      }
      const rm = /^\/actions\/runners\/(\d+)$/.exec(rest)
      if (method === 'DELETE' && rm) {
        w.runners = w.runners.filter((r) => r.id !== Number(rm[1]))
        return json(204)
      }
      if (method === 'GET' && /\/actions\/runs\/\d+\/attempts\/\d+\/jobs$/.test(rest)) return json(200, { jobs: w.jobs })
      const cancel = /^\/actions\/runs\/(\d+)\/cancel$/.exec(rest)
      if (method === 'POST' && cancel) {
        w.cancelled.push(cancel[1])
        return json(202)
      }
      const v = /^\/actions\/variables(?:\/([^/?]+))?$/.exec(rest)
      if (v) {
        if (method === 'GET' && !v[1]) return json(200, { variables: [...w.variables].map(([name, value]) => ({ name, value })) })
        if (method === 'GET') return w.variables.has(v[1]) ? json(200, { name: v[1], value: w.variables.get(v[1]) }) : json(404, {})
        if (method === 'POST') {
          if (w.variables.has(body.name)) return json(409, {})
          w.variables.set(body.name, body.value)
          return json(201)
        }
        if (method === 'PATCH') {
          w.variables.set(v[1], body.value)
          return json(204)
        }
        if (method === 'DELETE') return w.variables.delete(v[1]) ? json(204) : json(404, {})
      }
    }
    return json(404, { detail: `no stand-in for ${method} ${u.host}${path}` })
  }
  return { w, fetchFn }
}

export function deps(overrides: Partial<Deps> = {}) {
  const { w, fetchFn } = world()
  const retries = new Map<string, number>()
  const rp = caller(fetchFn, 'https://api.runpod.io', () => 'Bearer k', retries, {}, async () => {})
  const gh = caller(fetchFn, 'https://api.github.com', () => 'Bearer t', retries, {}, async () => {})
  const events: Event[] = []
  const repo = 'AutomataFramework/AutomataFrameworkExamples'
  const d: Deps = {
    rp,
    gh,
    vars: githubVars(gh, repo),
    repo,
    image: 'ghcr.io/automataframework/ci-gpu@sha256:' + 'a'.repeat(64),
    now: () => w.clock,
    // A sleep moves the clock, so waits end without real time passing.
    sleep: async (ms) => {
      w.clock += ms
    },
    events,
    ...overrides,
  }
  return { d, w, retries, events, fetchFn }
}

/** An in-memory `Vars`, with a hook to interleave two writers. */
export function memoryVars(initial: Record<string, string> = {}): Vars & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    async list(prefix) {
      await Promise.resolve()
      return [...data].filter(([n]) => n.startsWith(prefix)).map(([name, value]) => ({ name, value }))
    },
    async get(name) {
      await Promise.resolve()
      return data.get(name) ?? null
    },
    async set(name, value) {
      await Promise.resolve()
      data.set(name, value)
    },
    async remove(name) {
      await Promise.resolve()
      data.delete(name)
    },
  }
}

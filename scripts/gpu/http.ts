// A small JSON caller shared by the RunPod and GitHub clients. It takes the fetch function as an argument, so every
// test runs against a stand-in API. It retries an outside service's 429 and 5xx answers (twice) and counts each
// retried call, because the run summary names them (nothing silent).

export type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number
  text(): Promise<string>
}>

export type Answer<T> = { status: number; body: T }
export type Call = <T = unknown>(method: string, path: string, body?: unknown) => Promise<Answer<T>>

/** Counts of retried calls by `METHOD path-without-ids`, for the summary. */
export type Retries = Map<string, number>

export function caller(
  fetchFn: Fetch,
  base: string,
  auth: () => string,
  retries: Retries = new Map(),
  extra: Record<string, string> = {},
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Call {
  return async <T>(method: string, path: string, body?: unknown): Promise<Answer<T>> => {
    let last: Answer<T> = { status: 0, body: null as T }
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchFn(`${base}${path}`, {
        method,
        headers: {
          authorization: auth(),
          accept: 'application/json',
          'user-agent': 'automata-examples-gpu-gate',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const text = await res.text()
      let parsed: unknown = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }
      last = { status: res.status, body: parsed as T }
      if (res.status !== 429 && res.status < 500) return last
      const key = `${method} ${path.replace(/[0-9a-z]{10,}/g, ':id').replace(/\?.*$/, '')}`
      retries.set(key, (retries.get(key) ?? 0) + 1)
      if (attempt < 2) await sleep(500 * 2 ** attempt)
    }
    return last
  }
}

/** The body of a successful answer, or an error that names the call and the answer (never a secret: bodies are RunPod's and GitHub's own). */
export function ok<T>(what: string, answer: Answer<T>): T {
  if (answer.status < 200 || answer.status > 299) {
    throw new Error(`${what} answered ${answer.status}: ${JSON.stringify(answer.body).slice(0, 300)}`)
  }
  return answer.body
}

// Waits up to 5 minutes for the runner to come online; replaces the pod once, then fails naming both pods.
import { ensureOnline } from '../gate.ts'
import { render, summaryLines } from '../summary.ts'
import { addSummary, deps, need, readScratch } from './env.ts'

const label = need('LABEL')
const { d, retries, events } = await deps()
try {
  const r = await ensureOnline(d, { label, podName: label, podId: need('POD_ID'), gpu: readScratch('gpu'), runId: need('GITHUB_RUN_ID') })
  console.log(`runner ${r.podName} is online on ${r.gpu}`)
} finally {
  const out = render(summaryLines(null, events, retries))
  addSummary(out.markdown)
  for (const a of out.annotations) console.log(a)
}

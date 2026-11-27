// Its own step: makes the pod named after the label and outputs its id. Never logs a create request or answer.
import { CLOUD } from '../config.ts'
import { makePod } from '../gate.ts'
import { render, summaryLines } from '../summary.ts'
import { addSummary, deps, need, readScratch, setOutput, writeScratch } from './env.ts'

const label = need('LABEL')
const { d, retries, events } = await deps()
const made = await makePod(d, { podName: label, label, jit: readScratch('jit'), runId: need('GITHUB_RUN_ID') })
const chosen = { gpu: made.gpu, cloud: CLOUD, costPerHr: made.costPerHr, priced: made.priced, podId: made.pod.id, label }
const out = render(summaryLines(chosen, events, retries))
addSummary(out.markdown)
for (const a of out.annotations) console.log(a)
writeScratch('gpu', made.gpu)
console.log(`pod ${label} made on ${made.gpu}`)
setOutput('pod', made.pod.id)

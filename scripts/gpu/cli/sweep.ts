// The scheduled sweep: a second line only (GitHub delays and drops schedules). The pod's own self-delete is the backstop.
import { sweepAll } from '../gate.ts'
import { addSummary, deps } from './env.ts'

const { d } = await deps()
const r = await sweepAll(d)
addSummary(`Swept: ${r.removed.length ? r.removed.join(', ') : 'no old pod'}. Closed entries: ${r.closed.length}.\n`)

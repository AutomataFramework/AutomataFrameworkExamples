// The ledger job: the only writer of the month's total, run under one concurrency group that is never cancelled.
import { fold, spent } from '../budget.ts'
import { addSummary, deps } from './env.ts'

const { d } = await deps()
const n = await fold(d.vars, d.now())
const usd = await spent(d.vars, d.now())
addSummary(`Ledger: ${n} closed pod(s) added to the month. Spent this month: $${usd.toFixed(2)}.\n`)

// First step of `pod-start`: sweeps stale pods, settles the ledger, and refuses at the cap or at 3 pods running.
import { guard } from '../gate.ts'
import { addSummary, deps } from './env.ts'

const { d } = await deps()
const g = await guard(d)
if (g.swept.length) console.log(`::warning::swept ${g.swept.length} old pod(s): ${g.swept.join(' ')}`)
console.log(`spent this month $${g.spent.toFixed(2)}, running ${g.running}`)
if (!g.verdict.allowed) {
  addSummary(`**GPU check refused:** ${g.verdict.reason}\n`)
  console.log(`::error::${g.verdict.reason}`)
  process.exit(1)
}

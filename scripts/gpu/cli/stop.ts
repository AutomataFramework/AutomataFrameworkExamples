// `pod-stop`: removes every pod this run attempt made, found by name, and fails loudly if one is left.
import { stopRun } from '../gate.ts'
import { addSummary, deps, need } from './env.ts'

const { d } = await deps()
const r = await stopRun(d, need('GITHUB_RUN_ID'), need('GITHUB_RUN_ATTEMPT'))
addSummary(`Pods removed: ${r.removed.length ? r.removed.join(', ') : 'none were left'}.\n`)

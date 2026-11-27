// The `gpu` check: passes only when every job that applies ended `success`.
import { judge, type Plan } from '../decide.ts'
import { need } from './env.ts'

const p: Plan = {
  apply: process.env.APPLY === 'true',
  fork: process.env.FORK === 'true',
  passes: process.env.PASSES === 'true',
  why: process.env.WHY ?? '',
}
const r = judge(p, {
  plan: need('R_PLAN'),
  podStart: process.env.R_POD_START ?? 'skipped',
  gpuSmoke: process.env.R_GPU_SMOKE ?? 'skipped',
  watch: process.env.R_WATCH ?? 'skipped',
  podStop: process.env.R_POD_STOP ?? 'skipped',
})
console.log(r.why)
if (!r.pass) {
  console.log(`::error::gpu: ${r.why}`)
  process.exit(1)
}

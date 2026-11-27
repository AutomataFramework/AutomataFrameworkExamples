// Asks GitHub for a just-in-time runner config with the label, and masks it before anything else happens. The config
// goes to a mode-0600 file in the runner's temp folder, never to an output or a log.
import { makeJit } from '../github.ts'
import { deps, need, writeScratch } from './env.ts'

const label = need('LABEL')
const { d } = await deps()
const { jit } = await makeJit(d.gh, d.repo, label, label)
console.log(`::add-mask::${jit}`)
writeScratch('jit', jit)
console.log(`runner config made for ${label}`)

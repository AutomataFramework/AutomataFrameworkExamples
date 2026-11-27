// Its own step, before any create (N3): the label every pod of this run attempt is named with.
import { randomBytes } from 'node:crypto'
import { makeLabel } from '../names.ts'
import { need, setOutput } from './env.ts'

setOutput('label', makeLabel(need('GITHUB_RUN_ID'), need('GITHUB_RUN_ATTEMPT'), Date.now(), randomBytes(3).toString('hex')))

// What the GPU workflows must never do, as functions from a workflow's text to a list of problems. The tests run them on
// the real files (no problem) and on a copy broken on purpose for each rule (a problem), so a rule that stopped
// working would show. No YAML parser until slice 1a: the files are read as text, split at the job headers.

export function jobsOf(text: string): Map<string, string> {
  const body = text.slice(text.indexOf('\njobs:\n') + 1)
  const out = new Map<string, string>()
  const heads = [...body.matchAll(/^ {2}([a-z][a-z-]*):\n/gm)]
  heads.forEach((m, i) => out.set(m[1], body.slice(m.index!, heads[i + 1]?.index ?? body.length)))
  return out
}

const POD_JOBS = ['pod-start', 'gpu-smoke', 'watch', 'pod-stop']
const TRUSTED_REF = 'ref: ${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha || github.sha }}'

export function gpuProblems(text: string): string[] {
  const p: string[] = []
  const jobs = jobsOf(text)
  const need = (id: string): string => jobs.get(id) ?? ''

  // Triggers.
  const on = text.slice(text.indexOf('\non:'), text.indexOf('\npermissions:')).replace(/#.*$/gm, '')
  if (/\bedited\b/.test(on)) p.push('`edited` is in the triggers: a title change would start a pod')
  // No workflow-level env.
  if (/^env:/m.test(text)) p.push('a workflow-level `env`')
  // Every job has a timeout, and it is the number the spec names.
  const timeouts: Record<string, number> = { plan: 5, 'pod-start': 12, 'gpu-smoke': 15, watch: 20, 'pod-stop': 5, gpu: 5, sweep: 5, ledger: 5, preflight: 5 }
  for (const [id, body] of jobs) {
    const m = /timeout-minutes: (\d+)/.exec(body)
    if (!m) p.push(`job ${id} has no timeout-minutes`)
    else if (timeouts[id] !== undefined && Number(m[1]) !== timeouts[id]) p.push(`job ${id} has timeout-minutes ${m[1]}, not ${timeouts[id]}`)
  }
  // gpu-smoke: no secret, no variable, no secret-carrying output, empty permissions.
  const smoke = need('gpu-smoke')
  if (/secrets\./.test(smoke)) p.push('gpu-smoke names `secrets.`')
  if (/\bvars\./.test(smoke)) p.push('gpu-smoke names `vars.`')
  for (const m of smoke.matchAll(/needs\.[a-z-]+\.outputs\.[a-z]+/g)) {
    if (!['needs.plan.outputs.apply', 'needs.plan.outputs.fork', 'needs.pod-start.outputs.label'].includes(m[0])) p.push(`gpu-smoke reads ${m[0]}`)
  }
  if (!/permissions: \{\}/.test(smoke)) p.push('gpu-smoke has permissions other than `{}`')
  if (!smoke.includes("runs-on: [self-hosted, '${{ needs.pod-start.outputs.label }}']")) p.push('gpu-smoke does not ask for its own pod label')
  // pod-start gives out the pod id and the label only.
  const outputs = /\n {4}outputs:\n((?: {6}.+\n)+)/.exec(need('pod-start'))?.[1] ?? ''
  const names = [...outputs.matchAll(/^ {6}([a-z]+):/gm)].map((m) => m[1]).sort()
  if (names.join(',') !== 'label,pod') p.push(`pod-start has outputs ${names.join(', ') || 'none'}, not just pod and label`)
  // Every pod job refuses a fork.
  for (const id of POD_JOBS) if (!/if: .*needs\.plan\.outputs\.fork != 'true'/.test(need(id))) p.push(`${id} has no fork refusal`)
  // pod-start, watch, pod-stop and the aggregate run scripts from the trusted base only.
  for (const id of ['plan', 'pod-start', 'watch', 'pod-stop', 'ledger', 'gpu']) {
    for (const co of need(id).matchAll(/uses: actions\/checkout@[^\n]*\n((?: {8,}.+\n)*)/g)) {
      if (!co[1].includes(TRUSTED_REF)) p.push(`${id} checks out something other than the trusted base`)
    }
    for (const run of need(id).matchAll(/run: (.+)/g)) {
      if (!/^node scripts\/gpu\/cli\/[a-z]+\.ts$/.test(run[1].trim())) p.push(`${id} runs ${run[1].trim()}, which is not a script from scripts/gpu/cli`)
    }
    if (/pull_request\.head/.test(need(id))) p.push(`${id} reads the pull request's head`)
  }
  // Secrets stay in the jobs that start, stop and count pods.
  for (const id of ['plan', 'watch', 'gpu-smoke', 'gpu']) {
    if (/secrets\.(?!GITHUB_TOKEN)/.test(need(id)) || /vars\./.test(need(id))) p.push(`${id} reads a secret or a variable`)
  }
  // watch has the one permission and no other secret.
  if (!/permissions:\n {6}actions: write\n(?! {6})/.test(need('watch'))) p.push('watch has permissions other than `actions: write`')
  // An upload keeps for 3 days.
  for (const u of text.matchAll(/uses: actions\/upload-artifact@[^\n]*\n((?: {8,}.+\n)*)/g)) {
    if (!/retention-days: 3\n/.test(u[1])) p.push('an upload without `retention-days: 3`')
  }
  // The aggregate: always, every job's result, and the script that fails a cancelled job.
  const gpu = need('gpu')
  if (!/if: always\(\)/.test(gpu)) p.push('the `gpu` aggregate has no `if: always()`')
  for (const j of ['plan', 'pod-start', 'gpu-smoke', 'watch', 'pod-stop']) {
    if (!gpu.includes(`needs.${j}.result`)) p.push(`the \`gpu\` aggregate does not read ${j}'s result`)
  }
  if (!gpu.includes('node scripts/gpu/cli/aggregate.ts')) p.push('the `gpu` aggregate does not run aggregate.ts')
  // pod-stop always runs, the ledger is one at a time and never cancelled.
  if (!/if: always\(\) &&/.test(need('pod-stop'))) p.push('pod-stop does not always run')
  if (!/group: ax-ci-ledger\n\s+cancel-in-progress: false/.test(need('ledger'))) p.push('the ledger job is not one at a time and never cancelled')
  // The image is pinned by digest.
  if (!/ci-gpu@sha256:[0-9a-f]{64}/.test(need('pod-start'))) p.push('pod-start does not pin the image by digest')
  // Every action is pinned to a commit.
  for (const m of text.matchAll(/uses: ([^@\s]+)@(\S+)/g)) if (!/^[0-9a-f]{40}$/.test(m[2])) p.push(`${m[1]} is not pinned to a commit`)
  // A newer push stops only a pull request's run.
  if (!text.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")) p.push('cancel-in-progress is not limited to pull requests')
  return p
}

export function forkGuardProblems(text: string): string[] {
  const p: string[] = []
  const on = text.slice(text.indexOf('\non:'), text.indexOf('\npermissions:'))
  if (!/pull_request_target:/.test(on)) p.push('fork-guard does not run on pull_request_target (the base branch copy)')
  if (/\bedited\b/.test(on)) p.push('`edited` is in the triggers')
  if (!/types: \[opened, reopened, synchronize, ready_for_review\]/.test(on)) p.push('the types lack ready_for_review (R3-1)')
  if (!/merge_group:/.test(on)) p.push('fork-guard does not run in the merge queue')
  if (/actions\/checkout/.test(text) || /\bgit (clone|fetch|checkout)\b/.test(text)) p.push('fork-guard checks out something')
  if (!/^permissions: \{\}$/m.test(text)) p.push('the workflow-level permissions are not `{}`')
  const perms = [...text.matchAll(/^\s+([a-z-]+): (read|write|none)$/gm)].map((m) => `${m[1]}: ${m[2]}`)
  if (perms.join('|') !== 'pull-requests: write') p.push(`fork-guard has permissions ${perms.join(', ') || 'none'}, not only pull-requests: write`)
  if (!text.includes('gh pr ready --undo')) p.push('fork-guard does not turn a fork into a draft')
  if (!/exit 1/.test(text)) p.push('fork-guard does not fail a fork')
  if (/\$\{\{ github\.event\.pull_request\.(title|body|head\.ref)/.test(text)) p.push('fork-guard puts text a fork controls in a script')
  if (!/timeout-minutes: 5/.test(text)) p.push('fork-guard has no timeout')
  return p
}

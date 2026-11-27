// Nothing silent: the run summary names the GPU and cloud chosen and why, every pod replaced and why, every fall-back
// down the GPU list, and the count of each retried call. Warnings are annotations as well, so they show on the run page.
import type { Event } from './runpod.ts'
import type { Retries } from './http.ts'

export type Chosen = { gpu: string; cloud: string; costPerHr: number; priced: boolean; podId: string; label: string }

export function summaryLines(chosen: Chosen | null, events: Event[], retries: Retries, runner?: string): string[] {
  const lines: string[] = []
  if (chosen) {
    lines.push(
      `GPU: ${chosen.gpu} on ${chosen.cloud.toLowerCase()} cloud at $${chosen.costPerHr}/hr` +
        `${chosen.priced ? '' : ' (RunPod gave no price, booked at the dearest card)'}; pod ${chosen.label} (${chosen.podId}).`,
    )
    lines.push('Why this card: the first one in the list with stock; secure cloud only, so a host cannot read the pod.')
  }
  for (const e of events) lines.push(`${e.kind === 'fallback' ? 'Fell back' : e.kind === 'replaced' ? 'Pod replaced' : 'Note'}: ${e.text}`)
  for (const [call, n] of [...retries.entries()].sort()) lines.push(`Retried ${n} time${n === 1 ? '' : 's'}: ${call}`)
  if (runner) lines.push(`Runner version: ${runner}`)
  return lines
}

/** Markdown for `$GITHUB_STEP_SUMMARY` and `::warning::` lines for the annotations. */
export function render(lines: string[]): { markdown: string; annotations: string[] } {
  const warn = (l: string) => /^(Fell back|Pod replaced|Retried)/.test(l)
  return {
    markdown: lines.map((l) => `- ${l}`).join('\n') + (lines.length ? '\n' : ''),
    annotations: lines.filter(warn).map((l) => `::warning::${l.replace(/[\r\n%]/g, ' ')}`),
  }
}

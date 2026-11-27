// Names. A pod, its runner and its ledger entry share one label, made in its own step before anything is created,
// so a run that dies after the create can still be cleaned up by name (N3).
import { POD_PREFIX } from './config.ts'

/** Every pod a run attempt makes starts with this, so `pod-stop` needs no output from `pod-start` to find them. */
export function podPrefix(runId: string | number, attempt: string | number): string {
  return `${POD_PREFIX}${runId}-${attempt}-`
}

/**
 * `ax-ci-<run>-<attempt>-<time><random>`. The time (base 36, 8 characters) lets the sweep tell a pod's age from its
 * name even while RunPod has no runtime for it yet. The random part keeps two labels of one attempt apart.
 */
export function makeLabel(runId: string | number, attempt: string | number, nowMs: number, random: string): string {
  const time = nowMs.toString(36).padStart(8, '0')
  if (!/^[a-z0-9]{4,}$/.test(random)) throw new Error('the random part of a label is lowercase letters and digits')
  return `${podPrefix(runId, attempt)}${time}${random}`
}

export function isOurs(name: string): boolean {
  return name.startsWith(POD_PREFIX)
}

/** The time a label was made, or null for a name that is not one of ours or has no time. */
export function labelTime(name: string): number | null {
  const m = /^ax-ci-\d+-\d+-([0-9a-z]{8})[0-9a-z]{4,}(-\d)?$/.exec(name)
  if (!m) return null
  const t = parseInt(m[1], 36)
  return Number.isFinite(t) ? t : null
}

/** A replacement pod of the same run attempt: same prefix, a new label. */
export function runOf(name: string): { run: string; attempt: string } | null {
  const m = /^ax-ci-(\d+)-(\d+)-/.exec(name)
  return m ? { run: m[1], attempt: m[2] } : null
}

/** The name of the replacement pod for a label (and of its runner): same prefix, the label itself stays the job's. */
export function replacementName(label: string): string {
  return `${label}-2`
}

/** Y4-1: ledger variables use letters, digits and underscores only. */
export function ledgerVar(label: string): string {
  return `AX_CI_LEDGER_${label.replace(/-/g, '_')}`.toUpperCase()
}
export function spentVar(year: number, month: number): string {
  return `AX_CI_SPENT_${year}_${String(month).padStart(2, '0')}`
}
export function monthOf(ms: number): { year: number; month: number } {
  const d = new Date(ms)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

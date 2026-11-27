// Every value that decides how the GPU gate behaves lives here, so a test can pin each one and fail when it is put
// back. Nothing here reads the environment: the workflow passes what changes per run.

/** Every pod this repo starts is named with this prefix. Editors uses `ae-ci-`; the account has pods that are neither. */
export const POD_PREFIX = 'ax-ci-'

/** The repo's own name, which a job-started hook and the plan step compare against (case as GitHub writes it). */
export const REPO = 'AutomataFramework/AutomataFrameworkExamples'

/** Cheapest first among NVIDIA cards under $3 an hour. A card with no stock is skipped for the next one. */
export const GPU_ORDER: readonly string[] = [
  'NVIDIA GeForce RTX 4090',
  'NVIDIA RTX A6000',
  'NVIDIA L4',
  'NVIDIA A40',
  'NVIDIA GeForce RTX 5090',
]
export const MAX_PRICE_PER_HOUR = 3

/** Secure cloud only: a community host can read the container's environment, and with it RunPod's injected key. */
export const CLOUD = 'SECURE'

/** A runner that is not online this long after its pod was made means the pod never came up. */
export const ONLINE_WAIT_MS = 5 * 60 * 1000

/** `watch` cancels a run whose `gpu-smoke` has not started this long after the runner came online. */
export const WATCH_GRACE_MS = 3 * 60 * 1000

/** The sweep deletes `ax-ci-*` pods older than this: the three timeouts (12 + 15 + 5 minutes) plus 3. */
export const SWEEP_AGE_MIN = 35

/** At most this many `ax-ci-*` pods run at once; a fourth start is refused. */
export const MAX_RUNNING = 3

/**
 * The monthly cap for `ax-ci-*` pods. RunPod's billing read is not available to this repo's key, so the ledger
 * (the gate's own count) is the spend source and the $50 is split with Editors: $25 here, $25 there.
 */
export const CAP_USD = 25

/** The price booked for a pod RunPod gave no price for: the dearest card in the list, so the cap errs on the safe side. */
export const FALLBACK_COST_PER_HR = 3

/** A pod that never gets a job deletes itself after this long (the online wait twice, plus the watch grace). */
export const IDLE_LIMIT_MIN = 13

/** A pod deletes itself this long after its runner took its job, which is past `gpu-smoke`'s own 15 minutes. */
export const JOB_LIMIT_MIN = 20

/** The one job a pod's runner may take. */
export const ALLOWED_JOB = 'gpu-smoke'

/** Environment names `gpu-smoke` may see; any other name fails the job (the check proves no key got in). */
export const ENV_ALLOWLIST: readonly string[] = [
  'HOME',
  'HOSTNAME',
  'LANG',
  'LC_ALL',
  'NVIDIA_DRIVER_CAPABILITIES',
  'NVIDIA_VISIBLE_DEVICES',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PWD',
  'SHLVL',
  '_',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'TMPDIR',
  'CI',
  'RUNNER_TEMP',
  'RUNNER_TOOL_CACHE',
  'RUNNER_WORKSPACE',
  'RUNNER_NAME',
  'RUNNER_OS',
  'RUNNER_ARCH',
  'RUNNER_ENVIRONMENT',
  'RUNNER_TRACKING_ID',
  'ACTIONS_ORCHESTRATION_ID',
  'ImageOS',
  'ImageVersion',
  'AGENT_TOOLSDIRECTORY',
  'DOTNET_SYSTEM_GLOBALIZATION_INVARIANT',
  'INVOCATION_ID',
  'JOURNAL_STREAM',
  'OLDPWD',
]

/** Names that start with one of these are GitHub's own, set per step (GITHUB_*, INPUT_*, RUNNER_*, ACTIONS_*). */
export const ENV_PREFIXES: readonly string[] = ['GITHUB_', 'INPUT_', 'RUNNER_', 'ACTIONS_']

/** Names that fail `gpu-smoke` whatever else is true: they would reach beyond this one job. */
export const ENV_FORBIDDEN_PREFIXES: readonly string[] = ['RUNPOD_', 'JIT_']

/** A card id RunPod accepts is an NVIDIA name as the catalog writes it (measured: "NVIDIA GeForce RTX 4090"). */
export function isGpuName(name: string): boolean {
  return /^NVIDIA [A-Za-z0-9 ]+$/.test(name)
}

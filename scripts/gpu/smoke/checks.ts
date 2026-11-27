// What `gpu-smoke` judges. Kept apart from the part that drives Chromium so tests can feed it any answer.
import { ENV_ALLOWLIST, ENV_FORBIDDEN_PREFIXES, ENV_PREFIXES } from '../config.ts'

/** Names in the job's environment that are not allowed. A forbidden prefix (a RunPod or runner-config name) is named first. */
export function envProblems(names: string[]): string[] {
  const out: string[] = []
  for (const n of names) {
    if (ENV_FORBIDDEN_PREFIXES.some((p) => n.startsWith(p))) out.push(`${n} must never reach a job`)
    else if (!ENV_ALLOWLIST.includes(n) && !ENV_PREFIXES.some((p) => n.startsWith(p))) out.push(`${n} is not on the allowlist`)
  }
  return out
}

/** A real NVIDIA card drawing through Vulkan, or the reason it is not one. SwiftShader and llvmpipe are software. */
export function rendererProblem(webgl2: boolean, renderer: string | null): string | null {
  if (!webgl2) return 'WebGL2 is not available'
  if (!renderer) return 'the renderer name is hidden'
  if (/swiftshader|llvmpipe|software/i.test(renderer)) return `Chromium fell back to software drawing (${renderer})`
  if (!/nvidia/i.test(renderer)) return `the renderer is not an NVIDIA GPU (${renderer})`
  return null
}

/** The flags that give WebGL2 on the pod's NVIDIA driver (measured: without them there is no WebGL2 at all). */
export const VULKAN_ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox']

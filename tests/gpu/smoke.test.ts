import { describe, test } from 'node:test'
import { envProblems, rendererProblem, VULKAN_ARGS } from '../../scripts/gpu/smoke/checks.ts'
import { expect } from '../expect.ts'

describe('gpu-smoke judges', () => {
  test('the names the pod showed in the measured run pass, with GitHub step names', () => {
    const names = ['HOME', 'HOSTNAME', 'LANG', 'LC_ALL', 'NVIDIA_DRIVER_CAPABILITIES', 'NVIDIA_VISIBLE_DEVICES', 'PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'PWD', 'SHLVL', '_', 'GITHUB_RUN_ID', 'RUNNER_TEMP', 'ACTIONS_RUNTIME_URL']
    expect(envProblems(names)).toEqual([])
  })
  test('RUNPOD_API_KEY is named as something that must never reach a job, and so is any RUNPOD_ name', () => {
    expect(envProblems(['PATH', 'RUNPOD_API_KEY'])[0]).toContain('must never reach a job')
    expect(envProblems(['RUNPOD_POD_ID'])[0]).toContain('must never reach a job')
    expect(envProblems(['JIT_CONFIG'])[0]).toContain('must never reach a job')
  })
  test('a name outside the allowlist fails, and the value is never printed', () => {
    const p = envProblems(['PATH', 'MY_SECRET_THING'])
    expect(p).toEqual(['MY_SECRET_THING is not on the allowlist'])
  })
  test('an NVIDIA renderer through Vulkan passes', () => {
    expect(rendererProblem(true, 'ANGLE (NVIDIA, Vulkan 1.4.329 (NVIDIA NVIDIA GeForce RTX 4090 (0x00002684)))')).toBeNull()
  })
  test('Chromium falling back to SwiftShader fails', () => {
    expect(rendererProblem(true, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toContain('software')
    expect(rendererProblem(true, 'llvmpipe (LLVM 15)')).toContain('software')
  })
  test('no WebGL2 fails; a hidden renderer fails; a non-NVIDIA card fails', () => {
    expect(rendererProblem(false, null)).toContain('WebGL2')
    expect(rendererProblem(true, null)).toContain('hidden')
    expect(rendererProblem(true, 'Intel(R) UHD')).toContain('not an NVIDIA')
  })
  test('the Vulkan flags are the measured ones', () => {
    expect(VULKAN_ARGS).toContain('--use-angle=vulkan')
    expect(VULKAN_ARGS).toContain('--enable-features=Vulkan')
  })
})

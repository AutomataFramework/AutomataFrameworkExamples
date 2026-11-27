import assert from 'node:assert/strict'
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, test } from 'node:test'
import { APP_PERMISSIONS, appJwt, installationCaller, makeJit, runnerOnline } from '../../scripts/gpu/github.ts'
import { expect } from '../expect.ts'
import { deps, world } from './fakes.ts'

describe('GitHub', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  test('the App JWT is RS256, backdated a minute, valid nine, and verifies', () => {
    const now = Date.parse('2026-11-27T12:00:00Z')
    const jwt = appJwt('12345', privateKey, now)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims.iss).toBe('12345')
    expect(claims.exp - claims.iat).toBe(540)
    expect(claims.iat).toBe(Math.floor(now / 1000) - 60)
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(createPublicKey(publicKey), Buffer.from(s, 'base64url'))).toBe(true)
  })
  test('the token is asked for this repo only, with administration and variables write only', async () => {
    const { w, fetchFn } = world()
    const asked: any[] = []
    const wrapped: typeof fetchFn = async (url, init) => {
      if (url.includes('access_tokens')) {
        asked.push(JSON.parse(init!.body!))
        return { status: 201, text: async () => JSON.stringify({ token: 'tok' }) }
      }
      return fetchFn(url, init)
    }
    await installationCaller(wrapped, '1', privateKey, 'AutomataFramework/AutomataFrameworkExamples', Date.now())
    expect(asked[0]).toEqual({ repositories: ['AutomataFrameworkExamples'], permissions: { administration: 'write', variables: 'write' } })
    expect(APP_PERMISSIONS).toEqual({ administration: 'write', variables: 'write' })
    void w
  })
  test('a runner config asks for one custom label and is refused if GitHub adds another', async () => {
    const { d, w } = deps()
    const r = await makeJit(d.gh, d.repo, 'ax-ci-1-1-aaaaaaaabbbb', 'ax-ci-1-1-aaaaaaaabbbb')
    expect(r.jit).toBe('jit-for-ax-ci-1-1-aaaaaaaabbbb')
    w.extraLabels = ['gpu']
    await assert.rejects(makeJit(d.gh, d.repo, 'n2', 'l2'), /labels it was not asked for: gpu/)
    expect(w.runners.some((x) => x.name === 'n2')).toBe(false)
  })
  test('a runner is online only when GitHub says so', async () => {
    const { d, w } = deps()
    await makeJit(d.gh, d.repo, 'n', 'n')
    expect(await runnerOnline(d.gh, d.repo, 'n')).toBe(false)
    w.runners[0].status = 'online'
    expect(await runnerOnline(d.gh, d.repo, 'n')).toBe(true)
  })
})

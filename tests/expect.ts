// A tiny stand-in for Vitest's `expect`, so the tests run on Node's own test runner with no dependencies until
// slice 1a brings the game stack. It has only the matchers these tests use.
import assert from 'node:assert/strict'

type Matchers = {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toContain(expected: unknown): void
  toHaveLength(expected: number): void
  toBeNull(): void
  toBeUndefined(): void
}

function matchers(actual: unknown, negate: boolean): Matchers {
  const check = (pass: boolean, message: string): void => {
    if (pass === negate) assert.fail(negate ? `not: ${message}` : message)
  }
  const has = (expected: unknown): boolean =>
    typeof actual === 'string' ? actual.includes(String(expected)) : (actual as unknown[]).includes(expected)
  const deepEqual = (expected: unknown): boolean => {
    try {
      assert.deepStrictEqual(actual, expected)
      return true
    } catch {
      return false
    }
  }
  return {
    toBe: (expected) => check(Object.is(actual, expected), `${String(actual)} is ${String(expected)}`),
    toEqual: (expected) => check(deepEqual(expected), `${JSON.stringify(actual)} equals ${JSON.stringify(expected)}`),
    toContain: (expected) => check(has(expected), `${JSON.stringify(actual)} contains ${JSON.stringify(expected)}`),
    toHaveLength: (expected) =>
      check((actual as { length: number }).length === expected, `${JSON.stringify(actual)} has length ${expected}`),
    toBeNull: () => check(actual === null, `${JSON.stringify(actual)} is null`),
    toBeUndefined: () => check(actual === undefined, `${JSON.stringify(actual)} is undefined`),
  }
}

export function expect(actual: unknown): Matchers & { not: Matchers } {
  return Object.assign(matchers(actual, false), { not: matchers(actual, true) })
}

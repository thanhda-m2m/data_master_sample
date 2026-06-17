import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit, resetRateLimitStore } from '../rate-limit'

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitStore()
    vi.useRealTimers()
  })

  it('allows requests until the limit is reached', () => {
    expect(checkRateLimit('ip-1', 2, 60_000)).toMatchObject({ allowed: true, remaining: 1 })
    expect(checkRateLimit('ip-1', 2, 60_000)).toMatchObject({ allowed: true, remaining: 0 })
    expect(checkRateLimit('ip-1', 2, 60_000)).toMatchObject({ allowed: false, remaining: 0 })
  })

  it('resets the limit after the window expires', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T00:00:00Z'))

    expect(checkRateLimit('ip-2', 1, 1_000).allowed).toBe(true)
    expect(checkRateLimit('ip-2', 1, 1_000).allowed).toBe(false)

    vi.advanceTimersByTime(1_001)

    expect(checkRateLimit('ip-2', 1, 1_000).allowed).toBe(true)
  })

  it('tracks different keys independently', () => {
    expect(checkRateLimit('ip-a', 1, 60_000).allowed).toBe(true)
    expect(checkRateLimit('ip-b', 1, 60_000).allowed).toBe(true)
    expect(checkRateLimit('ip-a', 1, 60_000).allowed).toBe(false)
    expect(checkRateLimit('ip-b', 1, 60_000).allowed).toBe(false)
  })
})

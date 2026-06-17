import { describe, expect, it } from 'vitest'
import { getCurrentTenant, runWithTenant } from '../tenant-context'

describe('tenant-context', () => {
  it('returns the current tenant inside the context scope', () => {
    expect(runWithTenant('takdemo', () => getCurrentTenant())).toBe('takdemo')
  })

  it('isolates nested tenant scopes', () => {
    const result = runWithTenant('parent', () => ({
      current: getCurrentTenant(),
      nested: runWithTenant('child', () => getCurrentTenant()),
      restored: getCurrentTenant(),
    }))

    expect(result).toEqual({
      current: 'parent',
      nested: 'child',
      restored: 'parent',
    })
  })

  it('keeps concurrent async scopes isolated', async () => {
    const [first, second] = await Promise.all([
      runWithTenant('tenant-a', async () => {
        await Promise.resolve()
        return getCurrentTenant()
      }),
      runWithTenant('tenant-b', async () => {
        await Promise.resolve()
        return getCurrentTenant()
      }),
    ])

    expect(first).toBe('tenant-a')
    expect(second).toBe('tenant-b')
  })
})

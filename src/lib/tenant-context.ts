/**
 * AsyncLocalStorage-based tenant context for request lifecycle.
 * Binds tenant code to async execution context.
 */

import { AsyncLocalStorage } from 'async_hooks'

const tenantContext = new AsyncLocalStorage<string>()

/**
 * Run function with tenant context bound to AsyncLocalStorage.
 * All async operations within fn will have access to tenantCode via getCurrentTenant().
 *
 * @param tenantCode - Tenant identifier (buscomps.loginid)
 * @param fn - Function to execute with tenant context
 * @returns Result of fn execution
 */
export function runWithTenant<T>(tenantCode: string, fn: () => T): T {
  return tenantContext.run(tenantCode, fn)
}

/**
 * Get current tenant code from AsyncLocalStorage context.
 * Returns undefined if called outside runWithTenant scope.
 *
 * @returns Current tenant code or undefined
 */
export function getCurrentTenant(): string | undefined {
  return tenantContext.getStore()
}

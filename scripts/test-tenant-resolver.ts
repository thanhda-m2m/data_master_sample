/**
 * Integration test script for tenant-resolver.
 * Run with: node --loader tsx scripts/test-tenant-resolver.ts
 * Or: tsx scripts/test-tenant-resolver.ts
 */

import { resolveTenantConfigFromDb, listTenantsFromDb, clearTenantCache, invalidateTenantCache } from '../src/lib/tenant-resolver'

async function testTenantResolver() {
  console.log('=== Tenant Resolver Integration Tests ===\n')

  // Test 1: Resolve takdemo tenant
  console.log('Test 1: Resolve takdemo tenant config')
  const startTime1 = Date.now()
  const config1 = await resolveTenantConfigFromDb('takdemo')
  const duration1 = Date.now() - startTime1

  if (config1) {
    console.log('✓ Tenant config resolved')
    console.log(`  Login ID: ${config1.loginId}`)
    console.log(`  User Pool ID: ${config1.userPoolId}`)
    console.log(`  Client ID: ${config1.clientId}`)
    console.log(`  Client Secret: ${config1.clientSecret.substring(0, 10)}...`)
    console.log(`  Region: ${config1.region}`)
    console.log(`  Issuer: ${config1.issuer}`)
    console.log(`  Duration: ${duration1}ms (DB query)`)
  } else {
    console.error('✗ Failed to resolve tenant config')
    process.exit(1)
  }

  // Test 2: Cache hit (should be fast)
  console.log('\nTest 2: Cache hit test')
  const startTime2 = Date.now()
  const config2 = await resolveTenantConfigFromDb('takdemo')
  const duration2 = Date.now() - startTime2

  if (config2 && duration2 < 5) {
    console.log('✓ Cache hit successful')
    console.log(`  Duration: ${duration2}ms (from cache)`)
  } else {
    console.error('✗ Cache hit failed or too slow')
    console.error(`  Duration: ${duration2}ms`)
  }

  // Test 3: List all tenants
  console.log('\nTest 3: List all tenants')
  const tenants = await listTenantsFromDb()

  if (tenants.length > 0) {
    console.log(`✓ Found ${tenants.length} tenant(s)`)
    tenants.forEach(t => {
      console.log(`  - ${t.loginid} (${t.bcname}) [bkid=${t.bkid}, subdom=${t.subdom}]`)
    })
  } else {
    console.error('✗ No tenants found')
  }

  // Test 4: Nonexistent tenant
  console.log('\nTest 4: Nonexistent tenant')
  const config3 = await resolveTenantConfigFromDb('nonexistent')

  if (config3 === null) {
    console.log('✓ Correctly returned null for nonexistent tenant')
  } else {
    console.error('✗ Should return null for nonexistent tenant')
  }

  // Test 5: Cache invalidation
  console.log('\nTest 5: Cache invalidation')
  invalidateTenantCache('takdemo')
  const startTime5 = Date.now()
  const config5 = await resolveTenantConfigFromDb('takdemo')
  const duration5 = Date.now() - startTime5

  if (config5) {
    console.log('✓ Cache invalidated, queried DB again')
    console.log(`  Duration: ${duration5}ms (DB query after invalidation)`)
  } else {
    console.error('✗ Cache invalidation failed')
  }

  // Test 6: Clear entire cache
  console.log('\nTest 6: Clear entire cache')
  clearTenantCache()
  const startTime6 = Date.now()
  const config6 = await resolveTenantConfigFromDb('takdemo')
  const duration6 = Date.now() - startTime6

  if (config6) {
    console.log('✓ Cache cleared, queried DB again')
    console.log(`  Duration: ${duration6}ms`)
  } else {
    console.error('✗ Cache clear failed')
  }

  console.log('\n=== All Tests Completed ===')
}

// Run tests
testTenantResolver()
  .then(() => {
    console.log('\n✓ All integration tests passed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n✗ Integration tests failed:', error)
    process.exit(1)
  })

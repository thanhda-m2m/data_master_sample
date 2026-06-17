import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantConfigFromDb } from '@/lib/tenant-resolver'
import { resolveTenantConfig } from '@/lib/env-config'

function buildSmartiMateTenantUrl(authorizeUrl: string, tenant: string) {
  const url = new URL(authorizeUrl)
  return `${url.origin}/${tenant}/`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { target, tenant } = body as { target: string; tenant: string }

    if (target !== 'smartimate') {
      return NextResponse.json({ error: 'Unsupported target' }, { status: 400 })
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })
    }

    const config = await resolveTenantConfigFromDb(tenant) ?? await resolveTenantConfig(tenant)
    if (!config) {
      return NextResponse.json({ error: 'Tenant config not found' }, { status: 404 })
    }

    return NextResponse.json({
      redirectUrl: buildSmartiMateTenantUrl(config.smartimateAuthorizeUrl, tenant),
      sessionActive: true,
    })
  } catch (error) {
    console.error('SSO link error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

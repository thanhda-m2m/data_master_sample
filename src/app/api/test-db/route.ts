import { listTenants, resolveTenantConfig } from '@/lib/tenant-resolver'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const cookieTenant = request.headers
      .get('cookie')
      ?.split(';')
      .map(value => value.trim().split('='))
      .find(([key]) => key === 'datamaster_tenant')?.[1]
    const tenant = url.searchParams.get('tenant') || cookieTenant || ''

    if (!tenant) {
      const tenants = await listTenants()
      return Response.json({ success: true, tenants })
    }

    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(tenant)) {
      return Response.json({ success: false, error: 'Invalid tenant format' }, { status: 400 })
    }

    const config = await resolveTenantConfig(tenant)
    if (!config) {
      return Response.json({ success: false, tenant, error: 'Tenant not found' }, { status: 404 })
    }

    const safeConfig: Record<string, unknown> = { ...config }
    delete safeConfig.clientSecret
    return Response.json({ success: true, tenant, config: safeConfig })
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}

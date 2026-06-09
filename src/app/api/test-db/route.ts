import { resolveTenantConfig } from '@/lib/tenant-resolver'

export async function GET() {
  try {
    const config = await resolveTenantConfig('testcogfix2')
    return Response.json({ success: true, config })
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}

import { getSession } from '@/lib/auth'
import { listTenants } from '@/lib/tenant-resolver'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const session = await getSession()

  if (session) {
    redirect('/dashboard')
  }

  const tenants = await listTenants()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">Data Master Sample</h1>
        <p className="text-lg text-gray-600">
          POC for Smart iMATE OAuth integration with Cognito
        </p>
        <div className="space-y-3">
          {tenants.map(tenant => (
            <div key={tenant.bkid} className="flex items-center justify-center gap-3">
              <span className="text-sm text-gray-500 min-w-[80px] text-right">
                {tenant.bcname || tenant.compname || `Tenant ${tenant.bkid}`}
              </span>
              <Link
                href={`/api/auth/signin?tenant=${tenant.loginId}`}
                className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 font-medium"
              >
                Sign In
              </Link>
            </div>
          ))}
          {tenants.length === 0 && (
            <p className="text-sm text-red-500">No tenants with SSO enabled found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

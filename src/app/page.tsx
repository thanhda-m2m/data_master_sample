import { getSession } from '@/lib/auth'
import { listTenants } from '@/lib/env-config'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await getSession()

  if (session) {
    redirect('/dashboard')
  }

  const tenants = await listTenants()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">データマスター サンプル</h1>
        <p className="text-lg text-gray-600">
          Smart iMATE OAuth統合とCognitoのPOC
        </p>
        <div className="space-y-3">
          {tenants.map(tenant => (
            <div key={tenant.bkid} className="flex items-center justify-center gap-3">
              <span className="text-sm text-gray-500 min-w-[80px] text-right">
                {tenant.bcname || tenant.compname || `Tenant ${tenant.bkid}`}
              </span>
              <a
                href={`/api/auth/signin?tenant=${tenant.loginId}`}
                className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 font-medium"
              >
                サインイン
              </a>
            </div>
          ))}
          {tenants.length === 0 && (
            <p className="text-sm text-red-500">SSOが有効なテナントが見つかりません。</p>
          )}
        </div>
      </div>
    </div>
  )
}

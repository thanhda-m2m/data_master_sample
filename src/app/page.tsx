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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="max-w-lg text-center space-y-8">
        {/* Hero */}
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-2">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-slate-900">データマスター</h1>
          <p className="text-lg text-slate-600 font-medium">
            エンタープライズSSO認証ゲートウェイ
          </p>
          <p className="text-sm text-slate-500">
            Smart iMATE OAuth統合 & Cognitoセキュアアクセス
          </p>
        </div>

        {/* Tenant Selection */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
            テナントを選択
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tenants.length > 0 ? (
              tenants.map(tenant => (
                <a
                  key={tenant.bkid}
                  href={`/api/auth/signin?tenant=${tenant.loginId}`}
                  className="block group rounded-lg border-2 border-slate-200 bg-white px-6 py-4 text-left transition-all hover:border-blue-500 hover:bg-blue-50 hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 group-hover:text-blue-600">
                        {tenant.bcname || tenant.compname || `Tenant ${tenant.bkid}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        ID: {tenant.loginId}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              ))
            ) : (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">
                  ⚠️ SSOが有効なテナントが見つかりません。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Smart iMATE OAuth フロー • Cognito統合
          </p>
        </div>
      </div>
    </div>
  )
}

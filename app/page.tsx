import {getSession} from '@/lib/auth'
import {listTenantsFromDb} from '@/lib/tenant-resolver'
import {checkRateLimit} from '@/lib/rate-limit'
import {getRequestIp, logAuditEvent} from '@/lib/audit-log'
import {headers} from 'next/headers'
import {redirect} from 'next/navigation'
import {TenantSelectionForm} from '@/components/tenant-selection-form'

export default async function Home() {
    const session = await getSession()

    if (session) {
        redirect('/dashboard')
    }

    const requestHeaders = await headers()
    const ip = getRequestIp(requestHeaders)
    const rateLimit = checkRateLimit(`tenant-list:${ip}`, 10, 60_000)

    if (!rateLimit.allowed) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
                <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <h1 className="text-xl font-semibold text-amber-900">アクセスが集中しています</h1>
                    <p className="mt-3 text-sm text-amber-800">
                        テナント一覧の取得回数が上限に達しました。1分ほど待ってから再試行してください。
                    </p>
                </div>
            </div>
        )
    }

    const tenants = (await listTenantsFromDb()).sort((left, right) =>
        (left.bcname || left.compname || '').localeCompare(right.bcname || right.compname || '')
    )

    if (tenants.length > 0) {
        logAuditEvent('tenant_select', 'list', requestHeaders, {ip, source: 'home_page_render'})
    }

    return (
        <div
            className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
            <div className="max-w-lg text-center space-y-8">
                {/* Hero */}
                <div className="space-y-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-2">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                    </div>
                    <h1 className="text-4xl font-bold text-slate-900">デジタル保全マイスター</h1>
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
                    {tenants.length > 0 ? (
                        <TenantSelectionForm tenants={tenants}/>
                    ) : (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                            <p className="text-sm text-red-700">
                                SSOが有効なテナントが見つかりません。
                            </p>
                        </div>
                    )}
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

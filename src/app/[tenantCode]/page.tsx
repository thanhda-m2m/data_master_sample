import {SsoButton} from '@/components/sso-buttons'
import {getSession} from '@/lib/auth'
import {redirect} from 'next/navigation'
import {SignOutButton} from '../dashboard/signout-button'
import {Greeting} from './geeting'

const TENANT_CODE_FORMAT = /^[a-zA-Z0-9_-]{1,50}$/

type TenantDashboardPageProps = {
    params: Promise<{ tenantCode: string }>
    searchParams: Promise<{ logout?: string }>
}

export default async function TenantDashboardPage({params, searchParams}: TenantDashboardPageProps) {
    const [{tenantCode}, session, {logout}] = await Promise.all([params, getSession(), searchParams])

    if (!TENANT_CODE_FORMAT.test(tenantCode)) {
        redirect('/')
    }

    if (logout === 'true') {
        return <Greeting tenantCode={tenantCode}/>
    }

    if (!session || tenantCode !== session.tenant) {
        redirect(`/api/auth/signin?tenant=${tenantCode}&callbackUrl=/${tenantCode}`)
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6 md:p-8">
            <div className="mx-auto max-w-3xl space-y-8">
                {/* Header */}
                <div className="space-y-2">
                    <h1 className="text-4xl font-bold text-slate-900">ダッシュボード</h1>
                    <p className="text-slate-600">セッション情報と設定</p>
                </div>

                {/* User Info Card */}
                <div
                    className="rounded-lg border-2 border-slate-200 bg-white p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        ユーザー情報
                    </h2>
                    <dl className="space-y-4">
                        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                            <dt className="font-semibold text-slate-700">メールアドレス</dt>
                            <dd className="text-slate-600 text-right font-mono text-sm">{session.user.email}</dd>
                        </div>
                        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                            <dt className="font-semibold text-slate-700">表示名</dt>
                            <dd className="text-slate-600 text-right">{session.user.name}</dd>
                        </div>

                        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                            <dt className="font-semibold text-slate-700">電話番号</dt>
                            <dd className="text-slate-600 text-right font-mono text-sm">{session.user.phoneNumber}</dd>
                        </div>

                        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                            <dt className="font-semibold text-slate-700">ユーザーID</dt>
                            <dd className="text-slate-600 text-right font-mono text-xs bg-slate-100 px-3 py-1 rounded">{session.user.id}</dd>
                        </div>
                        <div className="flex items-start justify-between">
                            <dt className="font-semibold text-slate-700">テナント</dt>
                            <dd className="text-slate-600 text-right font-mono text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded">{session.tenant}</dd>
                        </div>
                    </dl>
                </div>

                {/* Actions Card */}
                <div className="rounded-lg border-2 border-slate-200 bg-white p-6 md:p-8 shadow-sm">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94
                                  3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724
                                  1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426
                                  1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724
                                  1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0
                                  001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        操作
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <SsoButton
                            target="smartimate"
                            tenant={session.tenant}
                            accessToken={session.accessToken}
                            label="Smart iMATEへ移動"
                        />
                        <SignOutButton redirectTo={`/${session.tenant}`}/>
                    </div>
                </div>

                {/* Session Info */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                    <p className="text-sm text-blue-700">
                        <strong>🔒 セッション状態:</strong> アクティブ • Smart iMATE OAuth統合により保護されています
                    </p>
                </div>
            </div>
        </div>
    )
}

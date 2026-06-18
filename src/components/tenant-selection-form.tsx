'use client'

import type {TenantSummary} from '@/lib/tenant-types'

export function TenantSelectionForm({tenants}: { tenants: TenantSummary[] }) {
    return (
        <form action="/api/auth/signin" method="get" className="space-y-3">
            <label className="sr-only" htmlFor="tenant">
                テナント
            </label>
            <select
                id="tenant"
                name="tenant"
                defaultValue=""
                required
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-5 py-4 text-left text-base font-semibold text-slate-900 outline-none transition-colors hover:border-blue-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            >
                <option value="" disabled>
                    テナントを選択してください
                </option>
                {tenants.map(tenant => {
                    const name = tenant.bcname || tenant.compname || `Tenant ${tenant.bkid}`
                    return (
                        <option key={tenant.bkid} value={tenant.loginId}>
                            {name} (ID: {tenant.loginId})
                        </option>
                    )
                })}
            </select>
            <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
                サインイン
            </button>
        </form>
    )
}

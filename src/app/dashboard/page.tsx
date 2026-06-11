import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SignOutButton } from './signout-button'
import { SsoButton } from '@/components/sso-buttons'

export default async function DashboardPage() {
  const session = await getSession()

  if (!session) {
    redirect('/')
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold">ダッシュボード</h1>

        <div className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">ユーザー情報</h2>
          <dl className="space-y-2">
            <div>
              <dt className="font-medium">メール:</dt>
              <dd className="text-gray-600">{session.user.email}</dd>
            </div>
            <div>
              <dt className="font-medium">名前:</dt>
              <dd className="text-gray-600">{session.user.name}</dd>
            </div>
            <div>
              <dt className="font-medium">テナント:</dt>
              <dd className="text-gray-600 font-mono text-sm">{session.tenant}</dd>
            </div>
            <div>
              <dt className="font-medium">ユーザーID:</dt>
              <dd className="text-gray-600 font-mono text-sm">{session.user.id}</dd>
            </div>
          </dl>
        </div>

        <div className="flex gap-4">
          <SsoButton target="smartimate" tenant={session.tenant} accessToken={session.accessToken} />
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}

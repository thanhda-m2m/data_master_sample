import Link from 'next/link'

const errorMessages: Record<string, { title: string; message: string; action: string; actionHref: string }> = {
    Configuration: {
        title: '設定エラー',
        message: '認証サービスの設定が正しくありません。サポートにお問い合わせください。',
        action: 'サポートに連絡',
        actionHref: '/',
    },
    AccessDenied: {
        title: 'アクセス拒否',
        message: 'このアプリケーションへのアクセス権限がありません。',
        action: '再試行',
        actionHref: '/',
    },
    Verification: {
        title: '確認が必要',
        message: 'メールまたは電話の確認が必要です。受信トレイで確認コードを確認してください。',
        action: '再試行',
        actionHref: '/',
    },
    InvalidTenant: {
        title: '無効なテナント',
        message: 'テナントサブドメインが無効または無効化されています。URLを確認して再試行してください。',
        action: 'ホームに戻る',
        actionHref: '/',
    },
    InvalidCallback: {
        title: '無効なリダイレクト',
        message: 'リダイレクトURLが許可されていません。セキュリティ上の問題の可能性があります。',
        action: 'ホームに戻る',
        actionHref: '/',
    },
    RefreshAccessTokenError: {
        title: 'セッション期限切れ',
        message: 'セッションの有効期限が切れました。再度ログインしてください。',
        action: 'ログイン',
        actionHref: '/api/auth/signin',
    },
    invalid_session: {
        title: '認証失敗',
        message: '無効な認証セッションです。再試行してください。',
        action: '再試行',
        actionHref: '/',
    },
    invalid_state: {
        title: '認証失敗',
        message: '無効な認証セッションです。再試行してください。',
        action: '再試行',
        actionHref: '/',
    },
    invalid_client: {
        title: 'OAuthクライアント未登録',
        message: 'DataMasterがSmart iMATEにOAuthクライアントとして登録されていません。',
        action: '再試行',
        actionHref: '/',
    },
    tenant_not_found: {
        title: 'テナントが見つかりません',
        message: 'テナント設定が見つかりません。',
        action: 'ホームに戻る',
        actionHref: '/',
    },
    token_exchange_failed: {
        title: '認証失敗',
        message: '認証を完了できませんでした。再試行してください。',
        action: '再試行',
        actionHref: '/',
    },
    internal_error: {
        title: '内部エラー',
        message: '内部エラーが発生しました。再試行するか、サポートにお問い合わせください。',
        action: '再試行',
        actionHref: '/',
    },
    Default: {
        title: '認証失敗',
        message: '認証中にエラーが発生しました。再試行するか、サポートにお問い合わせください。',
        action: '再試行',
        actionHref: '/',
    },
}

export default async function AuthError({
                                            searchParams,
                                        }: {
    searchParams: Promise<{ error?: string }>
}) {
    const params = await searchParams
    const errorCode = params.error || 'Default'
    const error = errorMessages[errorCode] || errorMessages.Default

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
                <h1 className="text-2xl font-bold text-red-600 mb-4">{error.title}</h1>
                <p className="text-gray-700 mb-6">{error.message}</p>
                <div className="space-y-2">
                    <Link
                        href={error.actionHref}
                        className="block text-center bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                    >
                        {error.action}
                    </Link>
                    <Link
                        href="/"
                        className="block text-center text-sm text-gray-500 hover:text-gray-700"
                    >
                        ホームに戻る
                    </Link>
                </div>
                {errorCode !== 'Default' && (
                    <p className="mt-6 text-center text-xs text-gray-400">エラーコード: {errorCode}</p>
                )}
            </div>
        </div>
    )
}

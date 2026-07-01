interface GreetingProps {
    tenantCode: string;
}

export const Greeting = ({tenantCode}: GreetingProps) => {
    return (
        <div
            className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
            <div className="w-full max-w-lg text-center space-y-8">
                <div className="space-y-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-2">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor"
                             viewBox="0 0 24 24" aria-hidden="true">
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

                <form action="/api/auth/signin" method="get" className="space-y-3">
                    <input type="hidden" name="tenant" value={tenantCode}/>
                    <input type="hidden" name="callbackUrl" value={`/${tenantCode}`}/>

                    <button
                        type="submit"
                        className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    >
                        サインイン
                    </button>
                </form>

                <div className="pt-4 border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                        Smart iMATE OAuth フロー • Cognito統合
                    </p>
                </div>
            </div>
        </div>
    );
}

'use client'

export function SignOutButton() {
  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center justify-center gap-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 px-6 py-3 text-base font-semibold text-slate-700 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      サインアウト
    </button>
  )
}

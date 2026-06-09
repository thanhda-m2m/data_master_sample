'use client'

export function SignOutButton() {
  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      Sign Out
    </button>
  )
}

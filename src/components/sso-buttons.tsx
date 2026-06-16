'use client'

import { useState } from 'react'

interface SsoButtonProps {
  target: 'smartimate'
  tenant: string
  accessToken?: string
  label?: string
}

export function SsoButton({ target, tenant, accessToken, label }: SsoButtonProps) {
  const [loading, setLoading] = useState(false)
  const buttonText = label || `${target === 'smartimate' ? 'Smart iMATE' : 'DataMaster'}にログイン`

  async function handleClick() {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/sso-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, tenant, accessToken }),
      })

      const data = await response.json()

      if (data.redirectUrl) {
        if (data.sessionActive) {
          window.location.href = data.redirectUrl
        } else {
          window.location.href = data.redirectUrl
        }
      }
    } catch (error) {
      console.error('SSO button error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-6 py-3 text-base font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          接続中...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {buttonText}
        </>
      )}
    </button>
  )
}

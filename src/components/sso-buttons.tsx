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
          // Open in same window since session already active
          window.location.href = data.redirectUrl
        } else {
          // Open OAuth flow in same window
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
      className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
    >
      {loading ? '接続中...' : buttonText}
    </button>
  )
}

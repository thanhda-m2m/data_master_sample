'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

function subscribeToHydrationStore() {
  return () => {}
}

function shouldShowSuccessBanner() {
  if (typeof window === 'undefined') {
    return false
  }

  const params = new URLSearchParams(window.location.search)
  return params.get('sso_success') === 'true' || params.get('login_success') === 'true'
}

export function FireworksBanner() {
  const shouldShow = useSyncExternalStore(
    subscribeToHydrationStore,
    shouldShowSuccessBanner,
    () => false
  )
  const [dismissed, setDismissed] = useState(false)
  const show = shouldShow && !dismissed
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => setDismissed(true), 4000)
      return () => clearTimeout(timer)
    }
  }, [show])

  useEffect(() => {
    if (!show || !containerRef.current) return

    // Create fireworks particles
    const colors = ['#2563eb', '#3b82f6', '#f97316', '#10b981', '#8b5cf6']
    const particleCount = 50

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div')
      const angle = (Math.PI * 2 * i) / particleCount
      const velocity = 3 + Math.random() * 5
      const tx = Math.cos(angle) * velocity
      const ty = Math.sin(angle) * velocity

      particle.className = 'firework'
      particle.style.cssText = `
        position: fixed;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: ${colors[Math.floor(Math.random() * colors.length)]};
        left: 50%;
        top: 50%;
        --tx: ${tx}rem;
        --ty: ${ty}rem;
        z-index: 50;
      `

      containerRef.current.appendChild(particle)

      setTimeout(() => particle.remove(), 800)
    }
  }, [show])

  if (!show) return null

  return (
    <>
      <div ref={containerRef} className="pointer-events-none fixed inset-0" />
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-center p-4 animate-pulse">
        <div className="rounded-lg bg-gradient-to-r from-green-400 to-emerald-500 px-8 py-4 text-center shadow-lg">
          <h2 className="text-xl font-bold text-white">ログイン成功！🎉</h2>
          <p className="mt-1 text-sm text-white opacity-90">Smart iMATEからの認証が完了しました</p>
        </div>
      </div>
    </>
  )
}

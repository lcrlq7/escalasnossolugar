import { useEffect, useState } from 'react'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()) })
}

/** Estado de instalação do app (adicionar à tela de início). */
export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => { listeners.delete(f) } }, [])
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  // navegadores embutidos (WhatsApp, Instagram, Facebook) não deixam instalar
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/.test(ua)
  const iosSafari = isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const r = await deferred.userChoice
    deferred = null; listeners.forEach((f) => f())
    return r.outcome === 'accepted'
  }
  return { standalone, isIos, isAndroid, inApp, iosSafari, canPrompt: !!deferred, install }
}

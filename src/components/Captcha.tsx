import { useEffect, useRef } from 'react'
import { useTheme } from '../context/Theme'

/** hCaptcha opcional: só aparece se VITE_HCAPTCHA_SITEKEY estiver definida (e o captcha ligado no Supabase). */
export const CAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY as string | undefined

declare global { interface Window { hcaptcha?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void } } }

let loading: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.hcaptcha) return Promise.resolve()
  if (!loading) loading = new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'; s.async = true
    s.onload = () => res(); s.onerror = () => { loading = null; rej(new Error('captcha')) }
    document.head.appendChild(s)
  })
  return loading
}

export function Captcha({ onToken, resetKey }: { onToken: (t: string | null) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)
  const { theme } = useTheme()
  useEffect(() => {
    if (!CAPTCHA_SITEKEY) return
    let dead = false
    void loadScript().then(() => {
      if (dead || !box.current || !window.hcaptcha) return
      id.current = window.hcaptcha.render(box.current, {
        sitekey: CAPTCHA_SITEKEY, theme: theme === 'dark' ? 'dark' : 'light',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
      })
    }).catch(() => onToken(null))
    return () => { dead = true; if (id.current && window.hcaptcha) { try { window.hcaptcha.remove(id.current) } catch { /* ignore */ } id.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
  useEffect(() => { if (resetKey && id.current && window.hcaptcha) { window.hcaptcha.reset(id.current); onToken(null) } }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!CAPTCHA_SITEKEY) return null
  return <div ref={box} className="flex min-h-[78px] justify-center" />
}

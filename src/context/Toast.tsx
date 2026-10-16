import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '../lib/utils'

type Kind = 'success' | 'error' | 'info'
interface T { id: number; kind: Kind; msg: string }
interface Ctx { success: (m: string) => void; error: (m: unknown) => void; info: (m: string) => void }
const ToastCtx = createContext<Ctx>({ success: () => {}, error: () => {}, info: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((kind: Kind, msg: string) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, kind, msg }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 6500 : 3500)
  }, [])
  const value = useMemo<Ctx>(() => ({
    success: (m) => push('success', m),
    info: (m) => push('info', m),
    error: (e) => push('error', e instanceof Error ? e.message : typeof e === 'string' ? e : 'Ocorreu um erro inesperado.'),
  }), [push])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn('toast-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur',
            t.kind === 'success' && 'border-ok/40 bg-surface text-fg',
            t.kind === 'error' && 'border-danger/50 bg-surface text-fg',
            t.kind === 'info' && 'border-info/40 bg-surface text-fg')}>
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />}
            {t.kind === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
            {t.kind === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />}
            <span className="flex-1">{t.msg}</span>
            <button aria-label="Fechar" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}><X className="h-4 w-4 text-muted" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

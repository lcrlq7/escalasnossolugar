import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2, X, Inbox } from 'lucide-react'
import { cn } from '../lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} aria-label="Carregando" />
}
export function PageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted">
      <div className="flex h-8 items-end gap-1" aria-hidden>{[0, .15, .3, .45].map((d) => <span key={d} className="h-full w-1.5 origin-bottom animate-eq rounded-full bg-accent" style={{ animationDelay: `${d}s` }} />)}</div>
      <span className="text-sm">{label}</span>
    </div>)
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export function Button({ variant = 'secondary', size, loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn('btn', size === 'sm' && '!min-h-0 !px-3 !py-1.5 text-xs',
        variant === 'primary' && 'bg-accent text-accentfg hover:brightness-95',
        variant === 'secondary' && 'bg-surface2 text-fg hover:bg-border',
        variant === 'outline' && 'border border-border bg-transparent text-fg hover:bg-surface2',
        variant === 'ghost' && 'bg-transparent text-muted hover:bg-surface2 hover:text-fg',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className)}
      {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label}
      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 hover:text-fg disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children?: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn('field', className)} {...p} /> }
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn('field pr-8', className)} {...p}>{children}</select> }
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn('field min-h-[88px] resize-y', className)} {...p} /> }

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm', disabled && 'opacity-50')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-accent' : 'bg-border')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label && <span>{label}</span>}
    </label>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>
}
export function SectionTitle({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div><h2 className="text-base font-bold">{title}</h2>{subtitle && <p className="text-xs text-muted">{subtitle}</p>}</div>
      {action}
    </div>
  )
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
      tone === 'neutral' && 'bg-surface2 text-muted',
      tone === 'ok' && 'bg-ok/15 text-ok',
      tone === 'warn' && 'bg-warn/15 text-warn',
      tone === 'danger' && 'bg-danger/15 text-danger',
      tone === 'info' && 'bg-info/15 text-info',
      tone === 'accent' && 'bg-accent/20 text-accenttext', className)}>{children}</span>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface2 text-muted">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-3xl md:animate-pop border border-border bg-surface shadow-card md:rounded-2xl', w)}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="text-base font-bold">{title}</h3>
          <IconButton label="Fechar" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 safe-bottom">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, text, confirmLabel = 'Confirmar', danger, onConfirm, onClose, loading }:
  { open: boolean; title: string; text: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-sm text-muted">{text}</div>
    </Modal>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cn('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition',
            value === i.value ? 'bg-surface text-fg shadow' : 'text-muted hover:text-fg')}>
          {i.label}{typeof i.count === 'number' && <span className="ml-1.5 text-xs opacity-70">{i.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent/20 font-bold text-accenttext">{ini || '?'}</span>
  )
}

export function Cover({ url, size = 48, className }: { url?: string | null; size?: number; className?: string }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [url])
  if (!url || bad) {
    return (
      <span style={{ width: size, height: size }} className={cn('inline-flex shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted', className)}>
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
      </span>
    )
  }
  return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ width: size, height: size }} className={cn('shrink-0 rounded-lg bg-surface2 object-cover', className)} />
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function KeyInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <>
      <input className={cn('field', className)} list="keys-list" value={value} placeholder={placeholder ?? 'Ex.: G'}
        onChange={(e) => onChange(e.target.value)} maxLength={4} />
    </>
  )
}

export function ClickAway({ onAway, children, className }: { onAway: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onAway() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onAway])
  return <div ref={ref} className={className}>{children}</div>
}

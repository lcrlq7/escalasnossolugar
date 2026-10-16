import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase, friendlyMessage, isConfigured } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'
import { Button, Field, Input } from '../components/ui'
import { useToast } from '../context/Toast'
import { LogOut, MailCheck, Moon, Sun } from 'lucide-react'

const NOTES = Array.from({ length: 9 }, (_, i) => ({ left: `${6 + i * 11}%`, delay: `${(i * 1.7) % 9}s`, dur: `${11 + (i % 4) * 3}s`, size: 14 + (i % 3) * 8, ch: ['♪', '♫', '♩', '♬'][i % 4] }))

function Shell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { theme, toggle } = useTheme()
  return (
    <div className="auth-bg relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
      {/* fundo em movimento */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-80 w-80 animate-float rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 animate-float2 rounded-full bg-info/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 animate-float rounded-full bg-accent/10 blur-3xl" />
        {NOTES.map((n, i) => (
          <span key={i} className="absolute bottom-0 animate-rise font-bold text-accent/60" style={{ left: n.left, animationDelay: n.delay, animationDuration: n.dur, fontSize: n.size, opacity: 0 }}>{n.ch}</span>
        ))}
      </div>
      <button onClick={toggle} aria-label="Alternar tema" className="glass absolute right-4 top-4 z-10 rounded-xl border border-border p-2 text-muted transition hover:scale-105 hover:text-fg">
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div className="relative w-full max-w-md">
        <img src={`/brand/logo-full-${theme === 'dark' ? 'dark' : 'light'}.png`} alt="Igreja Metodista — Nosso Lugar de Adoração e Comunhão"
          className="mx-auto mb-6 h-36 w-auto animate-fade-up drop-shadow-xl md:h-40" style={{ animationDelay: '.05s' }} />
        <div>
          <div className="glass animate-fade-up rounded-3xl border border-border p-6 shadow-card md:p-8" style={{ animationDelay: '.2s' }}>
            <div className="mb-4 flex h-6 items-end gap-1" aria-hidden>
              {[0, 0.2, 0.4, 0.1, 0.3].map((d, i) => <span key={i} className="h-full w-1.5 origin-bottom animate-eq rounded-full bg-accent" style={{ animationDelay: `${d}s` }} />)}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            <div className="stagger mt-6">{children}</div>
          </div>
        </div>
        {footer && <div className="mt-5 animate-fade-up text-center text-sm text-muted" style={{ animationDelay: '.45s' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function ConfigMissing() {
  return (
    <Shell title="Configuração pendente" subtitle="As variáveis de ambiente do Supabase não foram definidas.">
      <p className="text-sm text-muted">Defina <code className="text-accenttext">VITE_SUPABASE_URL</code> e <code className="text-accenttext">VITE_SUPABASE_PUBLISHABLE_KEY</code> e gere o build novamente (veja o README).</p>
    </Shell>
  )
}

export function Login() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  if (!isConfigured) return <ConfigMissing />
  if (!loading && session) return <Navigate to="/" replace />
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) toast.error(friendlyMessage(error.message)); else nav('/', { replace: true })
  }
  return (
    <Shell title="Entrar" subtitle="Acesse as escalas e repertórios do ministério de louvor."
      footer={<>Ainda não tem acesso? <Link to="/cadastro" className="font-semibold text-accenttext">Criar conta</Link></>}>
      <form onSubmit={submit} className="stagger space-y-4">
        <Field label="E-mail"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></Field>
        <Field label="Senha"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
        <Button variant="primary" type="submit" loading={busy} className="btn-shine w-full">Entrar</Button>
        <div className="text-center"><Link to="/recuperar-senha" className="text-sm text-muted hover:text-fg">Esqueci minha senha</Link></div>
      </form>
    </Shell>
  )
}

export function Signup() {
  const toast = useToast()
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (session) return <Navigate to="/" replace />
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) return toast.error(friendlyMessage(error.message))
    if (!data.session) setSent(true)
  }
  if (sent) {
    return (
      <Shell title="Confirme seu e-mail" footer={<Link to="/entrar" className="font-semibold text-accenttext">Voltar ao login</Link>}>
        <div className="flex flex-col items-center gap-3 text-center"><MailCheck className="h-10 w-10 text-accenttext" />
          <p className="text-sm text-muted">Enviamos um link de confirmação para <b className="text-fg">{email}</b>. Depois de confirmar, um administrador precisará liberar o seu acesso.</p></div>
      </Shell>
    )
  }
  return (
    <Shell title="Criar conta" subtitle="Depois do cadastro, um administrador libera o seu acesso e define o seu cargo."
      footer={<>Já tem conta? <Link to="/entrar" className="font-semibold text-accenttext">Entrar</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome completo"><Input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Senha" hint="Mínimo de 6 caracteres."><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
        <Button variant="primary" type="submit" loading={busy} className="w-full">Criar conta</Button>
      </form>
    </Shell>
  )
}

export function ForgotPassword() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setBusy(false)
    if (error) toast.error(friendlyMessage(error.message)); else setSent(true)
  }
  return (
    <Shell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha."
      footer={<Link to="/entrar" className="font-semibold text-accenttext">Voltar ao login</Link>}>
      {sent ? <p className="text-sm text-muted">Se o e-mail estiver cadastrado, você receberá o link em instantes. Verifique também a caixa de spam.</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button variant="primary" type="submit" loading={busy} className="w-full">Enviar link</Button>
        </form>)}
    </Shell>
  )
}

export function ResetPassword() {
  const { session, loading } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return toast.error(friendlyMessage(error.message))
    toast.success('Senha alterada com sucesso.'); nav('/', { replace: true })
  }
  return (
    <Shell title="Nova senha" subtitle="Escolha uma nova senha para a sua conta.">
      {!loading && !session ? <p className="text-sm text-muted">Link inválido ou expirado. <Link className="font-semibold text-accenttext" to="/recuperar-senha">Solicitar novo link</Link></p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nova senha"><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          <Button variant="primary" type="submit" loading={busy} className="w-full">Salvar nova senha</Button>
        </form>)}
    </Shell>
  )
}

export function PendingApproval() {
  const { profile, signOut, refresh } = useAuth()
  return (
    <Shell title="Aguardando liberação" subtitle={`Olá, ${profile?.full_name?.split(' ')[0] ?? ''}! Seu cadastro foi recebido.`}>
      <p className="text-sm text-muted">Um administrador do ministério precisa liberar o seu acesso e definir o seu cargo. Assim que isso acontecer, você poderá usar o sistema normalmente.</p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => void refresh()}>Verificar novamente</Button>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="h-4 w-4" />Sair</Button>
      </div>
    </Shell>
  )
}

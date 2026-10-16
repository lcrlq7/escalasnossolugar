import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Home, CalendarDays, Music2, ListMusic, Users, BarChart3, History, Settings, CalendarCheck, ClipboardList,
  Bell, Sun, Moon, LogOut, Menu, X, UserCircle,
} from 'lucide-react'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'
import { supabase, unwrap } from '../lib/supabase'
import { cn, fmtDateTime, ROLE_LABEL } from '../lib/utils'
import { Avatar, ClickAway, IconButton } from './ui'
import { KEYS } from '../lib/utils'
import type { AppNotification } from '../types'

interface NavItem { to: string; label: string; icon: typeof Home; show: boolean; end?: boolean }

export function useNav(): NavItem[] {
  const { isLeader, isAdmin, member } = useAuth()
  return [
    { to: '/', label: 'Início', icon: Home, show: true, end: true },
    { to: '/escalas', label: 'Escalas', icon: ClipboardList, show: true },
    { to: '/calendario', label: 'Calendário', icon: CalendarDays, show: true },
    { to: '/musicas', label: 'Músicas', icon: Music2, show: true },
    { to: '/repertorios', label: 'Repertórios', icon: ListMusic, show: isLeader },
    { to: '/disponibilidade', label: 'Disponibilidade', icon: CalendarCheck, show: isLeader || !!member },
    { to: '/integrantes', label: 'Integrantes', icon: Users, show: true },
    { to: '/historico', label: 'Histórico', icon: History, show: true },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, show: isLeader },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, show: isAdmin },
  ]
}

function Brand({ compact }: { compact?: boolean }) {
  const { theme } = useTheme()
  const { church } = useAuth()
  return (
    <Link to="/" className="flex items-center gap-3">
      <img src={`/brand/logo-compact-${theme === 'dark' ? 'dark' : 'light'}.png`} alt="Igreja Metodista — Nosso Lugar" className={compact ? 'h-9 w-auto' : 'h-14 w-auto'} />
      {compact && <span className="text-sm font-extrabold tracking-tight">{church?.system_name ?? 'Louvor em Escala'}</span>}
    </Link>
  )
}

function NotificationBell() {
  const { session } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ['notifications', 'recent'],
    enabled: !!session,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async () => unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(15)) as AppNotification[],
  })
  const unread = (q.data ?? []).filter((n) => !n.read_at).length
  const markAll = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  const openItem = async (n: AppNotification) => {
    setOpen(false)
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    if (n.link) nav(n.link)
  }
  return (
    <ClickAway onAway={() => setOpen(false)} className="relative">
      <IconButton label="Notificações" onClick={() => setOpen((o) => !o)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accentfg">{unread > 9 ? '9+' : unread}</span>}
      </IconButton>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-bold">Notificações</span>
            {unread > 0 && <button onClick={markAll} className="text-xs font-semibold text-accenttext">Marcar todas como lidas</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(q.data ?? []).length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma notificação por enquanto.</p>}
            {(q.data ?? []).map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={cn('block w-full border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-surface2', !n.read_at && 'bg-accent/5')}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  <div className="min-w-0"><p className="text-sm font-semibold">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted">{fmtDateTime(n.created_at)}</p></div>
                </div>
              </button>
            ))}
          </div>
          <Link to="/notificacoes" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-accenttext">Ver todas</Link>
        </div>
      )}
    </ClickAway>
  )
}

function UserMenu() {
  const { profile, roles, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <ClickAway onAway={() => setOpen(false)} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 hover:bg-surface2" aria-label="Menu do usuário">
        <Avatar name={profile?.full_name ?? ''} size={34} />
      </button>
      {open && (
        <div className="animate-pop absolute right-0 top-12 z-40 w-64 origin-top-right rounded-2xl border border-border bg-surface p-2 shadow-card">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-bold">{profile?.full_name}</p>
            <p className="truncate text-xs text-muted">{profile?.email}</p>
            <p className="mt-1 text-xs text-accenttext">{roles.map((r) => ROLE_LABEL[r]).join(' · ') || 'Sem cargo'}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link to="/perfil" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface2"><UserCircle className="h-4 w-4" />Meu perfil</Link>
          <button onClick={toggle} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface2">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <button onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"><LogOut className="h-4 w-4" />Sair</button>
        </div>
      )}
    </ClickAway>
  )
}

export function Layout() {
  const items = useNav().filter((i) => i.show)
  const loc = useLocation()
  const { church } = useAuth()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => setDrawer(false), [loc.pathname])
  useEffect(() => { if (church?.system_name) document.title = church.system_name }, [church?.system_name])
  const bottom = items.filter((i) => ['/', '/escalas', '/calendario', '/musicas'].includes(i.to))

  return (
    <div className="flex min-h-full">
      <datalist id="keys-list">{KEYS.map((k) => <option key={k} value={k} />)}</datalist>
      {/* Menu lateral (computador) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-5 md:flex">
        <Brand />
        <p className="mt-3 px-1 text-[11px] font-bold uppercase tracking-widest text-muted">{church?.system_name ?? 'Louvor em Escala'}</p>
        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                isActive ? 'bg-accent text-accentfg' : 'text-muted hover:bg-surface2 hover:text-fg')}>
              <i.icon className="h-[18px] w-[18px]" />{i.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 py-2.5 backdrop-blur md:px-8">
          <div className="md:hidden"><Brand compact /></div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12">
          <div key={loc.pathname} className="page-enter"><Outlet /></div>
        </main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur safe-bottom md:hidden" aria-label="Navegação principal">
        {bottom.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}
            className={({ isActive }) => cn('press flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors', isActive ? 'text-accenttext' : 'text-muted')}>
            {({ isActive }: { isActive: boolean }) => <><i.icon className={cn('h-5 w-5', isActive && 'nav-active')} />{i.label}</>}</NavLink>
        ))}
        <button onClick={() => setDrawer(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-muted"><Menu className="h-5 w-5" />Mais</button>
      </nav>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawer(false)} />
          <div className="drawer-in absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface p-4 safe-bottom">
            <div className="mb-3 flex items-center justify-between"><span className="font-bold">Menu</span><IconButton label="Fechar" onClick={() => setDrawer(false)}><X className="h-5 w-5" /></IconButton></div>
            <div className="grid grid-cols-3 gap-2">
              {items.filter((i) => !bottom.includes(i)).map((i) => (
                <NavLink key={i.to} to={i.to} className="press flex flex-col items-center gap-1.5 rounded-2xl bg-surface2 px-2 py-4 text-center text-xs font-semibold"><i.icon className="h-5 w-5 text-accenttext" />{i.label}</NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useToast } from './context/Toast'
import { useAuth } from './context/Auth'
import { isConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { PageLoader } from './components/ui'
import { ConfigMissing, ForgotPassword, Login, PendingApproval, ResetPassword, Signup } from './pages/AuthPages'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import EventEditor from './pages/EventEditor'
import EventView from './pages/EventView'
import CalendarPage from './pages/CalendarPage'
import Songs from './pages/Songs'
import { SetlistDetail, SetlistsPage } from './pages/Setlists'
import SharedSetlist from './pages/SharedSetlist'
import Availability from './pages/Availability'
import Members from './pages/Members'
import Reports from './pages/Reports'
import History from './pages/History'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Notifications from './pages/Notifications'

function Protected({ children }: { children: ReactNode }) {
  const { loading, session, profile, recovery } = useAuth()
  const loc = useLocation()
  if (loading) return <PageLoader />
  if (recovery) return <Navigate to="/redefinir-senha" replace />
  if (!session) return <Navigate to="/entrar" replace state={{ from: loc.pathname + loc.search }} />
  if (!profile || !profile.active) return <PendingApproval />
  return <>{children}</>
}

function Gate({ allow, children }: { allow: 'leader' | 'admin'; children: ReactNode }) {
  const { isLeader, isAdmin } = useAuth()
  const ok = allow === 'admin' ? isAdmin : isLeader
  return ok ? <>{children}</> : <Navigate to="/" replace />
}

function NotFound() {
  return <div className="py-20 text-center"><p className="text-2xl font-extrabold">Página não encontrada</p><p className="mt-1 text-sm text-muted">O endereço não existe ou foi movido.</p></div>
}

function SpotifyReturn() {
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  useEffect(() => {
    const p = new URLSearchParams(loc.search)
    const v = p.get('spotify')
    if (!v) return
    if (v === 'ok') toast.success('Spotify conectado! Abra “Criar playlist” novamente.')
    else toast.error('Não foi possível conectar o Spotify. Tente de novo.')
    p.delete('spotify')
    nav({ pathname: loc.pathname, search: p.toString() ? `?${p}` : '' }, { replace: true })
  }, [loc.search]) // eslint-disable-line
  return null
}

export default function App() {
  if (!isConfigured) return <ConfigMissing />
  return (
    <>
    <SpotifyReturn />
    <Routes>
      <Route path="/entrar" element={<Login />} />
      <Route path="/cadastro" element={<Signup />} />
      <Route path="/recuperar-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="escalas" element={<Events />} />
        <Route path="escalas/nova" element={<Gate allow="leader"><EventEditor /></Gate>} />
        <Route path="escalas/:id" element={<EventView />} />
        <Route path="escalas/:id/editar" element={<Gate allow="leader"><EventEditor /></Gate>} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="musicas" element={<Songs />} />
        <Route path="repertorios" element={<Gate allow="leader"><SetlistsPage /></Gate>} />
        <Route path="repertorios/:id" element={<Gate allow="leader"><SetlistDetail /></Gate>} />
        <Route path="r/:token" element={<SharedSetlist />} />
        <Route path="disponibilidade" element={<Availability />} />
        <Route path="integrantes" element={<Members />} />
        <Route path="historico" element={<History />} />
        <Route path="relatorios" element={<Gate allow="leader"><Reports /></Gate>} />
        <Route path="configuracoes" element={<Gate allow="admin"><Settings /></Gate>} />
        <Route path="perfil" element={<Profile />} />
        <Route path="notificacoes" element={<Notifications />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </>
  )
}

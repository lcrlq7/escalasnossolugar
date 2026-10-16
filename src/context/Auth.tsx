import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Church, Member, Profile, Role } from '../types'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  roles: Role[]
  church: Church | null
  member: Member | null
  recovery: boolean
  hasRole: (r: Role) => boolean
  isAdmin: boolean
  isLeader: boolean // administrador ou líder
  isTech: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)
export const useAuth = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [church, setChurch] = useState<Church | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [recovery, setRecovery] = useState(false)

  const load = useCallback(async (uid: string | null) => {
    if (!uid) { setProfile(null); setRoles([]); setChurch(null); setMember(null); return }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid),
    ])
    const prof = (p.data as Profile | null) ?? null
    setProfile(prof)
    setRoles(((r.data ?? []) as { role: Role }[]).map((x) => x.role))
    if (prof?.active && prof.church_id) {
      const [c, m] = await Promise.all([
        supabase.from('churches').select('*').eq('id', prof.church_id).maybeSingle(),
        supabase.from('members').select('*, member_functions(function_id)').eq('profile_id', uid).maybeSingle(),
      ])
      setChurch((c.data as Church | null) ?? null)
      setMember((m.data as Member | null) ?? null)
    } else { setChurch(null); setMember(null) }
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      try { await load(data.session?.user.id ?? null) } finally { if (alive) setLoading(false) }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      // evita chamadas ao Supabase dentro do callback (deadlock)
      setTimeout(() => { void load(s?.user.id ?? null) }, 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [load])

  const value = useMemo<AuthState>(() => ({
    loading, session, profile, roles, church, member, recovery,
    hasRole: (r) => roles.includes('admin') || roles.includes(r),
    isAdmin: roles.includes('admin'),
    isLeader: roles.includes('admin') || roles.includes('leader'),
    isTech: roles.includes('admin') || roles.includes('sound_tech'),
    refresh: async () => { await load(session?.user.id ?? null) },
    signOut: async () => {
      setRecovery(false)
      // Encerra a sessão local na hora (não depende de rede) e revoga no servidor em segundo plano.
      try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 1500))]) } catch { /* ignora */ }
      try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)) } catch { /* ignora */ }
      window.location.replace('/entrar')
    },
  }), [loading, session, profile, roles, church, member, recovery, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CalendarPlus, Megaphone, Music2, Plus, Trash2, Wrench, CalendarDays, Clock, MapPin, TrendingUp } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { CalendarView } from '../components/CalendarView'
import { AddSongModal } from '../components/SongForm'
import { useSongUsage, countBy } from '../lib/usage'
import { useSongs } from '../lib/queries'
import { resolveItems } from '../lib/setlist'
import { addDays, EVENT_TYPES, fmtDate, fmtDateLong, fmtTime, STATUS_LABEL, todayStr, toISODate } from '../lib/utils'
import type { Alert, EventRow, ResponseStatus, SetlistItem } from '../types'
import { SwapPanel } from '../components/SwapPanel'
import { Avatar, Badge, Button, Card, CountUp, Cover, EmptyState, Field, Input, Modal, PageHeader, PageLoader, SectionTitle, Textarea } from '../components/ui'
import { statusTone } from './Events'

type DashEvent = EventRow & {
  event_assignments: { id: string; member_id: string; status: ResponseStatus; member: { full_name: string } | null; function: { name: string } | null }[]
}
interface AlertRow { event_id: string; title: string; event_date: string; start_time: string; status: string; alerts: Alert[] }

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accenttext">{icon}</span>
      <div><p className="text-2xl font-extrabold leading-none">{typeof value === 'number' ? <CountUp value={value} /> : value}</p><p className="mt-1 text-xs text-muted">{label}</p>{hint && <p className="text-[11px] text-muted">{hint}</p>}</div>
    </Card>
  )
}

export default function Dashboard() {
  const { profile, isLeader, isTech, member, hasRole } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayStr()
  const songs = useSongs()
  const [addSong, setAddSong] = useState(false)
  const [annOpen, setAnnOpen] = useState(false)
  const [ann, setAnn] = useState({ title: '', body: '' })

  const upcoming = useQuery({
    queryKey: ['dash-upcoming'],
    queryFn: async () => unwrap(await supabase.from('events')
      .select('*, event_assignments(id, member_id, status, member:members(full_name), function:worship_functions(name))')
      .gte('event_date', today).in('status', ['draft', 'published']).order('event_date').order('start_time').limit(12)) as unknown as DashEvent[],
  })
  const monthStart = today.slice(0, 8) + '01'
  const monthEnd = toISODate(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))
  const monthCount = useQuery({
    queryKey: ['dash-month', monthStart],
    queryFn: async () => {
      const r = await supabase.from('events').select('id', { count: 'exact', head: true }).gte('event_date', monthStart).lte('event_date', monthEnd).in('status', ['published', 'completed'])
      return r.count ?? 0
    },
  })
  const alertsQ = useQuery({
    queryKey: ['upcoming-alerts', today], enabled: isLeader,
    queryFn: async () => (unwrap(await supabase.rpc('upcoming_event_alerts', { p_from: today, p_to: addDays(today, 45) })) ?? []) as AlertRow[],
  })
  const usage = useSongUsage(addDays(today, -90), today)
  const anns = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => unwrap(await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(5)) as { id: string; title: string; body: string | null; active: boolean; created_at: string }[],
  })

  const published = (upcoming.data ?? []).filter((e) => e.status === 'published')
  const next = published[0] ?? (isLeader ? upcoming.data?.[0] : undefined)
  const nextItems = useQuery({
    queryKey: ['dash-next-items', next?.id], enabled: !!next,
    queryFn: async () => {
      const sl = unwrap(await supabase.from('setlists').select('id').eq('event_id', next!.id).maybeSingle()) as { id: string } | null
      if (!sl) return []
      return unwrap(await supabase.from('setlist_items').select('*, song:songs(*)').eq('setlist_id', sl.id).order('position')) as unknown as SetlistItem[]
    },
  })

  const soundPending = published.filter((e) => !e.sound_ready)
  const topSongs = [...countBy(usage.data ?? [], (r) => r.song_id).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, n]) => ({ id, n, row: (usage.data ?? []).find((r) => r.song_id === id)! }))
  const teamNext = next ? [...new Map(next.event_assignments.map((a) => [a.member_id, a])).values()] : []
  const incomplete = (alertsQ.data ?? []).filter((r) => r.alerts.some((a) => a.type !== 'pending'))

  const publishAnn = async () => {
    if (!ann.title.trim()) return toast.error('Informe o título do aviso.')
    try {
      const { data: me } = await supabase.from('profiles').select('church_id').eq('id', profile!.id).single()
      unwrap(await supabase.from('announcements').insert({ title: ann.title.trim(), body: ann.body.trim() || null, church_id: me!.church_id }).select().single())
      setAnn({ title: '', body: '' }); setAnnOpen(false); qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Aviso publicado.')
    } catch (e) { toast.error(e) }
  }
  const delAnn = async (id: string) => { try { unwrap(await supabase.from('announcements').delete().eq('id', id).select()); qc.invalidateQueries({ queryKey: ['announcements'] }) } catch (e) { toast.error(e) } }

  if (upcoming.isLoading) return <PageLoader />
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const resolved = resolveItems(nextItems.data ?? [], [])

  return (
    <div className="space-y-6">
      <PageHeader title={<><span className="grad-text">{greet}, {profile?.full_name.split(' ')[0] ?? ''}!</span> <span className="wave">👋</span></>} subtitle={fmtDateLong(today)}
        actions={isLeader && (<>
          <Link to="/escalas/nova"><Button variant="primary"><CalendarPlus className="h-4 w-4" />Criar escala</Button></Link>
          <Button onClick={() => setAddSong(true)}><Plus className="h-4 w-4" />Adicionar música</Button></>)} />

      {!isLeader && !member && !hasRole('minister') && !isTech && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Seu usuário ainda não tem um cargo definido. Peça a um administrador para configurar seu acesso.</p>)}
      {!isLeader && !member && (hasRole('minister') || isTech) && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Seu usuário ainda não está vinculado a um integrante. Um administrador precisa fazer essa ligação para você receber escalas.</p>)}

      <div className="stagger grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="overflow-hidden">
          {next ? (
            <>
              <div className="border-b border-border bg-accent/10 p-5">
                <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold uppercase tracking-widest text-accenttext">Próximo culto</p><Badge tone={statusTone(next.status)}>{STATUS_LABEL[next.status]}</Badge></div>
                <Link to={`/escalas/${next.id}`} className="mt-1 block text-2xl font-extrabold tracking-tight hover:underline">{next.title}</Link>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5 capitalize"><CalendarDays className="h-4 w-4" />{fmtDateLong(next.event_date)}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{fmtTime(next.start_time)}{next.end_time ? ` – ${fmtTime(next.end_time)}` : ''}</span>
                  <span className="inline-flex items-center gap-1.5">{EVENT_TYPES[next.event_type]?.label}</span>
                  {next.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{next.location}</span>}
                </div>
              </div>
              <div className="grid gap-5 p-5 md:grid-cols-2">
                <div>
                  <SectionTitle title="Integrantes escalados" subtitle={teamNext.length ? `${teamNext.length} escalados` : undefined} />
                  {teamNext.length === 0 ? <p className="text-sm text-muted">Equipe ainda não definida.</p> : (
                    <ul className="space-y-2">{next.event_assignments.slice(0, 10).map((a) => (
                      <li key={a.id} className="flex items-center gap-2.5"><Avatar name={a.member?.full_name ?? ''} size={30} />
                        <span className="min-w-0 flex-1 truncate text-sm"><b className="font-semibold">{a.member?.full_name}</b> <span className="text-muted">· {a.function?.name}</span></span></li>))}
                      {next.event_assignments.length > 10 && <li className="text-xs text-muted">+ {next.event_assignments.length - 10} integrantes</li>}</ul>)}
                </div>
                <div>
                  <SectionTitle title="Repertório" />
                  {resolved.length === 0 ? <p className="text-sm text-muted">Repertório ainda não definido.</p> : (
                    <ol className="space-y-2">{resolved.slice(0, 6).map((r, n) => (
                      <li key={r.id} className="flex items-center gap-2.5"><span className="w-4 text-xs font-bold text-muted">{n + 1}</span>
                        {r.kind === 'song' ? <><Cover url={r.song?.cover_url} size={32} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.song?.title}</span>{r.key && <Badge tone="accent">{r.key}</Badge>}</>
                          : <span className="text-sm text-muted">{r.note || 'Momento especial'}</span>}</li>))}
                      {resolved.length > 6 && <li className="text-xs text-muted">+ {resolved.length - 6} itens</li>}</ol>)}
                </div>
              </div>
              <div className="border-t border-border px-5 py-3"><Link to={`/escalas/${next.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accenttext">Abrir escala completa<ArrowRight className="h-4 w-4" /></Link></div>
            </>
          ) : (
            <div className="p-5"><EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Nenhum culto programado" text={isLeader ? 'Crie a próxima escala para começar.' : 'Quando uma escala for publicada ela aparecerá aqui.'}
              action={isLeader && <Link to="/escalas/nova"><Button variant="primary"><CalendarPlus className="h-4 w-4" />Criar escala</Button></Link>} /></div>)}
        </Card>

        <div className="space-y-6">
          {isTech && soundPending.length > 0 && (
            <Card className="p-5"><SectionTitle title="Preparação de som pendente" />
              <ul className="space-y-2">{soundPending.slice(0, 5).map((e) => <li key={e.id}><Link to={`/escalas/${e.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface2 px-3 py-2.5 text-sm font-semibold hover:bg-border"><span className="inline-flex items-center gap-2 truncate"><Wrench className="h-4 w-4 text-warn" />{e.title} · {fmtDate(e.event_date)}</span><ArrowRight className="h-4 w-4" /></Link></li>)}</ul></Card>)}
          {isLeader && (
            <Card className="p-5">
              <SectionTitle title="Datas que precisam de atenção" subtitle="Próximos 45 dias" />
              {alertsQ.isLoading ? <p className="text-sm text-muted">Verificando…</p> : incomplete.length === 0 ? <p className="text-sm text-ok">Nenhuma escala com pendências. 🙌</p> : (
                <ul className="space-y-2">{incomplete.slice(0, 5).map((r) => (
                  <li key={r.event_id}><Link to={`/escalas/${r.event_id}/editar`} className="block rounded-xl border border-border px-3 py-2.5 hover:bg-surface2">
                    <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 shrink-0 text-warn" /><span className="truncate">{r.title} · {fmtDate(r.event_date)}</span></p>
                    <p className="mt-1 text-xs text-muted">{r.alerts.filter((a) => a.type !== 'pending').map((a) => a.message).slice(0, 2).join(' · ')}</p></Link></li>))}</ul>)}
            </Card>)}
          <Card className="p-5">
            <SectionTitle title="Avisos importantes" action={isLeader && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setAnnOpen(true)}><Megaphone className="h-4 w-4" />Novo</Button>} />
            {(anns.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum aviso no momento.</p> : (
              <ul className="space-y-3">{anns.data!.map((a) => (
                <li key={a.id} className="rounded-xl bg-surface2 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold">{a.title}</p>
                  {isLeader && <button aria-label="Excluir aviso" onClick={() => void delAnn(a.id)} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}</div>
                  {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.body}</p>}<p className="mt-1.5 text-[11px] text-muted">{fmtDate(a.created_at)}</p></li>))}</ul>)}
          </Card>
        </div>
      </div>

      <SwapPanel />

      {isLeader && (
        <div className="stagger grid gap-4 sm:grid-cols-2">
          <Stat icon={<CalendarDays className="h-5 w-5" />} label="Escalas neste mês" value={monthCount.data ?? '–'} />
          <Stat icon={<Music2 className="h-5 w-5" />} label="Músicas na biblioteca" value={songs.data?.length ?? '–'} />
        </div>)}

      <div className="stagger grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-4"><SectionTitle title="Calendário do mês" action={<Link to="/calendario" className="text-xs font-semibold text-accenttext">Abrir calendário</Link>} /><CalendarView compact /></Card>
        {isLeader && (
          <Card className="p-5">
            <SectionTitle title="Músicas mais utilizadas" subtitle="Últimos 90 dias" action={<TrendingUp className="h-4 w-4 text-muted" />} />
            {topSongs.length === 0 ? <p className="text-sm text-muted">Ainda não há cultos publicados com repertório neste período.</p> : (
              <ol className="space-y-2.5">{topSongs.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3"><span className="w-5 text-center text-sm font-extrabold text-accenttext">{i + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t.row.title}</span><span className="block truncate text-xs text-muted">{t.row.artist}</span></span>
                  <Badge>{t.n}×</Badge></li>))}</ol>)}
          </Card>)}
      </div>

      <AddSongModal open={addSong} onClose={() => setAddSong(false)} onAdded={() => toast.success('Música pronta na biblioteca.')} />
      <Modal open={annOpen} onClose={() => setAnnOpen(false)} size="sm" title="Novo aviso" footer={<><Button variant="ghost" onClick={() => setAnnOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void publishAnn()}>Publicar</Button></>}>
        <div className="space-y-3"><Field label="Título"><Input value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} /></Field>
          <Field label="Mensagem"><Textarea value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} /></Field></div>
      </Modal>
    </div>
  )
}

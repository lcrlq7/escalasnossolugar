import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CalendarRange, CheckCircle2, ClipboardList, Clock, MapPin, Search, Users, XCircle } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useSchedules } from '../lib/queries'
import { EVENT_TYPES, STATUS_LABEL, cn, fmtTime, normalize, parseDate, todayStr } from '../lib/utils'
import type { EventRow, EventStatus, ResponseStatus } from '../types'
import { Badge, Button, EmptyState, Fab, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs } from '../components/ui'

export type EventListItem = EventRow & { event_assignments: { member_id: string; status: ResponseStatus }[] }

export const statusTone = (s: EventStatus) => (s === 'published' ? 'ok' : s === 'draft' ? 'warn' : s === 'cancelled' ? 'danger' : 'neutral') as 'ok' | 'warn' | 'danger' | 'neutral'

export function DateBlock({ date }: { date: string }) {
  const d = parseDate(date)
  return (
    <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-accent/15 text-accenttext">
      <span className="text-[10px] font-bold uppercase tracking-wider">{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', '')}</span>
      <span className="text-2xl font-extrabold leading-none">{String(d.getDate()).padStart(2, '0')}</span>
      <span className="text-[10px] font-semibold uppercase">{new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '')}</span>
    </div>
  )
}

export function EventCard({ e, myMemberId }: { e: EventListItem; myMemberId?: string | null }) {
  const a = e.event_assignments ?? []
  const people = new Set(a.map((x) => x.member_id))
  const confirmed = new Set(a.filter((x) => x.status === 'confirmed').map((x) => x.member_id)).size
  const mine = myMemberId ? a.filter((x) => x.member_id === myMemberId) : []
  const myStatus: ResponseStatus | null = mine.length ? (mine.some((m) => m.status === 'declined') ? 'declined' : mine.every((m) => m.status === 'confirmed') ? 'confirmed' : 'pending') : null
  return (
    <Link to={`/escalas/${e.id}`} className="card flex items-center gap-4 p-4 transition hover:border-accent/60">
      <DateBlock date={e.event_date} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-bold">{e.title}</p>
          <Badge tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtTime(e.start_time)}{e.end_time ? ` – ${fmtTime(e.end_time)}` : ''}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: EVENT_TYPES[e.event_type]?.color }} />{EVENT_TYPES[e.event_type]?.label}</span>
          {e.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{e.location}</span>}
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{people.size} escalados · {confirmed} confirmados</span>
        </div>
      </div>
      {myStatus && (
        <span className="hidden shrink-0 sm:block">
          {myStatus === 'confirmed' ? <Badge tone="ok"><CheckCircle2 className="h-3.5 w-3.5" />Você confirmou</Badge>
            : myStatus === 'declined' ? <Badge tone="danger"><XCircle className="h-3.5 w-3.5" />Você recusou</Badge>
              : <Badge tone="warn"><Clock className="h-3.5 w-3.5" />Responder</Badge>}
        </span>)}
    </Link>
  )
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function RecurringModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const schedules = useSchedules()
  const [sched, setSched] = useState('')
  const [from, setFrom] = useState(todayStr())
  const [weeks, setWeeks] = useState(8)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!sched) { toast.error('Escolha um horário de culto.'); return }
    setBusy(true)
    try {
      const n = unwrap(await supabase.rpc('create_recurring_events', { p_schedule: sched, p_from: from, p_weeks: weeks })) as number
      toast.success(`${n} escala(s) criadas como rascunho.`)
      qc.invalidateQueries({ queryKey: ['events-list'] })
      onClose()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Escalas recorrentes"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={() => void go()}>Gerar escalas</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Cria vários rascunhos de uma vez, um por semana, nos dias e horários cadastrados. Datas que já têm essa escala são puladas.</p>
        <Field label="Horário de culto">
          <Select value={sched} onChange={(e) => setSched(e.target.value)}>
            <option value="">Selecione…</option>
            {(schedules.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} — {WEEKDAYS[x.weekday]} {String(x.start_time).slice(0, 5)}</option>)}
          </Select>
        </Field>
        <Field label="A partir de"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Quantas semanas (1 a 26)"><Input type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} /></Field>
      </div>
    </Modal>
  )
}

export default function Events() {
  const { isLeader, member } = useAuth()
  const nav = useNavigate()
  const [rec, setRec] = useState(false)
  const [tab, setTab] = useState<'next' | 'draft' | 'past' | 'cancelled'>('next')
  const [q, setQ] = useState('')
  const query = useQuery({
    queryKey: ['events-list'],
    queryFn: async () => unwrap(await supabase.from('events').select('*, event_assignments(member_id, status)').order('event_date', { ascending: false }).order('start_time', { ascending: false }).limit(400)) as unknown as EventListItem[],
  })
  const today = todayStr()
  const lists = useMemo(() => {
    const all = query.data ?? []
    const n = normalize(q)
    const f = all.filter((e) => !n || normalize(`${e.title} ${EVENT_TYPES[e.event_type]?.label} ${e.location ?? ''}`).includes(n))
    return {
      next: f.filter((e) => e.event_date >= today && e.status === 'published').sort((a, b) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time)),
      draft: f.filter((e) => e.status === 'draft').sort((a, b) => a.event_date.localeCompare(b.event_date)),
      past: f.filter((e) => e.status === 'completed' || (e.status === 'published' && e.event_date < today)),
      cancelled: f.filter((e) => e.status === 'cancelled'),
    }
  }, [query.data, q, today])
  const items = [
    { value: 'next' as const, label: 'Próximas', count: lists.next.length },
    ...(isLeader ? [{ value: 'draft' as const, label: 'Rascunhos', count: lists.draft.length }] : []),
    { value: 'past' as const, label: 'Anteriores', count: lists.past.length },
    { value: 'cancelled' as const, label: 'Canceladas', count: lists.cancelled.length },
  ]
  const list = lists[tab]
  return (
    <div>
      <PageHeader title="Escalas" subtitle="Cultos, ensaios e eventos do ministério de louvor."
        actions={isLeader && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setRec(true)}><CalendarRange className="h-4 w-4" />Recorrentes</Button><Link to="/escalas/nova"><Button variant="primary"><CalendarPlus className="h-4 w-4" />Nova escala</Button></Link></div>} />
      <RecurringModal open={rec} onClose={() => setRec(false)} />
      <div className="mb-4 relative"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" /><Input className="!pl-10" placeholder="Buscar por nome, tipo ou local" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {isLeader && <Fab label="Nova escala" onClick={() => nav('/escalas/nova')}><CalendarPlus className="h-6 w-6" /></Fab>}
      <Tabs value={tab} onChange={setTab} items={items} />
      {query.isLoading ? <PageLoader /> : list.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={tab === 'next' ? 'Nenhuma escala publicada para os próximos dias' : tab === 'draft' ? 'Nenhum rascunho' : 'Nada por aqui'}
          text={tab === 'next' && isLeader ? 'Crie uma escala, monte a equipe e o repertório e publique para avisar os integrantes.' : undefined}
          action={isLeader && tab === 'next' && <Link to="/escalas/nova"><Button variant="primary"><CalendarPlus className="h-4 w-4" />Criar escala</Button></Link>} />
      ) : <div className={cn('stagger grid gap-3')}>{list.map((e) => <EventCard key={e.id} e={e} myMemberId={member?.id} />)}</div>}
    </div>
  )
}

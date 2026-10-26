import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CalendarRange, FileDown, ClipboardList, Clock, MapPin, Search, Users } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useSchedules } from '../lib/queries'
import { exportMonthPdf, type MonthEvent } from '../lib/pdf'
import { EVENT_TYPES, STATUS_LABEL, cn, fmtTime, normalize, parseDate, todayStr } from '../lib/utils'
import type { EventRow, EventStatus, ResponseStatus } from '../types'
import { Badge, Button, EmptyState, Fab, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs, Toggle } from '../components/ui'

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

export function EventCard({ e }: { e: EventListItem; myMemberId?: string | null }) {
  const a = e.event_assignments ?? []
  const people = new Set(a.map((x) => x.member_id))
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
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{people.size} escalados</span>
        </div>
      </div>
    </Link>
  )
}

function MonthPdfModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { church } = useAuth()
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [drafts, setDrafts] = useState(false)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return toast.error('Escolha o mês.')
    setBusy(true)
    try {
      const [y, m] = month.split('-').map(Number)
      const last = new Date(y, m, 0).getDate()
      const rows = unwrap(await supabase.from('events')
        .select('title, event_date, start_time, end_time, location, status, leader:members!leader_member_id(full_name), event_assignments(member:members(full_name), function:worship_functions(name, sort_order)), setlists(setlist_items(position, kind, key_override, song:songs(title, church_key, original_key)))')
        .gte('event_date', `${month}-01`).lte('event_date', `${month}-${String(last).padStart(2, '0')}`)
        .in('status', drafts ? ['published', 'completed', 'draft'] : ['published', 'completed'])
        .order('event_date').order('start_time')) as unknown as {
          title: string; event_date: string; start_time: string; end_time: string | null; location: string | null; status: string
          leader: { full_name: string } | { full_name: string }[] | null
          event_assignments: { member: { full_name: string } | { full_name: string }[] | null; function: { name: string; sort_order: number } | { name: string; sort_order: number }[] | null }[]
          setlists: { setlist_items: { position: number; kind: string; key_override: string | null; song: { title: string; church_key: string | null; original_key: string | null } | { title: string; church_key: string | null; original_key: string | null }[] | null }[] }[] | { setlist_items: { position: number; kind: string; key_override: string | null; song: { title: string; church_key: string | null; original_key: string | null } | { title: string; church_key: string | null; original_key: string | null }[] | null }[] } | null
        }[]
      const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
      const events: MonthEvent[] = rows.map((r) => {
        const sl = one(r.setlists)
        return {
          title: r.title, event_date: r.event_date, start_time: r.start_time, end_time: r.end_time, location: r.location, status: r.status,
          leader: one(r.leader)?.full_name ?? null,
          team: r.event_assignments.map((a) => ({ role: one(a.function)?.name ?? '', order: one(a.function)?.sort_order ?? 99, name: one(a.member)?.full_name ?? '' })),
          songs: (sl?.setlist_items ?? []).filter((i) => i.kind === 'song').sort((a, b) => a.position - b.position).map((i) => {
            const sg = one(i.song); return { title: sg?.title ?? '', key: i.key_override || sg?.church_key || sg?.original_key || null }
          }),
        }
      })
      const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
      exportMonthPdf({ church: church?.name ?? '', monthLabel: label, month, events })
      onClose()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="PDF da escala do mês"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={() => void go()}><FileDown className="h-4 w-4" />Gerar PDF</Button></>}>
      <div className="space-y-4">
        <Field label="Mês"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Toggle checked={drafts} onChange={setDrafts} label="Incluir rascunhos" />
        <p className="text-xs text-muted">Todos os cultos do mês, com ministro, equipe por função e repertório. Escalas canceladas não entram.</p>
      </div>
    </Modal>
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
  const [monthPdf, setMonthPdf] = useState(false)
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
        actions={isLeader && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setMonthPdf(true)}><FileDown className="h-4 w-4" />PDF do mês</Button><Button variant="outline" onClick={() => setRec(true)}><CalendarRange className="h-4 w-4" />Recorrentes</Button><Link to="/escalas/nova"><Button variant="primary"><CalendarPlus className="h-4 w-4" />Nova escala</Button></Link></div>} />
      <RecurringModal open={rec} onClose={() => setRec(false)} />
      <MonthPdfModal open={monthPdf} onClose={() => setMonthPdf(false)} />
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

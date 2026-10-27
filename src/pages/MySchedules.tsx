import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, Clock, MapPin, UserCheck } from 'lucide-react'
import { downloadIcs, type IcsEvent } from '../lib/ics'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { EVENT_TYPES, fmtTime, todayStr } from '../lib/utils'
import type { EventStatus, EventType } from '../types'
import { Badge, Button, EmptyState, PageHeader, PageLoader } from '../components/ui'
import { DateBlock } from './Events'

interface Row {
  function: { name: string } | { name: string }[] | null
  event: { id: string; title: string; event_date: string; start_time: string; end_time: string | null; location: string | null; event_type: EventType; status: EventStatus } | null
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

/** "Minhas escalas": só os dias em que a pessoa logada está escalada. */
export default function MySchedules() {
  const { member } = useAuth()
  const q = useQuery({
    queryKey: ['my-schedules', member?.id], enabled: !!member,
    queryFn: async () => unwrap(await supabase.from('event_assignments')
      .select('function:worship_functions(name), event:events!inner(id, title, event_date, start_time, end_time, location, event_type, status)')
      .eq('member_id', member!.id).in('event.status', ['published', 'completed'])) as unknown as Row[],
  })
  const { next, past } = useMemo(() => {
    const by = new Map<string, { ev: NonNullable<Row['event']>; fns: string[] }>()
    for (const r of q.data ?? []) {
      if (!r.event) continue
      const g = by.get(r.event.id) ?? { ev: r.event, fns: [] }
      const f = one(r.function)?.name; if (f) g.fns.push(f)
      by.set(r.event.id, g)
    }
    const all = [...by.values()], t = todayStr(), k = (x: { ev: { event_date: string; start_time: string } }) => x.ev.event_date + x.ev.start_time
    return { next: all.filter((x) => x.ev.event_date >= t).sort((a, b) => k(a).localeCompare(k(b))), past: all.filter((x) => x.ev.event_date < t).sort((a, b) => k(b).localeCompare(k(a))).slice(0, 10) }
  }, [q.data])

  if (!member) return <div><PageHeader title="Minhas escalas" /><EmptyState icon={<UserCheck className="h-6 w-6" />} title="Seu login ainda não está vinculado a um integrante" text="Peça ao líder ou administrador para vincular você em Configurações → Usuários." /></div>
  const toIcs = (x: { ev: NonNullable<Row['event']>; fns: string[] }): IcsEvent => ({ id: x.ev.id, title: x.ev.title, event_date: x.ev.event_date, start_time: x.ev.start_time, end_time: x.ev.end_time, location: x.ev.location, roles: x.fns })
  const card = (x: { ev: NonNullable<Row['event']>; fns: string[] }) => (
    <div key={x.ev.id} className="card flex items-center gap-2 pr-2 transition hover:border-accent/60">
    <Link to={`/escalas/${x.ev.id}`} className="flex min-w-0 flex-1 items-center gap-4 p-4">
      <DateBlock date={x.ev.event_date} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{x.ev.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtTime(x.ev.start_time)}{x.ev.end_time ? ` – ${fmtTime(x.ev.end_time)}` : ''}</span>
          <span>{EVENT_TYPES[x.ev.event_type]?.label}</span>
          {x.ev.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{x.ev.location}</span>}
        </div>
      </div>
      {x.fns.length > 0 && <Badge tone="ok">{x.fns.join(', ')}</Badge>}
    </Link>
    {x.ev.event_date >= todayStr() && <button aria-label="Adicionar à agenda do celular" title="Adicionar à agenda" onClick={() => downloadIcs([toIcs(x)], `escala-${x.ev.event_date}.ics`)} className="shrink-0 rounded-xl p-2.5 text-muted hover:bg-surface2 hover:text-accenttext"><CalendarPlus className="h-5 w-5" /></button>}
    </div>)
  return (
    <div className="space-y-6">
      <PageHeader title="Minhas escalas" subtitle="Os dias em que você está escalado(a)."
        actions={next.length > 0 && <Button variant="outline" onClick={() => downloadIcs(next.map(toIcs))}><CalendarPlus className="h-4 w-4" />Adicionar todas à agenda</Button>} />
      {q.isLoading ? <PageLoader /> : <>
        {next.length === 0 ? <EmptyState icon={<UserCheck className="h-6 w-6" />} title="Você não está escalado(a) nos próximos dias" text="Quando o líder publicar uma escala com o seu nome, ela aparece aqui." />
          : <div className="stagger grid gap-3">{next.map(card)}</div>}
        {past.length > 0 && <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Anteriores</p><div className="grid gap-3 opacity-80">{past.map(card)}</div></div>}
      </>}
    </div>
  )
}

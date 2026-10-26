import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Eraser, X } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useMembers } from '../lib/queries'
import { cn, fmtDate, fmtTime, monthLabel, toISODate, todayStr } from '../lib/utils'
import type { EventRow } from '../types'
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, PageLoader, Tabs } from '../components/ui'

interface Av { id: string; member_id: string; date: string; status: 'available' | 'unavailable'; note: string | null }

function MyAvailability() {
  const { member } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [day, setDay] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const start = toISODate(cursor)
  const end = toISODate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
  const q = useQuery({
    queryKey: ['my-availability', member?.id, start], enabled: !!member,
    queryFn: async () => unwrap(await supabase.from('availability').select('*').eq('member_id', member!.id).gte('date', start).lte('date', end)) as Av[],
  })
  const mine = useQuery({
    queryKey: ['my-assignments-month', member?.id, start], enabled: !!member,
    queryFn: async () => unwrap(await supabase.from('event_assignments').select('status, event:events!inner(id,title,event_date,start_time,status)').eq('member_id', member!.id).gte('event.event_date', start).lte('event.event_date', end)) as unknown as { status: string; event: { id: string; title: string; event_date: string; start_time: string; status: string } | { id: string; title: string; event_date: string; start_time: string; status: string }[] }[],
  })
  const byDate = useMemo(() => new Map((q.data ?? []).map((a) => [a.date, a])), [q.data])
  const evByDate = useMemo(() => {
    const m = new Map<string, { id: string; title: string; start_time: string }[]>()
    for (const r of mine.data ?? []) {
      const e = Array.isArray(r.event) ? r.event[0] : r.event
      if (!e || e.status === 'cancelled' || e.status === 'draft') continue
      m.set(e.event_date, [...(m.get(e.event_date) ?? []), e])
    }
    return m
  }, [mine.data])
  if (!member) return <EmptyState title="Seu usuário não está vinculado a um integrante" text="Peça a um administrador para vincular o seu usuário à lista de integrantes." />

  const first = cursor.getDay()
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => toISODate(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)))]
  const refresh = () => qc.invalidateQueries({ queryKey: ['my-availability'] })
  const setStatus = async (status: 'available' | 'unavailable' | null) => {
    if (!day) return
    try {
      if (status === null) unwrap(await supabase.from('availability').delete().eq('member_id', member.id).eq('date', day).select())
      else unwrap(await supabase.from('availability').upsert({ member_id: member.id, date: day, status, note: note.trim() || null }, { onConflict: 'member_id,date' }).select())
      setDay(null); refresh(); qc.invalidateQueries({ queryKey: ['availability-date'] })
    } catch (e) { toast.error(e) }
  }
  const open = (d: string) => { setDay(d); setNote(byDate.get(d)?.note ?? '') }
  return (
    <Card className="p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <IconButton label="Mês anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-5 w-5" /></IconButton>
        <p className="font-bold capitalize">{monthLabel(start)}</p>
        <IconButton label="Próximo mês" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-5 w-5" /></IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-muted">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => d === null ? <span key={i} /> : (() => {
          const a = byDate.get(d), evs = evByDate.get(d)
          return (
            <button key={d} onClick={() => open(d)} className={cn('relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold transition',
              a?.status === 'unavailable' ? 'border-danger/50 bg-danger/15 text-danger' : a?.status === 'available' ? 'border-ok/50 bg-ok/15 text-ok' : 'border-border hover:bg-surface2',
              d === todayStr() && 'ring-2 ring-accent')}>
              {Number(d.slice(8))}
              {evs && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-accent" title={evs.map((e) => e.title).join(', ')} />}
            </button>)
        })())}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-ok/40" />Disponível</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-danger/40" />Indisponível</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Você está escalado(a)</span>
      </div>
      <Modal open={!!day} onClose={() => setDay(null)} size="sm" title={day ? fmtDate(day) : ''}
        footer={<Button variant="ghost" onClick={() => void setStatus(null)}><Eraser className="h-4 w-4" />Limpar</Button>}>
        {day && evByDate.get(day) && <p className="mb-3 rounded-xl bg-accent/10 p-3 text-sm">Você está escalado(a): {evByDate.get(day)!.map((e) => `${e.title} (${fmtTime(e.start_time)})`).join(', ')}. Se não puder ir, peça uma troca pela própria escala.</p>}
        <div className="grid grid-cols-2 gap-2"><Button variant="primary" onClick={() => void setStatus('available')}><Check className="h-4 w-4" />Disponível</Button><Button variant="danger" onClick={() => void setStatus('unavailable')}><X className="h-4 w-4" />Indisponível</Button></div>
        <Field label="Observação (opcional)" className="mt-4"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: viagem, plantão…" /></Field>
      </Modal>
    </Card>
  )
}

function TeamAvailability() {
  const members = useMembers()
  const today = todayStr()
  const evs = useQuery({
    queryKey: ['team-av-events'],
    queryFn: async () => unwrap(await supabase.from('events').select('*, event_assignments(member_id)').gte('event_date', today).in('status', ['draft', 'published']).order('event_date').order('start_time').limit(8)) as unknown as (EventRow & { event_assignments: { member_id: string }[] })[],
  })
  const dates = [...new Set((evs.data ?? []).map((e) => e.event_date))]
  const av = useQuery({
    queryKey: ['team-av', dates.join(',')], enabled: dates.length > 0,
    queryFn: async () => unwrap(await supabase.from('availability').select('*').in('date', dates)) as Av[],
  })
  const map = new Map((av.data ?? []).map((a) => [`${a.member_id}|${a.date}`, a]))
  if (evs.isLoading || members.isLoading) return <PageLoader />
  if ((evs.data ?? []).length === 0) return <EmptyState title="Nenhum evento próximo" text="Crie escalas para acompanhar a disponibilidade da equipe nessas datas." action={<Link to="/escalas/nova"><Button variant="primary">Criar escala</Button></Link>} />
  const people = (members.data ?? []).filter((m) => m.active)
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[40rem] text-sm">
        <thead><tr className="border-b border-border text-left">
          <th className="sticky left-0 bg-surface px-4 py-3 font-bold">Integrante</th>
          {evs.data!.map((e) => <th key={e.id} className="px-3 py-3 text-center"><Link to={`/escalas/${e.id}/editar`} className="block font-bold hover:underline">{fmtDate(e.event_date).slice(0, 5)}</Link><span className="block text-[11px] font-normal text-muted">{e.title}</span></th>)}
        </tr></thead>
        <tbody>
          {people.map((m) => (
            <tr key={m.id} className="border-b border-border/60 last:border-0">
              <td className="sticky left-0 bg-surface px-4 py-2.5 font-semibold">{m.full_name}</td>
              {evs.data!.map((e) => {
                const a = map.get(`${m.id}|${e.event_date}`)
                const scheduled = e.event_assignments.some((x) => x.member_id === m.id)
                return (
                  <td key={e.id} className="px-3 py-2 text-center" title={a?.note ?? undefined}>
                    {a?.status === 'unavailable' ? <Badge tone="danger">Indisponível</Badge> : a?.status === 'available' ? <Badge tone="ok">Disponível</Badge> : <Badge>Sem resposta</Badge>}
                    {scheduled && <span className="mt-1 block text-[10px] font-bold uppercase text-accenttext">escalado</span>}
                  </td>)
              })}
            </tr>))}
        </tbody>
      </table>
    </Card>
  )
}

export default function Availability() {
  const { isLeader, member } = useAuth()
  const [tab, setTab] = useState<'mine' | 'team'>(member || !isLeader ? 'mine' : 'team')
  return (
    <div>
      <PageHeader title="Disponibilidade" subtitle="Informe os dias em que você não pode participar. O líder vê isso ao montar as escalas." />
      {isLeader && <Tabs value={tab} onChange={setTab} items={[{ value: 'mine', label: 'Minha disponibilidade' }, { value: 'team', label: 'Equipe' }]} />}
      {tab === 'mine' ? <MyAvailability /> : <TeamAvailability />}
    </div>
  )
}

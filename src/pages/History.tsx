import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, History as HistoryIcon, Search } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { StatusIcon } from '../components/TeamEditor'
import { useAssignments } from '../lib/events'
import { resolveItems } from '../lib/setlist'
import { useCategories } from '../lib/queries'
import { EVENT_TYPES, STATUS_LABEL, cn, fmtDate, fmtDateTime, fmtTime, normalize, todayStr } from '../lib/utils'
import type { EventRow, SetlistItem } from '../types'
import { Badge, Card, EmptyState, Input, PageHeader, PageLoader, Tabs } from '../components/ui'
import { statusTone } from './Events'

type H = EventRow & { creator: { full_name: string } | null; updater: { full_name: string } | null }

function Detail({ e }: { e: H }) {
  const asg = useAssignments(e.id)
  const cats = useCategories()
  const items = useQuery({
    queryKey: ['hist-items', e.id],
    queryFn: async () => {
      const sl = unwrap(await supabase.from('setlists').select('id').eq('event_id', e.id).maybeSingle()) as { id: string } | null
      if (!sl) return []
      return unwrap(await supabase.from('setlist_items').select('*, song:songs(*)').eq('setlist_id', sl.id).order('position')) as unknown as SetlistItem[]
    },
  })
  const resolved = resolveItems(items.data ?? [], cats.data ?? [])
  return (
    <div className="grid gap-5 border-t border-border bg-surface2/40 p-4 md:grid-cols-2">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Quem participou</p>
        {(asg.data ?? []).length === 0 ? <p className="text-sm text-muted">Sem equipe registrada.</p> : (
          <ul className="space-y-1.5 text-sm">{asg.data!.map((a) => <li key={a.id} className="flex items-center gap-2"><StatusIcon status={a.status} /><span className="font-semibold">{a.member?.full_name}</span><span className="text-muted">· {a.function?.name}</span></li>)}</ul>)}</div>
      <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Músicas e tonalidades</p>
        {resolved.length === 0 ? <p className="text-sm text-muted">Sem repertório.</p> : (
          <ol className="space-y-1.5 text-sm">{resolved.map((r, i) => <li key={r.id} className="flex items-center gap-2"><span className="w-4 text-xs text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate">{r.kind === 'song' ? r.song?.title : r.note || 'Momento especial'}</span>{r.key && <Badge tone="accent">{r.key}</Badge>}</li>)}</ol>)}</div>
      <p className="text-xs text-muted md:col-span-2">Criada por {e.creator?.full_name ?? '—'} em {fmtDateTime(e.created_at)} · última alteração {fmtDateTime(e.updated_at)}{e.updater ? ` por ${e.updater.full_name}` : ''} · <Link className="font-semibold text-accenttext" to={`/escalas/${e.id}`}>abrir escala</Link></p>
    </div>
  )
}

const ACTION: Record<string, string> = { insert: 'criou', update: 'alterou', delete: 'excluiu', activate: 'ativou o acesso de', deactivate: 'desativou o acesso de', role_added: 'concedeu cargo a', role_removed: 'removeu cargo de' }
const ENTITY: Record<string, string> = { events: 'escala', songs: 'música', members: 'integrante', worship_functions: 'função', service_schedules: 'horário de culto', churches: 'configurações', profiles: 'usuário', user_roles: 'usuário' }

function Activity() {
  const q = useQuery({
    queryKey: ['audit'],
    queryFn: async () => {
      const logs = unwrap(await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)) as { id: number; user_id: string | null; action: string; entity: string; entity_id: string | null; details: { label?: string; role?: string; changed?: string[] }; created_at: string }[]
      const ids = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[]
      const profs = ids.length ? (unwrap(await supabase.from('profiles').select('id, full_name').in('id', ids)) as { id: string; full_name: string }[]) : []
      return { logs, names: new Map(profs.map((p) => [p.id, p.full_name])) }
    },
  })
  if (q.isLoading) return <PageLoader />
  if (!q.data?.logs.length) return <EmptyState title="Nenhuma atividade registrada" />
  return (
    <Card className="divide-y divide-border">
      {q.data.logs.map((l) => (
        <div key={l.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-3 text-sm">
          <span className="font-semibold">{l.user_id ? q.data.names.get(l.user_id) ?? 'Usuário' : 'Sistema'}</span>
          <span className="text-muted">{ACTION[l.action] ?? l.action} {ENTITY[l.entity] ?? l.entity}</span>
          {l.details?.label && <span className="font-semibold">“{l.details.label}”</span>}
          {l.details?.role && <Badge>{l.details.role}</Badge>}
          {l.details?.changed && l.details.changed.length > 0 && l.action === 'update' && <span className="text-xs text-muted">({l.details.changed.join(', ')})</span>}
          <span className="ml-auto text-xs text-muted">{fmtDateTime(l.created_at)}</span>
        </div>))}
    </Card>
  )
}

export default function History() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<'events' | 'activity'>('events')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const today = todayStr()
  const list = useQuery({
    queryKey: ['history'],
    queryFn: async () => unwrap(await supabase.from('events').select('*, creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
      .or(`event_date.lt.${today},status.in.(completed,cancelled)`).order('event_date', { ascending: false }).limit(150)) as unknown as H[],
  })
  const rows = (list.data ?? []).filter((e) => !q || normalize(`${e.title} ${fmtDate(e.event_date)}`).includes(normalize(q)))
  return (
    <div>
      <PageHeader title="Histórico" subtitle="Quem participou, quais músicas e tons foram usados e quem alterou cada escala." />
      {isAdmin && <Tabs value={tab} onChange={setTab} items={[{ value: 'events', label: 'Cultos' }, { value: 'activity', label: 'Registro de atividades' }]} />}
      {tab === 'activity' ? <Activity /> : (<>
        <div className="relative mb-4"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" /><Input className="!pl-10" placeholder="Buscar por nome ou data" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title="Nenhum culto no histórico" text="Cultos passados, concluídos e cancelados aparecem aqui." /> : (
          <div className="space-y-2.5">{rows.map((e) => (
            <Card key={e.id} className="overflow-hidden">
              <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{e.title}</p><p className="text-xs text-muted">{fmtDate(e.event_date)} · {fmtTime(e.start_time)} · {EVENT_TYPES[e.event_type]?.label}</p></div>
                <Badge tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Badge>
                <ChevronDown className={cn('h-5 w-5 text-muted transition', open === e.id && 'rotate-180')} />
              </button>
              {open === e.id && <Detail e={e} />}
            </Card>))}</div>)}
      </>)}
    </div>
  )
}

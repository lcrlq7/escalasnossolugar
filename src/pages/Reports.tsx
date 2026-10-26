import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useSongs } from '../lib/queries'
import { useSongUsage, countBy } from '../lib/usage'
import { addDays, fmtDate, todayStr } from '../lib/utils'
import type { Alert, ResponseStatus } from '../types'
import { Badge, Card, EmptyState, Field, Input, PageHeader, PageLoader, SectionTitle } from '../components/ui'

const C = { accent: '#F9C700', blue: '#5B9BF0', green: '#4AC882', red: '#F56464', amber: '#F5AA32', grey: '#8A8A94' }
const tip = { contentStyle: { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 12, color: 'rgb(var(--fg))' }, labelStyle: { color: 'rgb(var(--fg))', fontWeight: 700 } }

interface Ev { id: string; title: string; event_date: string; status: string; event_assignments: { status: ResponseStatus; member_id: string; member: { full_name: string } | { full_name: string }[] | null; function: { name: string } | { name: string }[] | null }[] }
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

export default function Reports() {
  const [from, setFrom] = useState(addDays(todayStr(), -90))
  const [to, setTo] = useState(todayStr())
  const songs = useSongs()
  const usage = useSongUsage(from, to)
  const evs = useQuery({
    queryKey: ['report-events', from, to],
    queryFn: async () => unwrap(await supabase.from('events').select('id, title, event_date, status, event_assignments(status, member_id, member:members(full_name), function:worship_functions(name))')
      .gte('event_date', from).lte('event_date', to).in('status', ['published', 'completed']).order('event_date', { ascending: false })) as unknown as Ev[],
  })
  const pend = useQuery({
    queryKey: ['report-pending'],
    queryFn: async () => ((unwrap(await supabase.rpc('upcoming_event_alerts', { p_from: todayStr(), p_to: addDays(todayStr(), 60) })) ?? []) as { event_id: string; title: string; event_date: string; alerts: Alert[] }[]).map((r) => ({ ...r, alerts: r.alerts.filter((a) => a.type !== 'pending') })).filter((r) => r.alerts.length > 0),
  })

  const att = useQuery({
    queryKey: ['attendance-report', from, to],
    queryFn: async () => (unwrap(await supabase.rpc('attendance_report', { p_from: from, p_to: to })) ?? []) as { member_id: string; full_name: string; total: number; confirmed: number; declined: number; pending: number; last_served: string | null; last_30: number }[],
  })
  const d = useMemo(() => {
    const rows = (evs.data ?? []).flatMap((e) => e.event_assignments.map((a) => ({ e, a, name: one(a.member)?.full_name ?? '—', fn: one(a.function)?.name ?? '—' })))
    const per = new Map<string, { name: string; events: Set<string> }>()
    for (const r of rows) {
      const p = per.get(r.a.member_id) ?? { name: r.name, events: new Set<string>() }
      p.events.add(r.e.id)
      per.set(r.a.member_id, p)
    }
    const members = [...per.values()].map((p) => ({ name: p.name, escalas: p.events.size })).sort((a, b) => b.escalas - a.escalas)
    const fnCount = [...countBy(rows, (r) => r.fn).entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
    return { members, fnCount, total: rows.length }
  }, [evs.data])

  const songUse = useMemo(() => {
    const m = countBy(usage.data ?? [], (r) => r.song_id)
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ name: (usage.data ?? []).find((r) => r.song_id === id)!.title, n }))
    const rare = (songs.data ?? []).filter((s) => !s.archived && (m.get(s.id) ?? 0) === 0)
    return { top, rare }
  }, [usage.data, songs.data])

  const loading = evs.isLoading || usage.isLoading

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle="Dados reais das escalas publicadas e concluídas no período." />
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-2 pb-0.5">{[['30 dias', 30], ['90 dias', 90], ['1 ano', 365]].map(([l, n]) => <button key={l as string} onClick={() => { setFrom(addDays(todayStr(), -(n as number))); setTo(todayStr()) }} className="rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold hover:bg-border">{l}</button>)}</div>
      </Card>
      {loading ? <PageLoader /> : (evs.data ?? []).length === 0 ? <EmptyState title="Sem dados neste período" text="Os relatórios consideram escalas publicadas ou concluídas. Ajuste o período ou publique escalas." /> : (<>
        <div className="grid gap-4 sm:grid-cols-3">
          {[['Cultos no período', evs.data!.length], ['Participações', d.total], ['Integrantes escalados', d.members.length]].map(([l, v]) => (
            <Card key={l as string} className="p-4"><p className="text-2xl font-extrabold">{v}</p><p className="text-xs text-muted">{l}</p></Card>))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5"><SectionTitle title="Escalas por integrante" />
            <ResponsiveContainer width="100%" height={Math.max(220, d.members.slice(0, 12).length * 34)}>
              <BarChart data={d.members.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} /><Tooltip {...tip} /><Bar dataKey="escalas" name="Escalas" fill={C.accent} radius={[0, 6, 6, 0]} /></BarChart>
            </ResponsiveContainer></Card>
          <Card className="p-5"><SectionTitle title="Participação por função" />
            <ResponsiveContainer width="100%" height={Math.max(220, d.fnCount.length * 34)}>
              <BarChart data={d.fnCount} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={120} /><Tooltip {...tip} /><Bar dataKey="n" name="Participações" fill={C.blue} radius={[0, 6, 6, 0]} /></BarChart>
            </ResponsiveContainer></Card>
          <Card className="p-5"><SectionTitle title="Músicas mais utilizadas" />
            {songUse.top.length === 0 ? <p className="text-sm text-muted">Nenhuma música usada no período.</p> : (
              <ResponsiveContainer width="100%" height={Math.max(220, songUse.top.length * 34)}>
                <BarChart data={songUse.top} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={130} /><Tooltip {...tip} /><Bar dataKey="n" name="Vezes" fill={C.accent} radius={[0, 6, 6, 0]} /></BarChart>
              </ResponsiveContainer>)}</Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5"><SectionTitle title="Músicas pouco utilizadas" subtitle="Cadastradas e sem uso no período" />
            {songUse.rare.length === 0 ? <p className="text-sm text-muted">Todas as músicas foram usadas no período.</p> : <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">{songUse.rare.slice(0, 80).map((s) => <Badge key={s.id}>{s.title}</Badge>)}</div>}</Card>
          <Card className="p-5"><SectionTitle title="Repertórios anteriores" />
            <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">{[...new Map((usage.data ?? []).map((u) => [u.event_id, u])).values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((u) => (
              <li key={u.event_id} className="flex justify-between gap-3"><Link to={`/escalas/${u.event_id}`} className="truncate font-semibold hover:underline">{u.event_title}</Link><span className="shrink-0 text-muted">{fmtDate(u.date)} · {(usage.data ?? []).filter((x) => x.event_id === u.event_id).length} músicas</span></li>))}</ul></Card>
        </div>
      </>)}

      <Card className="overflow-x-auto p-5"><SectionTitle title="Carga e rodízio da equipe" subtitle="Quem está sobrecarregado e quem está há mais tempo sem servir" />
        {(att.data ?? []).length === 0 ? <p className="text-sm text-muted">Sem integrantes ativos.</p> : (
          <table className="w-full min-w-[32rem] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted"><th className="py-2">Integrante</th><th>No período</th><th>Últimos 30 dias</th><th>Última vez</th><th>Situação</th></tr></thead>
            <tbody>{att.data!.map((m) => {
              const days = m.last_served ? Math.floor((Date.now() - new Date(`${m.last_served}T12:00:00`).getTime()) / 86400000) : null
              return (<tr key={m.member_id} className="border-b border-border/60 last:border-0"><td className="py-2 font-semibold">{m.full_name}</td><td className="pr-4"><div className="flex items-center gap-2"><span className="w-5 font-bold">{m.total}</span><div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-accent" style={{ width: `${(m.total / Math.max(1, ...(att.data ?? []).map((x) => x.total))) * 100}%` }} /></div></div></td><td>{m.last_30}</td>
                <td>{m.last_served ? fmtDate(m.last_served) : '—'}</td>
                <td>{m.last_30 >= 4 ? <Badge tone="warn">Sobrecarregado(a)</Badge> : days === null || days > 45 ? <Badge tone="info">Descansado(a)</Badge> : <Badge tone="ok">Em dia</Badge>}</td></tr>)
            })}</tbody></table>)}</Card>

      <Card className="p-5"><SectionTitle title="Escalas com pendências" subtitle="Próximos 60 dias" />
        {(pend.data ?? []).length === 0 ? <p className="text-sm text-ok">Nenhuma pendência encontrada.</p> : (
          <ul className="space-y-2">{pend.data!.map((r) => (
            <li key={r.event_id}><Link to={`/escalas/${r.event_id}/editar`} className="flex items-start gap-2.5 rounded-xl border border-border p-3 hover:bg-surface2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <div><p className="text-sm font-semibold">{r.title} · {fmtDate(r.event_date)}</p><p className="text-xs text-muted">{r.alerts.map((a) => a.message).join(' · ')}</p></div></Link></li>))}</ul>)}</Card>
    </div>
  )
}

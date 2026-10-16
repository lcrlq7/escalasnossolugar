import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle, X } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useFunctions, useMembers } from '../lib/queries'
import { useToast } from '../context/Toast'
import { cn, RESPONSE_LABEL } from '../lib/utils'
import type { Alert, EventRow, ResponseStatus } from '../types'
import type { AssignmentFull } from '../lib/events'
import { Badge, Select } from './ui'

export function StatusIcon({ status, className }: { status: ResponseStatus; className?: string }) {
  if (status === 'confirmed') return <CheckCircle2 className={cn('h-4 w-4 text-ok', className)} aria-label="Confirmado" />
  if (status === 'declined') return <XCircle className={cn('h-4 w-4 text-danger', className)} aria-label="Recusou" />
  return <Clock className={cn('h-4 w-4 text-warn', className)} aria-label="Aguardando" />
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm',
          a.severity === 'error' && 'border-danger/40 bg-danger/10', a.severity === 'warning' && 'border-warn/40 bg-warn/10', a.severity === 'info' && 'border-info/30 bg-info/10')}>
          {a.severity === 'info' ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" /> : <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', a.severity === 'error' ? 'text-danger' : 'text-warn')} />}
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  )
}

/** Equipe do culto agrupada por função. Alertas não bloqueiam — o líder decide. */
export function TeamEditor({ event, assignments }: { event: EventRow; assignments: AssignmentFull[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const fns = useFunctions()
  const members = useMembers()
  const avail = useQuery({
    queryKey: ['availability-date', event.event_date],
    queryFn: async () => unwrap(await supabase.from('availability').select('member_id, status').eq('date', event.event_date)) as { member_id: string; status: string }[],
  })
  const unavailable = useMemo(() => new Set((avail.data ?? []).filter((a) => a.status === 'unavailable').map((a) => a.member_id)), [avail.data])
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['assignments', event.id] })
    qc.invalidateQueries({ queryKey: ['alerts', event.id] })
    qc.invalidateQueries({ queryKey: ['upcoming-alerts'] })
  }
  const add = async (functionId: string, memberId: string) => {
    if (!memberId) return
    try { unwrap(await supabase.from('event_assignments').insert({ event_id: event.id, member_id: memberId, function_id: functionId }).select().single()); refresh() }
    catch (e) { toast.error(e) }
  }
  const remove = async (id: string) => {
    try { unwrap(await supabase.from('event_assignments').delete().eq('id', id).select()); refresh() } catch (e) { toast.error(e) }
  }
  const activeMembers = (members.data ?? []).filter((m) => m.active)
  const list = (fns.data ?? []).filter((f) => f.active)

  return (
    <div className="space-y-2.5">
      {list.map((f) => {
        const here = assignments.filter((a) => a.function_id === f.id)
        const ids = new Set(here.map((a) => a.member_id))
        const skilled = activeMembers.filter((m) => !ids.has(m.id) && m.member_functions?.some((x) => x.function_id === f.id))
        const others = activeMembers.filter((m) => !ids.has(m.id) && !m.member_functions?.some((x) => x.function_id === f.id))
        const label = (m: { id: string; full_name: string }) => `${m.full_name}${unavailable.has(m.id) ? ' — indisponível' : ''}`
        return (
          <div key={f.id} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold">{f.name}</span>
              {f.is_main && <Badge tone="accent">Principal</Badge>}
              {f.is_required && <Badge tone="warn">Obrigatória</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {here.map((a) => (
                <span key={a.id} className={cn('inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1.5 text-sm',
                  unavailable.has(a.member_id) ? 'border-danger/50 bg-danger/10' : 'border-border bg-surface2')}>
                  <StatusIcon status={a.status} className="h-3.5 w-3.5" />{a.member?.full_name}
                  <span className="sr-only">{RESPONSE_LABEL[a.status]}</span>
                  <button onClick={() => void remove(a.id)} aria-label={`Remover ${a.member?.full_name}`} className="rounded-full p-0.5 text-muted hover:bg-border hover:text-fg"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              <Select className="!w-auto !py-1.5 text-sm" value="" onChange={(e) => void add(f.id, e.target.value)} aria-label={`Adicionar integrante em ${f.name}`}>
                <option value="">+ Adicionar</option>
                {skilled.length > 0 && <optgroup label="Habilitados nesta função">{skilled.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</optgroup>}
                {others.length > 0 && <optgroup label="Outros integrantes">{others.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</optgroup>}
              </Select>
            </div>
          </div>
        )
      })}
      {members.data && activeMembers.length === 0 && <p className="text-sm text-muted">Cadastre integrantes em “Integrantes” para montar a equipe.</p>}
    </div>
  )
}

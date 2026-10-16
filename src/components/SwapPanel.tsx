import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { fmtDate, todayStr } from '../lib/utils'
import { Badge, Button, Card, SectionTitle } from './ui'

interface Swap {
  id: string; status: 'pending' | 'accepted'; message: string | null; from_member_id: string; to_member_id: string
  event: { id: string; title: string; event_date: string } | null
  from: { full_name: string } | null; to: { full_name: string } | null
}

/** Pedidos de troca em andamento: aceitar/recusar (colega), aprovar/negar (líder) e cancelar (quem pediu). */
export function SwapPanel() {
  const { member, isLeader } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['swaps'],
    queryFn: async () => (unwrap(await supabase.from('swap_requests')
      .select('id,status,message,from_member_id,to_member_id,event:events(id,title,event_date),from:members!swap_requests_from_member_id_fkey(full_name),to:members!swap_requests_to_member_id_fkey(full_name)')
      .in('status', ['pending', 'accepted']).order('created_at', { ascending: false })) ?? []) as unknown as Swap[],
  })
  const run = useMutation({
    mutationFn: async (a: { fn: 'respond_swap' | 'approve_swap' | 'cancel_swap'; args: Record<string, unknown>; ok: string }) => { unwrap(await supabase.rpc(a.fn, a.args)); return a.ok },
    onSuccess: (ok) => { toast.success(ok); qc.invalidateQueries({ queryKey: ['swaps'] }); qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['notifications'] }) },
    onError: (e) => toast.error(e),
  })
  const list = (q.data ?? []).filter((s) => s.event && s.event.event_date >= todayStr())
  if (list.length === 0) return null
  return (
    <Card className="p-5">
      <SectionTitle title="Pedidos de troca" subtitle="Trocas de escala em andamento" action={<ArrowRightLeft className="h-4 w-4 text-muted" />} />
      <ul className="space-y-3">
        {list.map((s) => {
          const toMe = s.to_member_id === member?.id, fromMe = s.from_member_id === member?.id
          return (
            <li key={s.id} className="rounded-xl bg-surface2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{s.event?.title} · {s.event ? fmtDate(s.event.event_date) : ''}</p>
                <Badge tone={s.status === 'accepted' ? 'ok' : 'warn'}>{s.status === 'accepted' ? 'Aguardando líder' : 'Aguardando colega'}</Badge>
              </div>
              <p className="mt-1 text-muted">{s.from?.full_name} → {s.to?.full_name}</p>
              {s.message && <p className="mt-1 text-xs italic text-muted">“{s.message}”</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {toMe && s.status === 'pending' && <>
                  <Button size="sm" variant="primary" loading={run.isPending} onClick={() => run.mutate({ fn: 'respond_swap', args: { p_swap: s.id, p_accept: true }, ok: 'Você aceitou. O líder vai aprovar.' })}>Aceitar</Button>
                  <Button size="sm" variant="danger" loading={run.isPending} onClick={() => run.mutate({ fn: 'respond_swap', args: { p_swap: s.id, p_accept: false }, ok: 'Pedido recusado.' })}>Recusar</Button></>}
                {isLeader && s.status === 'accepted' && <>
                  <Button size="sm" variant="primary" loading={run.isPending} onClick={() => run.mutate({ fn: 'approve_swap', args: { p_swap: s.id, p_approve: true }, ok: 'Troca aprovada.' })}>Aprovar troca</Button>
                  <Button size="sm" variant="danger" loading={run.isPending} onClick={() => run.mutate({ fn: 'approve_swap', args: { p_swap: s.id, p_approve: false }, ok: 'Troca negada.' })}>Negar</Button></>}
                {(fromMe || isLeader) && <Button size="sm" variant="ghost" loading={run.isPending} onClick={() => run.mutate({ fn: 'cancel_swap', args: { p_swap: s.id }, ok: 'Pedido cancelado.' })}>Cancelar pedido</Button>}
              </div>
            </li>)
        })}
      </ul>
    </Card>
  )
}

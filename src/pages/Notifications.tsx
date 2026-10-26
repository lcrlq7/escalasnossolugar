import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { cn, fmtDateTime } from '../lib/utils'
import type { AppNotification } from '../types'
import { Button, Card, EmptyState, PageHeader, PageLoader } from '../components/ui'

export default function Notifications() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: async () => unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) as AppNotification[],
  })
  const unread = (q.data ?? []).filter((n) => !n.read_at).length
  const markAll = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  const open = async (n: AppNotification) => {
    if (!n.read_at) { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); qc.invalidateQueries({ queryKey: ['notifications'] }) }
    if (n.link) nav(n.link)
  }
  return (
    <div>
      <PageHeader title="Notificações" actions={unread > 0 ? <Button variant="outline" onClick={markAll}>Marcar todas como lidas</Button> : undefined} />
      {q.isLoading ? <PageLoader /> : (q.data ?? []).length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="Nenhuma notificação" text="Avisos sobre escalas, trocas e cancelamentos aparecem aqui." /> : (
        <Card className="divide-y divide-border">{q.data!.map((n) => (
          <button key={n.id} onClick={() => open(n)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface2">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-accent')} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{n.title}</span>{n.body && <span className="block text-sm text-muted">{n.body}</span>}<span className="text-xs text-muted">{fmtDateTime(n.created_at)}</span></span>
          </button>))}</Card>)}
    </div>
  )
}

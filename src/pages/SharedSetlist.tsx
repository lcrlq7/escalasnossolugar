import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Play } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { PlayerView } from '../components/PlayerView'
import { exportSetlistPdf } from '../lib/pdf'
import type { ResolvedItem } from '../lib/setlist'
import { totalSeconds } from '../lib/setlist'
import { fmtDate, fmtDuration, fmtTime, fmtTotal } from '../lib/utils'
import type { Song } from '../types'
import { Badge, Button, Card, Cover, EmptyState, PageHeader, PageLoader } from '../components/ui'

interface Shared {
  setlist: { id: string; name: string; theme: string | null; notes: string | null }
  event: { id: string; title: string; event_date: string; start_time: string; location: string | null; status: string } | null
  items: { id: string; position: number; kind: ResolvedItem['kind']; note: string | null; key: string | null; category: string | null; duration_seconds: number | null; song: Song | null }[]
}

export default function SharedSetlist() {
  const { token } = useParams()
  const { church } = useAuth()
  const [player, setPlayer] = useState(false)
  const q = useQuery({ queryKey: ['shared', token], queryFn: async () => unwrap(await supabase.rpc('get_shared_setlist', { p_token: token! })) as unknown as Shared | null })
  const items: ResolvedItem[] = useMemo(() => (q.data?.items ?? []).map((i) => ({ id: i.id, position: i.position, kind: i.kind, note: i.note, category: i.category, key: i.key, duration: i.duration_seconds, song: i.song })), [q.data])
  if (q.isLoading) return <PageLoader />
  if (!q.data) return <EmptyState title="Repertório indisponível" text="O link é inválido ou você não tem autorização para ver este repertório. Apenas integrantes autorizados conseguem abri-lo." action={<Link to="/"><Button variant="primary">Ir para o início</Button></Link>} />
  const { setlist, event } = q.data
  const tot = totalSeconds(items)
  return (
    <div>
      <PageHeader title={setlist.name} subtitle={event ? `${fmtDate(event.event_date)} às ${fmtTime(event.start_time)}${event.location ? ` · ${event.location}` : ''}` : undefined}
        actions={<><Button variant="outline" onClick={() => exportSetlistPdf({ church: church?.name ?? '', title: setlist.name, subtitle: event ? `${fmtDate(event.event_date)} às ${fmtTime(event.start_time)}` : undefined, items })}><FileDown className="h-4 w-4" />PDF</Button>
          <Button variant="primary" onClick={() => setPlayer(true)}><Play className="h-4 w-4" />Reproduzir</Button></>} />
      <Card className="p-4">
        <ol className="space-y-2">{items.map((r, n) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            <span className="w-5 text-center text-sm font-bold text-muted">{n + 1}</span>
            {r.kind === 'song' ? (<><Cover url={r.song?.cover_url} size={48} /><div className="min-w-0 flex-1"><p className="truncate font-bold">{r.song?.title}</p><p className="truncate text-xs text-muted">{[r.category, r.song?.artist, r.duration ? fmtDuration(r.duration) : null].filter(Boolean).join(' · ')}</p>{r.note && <p className="text-xs text-accenttext">{r.note}</p>}</div>{r.key && <Badge tone="accent">{r.key}</Badge>}</>)
              : <div className="flex-1 text-sm"><Badge tone="info">Momento</Badge> {r.note}</div>}
          </li>))}</ol>
        <p className="mt-3 text-sm text-muted">Duração total estimada: {fmtTotal(tot.total)}</p>
      </Card>
      {player && <PlayerView title={setlist.name} items={items} onClose={() => setPlayer(false)} />}
    </div>
  )
}

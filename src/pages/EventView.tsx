import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Clock, FileDown, MapPin, Pencil, Play, Repeat2, Wrench, Link2, Mic2, Youtube, Music2 } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useCategories } from '../lib/queries'
import { AlertList } from '../components/TeamEditor'
import { PlayerView } from '../components/PlayerView'
import { useAssignments, useEventAlerts, useEventFull, useEventSetlist } from '../lib/events'
import { resolveItems, shareUrl, totalSeconds } from '../lib/setlist'
import { exportEventPdf } from '../lib/pdf'
import { EVENT_TYPES, STATUS_LABEL, fmtDateLong, fmtDuration, fmtTime, fmtTotal, safeUrl } from '../lib/utils'
import type { SetlistItem } from '../types'
import { Avatar, Badge, Button, Card, Cover, EmptyState, PageLoader, SectionTitle, Textarea, Toggle } from '../components/ui'
import { statusTone } from './Events'
import { SwapModal } from '../components/SwapModal'
import { SetlistEditor } from '../components/SetlistEditor'

export default function EventView() {
  const { id } = useParams()
  const { isLeader, isTech, member, church } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const ev = useEventFull(id)
  const asg = useAssignments(id)
  const sl = useEventSetlist(id)
  const cats = useCategories()
  const alerts = useEventAlerts(id, isLeader && !!ev.data)
  const items = useQuery({
    queryKey: ['setlist-items-event', sl.data?.id], enabled: !!sl.data?.id,
    queryFn: async () => unwrap(await supabase.from('setlist_items').select('*, song:songs(*)').eq('setlist_id', sl.data!.id).order('position')) as unknown as SetlistItem[],
  })
  const [tech, setTech] = useState('')
  const [ready, setReady] = useState(false)
  const [savingTech, setSavingTech] = useState(false)
  const [player, setPlayer] = useState(false)
  const [swapFor, setSwapFor] = useState<string | null>(null)
  useEffect(() => { if (ev.data) { setTech(ev.data.tech_notes ?? ''); setReady(ev.data.sound_ready) } }, [ev.data])

  const resolved = useMemo(() => resolveItems(items.data ?? [], cats.data ?? []), [items.data, cats.data])
  if (ev.isLoading || asg.isLoading) return <PageLoader />
  const e = ev.data
  if (!e) return <EmptyState title="Escala não encontrada" text="Ela pode ter sido removida ou ainda estar em rascunho." action={<Link to="/escalas"><Button variant="primary">Voltar às escalas</Button></Link>} />
  const team = [...(asg.data ?? [])].sort((a, b) => (a.function?.sort_order ?? 0) - (b.function?.sort_order ?? 0) || (a.member?.full_name ?? '').localeCompare(b.member?.full_name ?? ''))
  const mine = team.filter((a) => a.member_id === member?.id)
  const peopleIds = new Set(team.map((a) => a.member_id))
  const tot = totalSeconds(resolved)
  // ministro da escala: o líder responsável ou quem está na função principal (Ministro principal)
  const isEventLead = !!member?.id && e.status !== 'cancelled' && (member.id === e.leader_member_id || team.some((a) => a.member_id === member.id && a.function?.is_main))
  const canTech = isLeader || (isTech && e.status !== 'draft')
  const canRespond = mine.length > 0 && e.status === 'published'

  const refresh = () => { qc.invalidateQueries({ queryKey: ['assignments', id] }); qc.invalidateQueries({ queryKey: ['event', id] }); qc.invalidateQueries({ queryKey: ['events-list'] }); qc.invalidateQueries({ queryKey: ['alerts', id] }) }
  const toggleRehearsed = async (itemId: string, value: boolean) => {
    try { unwrap(await supabase.rpc('set_item_rehearsed', { p_item: itemId, p_value: value })); qc.invalidateQueries({ queryKey: ['setlist-items-event'] }) }
    catch (err) { toast.error(err) }
  }
  const saveTech = async (nextReady = ready) => {
    setSavingTech(true)
    try { unwrap(await supabase.rpc('set_tech_info', { p_event_id: e.id, p_tech_notes: tech, p_sound_ready: nextReady })); toast.success('Informações técnicas salvas.'); refresh() }
    catch (err) { toast.error(err) } finally { setSavingTech(false) }
  }
  const copyLink = async () => {
    if (!sl.data) return
    try { await navigator.clipboard.writeText(shareUrl(sl.data)); toast.success('Link do repertório copiado.') } catch { toast.info(shareUrl(sl.data)) }
  }
  const pdf = () => exportEventPdf({
    church: church?.name ?? '', title: e.title, subtitle: `${fmtDateLong(e.event_date)} · ${fmtTime(e.start_time)}${e.end_time ? ` – ${fmtTime(e.end_time)}` : ''} · ${STATUS_LABEL[e.status]}`,
    leader: e.leader?.full_name, location: e.location, notes: e.notes, techNotes: e.tech_notes,
    team: team.map((t) => ({ role: t.function?.name ?? '', name: t.member?.full_name ?? '' })), items: resolved,
  })

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-border bg-surface p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Badge>
              <Badge><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: EVENT_TYPES[e.event_type]?.color }} />{EVENT_TYPES[e.event_type]?.label}</Badge>
              {e.status === 'published' && (e.sound_ready ? <Badge tone="ok"><Wrench className="h-3 w-3" />Som preparado</Badge> : <Badge tone="warn"><Wrench className="h-3 w-3" />Som pendente</Badge>)}</div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">{e.title}</h1>
            <p className="mt-1 text-sm capitalize text-muted">{fmtDateLong(e.event_date)} · {fmtTime(e.start_time)}{e.end_time ? ` às ${fmtTime(e.end_time)}` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              {e.leader && <span className="inline-flex items-center gap-1.5"><Mic2 className="h-4 w-4" />Líder: <b className="text-fg">{e.leader.full_name}</b></span>}
              {e.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{e.location}</span>}
            </div>
            {e.status === 'cancelled' && e.cancel_reason && <p className="mt-2 text-sm text-danger">Motivo do cancelamento: {e.cancel_reason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isLeader && <Link to={`/escalas/${e.id}/editar`}><Button variant="primary"><Pencil className="h-4 w-4" />Editar</Button></Link>}
            <Button variant="outline" onClick={pdf}><FileDown className="h-4 w-4" />PDF</Button>
            {sl.data && <Button variant="outline" onClick={copyLink}><Link2 className="h-4 w-4" />Link</Button>}
            {resolved.length > 0 && <Button variant="outline" onClick={() => setPlayer(true)}><Play className="h-4 w-4" />Modo palco</Button>}
          </div>
        </div>
        {e.notes && <p className="mt-4 rounded-xl bg-surface2 px-4 py-3 text-sm">{e.notes}</p>}
      </div>

      {canRespond && (
        <div className="mb-6 rounded-2xl border border-accent/50 bg-accent/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-bold">Você está escalado(a) neste culto</p>
              <p className="text-sm text-muted">Funções: {mine.map((m) => m.function?.name).join(', ')}</p></div>
            {mine[0] && new Date(`${e.event_date}T23:59:59`) >= new Date() && <Button onClick={() => setSwapFor(mine[0].id)}><Repeat2 className="h-4 w-4" />Pedir troca</Button>}
          </div>
        </div>)}

      {isLeader && (alerts.data ?? []).length > 0 && <div className="mb-6"><AlertList alerts={alerts.data ?? []} /></div>}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle title="Equipe" subtitle={`${peopleIds.size} escalados`} />
            {team.length === 0 ? <p className="text-sm text-muted">Equipe ainda não definida.</p> : (
              <ul className="space-y-2.5">
                {team.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <Avatar name={t.member?.full_name ?? ''} size={34} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.member?.full_name}</p><p className="text-xs text-muted">{t.function?.name}</p></div>
                  </li>))}
              </ul>)}
          </Card>

          {(canTech || e.tech_notes) && e.status !== 'draft' || isLeader ? (
            <Card className="p-5">
              <SectionTitle title="Informações técnicas" subtitle="Microfones, entradas, instrumentos e transições" />
              {canTech ? (<>
                <Textarea value={tech} onChange={(x) => setTech(x.target.value)} placeholder="Ex.: 3 microfones de voz, DI no violão, pad na transição…" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <Toggle checked={ready} label="Preparação do som concluída" onChange={(v) => { setReady(v); void saveTech(v) }} />
                  <Button loading={savingTech} onClick={() => void saveTech()}>Salvar observações</Button>
                </div></>) : <p className="whitespace-pre-wrap text-sm">{e.tech_notes || 'Sem observações técnicas.'}</p>}
            </Card>) : null}
        </div>

        <Card className="p-5">
          <SectionTitle title="Repertório" subtitle={resolved.length ? `${resolved.filter((r) => r.kind === 'song').length} músicas · ${fmtTotal(tot.total)} · ${resolved.filter((r) => r.kind === 'song' && r.rehearsed).length} ensaiadas` : undefined} />
          {(isEventLead || isLeader) && e.status !== 'cancelled' && sl.data ? (<>
            {!isLeader && <p className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-sm">Você é o ministro responsável por esta escala: monte o repertório, ajuste os tons e crie a playlist.</p>}
            <SetlistEditor setlist={sl.data} eventType={e.event_type} />
          </>) : resolved.length === 0 ? <EmptyState title="Repertório ainda não definido" /> : (
            <ol className="space-y-2">
              {resolved.map((r, n) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                  <span className="w-5 text-center text-sm font-bold text-muted">{n + 1}</span>
                  {r.kind === 'song' ? (<>
                    <Cover url={r.song?.cover_url} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{r.song?.title}</p>
                      <p className="truncate text-xs text-muted">{[r.category, r.song?.artist, r.duration ? fmtDuration(r.duration) : null].filter(Boolean).join(' · ')}</p>
                      {r.note && <p className="mt-0.5 text-xs text-accenttext">{r.note}</p>}
                    </div>
                    {r.key && <span className="rounded-lg bg-accent px-2.5 py-1 text-sm font-extrabold text-accentfg">{r.key}</span>}
                    {(isLeader || mine.length > 0) && e.status !== 'draft' && (
                      <button onClick={() => void toggleRehearsed(r.id, !r.rehearsed)} aria-label={r.rehearsed ? 'Marcar como não ensaiada' : 'Marcar como ensaiada'} title={r.rehearsed ? 'Ensaiada' : 'Precisa ensaiar'}
                        className={`press rounded-lg p-2 ${r.rehearsed ? 'text-ok' : 'text-muted hover:text-fg'}`}>{r.rehearsed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</button>)}
                    <div className="flex gap-1">
                      {r.song?.youtube_url && <a aria-label="Abrir no YouTube" href={safeUrl(r.song.youtube_url)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg"><Youtube className="h-4 w-4" /></a>}
                      {r.song?.spotify_url && <a aria-label="Abrir no Spotify" href={safeUrl(r.song.spotify_url)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg"><Music2 className="h-4 w-4" /></a>}
                    </div>
                  </>) : (<div className="flex-1"><Badge tone="info">{r.kind === 'prayer' ? 'Oração' : r.kind === 'transition' ? 'Transição' : 'Observação'}</Badge><span className="ml-2 text-sm">{r.note}</span></div>)}
                </li>))}
            </ol>)}
          {e.updated_at && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Clock className="h-3.5 w-3.5" />Atualizada por {e.updater?.full_name ?? e.creator?.full_name ?? '—'}</p>}
        </Card>
      </div>

      <SwapModal open={!!swapFor} assignmentId={swapFor} eventId={e.id} onClose={() => setSwapFor(null)} />
      {player && <PlayerView title={e.title} items={resolved} onClose={() => setPlayer(false)} />}
    </div>
  )
}

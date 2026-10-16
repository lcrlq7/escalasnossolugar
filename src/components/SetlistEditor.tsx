import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Copy, FileDown, GripVertical, HandHeart, Link2, ListPlus, MessageSquare, Music2, ListVideo, Play, Plus, Shuffle, Star, Trash2, Wand2, Youtube,
} from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useCategories } from '../lib/queries'
import { KIND_LABEL, resolveItems, shareUrl, totalSeconds } from '../lib/setlist'
import { exportSetlistPdf } from '../lib/pdf'
import { cn, fmtDate, fmtDuration, fmtTotal } from '../lib/utils'
import type { Category, EventType, ItemKind, Setlist, SetlistItem, Song } from '../types'
import { Badge, Button, ConfirmDialog, Cover, EmptyState, Field, IconButton, Input, KeyInput, Modal, Select, Spinner } from './ui'
import { SongPickerModal } from './SongForm'
import { AutoSetlistModal } from './AutoSetlistModal'
import { PlayerView } from './PlayerView'
import { PlaylistModal } from './PlaylistModal'

function Row({ item, cats, readOnly, onChange, onRemove }: {
  item: SetlistItem; cats: Category[]; readOnly: boolean
  onChange: (patch: Partial<SetlistItem>) => void; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: readOnly })
  const [note, setNote] = useState(item.note ?? '')
  const [key, setKey] = useState(item.key_override ?? '')
  const [showNote, setShowNote] = useState(!!item.note && item.kind === 'song')
  useEffect(() => { setNote(item.note ?? ''); setKey(item.key_override ?? '') }, [item.note, item.key_override])
  const s = item.song
  const isSong = item.kind === 'song'
  const defKey = s?.church_key || s?.original_key || ''
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('rounded-xl border border-border bg-surface p-2.5', isDragging && 'z-10 opacity-80 shadow-card ring-2 ring-accent')}>
      <div className="flex items-center gap-2.5">
        {!readOnly && (
          <button {...attributes} {...listeners} aria-label="Arrastar para reordenar" style={{ touchAction: 'none' }}
            className="cursor-grab rounded-md p-1.5 text-muted hover:bg-surface2 active:cursor-grabbing"><GripVertical className="h-5 w-5" /></button>)}
        {isSong ? <Cover url={s?.cover_url} size={48} /> : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info">{item.kind === 'prayer' ? <HandHeart className="h-5 w-5" /> : item.kind === 'transition' ? <Shuffle className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}</span>)}
        <div className="min-w-0 flex-1">
          {isSong ? (<>
            <p className="truncate text-sm font-bold">{s?.title}</p>
            <p className="truncate text-xs text-muted">{[s?.artist, item.duration_override_seconds ? fmtDuration(item.duration_override_seconds) : s?.duration_seconds ? fmtDuration(s.duration_seconds) : null].filter(Boolean).join(' · ')}</p>
          </>) : (<>
            <p className="text-xs font-bold uppercase tracking-wide text-info">{KIND_LABEL[item.kind]}</p>
            {readOnly ? <p className="text-sm">{item.note}</p> : (
              <input className="field !py-1.5" value={note} placeholder="Descreva (ex.: oração de entrega, transição em Dó)" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (item.note ?? '') && onChange({ note: note || null })} />)}
          </>)}
        </div>
        {isSong && (
          <div className="flex items-center gap-1.5">
            {readOnly ? (key || defKey) && <Badge tone="accent">{key || defKey}</Badge> : (
              <div className="w-[4.5rem]"><KeyInput value={key} placeholder={defKey || 'Tom'} className="!px-2 !py-1.5 text-center font-bold"
                onChange={(v) => setKey(v)} /></div>)}
          </div>)}
        {!readOnly && <IconButton label="Remover do repertório" onClick={onRemove}><Trash2 className="h-4 w-4" /></IconButton>}
      </div>
      {!readOnly && isSong && key !== (item.key_override ?? '') && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs"><span className="text-muted">Tom neste culto (não altera o cadastro da música)</span>
          <Button className="!px-3 !py-1" variant="primary" onClick={() => onChange({ key_override: key.trim() || null })}>Aplicar</Button></div>)}
      {isSong && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-0 sm:pl-12">
          {readOnly ? (item.category_id && <Badge>{cats.find((c) => c.id === item.category_id)?.name}</Badge>) : (
            <Select className="!w-auto !py-1.5 !text-xs" value={item.category_id ?? ''} onChange={(e) => onChange({ category_id: e.target.value || null })}>
              <option value="">Sem etapa</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>)}
          {s?.youtube_url && <a href={s.youtube_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accenttext"><Youtube className="h-3.5 w-3.5" />YouTube</a>}
          {s?.spotify_url && <a href={s.spotify_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accenttext"><Music2 className="h-3.5 w-3.5" />Spotify</a>}
          {!readOnly && !showNote && <button className="text-xs font-semibold text-muted hover:text-fg" onClick={() => setShowNote(true)}>+ observação</button>}
        </div>)}
      {isSong && (showNote || (readOnly && item.note)) && (
        <div className="mt-2 sm:pl-12">
          {readOnly ? <p className="rounded-lg bg-surface2 px-3 py-2 text-xs">{item.note}</p> : (
            <input className="field !py-1.5 text-xs" value={note} placeholder="Observação entre as músicas (ex.: ficar no pad; repetir refrão)" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (item.note ?? '') && onChange({ note: note || null })} />)}
        </div>)}
    </div>
  )
}

export function SetlistEditor({ setlist, readOnly = false, eventType, onRenamed }: { setlist: Setlist; readOnly?: boolean; eventType?: EventType; onRenamed?: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { church } = useAuth()
  const cats = useCategories()
  const [picker, setPicker] = useState(false)
  const [auto, setAuto] = useState(false)
  const [player, setPlayer] = useState(false)
  const [playlist, setPlaylist] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [favOpen, setFavOpen] = useState(false)
  const [favName, setFavName] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [order, setOrder] = useState<SetlistItem[]>([])

  const key = ['setlist-items', setlist.id]
  const q = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await supabase.from('setlist_items').select('*, song:songs(*)').eq('setlist_id', setlist.id).order('position')) as unknown as SetlistItem[],
  })
  useEffect(() => { if (q.data) setOrder(q.data) }, [q.data])
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['setlist-items-event'] }) }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const resolved = useMemo(() => resolveItems(order, cats.data ?? []), [order, cats.data])
  const tot = totalSeconds(resolved)
  const nextPos = () => (order.reduce((m, i) => Math.max(m, i.position), 0) + 1)

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); refresh() } catch (e) { toast.error(e) }
  }
  const addSong = (s: Song) => run(async () => {
    unwrap(await supabase.from('setlist_items').insert({ setlist_id: setlist.id, position: nextPos(), kind: 'song', song_id: s.id }).select().single())
  }, `"${s.title}" adicionada.`)
  const addSpecial = (kind: ItemKind) => run(async () => {
    unwrap(await supabase.from('setlist_items').insert({ setlist_id: setlist.id, position: nextPos(), kind, note: null }).select().single())
  })
  const update = (id: string, patch: Partial<SetlistItem>) => run(async () => { unwrap(await supabase.from('setlist_items').update(patch).eq('id', id).select().single()) })
  const remove = (id: string) => run(async () => { unwrap(await supabase.from('setlist_items').delete().eq('id', id).select()) })

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = order.findIndex((i) => i.id === active.id), to = order.findIndex((i) => i.id === over.id)
    const next = arrayMove(order, from, to)
    setOrder(next)
    try { unwrap(await supabase.rpc('reorder_setlist_items', { p_setlist: setlist.id, p_ids: next.map((i) => i.id) })); qc.invalidateQueries({ queryKey: ['setlist-items-event'] }) }
    catch (err) { toast.error(err); refresh() }
  }

  const applyAuto = async (items: { song: Song; category_id: string | null }[], mode: 'append' | 'replace') => {
    await run(async () => {
      if (mode === 'replace' && order.length) unwrap(await supabase.from('setlist_items').delete().eq('setlist_id', setlist.id).select())
      const base = mode === 'replace' ? 0 : nextPos() - 1
      const rows = items.map((it, n) => ({ setlist_id: setlist.id, position: base + n + 1, kind: 'song' as const, song_id: it.song.id, category_id: it.category_id }))
      if (rows.length) unwrap(await supabase.from('setlist_items').insert(rows).select())
    }, 'Sugestão aplicada. Revise e ajuste o que precisar.')
  }

  // cópia de outro repertório
  const others = useQuery({
    queryKey: ['setlists-copy', setlist.id], enabled: copyOpen,
    queryFn: async () => unwrap(await supabase.from('setlists').select('id, name, is_template, event:events(title,event_date)').neq('id', setlist.id).order('updated_at', { ascending: false }).limit(50)) as unknown as
      { id: string; name: string; is_template: boolean; event: { title: string; event_date: string } | { title: string; event_date: string }[] | null }[],
  })
  const copyFrom = (srcId: string, replace: boolean) => run(async () => {
    if (replace && order.length) unwrap(await supabase.from('setlist_items').delete().eq('setlist_id', setlist.id).select())
    unwrap(await supabase.rpc('duplicate_setlist', { p_source: srcId, p_target: setlist.id }))
    setCopyOpen(false)
  }, 'Repertório copiado.')
  const saveFav = () => run(async () => {
    const id = unwrap(await supabase.rpc('duplicate_setlist', { p_source: setlist.id, p_name: favName.trim() || setlist.name, p_template: true })) as unknown as string
    unwrap(await supabase.from('setlists').update({ is_favorite: true }).eq('id', id).select())
    qc.invalidateQueries({ queryKey: ['setlists'] }); setFavOpen(false)
  }, 'Repertório salvo nos favoritos.')
  const clearAll = () => run(async () => { unwrap(await supabase.from('setlist_items').delete().eq('setlist_id', setlist.id).select()); setConfirmClear(false) })
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl(setlist)); toast.success('Link copiado. Só integrantes logados e autorizados conseguem abrir.') } catch { toast.info(shareUrl(setlist)) }
  }

  if (q.isLoading) return <div className="flex justify-center py-10"><Spinner /></div>
  const songIds = order.filter((i) => i.song_id).map((i) => i.song_id as string)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!readOnly && (<>
          <Button variant="primary" onClick={() => setPicker(true)}><Plus className="h-4 w-4" />Música</Button>
          <Button onClick={() => addSpecial('prayer')}><HandHeart className="h-4 w-4" />Oração</Button>
          <Button onClick={() => addSpecial('transition')}><Shuffle className="h-4 w-4" />Transição</Button>
          <Button onClick={() => addSpecial('note')}><MessageSquare className="h-4 w-4" />Observação</Button>
          <Button variant="outline" onClick={() => setAuto(true)}><Wand2 className="h-4 w-4" />Montar automaticamente</Button>
        </>)}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!readOnly && <IconButton label="Copiar de outro repertório" onClick={() => setCopyOpen(true)}><Copy className="h-[18px] w-[18px]" /></IconButton>}
          {!readOnly && <IconButton label="Salvar como repertório favorito" onClick={() => { setFavName(setlist.name); setFavOpen(true) }}><Star className="h-[18px] w-[18px]" /></IconButton>}
          <IconButton label="Copiar link de visualização" onClick={copyLink}><Link2 className="h-[18px] w-[18px]" /></IconButton>
          <IconButton label="Exportar PDF" disabled={!order.length} onClick={() => exportSetlistPdf({ church: church?.name ?? '', title: setlist.name, items: resolved })}><FileDown className="h-[18px] w-[18px]" /></IconButton>
          <Button variant="outline" disabled={!order.length} onClick={() => setPlaylist(true)}><ListVideo className="h-4 w-4" />Criar playlist</Button>
          <Button variant="outline" disabled={!order.length} onClick={() => setPlayer(true)}><Play className="h-4 w-4" />Reproduzir</Button>
        </div>
      </div>

      {order.length === 0 ? (
        <EmptyState icon={<ListPlus className="h-6 w-6" />} title="Repertório vazio" text={readOnly ? 'Nenhuma música definida ainda.' : 'Adicione músicas da biblioteca, pesquise uma nova ou deixe o sistema sugerir uma sequência.'}
          action={!readOnly && <Button variant="primary" onClick={() => setPicker(true)}><Plus className="h-4 w-4" />Adicionar música</Button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {order.map((i) => <Row key={i.id} item={i} cats={cats.data ?? []} readOnly={readOnly} onChange={(p) => void update(i.id, p)} onRemove={() => void remove(i.id)} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {order.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface2 px-4 py-2.5 text-sm">
          <span><b>{order.filter((i) => i.kind === 'song').length}</b> músicas · duração total <b>{fmtTotal(tot.total)}</b>{tot.unknown > 0 && <span className="text-muted"> (+{tot.unknown} sem duração)</span>}</span>
          {!readOnly && <button className="text-xs font-semibold text-danger" onClick={() => setConfirmClear(true)}>Limpar repertório</button>}
        </div>)}

      <SongPickerModal open={picker} onClose={() => setPicker(false)} excludeIds={songIds} onPick={(s) => { setPicker(false); void addSong(s) }} />
      <AutoSetlistModal open={auto} onClose={() => setAuto(false)} eventType={eventType} onApply={applyAuto} />
      <PlaylistModal open={playlist} onClose={() => setPlaylist(false)} items={resolved} name={setlist.name} />
      {player && <PlayerView title={setlist.name} items={resolved} onClose={() => setPlayer(false)} />}
      <ConfirmDialog open={confirmClear} danger title="Limpar repertório?" text="Todos os itens serão removidos deste repertório. As músicas continuam na biblioteca." confirmLabel="Limpar" onClose={() => setConfirmClear(false)} onConfirm={() => void clearAll()} />
      <Modal open={favOpen} onClose={() => setFavOpen(false)} size="sm" title="Salvar como favorito" footer={<><Button variant="ghost" onClick={() => setFavOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void saveFav()}>Salvar</Button></>}>
        <Field label="Nome do repertório favorito"><Input value={favName} onChange={(e) => setFavName(e.target.value)} /></Field>
      </Modal>
      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} size="md" title="Copiar de outro repertório">
        {others.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {others.data?.length === 0 && <EmptyState title="Nenhum outro repertório" text="Salve repertórios favoritos ou crie outras escalas para reutilizá-los aqui." />}
        <div className="space-y-1.5">
          {others.data?.map((o) => {
            const ev = Array.isArray(o.event) ? o.event[0] : o.event
            return (
              <div key={o.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{o.name}</p><p className="text-xs text-muted">{ev ? `Culto de ${fmtDate(ev.event_date)}` : o.is_template ? 'Modelo / favorito' : ''}</p></div>
                <Button className="!px-3 !py-1.5 text-xs" onClick={() => void copyFrom(o.id, false)}>Adicionar</Button>
                <Button variant="primary" className="!px-3 !py-1.5 text-xs" onClick={() => void copyFrom(o.id, true)}>Substituir</Button>
              </div>)
          })}
        </div>
      </Modal>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, ExternalLink, Heart, Lightbulb, Music2, Pencil, Plus, Search, Send, Trash2, X, Youtube } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useFavorites, useSongs } from '../lib/queries'
import { useSongUsage } from '../lib/usage'
import { AddSongModal, SongFormModal } from '../components/SongForm'
import { ImportPlaylistModal } from '../components/ImportPlaylistModal'
import { addDays, cn, fmtDate, fmtDuration, normalize, todayStr, safeUrl } from '../lib/utils'
import type { Song } from '../types'
import { Badge, Button, ConfirmDialog, Cover, EmptyState, Fab, Field, IconButton, Input, Modal, PageHeader, PageLoader, Tabs, Textarea } from '../components/ui'

interface Suggestion { id: string; title: string; artist: string | null; link: string | null; note: string | null; status: 'pending' | 'accepted' | 'rejected'; created_at: string; suggested_by: string; who: { full_name: string } | null }

function SongDetail({ song, onClose, onEdit }: { song: Song; onClose: () => void; onEdit: () => void }) {
  const { isLeader } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const usage = useSongUsage('2000-01-01', addDays(todayStr(), 400))
  const uses = (usage.data ?? []).filter((u) => u.song_id === song.id).sort((a, b) => b.date.localeCompare(a.date))
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const act = async () => {
    try {
      if (confirm === 'archive') { unwrap(await supabase.from('songs').update({ archived: !song.archived }).eq('id', song.id).select().single()); toast.success(song.archived ? 'Música reativada.' : 'Música arquivada.') }
      else { unwrap(await supabase.from('songs').delete().eq('id', song.id).select()); toast.success('Música excluída.') }
      qc.invalidateQueries({ queryKey: ['songs'] }); setConfirm(null); onClose()
    } catch (e) { toast.error(e); setConfirm(null) }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={song.title}
      footer={isLeader ? <>
        <Button variant="ghost" onClick={() => setConfirm('delete')} className="mr-auto text-danger"><Trash2 className="h-4 w-4" />Excluir</Button>
        <Button variant="outline" onClick={() => setConfirm('archive')}><Archive className="h-4 w-4" />{song.archived ? 'Reativar' : 'Arquivar'}</Button>
        <Button variant="primary" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</Button></> : undefined}>
      <div className="flex gap-4">
        <Cover url={song.cover_url} size={112} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{[song.artist, song.album].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {song.original_key && <Badge>Tom original {song.original_key}</Badge>}
            {song.church_key && <Badge tone="accent">Tom da igreja {song.church_key}</Badge>}
            {song.bpm && <Badge>{song.bpm} BPM</Badge>}
            {song.duration_seconds && <Badge>{fmtDuration(song.duration_seconds)}</Badge>}
            {song.is_habitual && <Badge tone="ok">Repertório habitual</Badge>}
            {song.archived && <Badge tone="warn">Arquivada</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {song.youtube_url && <a className="btn bg-surface2 hover:bg-border" href={safeUrl(song.youtube_url)} target="_blank" rel="noreferrer"><Youtube className="h-4 w-4" />YouTube<ExternalLink className="h-3 w-3" /></a>}
            {song.spotify_url && <a className="btn bg-surface2 hover:bg-border" href={safeUrl(song.spotify_url)} target="_blank" rel="noreferrer"><Music2 className="h-4 w-4" />Spotify<ExternalLink className="h-3 w-3" /></a>}
          </div>
          {song.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{song.tags.map((t) => <Badge key={t} tone="info">{t}</Badge>)}</div>}
        </div>
      </div>
      {song.notes && <div className="mt-5"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Observações sobre a execução</p><p className="whitespace-pre-wrap text-sm">{song.notes}</p></div>}
      {song.lyrics && <div className="mt-5"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Letra</p><pre className="whitespace-pre-wrap rounded-xl bg-surface2 p-4 font-sans text-sm leading-relaxed">{song.lyrics}</pre></div>}
      <div className="mt-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Histórico de uso ({uses.length})</p>
        {uses.length === 0 ? <p className="text-sm text-muted">Ainda não foi usada em cultos publicados.</p> : (
          <ul className="space-y-1 text-sm">{uses.slice(0, 8).map((u) => <li key={u.event_id + u.date} className="flex justify-between gap-3"><span className="truncate">{u.event_title}</span><span className="shrink-0 text-muted">{fmtDate(u.date)}{u.key ? ` · tom ${u.key}` : ''}</span></li>)}</ul>)}
      </div>
      <ConfirmDialog open={!!confirm} danger={confirm === 'delete'} title={confirm === 'delete' ? 'Excluir música?' : song.archived ? 'Reativar música?' : 'Arquivar música?'}
        text={confirm === 'delete' ? 'A música será removida da biblioteca. Se ela estiver em algum repertório, a exclusão será bloqueada — nesse caso, arquive.' : 'Músicas arquivadas deixam de aparecer nas buscas de repertório, mas o histórico é preservado.'}
        confirmLabel={confirm === 'delete' ? 'Excluir' : 'Confirmar'} onClose={() => setConfirm(null)} onConfirm={() => void act()} />
    </Modal>
  )
}

function Suggestions() {
  const { isLeader, church, session } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', artist: '', link: '', note: '' })
  const [adding, setAdding] = useState<Suggestion | null>(null)
  const q = useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => unwrap(await supabase.from('song_suggestions').select('*, who:profiles!suggested_by(full_name)').order('created_at', { ascending: false }).limit(100)) as unknown as Suggestion[],
  })
  const send = async () => {
    if (!f.title.trim()) return toast.error('Informe o nome da música.')
    try {
      unwrap(await supabase.from('song_suggestions').insert({ church_id: church!.id, suggested_by: session!.user.id, title: f.title.trim(), artist: f.artist.trim() || null, link: f.link.trim() || null, note: f.note.trim() || null }).select().single())
      toast.success('Sugestão enviada ao líder.'); setOpen(false); setF({ title: '', artist: '', link: '', note: '' }); qc.invalidateQueries({ queryKey: ['suggestions'] })
    } catch (e) { toast.error(e) }
  }
  const setStatus = async (id: string, status: Suggestion['status']) => {
    try { unwrap(await supabase.from('song_suggestions').update({ status }).eq('id', id).select().single()); qc.invalidateQueries({ queryKey: ['suggestions'] }) } catch (e) { toast.error(e) }
  }
  return (
    <div>
      <div className="mb-4 flex justify-between gap-3"><p className="text-sm text-muted">{isLeader ? 'Sugestões enviadas pelos ministros para futuros cultos.' : 'Sugira músicas para os próximos cultos. O líder avalia e adiciona à biblioteca.'}</p>
        <Button variant="primary" onClick={() => setOpen(true)}><Lightbulb className="h-4 w-4" />Sugerir música</Button></div>
      {q.isLoading ? <PageLoader /> : (q.data ?? []).length === 0 ? <EmptyState icon={<Lightbulb className="h-6 w-6" />} title="Nenhuma sugestão ainda" /> : (
        <div className="space-y-2">{q.data!.map((s) => (
          <div key={s.id} className="card flex flex-wrap items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1"><p className="font-semibold">{s.title}{s.artist ? <span className="font-normal text-muted"> — {s.artist}</span> : null}</p>
              <p className="text-xs text-muted">{s.who?.full_name ?? 'Alguém'} · {fmtDate(s.created_at)}{s.note ? ` · ${s.note}` : ''}</p>
              {s.link && <a href={safeUrl(s.link)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accenttext">Abrir link</a>}</div>
            <Badge tone={s.status === 'accepted' ? 'ok' : s.status === 'rejected' ? 'danger' : 'warn'}>{s.status === 'accepted' ? 'Aceita' : s.status === 'rejected' ? 'Recusada' : 'Pendente'}</Badge>
            {isLeader && s.status === 'pending' && <div className="flex gap-1.5">
              <Button variant="primary" className="!px-3 !py-1.5 text-xs" onClick={() => setAdding(s)}><Check className="h-3.5 w-3.5" />Cadastrar</Button>
              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => void setStatus(s.id, 'rejected')}><X className="h-3.5 w-3.5" />Recusar</Button></div>}
          </div>))}</div>)}
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Sugerir música" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void send()}><Send className="h-4 w-4" />Enviar</Button></>}>
        <div className="space-y-3"><Field label="Música *"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Artista / ministério"><Input value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} /></Field>
          <Field label="Link (YouTube, Spotify…)"><Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
          <Field label="Por que sugere?"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
      </Modal>
      <AddSongModal open={!!adding} initialQuery={adding ? `${adding.title} ${adding.artist ?? ''}`.trim() : ''} onClose={() => setAdding(null)}
        onAdded={() => { if (adding) void setStatus(adding.id, 'accepted'); setAdding(null) }} />
    </div>
  )
}

export default function Songs() {
  const { isLeader, session } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('aba') === 'sugestoes' ? 'sug' : 'lib') as 'lib' | 'sug'
  const songs = useSongs()
  const favs = useFavorites(session?.user.id)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'fav' | 'habitual' | 'archived'>('all')
  const [tag, setTag] = useState('')
  const [add, setAdd] = useState(false)
  const [imp, setImp] = useState(false)
  const [cov, setCov] = useState(false)
  const [shown, setShown] = useState(60)
  const missingCovers = useMemo(() => (songs.data ?? []).filter((x) => !x.cover_url && /open\.spotify\.com\/track\//.test(x.spotify_url ?? '')), [songs.data])
  const fetchCovers = async () => {
    setCov(true)
    try {
      let done = 0
      for (let i = 0; i < missingCovers.length; i += 40) {
        const part = missingCovers.slice(i, i + 40)
        const { data, error } = await supabase.functions.invoke('playlist-import', { body: { covers: part.map((x) => x.spotify_url) } })
        if (error) throw error
        const map = (data?.covers ?? {}) as Record<string, string>
        for (const sg of part) {
          const c = map[sg.spotify_url as string]
          if (c) { const { error: e2 } = await supabase.from('songs').update({ cover_url: c }).eq('id', sg.id); if (!e2) done++ }
        }
      }
      qc.invalidateQueries({ queryKey: ['songs'] })
      toast.success(`${done} capa(s) atualizada(s).`)
    } catch (e) { toast.error(e) } finally { setCov(false) }
  }
  const [view, setView] = useState<Song | null>(null)
  const [edit, setEdit] = useState<Song | null>(null)

  const tags = useMemo(() => [...new Set((songs.data ?? []).flatMap((s) => s.tags))].sort(), [songs.data])
  const list = useMemo(() => {
    const n = normalize(q)
    return (songs.data ?? []).filter((s) => {
      if (only === 'archived' ? !s.archived : s.archived) return false
      if (only === 'fav' && !favs.data?.has(s.id)) return false
      if (only === 'habitual' && !s.is_habitual) return false
      if (tag && !s.tags.includes(tag)) return false
      return !n || normalize(`${s.title} ${s.artist ?? ''} ${s.album ?? ''} ${s.tags.join(' ')}`).includes(n)
    })
  }, [songs.data, q, only, tag, favs.data])

  const toggleFav = async (s: Song) => {
    try {
      if (favs.data?.has(s.id)) unwrap(await supabase.from('song_favorites').delete().eq('song_id', s.id).eq('user_id', session!.user.id).select())
      else unwrap(await supabase.from('song_favorites').insert({ song_id: s.id, user_id: session!.user.id }).select())
      qc.invalidateQueries({ queryKey: ['favorites'] })
    } catch (e) { toast.error(e) }
  }
  return (
    <div>
      <PageHeader title="Músicas" subtitle="Biblioteca do ministério: letras, tons, links e histórico de uso."
        actions={isLeader && tab === 'lib' && <div className="flex w-full flex-wrap gap-2 [&>.btn]:flex-1 sm:w-auto sm:[&>.btn]:flex-none"><Button variant="outline" onClick={() => setImp(true)}>Importar playlist</Button>{missingCovers.length > 0 && <Button variant="outline" loading={cov} onClick={fetchCovers}>Buscar capas ({missingCovers.length})</Button>}<Button variant="primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Adicionar música</Button></div>} />
      <Tabs value={tab === 'sug' ? 'sug' : 'lib'} onChange={(v) => setSp(v === 'sug' ? { aba: 'sugestoes' } : {})} items={[{ value: 'lib', label: 'Biblioteca', count: (songs.data ?? []).filter((s) => !s.archived).length }, { value: 'sug', label: 'Sugestões' }]} />
      {isLeader && tab !== 'sug' && <Fab label="Adicionar música" onClick={() => setAdd(true)}><Plus className="h-6 w-6" /></Fab>}
      {tab === 'sug' ? <Suggestions /> : (<>
        <div className="sticky top-[57px] z-20 -mx-4 mb-3 space-y-2 bg-bg/90 px-4 pb-2 pt-2 backdrop-blur md:static md:mx-0 md:flex md:flex-wrap md:space-y-0 md:gap-2 md:bg-transparent md:p-0 md:pb-0 md:backdrop-blur-none md:mb-4">
          <div className="relative min-w-[14rem] flex-1"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" /><Input className="!pl-10" placeholder="Buscar por título, artista, álbum ou tag" value={q} onChange={(e) => { setQ(e.target.value); setShown(60) }} /></div>
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
            {([['all', 'Todas'], ['fav', 'Favoritas'], ['habitual', 'Habituais'], ...(isLeader ? [['archived', 'Arquivadas']] : [])] as [typeof only, string][]).map(([v, l]) => (
              <button key={v} onClick={() => { setOnly(v); setShown(60) }} className={cn('shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold', only === v ? 'border-accent bg-accent/15 text-accenttext' : 'border-border text-muted hover:text-fg')}>{l}</button>))}
          </div>
        </div>
        {tags.length > 0 && <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">{tags.map((t) => <button key={t} onClick={() => { setTag(tag === t ? '' : t); setShown(60) }} className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold', tag === t ? 'bg-accent text-accentfg' : 'bg-surface2 text-muted hover:text-fg')}>{t}</button>)}</div>}
        {songs.isLoading ? <PageLoader /> : list.length === 0 ? (
          <EmptyState icon={<Music2 className="h-6 w-6" />} title={(songs.data?.length ?? 0) === 0 ? 'Sua biblioteca está vazia' : 'Nenhuma música encontrada'}
            text={(songs.data?.length ?? 0) === 0 ? (isLeader ? 'Pesquise o nome de uma música para trazer capa, artista e link automaticamente — ou cadastre manualmente.' : 'O líder ainda não cadastrou músicas. Você pode enviar sugestões na aba ao lado.') : 'Ajuste a busca ou os filtros.'}
            action={isLeader && (songs.data?.length ?? 0) === 0 && <Button variant="primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Adicionar a primeira música</Button>} />
        ) : (
          <><div className="stagger grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
            {list.slice(0, shown).map((s) => (
              <div key={s.id} className="card flex min-w-0 items-center gap-3 p-2.5 transition hover:border-accent/60 sm:p-3">
                <button onClick={() => setView(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Cover url={s.cover_url} size={56} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold">{s.title}</span><span className="block truncate text-xs text-muted">{s.artist ?? 'Artista não informado'}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">{(s.church_key || s.original_key) && <Badge tone="accent">{s.church_key || s.original_key}</Badge>}
                      {s.duration_seconds ? <span className="text-xs text-muted">{fmtDuration(s.duration_seconds)}</span> : null}{s.is_habitual && <Badge tone="ok">Habitual</Badge>}</span></span>
                </button>
                <IconButton label={favs.data?.has(s.id) ? 'Remover dos favoritos' : 'Favoritar'} onClick={() => void toggleFav(s)}><Heart className={cn('h-5 w-5', favs.data?.has(s.id) && 'fill-accent text-accent')} /></IconButton>
              </div>))}
          </div>
          {list.length > shown && <div className="mt-4 flex flex-col items-center gap-1"><Button variant="outline" onClick={() => setShown((n) => n + 60)}>Mostrar mais</Button><span className="text-xs text-muted">Mostrando {shown} de {list.length}</span></div>}
          </>)}
      </>)}
      <AddSongModal open={add} onClose={() => setAdd(false)} onAdded={() => setAdd(false)} />
      <ImportPlaylistModal open={imp} onClose={() => setImp(false)} />
      {view && !edit && <SongDetail song={view} onClose={() => setView(null)} onEdit={() => setEdit(view)} />}
      <SongFormModal open={!!edit} song={edit} onClose={() => { setEdit(null); setView(null) }} />
    </div>
  )
}

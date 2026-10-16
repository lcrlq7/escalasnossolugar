import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Search, Youtube, Music2, Check } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useSongs } from '../lib/queries'
import { searchMusic, mergeResults } from '../lib/music'
import { cn, fmtDuration, isUrl, normalize, parseDuration, spotifySearchUrl, youtubeSearchUrl } from '../lib/utils'
import type { ExternalResult, Song } from '../types'
import { Badge, Button, Cover, EmptyState, Field, Input, KeyInput, Modal, Spinner, Textarea, Toggle, useDebounced } from './ui'

interface Initial {
  title?: string; artist?: string; album?: string; cover_url?: string; duration_seconds?: number | null
  youtube_url?: string; spotify_url?: string; source?: string
}

/** Formulário de revisão/edição de música. */
export function SongFormModal({ open, song, initial, onClose, onSaved }:
  { open: boolean; song?: Song | null; initial?: Initial; onClose: () => void; onSaved?: (s: Song) => void }) {
  const { church, isLeader } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [f, setF] = useState({
    title: '', artist: '', album: '', cover_url: '', original_key: '', church_key: '', bpm: '', duration: '',
    youtube_url: '', spotify_url: '', tags: '', lyrics: '', notes: '', is_habitual: false,
  })
  const [source, setSource] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [similar, setSimilar] = useState<Song[]>([])

  useEffect(() => {
    if (!open) return
    const s = song
    setF({
      title: s?.title ?? initial?.title ?? '', artist: s?.artist ?? initial?.artist ?? '',
      album: s?.album ?? initial?.album ?? '', cover_url: s?.cover_url ?? initial?.cover_url ?? '',
      original_key: s?.original_key ?? '', church_key: s?.church_key ?? '', bpm: s?.bpm ? String(s.bpm) : '',
      duration: fmtDuration(s?.duration_seconds ?? initial?.duration_seconds ?? null),
      youtube_url: s?.youtube_url ?? initial?.youtube_url ?? '', spotify_url: s?.spotify_url ?? initial?.spotify_url ?? '',
      tags: (s?.tags ?? []).join(', '), lyrics: s?.lyrics ?? '', notes: s?.notes ?? '', is_habitual: s?.is_habitual ?? false,
    })
    setSource(s?.source ?? initial?.source ?? 'manual')
    setSimilar([])
  }, [open, song, initial])

  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const dTitle = useDebounced(f.title, 400)
  const dArtist = useDebounced(f.artist, 400)

  // Evita duplicatas: procura músicas parecidas já cadastradas
  useEffect(() => {
    if (!open || song || dTitle.trim().length < 3) { setSimilar([]); return }
    let alive = true
    supabase.rpc('find_similar_songs', { p_title: dTitle.trim(), p_artist: dArtist.trim() || null }).then(({ data }) => {
      if (alive) setSimilar((data ?? []) as Song[])
    })
    return () => { alive = false }
  }, [dTitle, dArtist, open, song])

  const save = async () => {
    if (!church) return
    if (!f.title.trim()) return toast.error('Informe o título da música.')
    for (const k of ['youtube_url', 'spotify_url', 'cover_url'] as const) {
      if (f[k].trim() && !isUrl(f[k].trim())) return toast.error('Os links precisam começar com http:// ou https://')
    }
    const bpm = f.bpm.trim() ? Number(f.bpm) : null
    if (bpm !== null && (Number.isNaN(bpm) || bpm < 20 || bpm > 300)) return toast.error('BPM deve estar entre 20 e 300.')
    const dur = f.duration.trim() ? parseDuration(f.duration) : null
    if (f.duration.trim() && (dur === null || dur <= 0)) return toast.error('Duração inválida. Use o formato 4:35.')
    const payload = {
      title: f.title.trim(), artist: f.artist.trim() || null, album: f.album.trim() || null,
      cover_url: f.cover_url.trim() || null, original_key: f.original_key.trim() || null,
      church_key: f.church_key.trim() || null, bpm, duration_seconds: dur,
      youtube_url: f.youtube_url.trim() || null, spotify_url: f.spotify_url.trim() || null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), lyrics: f.lyrics.trim() || null,
      notes: f.notes.trim() || null, is_habitual: f.is_habitual,
    }
    setSaving(true)
    try {
      const res = song
        ? await supabase.from('songs').update(payload).eq('id', song.id).select().single()
        : await supabase.from('songs').insert({ ...payload, church_id: church.id, source }).select().single()
      const saved = unwrap(res) as Song
      toast.success(song ? 'Música atualizada.' : 'Música adicionada à biblioteca.')
      qc.invalidateQueries({ queryKey: ['songs'] })
      onSaved?.(saved); onClose()
    } catch (e) { toast.error(e) } finally { setSaving(false) }
  }

  const q = `${f.title} ${f.artist}`.trim()
  return (
    <Modal open={open} onClose={onClose} size="lg" title={song ? 'Editar música' : 'Revisar e cadastrar música'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button>
        {isLeader && <Button variant="primary" loading={saving} onClick={save}>{song ? 'Salvar alterações' : 'Adicionar à biblioteca'}</Button>}</>}>
      <div className="space-y-4">
        {similar.length > 0 && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-4 w-4" />Parece que esta música já está cadastrada</p>
            <ul className="mt-2 space-y-1">
              {similar.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{s.title}{s.artist ? ` — ${s.artist}` : ''}</span>
                  <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => { onSaved?.(s); onClose() }}>Usar cadastro existente</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-start gap-4">
          <Cover url={f.cover_url} size={88} />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Título *"><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Artista / ministério"><Input value={f.artist} onChange={(e) => set('artist', e.target.value)} /></Field>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Álbum"><Input value={f.album} onChange={(e) => set('album', e.target.value)} /></Field>
          <Field label="Link da capa (imagem)"><Input value={f.cover_url} onChange={(e) => set('cover_url', e.target.value)} placeholder="https://…" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Tom original"><KeyInput value={f.original_key} onChange={(v) => set('original_key', v)} /></Field>
          <Field label="Tom da igreja"><KeyInput value={f.church_key} onChange={(v) => set('church_key', v)} /></Field>
          <Field label="BPM"><Input inputMode="numeric" value={f.bpm} onChange={(e) => set('bpm', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Duração" hint="Ex.: 4:35"><Input value={f.duration} onChange={(e) => set('duration', e.target.value)} placeholder="4:35" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Link do YouTube"><Input value={f.youtube_url} onChange={(e) => set('youtube_url', e.target.value)} placeholder="https://youtube.com/watch?v=…" /></Field>
          <Field label="Link do Spotify"><Input value={f.spotify_url} onChange={(e) => set('spotify_url', e.target.value)} placeholder="https://open.spotify.com/track/…" /></Field>
        </div>
        {q && (
          <div className="flex flex-wrap gap-2 text-xs">
            <a className="inline-flex items-center gap-1 text-accenttext" href={youtubeSearchUrl(q)} target="_blank" rel="noreferrer"><Youtube className="h-3.5 w-3.5" />Procurar no YouTube<ExternalLink className="h-3 w-3" /></a>
            <a className="inline-flex items-center gap-1 text-accenttext" href={spotifySearchUrl(q)} target="_blank" rel="noreferrer"><Music2 className="h-3.5 w-3.5" />Procurar no Spotify<ExternalLink className="h-3 w-3" /></a>
          </div>
        )}
        <Field label="Tags e categorias" hint="Separe por vírgula. Ex.: adoração, cura, celebração"><Input value={f.tags} onChange={(e) => set('tags', e.target.value)} /></Field>
        <Field label="Observações sobre a execução"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: começar só com teclado; repetir o refrão 2x" /></Field>
        <Field label="Letra" hint="Insira apenas letras que você tem autorização para usar."><Textarea className="min-h-[140px]" value={f.lyrics} onChange={(e) => set('lyrics', e.target.value)} /></Field>
        <Toggle checked={f.is_habitual} onChange={(v) => set('is_habitual', v)} label="Faz parte do repertório habitual da igreja" />
      </div>
    </Modal>
  )
}

/** Fluxo "Adicionar música": pesquisa externa/local → revisão → cadastro. */
export function AddSongModal({ open, onClose, onAdded, initialQuery = '' }:
  { open: boolean; onClose: () => void; onAdded?: (s: Song) => void; initialQuery?: string }) {
  const toast = useToast()
  const songs = useSongs()
  const [q, setQ] = useState(initialQuery)
  const [busy, setBusy] = useState(false)
  const [gospel, setGospel] = useState(true)
  const [results, setResults] = useState<ExternalResult[] | null>(null)
  const [sources, setSources] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<string[]>([])
  const [form, setForm] = useState<Initial | null>(null)

  useEffect(() => { if (open) { setQ(initialQuery); setResults(null); setSel([]); setForm(null) } }, [open, initialQuery])

  const local = useMemo(() => {
    const n = normalize(q)
    if (n.length < 2) return []
    return (songs.data ?? []).filter((s) => normalize(`${s.title} ${s.artist ?? ''}`).includes(n)).slice(0, 5)
  }, [q, songs.data])

  const run = async () => {
    if (q.trim().length < 2) return
    setBusy(true); setSel([])
    try { const r = await searchMusic(q.trim(), gospel); setResults(r.results); setSources(r.sources) }
    catch (e) { toast.error(e); setResults([]) } finally { setBusy(false) }
  }
  const chosen = (results ?? []).filter((r) => sel.includes(r.external_ref))
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  if (form) {
    return <SongFormModal open={open} initial={form} onClose={() => setForm(null)}
      onSaved={(s) => { onAdded?.(s); setForm(null); onClose() }} />
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Adicionar música"
      footer={<>
        <Button variant="ghost" onClick={() => setForm({ title: q })}>Cadastrar manualmente</Button>
        <Button variant="primary" disabled={chosen.length === 0} onClick={() => setForm(mergeResults(chosen))}>
          Continuar com {chosen.length || ''} selecionado{chosen.length === 1 ? '' : 's'}
        </Button></>}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run() }}>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome da música, artista ou link do YouTube" />
        <Button variant="primary" type="submit" loading={busy}><Search className="h-4 w-4" />Pesquisar</Button>
      </form>

      <div className="mt-3"><Toggle checked={gospel} onChange={setGospel} label="Somente música cristã / gospel (oculta músicas seculares)" /></div>

      {local.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Já cadastradas na biblioteca</p>
          {local.map((s) => (
            <button key={s.id} onClick={() => { onAdded?.(s); onClose() }} className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-border p-2.5 text-left hover:bg-surface2">
              <Cover url={s.cover_url} size={40} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{s.title}</p><p className="truncate text-xs text-muted">{s.artist}</p></div>
              <Badge tone="ok">Usar esta</Badge>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {busy && <div className="flex justify-center py-8"><Spinner /></div>}
        {!busy && results && results.length === 0 && (
          <EmptyState title="Nenhum resultado encontrado" text="Tente outro termo, cole o link do YouTube ou cadastre a música manualmente. O filtro de música cristã pode ocultar resultados sem gênero identificado. Capas, tons e links não são inventados: o que não for encontrado fica em branco." />
        )}
        {!busy && results && results.length > 0 && (
          <>
            <p className="mb-2 text-xs text-muted">Selecione um ou mais resultados para combinar (ex.: capa do catálogo + vídeo do YouTube) e revise antes de salvar.</p>
            <div className="space-y-1.5">
              {results.map((r) => {
                const on = sel.includes(r.external_ref)
                return (
                  <button key={r.external_ref} onClick={() => toggle(r.external_ref)}
                    className={cn('flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition', on ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface2')}>
                    <Cover url={r.cover_url} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.title}</p>
                      <p className="truncate text-xs text-muted">{[r.artist, r.album, r.duration_seconds ? fmtDuration(r.duration_seconds) : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Badge tone={r.source === 'youtube' ? 'danger' : r.source === 'spotify' ? 'ok' : 'info'}>{r.source === 'itunes' ? 'Catálogo' : r.source === 'youtube' ? 'YouTube' : r.source === 'spotify' ? 'Spotify' : 'Link'}</Badge>
                    {on && <Check className="h-4 w-4 text-accenttext" />}
                  </button>
                )
              })}
            </div>
          </>
        )}
        {results && Object.entries(sources).some(([, v]) => v !== 'ok') && (
          <p className="mt-3 text-xs text-muted">
            Fontes: {Object.entries(sources).map(([k, v]) => `${k === 'itunes' ? 'Catálogo' : k === 'youtube' ? 'YouTube' : 'Spotify'}: ${v === 'ok' ? 'ok' : v}`).join(' · ')}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Seletor de músicas da biblioteca (para repertórios). */
export function SongPickerModal({ open, onClose, onPick, excludeIds = [] }:
  { open: boolean; onClose: () => void; onPick: (s: Song) => void; excludeIds?: string[] }) {
  const songs = useSongs()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  useEffect(() => { if (open) setQ('') }, [open])
  const list = useMemo(() => {
    const n = normalize(q)
    return (songs.data ?? []).filter((s) => !s.archived && (!n || normalize(`${s.title} ${s.artist ?? ''} ${s.tags.join(' ')}`).includes(n))).slice(0, 80)
  }, [songs.data, q])
  return (
    <>
      <Modal open={open && !adding} onClose={onClose} size="lg" title="Adicionar música ao repertório"
        footer={<Button variant="outline" onClick={() => setAdding(true)}>Música nova (pesquisar / cadastrar)</Button>}>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na biblioteca por título, artista ou tag" />
        <div className="mt-3 space-y-1.5">
          {songs.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
          {!songs.isLoading && list.length === 0 && <EmptyState title="Nenhuma música encontrada" text="Cadastre uma música nova para incluí-la no repertório." />}
          {list.map((s) => {
            const used = excludeIds.includes(s.id)
            return (
              <button key={s.id} onClick={() => onPick(s)} className="flex w-full items-center gap-3 rounded-xl border border-border p-2.5 text-left hover:bg-surface2">
                <Cover url={s.cover_url} size={44} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{s.title}</p><p className="truncate text-xs text-muted">{s.artist}</p></div>
                {(s.church_key || s.original_key) && <Badge tone="accent">{s.church_key || s.original_key}</Badge>}
                {s.duration_seconds ? <span className="text-xs text-muted">{fmtDuration(s.duration_seconds)}</span> : null}
                {used && <Badge>No repertório</Badge>}
              </button>
            )
          })}
        </div>
      </Modal>
      <AddSongModal open={adding} onClose={() => setAdding(false)} initialQuery={q} onAdded={(s) => { setAdding(false); onPick(s) }} />
    </>
  )
}

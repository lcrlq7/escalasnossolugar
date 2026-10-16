import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, ListVideo, Music2, Youtube } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useToast } from '../context/Toast'
import type { ResolvedItem } from '../lib/setlist'
import { isUrl, safeUrl, spotifySearchUrl, youtubeSearchUrl } from '../lib/utils'
import { Button, Input, Modal, Spinner } from './ui'
import { useAuth } from '../context/Auth'

const ytId = (u: string | null | undefined): string | null => {
  const m = (u ?? '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}

/**
 * Gera uma playlist a partir do repertório, sem precisar de login/chaves:
 * - YouTube: link "watch_videos" abre uma playlist temporária com todos os vídeos (dá para salvá-la na conta).
 * - Spotify: lista de links das faixas / busca de cada música (o Spotify não permite criar playlist por link).
 */
interface Cand { id: string; title: string; artist: string; album: string | null; url: string | null }
interface Found { song_id: string; known_id: string | null; candidates: Cand[]; error: string | null }

export function PlaylistModal({ open, onClose, items, name }: { open: boolean; onClose: () => void; items: ResolvedItem[]; name?: string }) {
  const { isLeader } = useAuth()
  const toast = useToast()
  const [sp, setSp] = useState<{ configured: boolean; connected: boolean } | null>(null)
  const [found, setFound] = useState<Found[] | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [sbusy, setSbusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const callSp = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('spotify', { body })
    if (error) {
      let msg = 'Não foi possível falar com o servidor do Spotify.'
      try { const j = await (error as unknown as { context: Response }).context.json(); if (j?.error) msg = j.error } catch { /* ignore */ }
      throw new Error(msg)
    }
    return data as Record<string, any>
  }
  useEffect(() => {
    if (!open) return
    setFound(null); setCreated(null)
    callSp({ action: 'status' }).then((d) => setSp({ configured: d.configured !== false, connected: !!d.connected })).catch(() => setSp({ configured: false, connected: false }))
  }, [open]) // eslint-disable-line
  const connect = async () => {
    setSbusy(true)
    try { const d = await callSp({ action: 'connect', returnTo: window.location.pathname }); if (d.url) window.location.href = d.url } catch (e) { toast.error(e); setSbusy(false) }
  }
  const searchSp = async () => {
    setSbusy(true)
    try {
      const d = await callSp({ action: 'search', songs: songs.map((i) => ({ id: i.song!.id, title: i.song!.title, artist: i.song!.artist, spotify_url: i.song!.spotify_url })) })
      const res = d.results as Found[]
      setFound(res)
      const p: Record<string, string> = {}
      for (const r of res) { const id = r.known_id ?? r.candidates[0]?.id; if (id) p[r.song_id] = id }
      setPick(p)
    } catch (e) { toast.error(e) } finally { setSbusy(false) }
  }
  const createSp = async () => {
    const trackIds = songs.map((i) => pick[i.song!.id]).filter(Boolean)
    if (!trackIds.length) return toast.error('Nenhuma faixa selecionada.')
    setSbusy(true)
    try {
      const d = await callSp({ action: 'create', name: name ?? 'Louvor em Escala', trackIds })
      setCreated(d.url ?? '#')
      // guarda o link do Spotify nas músicas que ainda não tinham
      for (const r of found ?? []) {
        const c = r.candidates.find((x) => x.id === pick[r.song_id])
        const song = songs.find((i) => i.song!.id === r.song_id)?.song
        if (c?.url && song && !song.spotify_url) await supabase.from('songs').update({ spotify_url: c.url }).eq('id', song.id)
      }
      qc.invalidateQueries({ queryKey: ['songs'] })
      toast.success('Playlist criada no Spotify.')
    } catch (e) { toast.error(e) } finally { setSbusy(false) }
  }
  const qc = useQueryClient()
  const songs = items.filter((i) => i.kind === 'song' && i.song)
  const [paste, setPaste] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const withYt = songs.filter((i) => ytId(i.song!.youtube_url))
  const ids = withYt.map((i) => ytId(i.song!.youtube_url)!).slice(0, 50)
  const ytUrl = ids.length ? `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}` : null

  const saveLink = async (songId: string, field: 'youtube_url' | 'spotify_url') => {
    const v = (paste[songId + field] ?? '').trim()
    if (!isUrl(v)) return toast.error('Cole um link válido (começando com https://).')
    if (field === 'youtube_url' && !ytId(v)) return toast.error('Link do YouTube não reconhecido. Use o link do vídeo (youtube.com/watch?v=… ou youtu.be/…).')
    setBusy(songId + field)
    try {
      unwrap(await supabase.from('songs').update({ [field]: v }).eq('id', songId).select().single())
      qc.invalidateQueries({ queryKey: ['songs'] }); qc.invalidateQueries({ queryKey: ['setlist-items-event'] }); qc.invalidateQueries({ queryKey: ['setlist-items'] })
      toast.success('Link salvo na música.')
    } catch (e) { toast.error(e) } finally { setBusy(null) }
  }
  const copySpotify = async () => {
    const lines = songs.map((i) => i.song!.spotify_url || spotifySearchUrl(`${i.song!.title} ${i.song!.artist ?? ''}`.trim()))
    try { await navigator.clipboard.writeText(lines.join('\n')); toast.success('Links copiados. No Spotify, selecione as faixas e arraste/cole para sua playlist.') } catch { toast.info(lines.join('\n')) }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Criar playlist deste repertório"
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      {songs.length === 0 ? <p className="text-sm text-muted">Adicione músicas ao repertório primeiro.</p> : (
        <div className="space-y-5">
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 font-bold"><Youtube className="h-5 w-5 text-danger" />YouTube</p>
            <p className="mt-1 text-sm text-muted">{ids.length} de {songs.length} músicas têm vídeo cadastrado. O link abre a playlist no YouTube; clique em “Salvar playlist” lá para guardá-la na sua conta.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={ytUrl ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!ytUrl}>
                <Button variant="primary" disabled={!ytUrl}><ListVideo className="h-4 w-4" />Abrir playlist no YouTube</Button>
              </a>
              {ytUrl && <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(ytUrl); toast.success('Link da playlist copiado.') }}>Copiar link</Button>}
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 font-bold"><Music2 className="h-5 w-5 text-ok" />Spotify</p>
            {!isLeader ? <p className="mt-1 text-sm text-muted">Apenas líderes e administradores criam playlists no Spotify.</p>
              : !sp ? <div className="mt-3"><Spinner /></div>
              : !sp.configured ? <p className="mt-1 text-sm text-warn">A integração com o Spotify ainda não foi configurada no servidor (falta o Client Secret). Enquanto isso, use “Copiar links das músicas”.</p>
              : !sp.connected ? (<>
                <p className="mt-1 text-sm text-muted">Conecte sua conta do Spotify uma vez para criar playlists automaticamente.</p>
                <Button className="mt-3" variant="primary" loading={sbusy} onClick={connect}>Conectar Spotify</Button></>)
              : created ? (<>
                <p className="mt-1 text-sm text-ok">Playlist criada!</p>
                <a href={safeUrl(created)} target="_blank" rel="noreferrer"><Button className="mt-3" variant="primary"><ExternalLink className="h-4 w-4" />Abrir no Spotify</Button></a></>)
              : !found ? (<>
                <p className="mt-1 text-sm text-muted">Conta conectada. Vamos procurar cada música no Spotify e você confirma antes de criar.</p>
                <Button className="mt-3" variant="primary" loading={sbusy} onClick={searchSp}>Procurar músicas no Spotify</Button></>)
              : (<div className="mt-3 space-y-3">
                {songs.map((i) => {
                  const r = found.find((f) => f.song_id === i.song!.id)
                  return (
                    <div key={i.id} className="rounded-lg border border-border p-2.5">
                      <p className="text-sm font-semibold">{i.song!.title}<span className="font-normal text-muted"> — {i.song!.artist}</span></p>
                      {r?.error && <p className="text-xs text-danger">{r.error}</p>}
                      {!r?.candidates.length && !r?.known_id && <p className="text-xs text-warn">Nenhum resultado. Esta música ficará de fora.</p>}
                      <div className="mt-1.5 space-y-1">
                        {(r?.candidates ?? []).map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="radio" name={'sp' + i.id} checked={pick[i.song!.id] === c.id} onChange={() => setPick({ ...pick, [i.song!.id]: c.id })} />
                            <span className="min-w-0 flex-1 truncate">{c.title} <span className="text-muted">— {c.artist}{c.album ? ` · ${c.album}` : ''}</span></span>
                          </label>))}
                        {r && r.candidates.length > 0 && (
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                            <input type="radio" name={'sp' + i.id} checked={!pick[i.song!.id]} onChange={() => { const p = { ...pick }; delete p[i.song!.id]; setPick(p) }} />Não incluir
                          </label>)}
                      </div>
                    </div>)
                })}
                <Button variant="primary" loading={sbusy} onClick={createSp}>Criar playlist no Spotify</Button>
              </div>)}
            <Button className="mt-3" variant="outline" onClick={copySpotify}>Copiar links das músicas</Button>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Músicas do repertório</p>
            <div className="space-y-2">
              {songs.map((i) => {
                const s = i.song!
                const hasYt = !!ytId(s.youtube_url)
                return (
                  <div key={i.id} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.title}<span className="font-normal text-muted"> — {s.artist}</span></span>
                      {hasYt ? <span className="flex items-center gap-1 text-xs text-ok"><Check className="h-3.5 w-3.5" />vídeo</span>
                        : <a className="inline-flex items-center gap-1 text-xs text-accenttext" href={youtubeSearchUrl(`${s.title} ${s.artist ?? ''}`)} target="_blank" rel="noreferrer">Procurar no YouTube<ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    {!hasYt && (
                      <div className="mt-2 flex gap-2">
                        <Input placeholder="Cole aqui o link do vídeo do YouTube" value={paste[s.id + 'youtube_url'] ?? ''} onChange={(e) => setPaste({ ...paste, [s.id + 'youtube_url']: e.target.value })} />
                        <Button variant="outline" loading={busy === s.id + 'youtube_url'} onClick={() => saveLink(s.id, 'youtube_url')}>Salvar</Button>
                      </div>)}
                  </div>)
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, ListVideo, Music2, Youtube } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useToast } from '../context/Toast'
import type { ResolvedItem } from '../lib/setlist'
import { isUrl, spotifySearchUrl, youtubeSearchUrl } from '../lib/utils'
import { Button, Input, Modal } from './ui'

const ytId = (u: string | null | undefined): string | null => {
  const m = (u ?? '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}

/**
 * Gera uma playlist a partir do repertório, sem precisar de login/chaves:
 * - YouTube: link "watch_videos" abre uma playlist temporária com todos os vídeos (dá para salvá-la na conta).
 * - Spotify: lista de links das faixas / busca de cada música (o Spotify não permite criar playlist por link).
 */
export function PlaylistModal({ open, onClose, items }: { open: boolean; onClose: () => void; items: ResolvedItem[] }) {
  const toast = useToast()
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
            <p className="mt-1 text-sm text-muted">O Spotify não permite montar uma playlist só por link. Copie a lista de links (ou busca) e adicione à sua playlist. Para criação automática seria preciso conectar uma conta Spotify de desenvolvedor.</p>
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

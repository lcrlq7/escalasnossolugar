import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ListPlus } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useSongs } from '../lib/queries'
import { fmtDuration, normalize } from '../lib/utils'
import { Badge, Button, Cover, Input, Modal } from './ui'

interface Track {
  title: string; artist: string | null; album: string | null; cover_url: string | null; duration_seconds: number | null
  youtube_url: string | null; spotify_url: string | null; source: 'spotify' | 'youtube'; ref: string
}
const key = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '')

/** Importa as músicas de uma playlist (Spotify/YouTube) para a biblioteca, ignorando as que já existem. */
export function ImportPlaylistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { church } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const songs = useSongs()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<{ name?: string; tracks: Track[] } | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const reconnect = async () => {
    setBusy(true)
    try {
      const { data: d, error } = await supabase.functions.invoke('spotify', { body: { action: 'connect', returnTo: window.location.pathname } })
      if (error || !d?.url) throw new Error('Não foi possível iniciar a conexão com o Spotify.')
      window.location.href = d.url as string
    } catch (e) { toast.error(e); setBusy(false) }
  }
  const reset = () => { setUrl(''); setErr(null); setData(null); setSel(new Set()) }
  const close = () => { reset(); onClose() }

  const isDup = (t: Track) => {
    const tk = key(t.title), ak = key(t.artist ?? '')
    return (songs.data ?? []).some((s) => {
      if (key(s.title) !== tk) return false
      const sa = key(s.artist ?? '')
      return !ak || !sa || sa.includes(ak) || ak.includes(sa)
    })
  }

  const read = async () => {
    setBusy(true); setErr(null); setData(null)
    try {
      const { data: d, error } = await supabase.functions.invoke('playlist-import', { body: { url: url.trim() } })
      if (error) {
        let m = 'Não foi possível ler a playlist agora.'
        try { const j = await (error as unknown as { context: Response }).context.json(); if (j?.error) m = j.error } catch { /* ignore */ }
        throw new Error(m)
      }
      if (d?.error) throw new Error(d.error)
      const tracks = (d.tracks ?? []) as Track[]
      // remove repetidas dentro da própria playlist
      const seen = new Set<string>(); const uniq: Track[] = []
      for (const t of tracks) { const k = key(t.title) + '|' + key(t.artist ?? ''); if (seen.has(k)) continue; seen.add(k); uniq.push(t) }
      setData({ name: d.name, tracks: uniq })
      setSel(new Set(uniq.filter((t) => !isDup(t)).map((t) => t.ref)))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao ler a playlist.') } finally { setBusy(false) }
  }

  const fresh = data ? data.tracks.filter((t) => !isDup(t)) : []
  const dups = data ? data.tracks.length - fresh.length : 0
  const chosen = fresh.filter((t) => sel.has(t.ref))

  const importNow = async () => {
    if (!chosen.length || !church) return
    setBusy(true)
    const rows = chosen.map((t) => ({
      church_id: church.id, title: t.title.trim(), artist: t.artist, album: t.album, cover_url: t.cover_url,
      duration_seconds: t.duration_seconds, youtube_url: t.youtube_url, spotify_url: t.spotify_url, source: t.source,
      notes: 'Importada de playlist: confira título, artista, tom e letra.',
    }))
    try {
      let ok = 0, skipped = 0
      try { unwrap(await supabase.from('songs').insert(rows).select('id')); ok = rows.length }
      catch {
        for (const r of rows) { const { error } = await supabase.from('songs').insert(r); if (error) skipped++; else ok++ }
      }
      qc.invalidateQueries({ queryKey: ['songs'] })
      toast.success(`${ok} música(s) importada(s)${skipped ? `; ${skipped} ignorada(s) por já existirem` : ''}.`)
      close()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={close} size="lg" title="Importar playlist para a biblioteca"
      footer={<><Button variant="ghost" onClick={close}>Cancelar</Button>
        {data && <Button variant="primary" loading={busy} disabled={!chosen.length} onClick={importNow}><ListPlus className="h-4 w-4" />Importar {chosen.length} música{chosen.length === 1 ? '' : 's'}</Button>}</>}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void read() }}>
        <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Cole o link da playlist do Spotify ou do YouTube" />
        <Button variant="primary" type="submit" loading={busy && !data} disabled={!url.trim()}>Ler playlist</Button>
      </form>
      <p className="mt-2 text-xs text-muted">Spotify: playlists suas (conta conectada em “Criar playlist”). YouTube: playlists públicas ou não listadas (requer a chave de API configurada).</p>
      {err && (
        <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <p>{err}</p>
          {/403/.test(err) && <Button className="mt-3" variant="outline" loading={busy} onClick={reconnect}>Reconectar Spotify (pedir permissão de leitura)</Button>}
        </div>)}
      {data && (
        <div className="mt-4">
          <p className="mb-2 text-sm"><b>{data.name ?? 'Playlist'}</b> — {data.tracks.length} música(s): <span className="text-ok">{fresh.length} nova(s)</span>{dups ? <>, <span className="text-muted">{dups} já na biblioteca (serão ignoradas)</span></> : null}.</p>
          <div className="mb-2 flex gap-3 text-xs"><button className="font-semibold text-accenttext" onClick={() => setSel(new Set(fresh.map((t) => t.ref)))}>Marcar todas</button><button className="font-semibold text-accenttext" onClick={() => setSel(new Set())}>Desmarcar</button></div>
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {data.tracks.map((t) => {
              const dup = isDup(t)
              return (
                <label key={t.ref} className={`flex items-center gap-3 rounded-xl border border-border p-2 ${dup ? 'opacity-50' : 'cursor-pointer hover:bg-surface2'}`}>
                  <input type="checkbox" disabled={dup} checked={!dup && sel.has(t.ref)} onChange={() => { const n = new Set(sel); if (n.has(t.ref)) n.delete(t.ref); else n.add(t.ref); setSel(n) }} />
                  <Cover url={t.cover_url} size={36} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.title}</p><p className="truncate text-xs text-muted">{t.artist}{t.duration_seconds ? ` · ${fmtDuration(t.duration_seconds)}` : ''}</p></div>
                  {dup ? <Badge><Check className="mr-1 h-3 w-3" />Já existe</Badge> : <Badge tone="ok">Nova</Badge>}
                </label>)
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}

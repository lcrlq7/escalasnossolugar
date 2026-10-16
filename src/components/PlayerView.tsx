import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X, Youtube, Music2 } from 'lucide-react'
import { cn, fmtDuration, fmtTotal } from '../lib/utils'
import { totalSeconds, KIND_LABEL, type ResolvedItem } from '../lib/setlist'
import { Badge, Button, Cover, IconButton } from './ui'

/** Visualização de reprodução / modo palco: música atual, próximas, tom, links e tempo total. */
export function PlayerView({ title, items, onClose }: { title: string; items: ResolvedItem[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0)
  const [lyrics, setLyrics] = useState(false)
  const cur = items[idx]
  const t = totalSeconds(items)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(items.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', h)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [items.length, onClose])

  const elapsed = items.slice(0, idx).reduce((a, i) => a + (i.duration ?? 0), 0)
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Modo reprodução">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0"><p className="truncate text-xs font-bold uppercase tracking-widest text-muted">Repertório</p><p className="truncate font-bold">{title}</p></div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:block">{idx + 1}/{items.length} · {fmtTotal(elapsed)} de ~{fmtTotal(t.total)}</span>
          <IconButton label="Fechar" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
      </div>
      {!cur ? <div className="flex flex-1 items-center justify-center text-muted">Repertório vazio.</div> : (
        <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[1fr_20rem]">
          <div className="flex flex-col items-center overflow-y-auto px-5 py-6 text-center">
            {cur.kind === 'song' && cur.song ? (
              <>
                <Cover url={cur.song.cover_url} size={220} className="!rounded-2xl shadow-card" />
                {cur.category && <Badge tone="accent" className="mt-5">{cur.category}</Badge>}
                <h2 className="stage-text mt-3 font-extrabold">{cur.song.title}</h2>
                <p className="mt-1 text-lg text-muted">{cur.song.artist}</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {cur.key && <span className="rounded-xl bg-accent px-4 py-1.5 text-2xl font-extrabold text-accentfg">{cur.key}</span>}
                  {cur.duration ? <span className="text-sm text-muted">{fmtDuration(cur.duration)}</span> : null}
                  {cur.song.bpm ? <span className="text-sm text-muted">{cur.song.bpm} BPM</span> : null}
                </div>
                {cur.note && <p className="mt-4 max-w-xl rounded-xl bg-surface2 px-4 py-3 text-sm">{cur.note}</p>}
                {cur.song.notes && <p className="mt-2 max-w-xl text-sm text-muted">{cur.song.notes}</p>}
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {cur.song.youtube_url && <a href={cur.song.youtube_url} target="_blank" rel="noreferrer" className="btn bg-surface2 hover:bg-border"><Youtube className="h-4 w-4" />Abrir no YouTube<ExternalLink className="h-3 w-3" /></a>}
                  {cur.song.spotify_url && <a href={cur.song.spotify_url} target="_blank" rel="noreferrer" className="btn bg-surface2 hover:bg-border"><Music2 className="h-4 w-4" />Abrir no Spotify<ExternalLink className="h-3 w-3" /></a>}
                  {cur.song.lyrics && <Button onClick={() => setLyrics((l) => !l)}><FileText className="h-4 w-4" />{lyrics ? 'Ocultar letra' : 'Ver letra'}</Button>}
                </div>
                {lyrics && cur.song.lyrics && <pre className="mt-5 max-w-xl whitespace-pre-wrap text-left font-sans text-lg leading-relaxed">{cur.song.lyrics}</pre>}
                {!cur.song.youtube_url && !cur.song.spotify_url && <p className="mt-4 text-xs text-muted">Sem links cadastrados para esta música.</p>}
              </>
            ) : (
              <div className="my-auto"><Badge tone="info">{KIND_LABEL[cur.kind]}</Badge><h2 className="stage-text mt-4 font-extrabold">{cur.note || KIND_LABEL[cur.kind]}</h2></div>
            )}
          </div>
          <aside className="hidden overflow-y-auto border-l border-border p-3 md:block">
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">Sequência</p>
            {items.map((i, n) => (
              <button key={i.id} onClick={() => setIdx(n)} className={cn('mb-1 flex w-full items-center gap-2.5 rounded-xl p-2 text-left', n === idx ? 'bg-accent/15' : 'hover:bg-surface2', n < idx && 'opacity-50')}>
                <span className="w-5 text-center text-xs font-bold text-muted">{n + 1}</span>
                {i.kind === 'song' ? <Cover url={i.song?.cover_url} size={36} /> : null}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{i.kind === 'song' ? i.song?.title : (i.note || KIND_LABEL[i.kind])}</span>
                  {i.kind === 'song' && <span className="block truncate text-xs text-muted">{i.song?.artist}</span>}</span>
                {i.key && <span className="text-xs font-bold text-accenttext">{i.key}</span>}
              </button>
            ))}
          </aside>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 safe-bottom">
        <Button disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
        <div className="min-w-0 truncate text-center text-xs text-muted md:hidden">{idx + 1}/{items.length}{items[idx + 1] ? ` · Próxima: ${items[idx + 1].song?.title ?? KIND_LABEL[items[idx + 1].kind]}` : ''}</div>
        <Button variant="primary" disabled={idx >= items.length - 1} onClick={() => setIdx((i) => i + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

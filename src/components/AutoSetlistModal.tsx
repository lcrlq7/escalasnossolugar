import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useFavorites, useCategories, useSongs } from '../lib/queries'
import { alternativeFor, buildSetlist, type AutoInput, type AutoOutput } from '../lib/autoSetlist'
import { EVENT_TYPES, KEYS, cn, fmtDate, fmtDuration, fmtTotal, normalize, todayStr } from '../lib/utils'
import type { EventType, Song } from '../types'
import { Badge, Button, Cover, Field, IconButton, Input, Modal, Select } from './ui'

interface Props { open: boolean; onClose: () => void; eventType?: EventType; onApply: (items: { song: Song; category_id: string | null }[], mode: 'append' | 'replace') => Promise<void> }

/** "Montar repertório automaticamente": gera uma SUGESTÃO editável — nunca publica sozinho. */
export function AutoSetlistModal({ open, onClose, eventType, onApply }: Props) {
  const { session } = useAuth()
  const songs = useSongs()
  const cats = useCategories()
  const favs = useFavorites(session?.user.id)
  const [type, setType] = useState<string>(eventType ?? '')
  const [theme, setTheme] = useState('')
  const [count, setCount] = useState('5')
  const [minutes, setMinutes] = useState('')
  const [catIds, setCatIds] = useState<string[]>([])
  const [include, setInclude] = useState<string[]>([])
  const [exclude, setExclude] = useState<string[]>([])
  const [keys, setKeys] = useState<string[]>([])
  const [refs, setRefs] = useState<string[]>([])
  const [out, setOut] = useState<AutoOutput | null>(null)
  const [mode, setMode] = useState<'append' | 'replace'>('replace')
  const [busy, setBusy] = useState(false)
  const [songQ, setSongQ] = useState('')

  useEffect(() => { if (open) { setOut(null); setType(eventType ?? '') } }, [open, eventType])
  useEffect(() => { if (cats.data && catIds.length === 0) setCatIds(cats.data.map((c) => c.id)) }, [cats.data]) // eslint-disable-line

  // histórico de uso (recência) a partir de escalas reais
  const usage = useQuery({
    queryKey: ['song-usage'], enabled: open,
    queryFn: async () => {
      const rows = unwrap(await supabase.from('setlist_items').select('song_id, setlist:setlists!inner(event:events!inner(event_date,status))').not('song_id', 'is', null)) as unknown as
        { song_id: string; setlist: { event: { event_date: string; status: string } | { event_date: string; status: string }[] } }[]
      const last: Record<string, string> = {}
      const today = todayStr()
      for (const r of rows) {
        const ev = Array.isArray(r.setlist.event) ? r.setlist.event[0] : r.setlist.event
        if (!ev || ev.status === 'cancelled' || ev.status === 'draft' || ev.event_date > today) continue
        if (!last[r.song_id] || ev.event_date > last[r.song_id]) last[r.song_id] = ev.event_date
      }
      return last
    },
  })
  const refList = useQuery({
    queryKey: ['ref-setlists'], enabled: open,
    queryFn: async () => unwrap(await supabase.from('setlists').select('id, name, is_template, event:events(title,event_date)').order('updated_at', { ascending: false }).limit(30)) as unknown as
      { id: string; name: string; is_template: boolean; event: { title: string; event_date: string } | { title: string; event_date: string }[] | null }[],
  })

  const orderedCats = useMemo(() => (cats.data ?? []).filter((c) => catIds.includes(c.id)), [cats.data, catIds])

  const buildInput = async (): Promise<AutoInput> => {
    const refSongIds = new Set<string>(); const refCategory: Record<string, string> = {}
    if (refs.length) {
      const rows = unwrap(await supabase.from('setlist_items').select('song_id, category_id').in('setlist_id', refs).not('song_id', 'is', null)) as { song_id: string; category_id: string | null }[]
      for (const r of rows) { refSongIds.add(r.song_id); if (r.category_id) refCategory[r.song_id] = r.category_id }
    }
    const typeLabel = type ? EVENT_TYPES[type as EventType]?.label ?? '' : ''
    return {
      songs: songs.data ?? [], categories: orderedCats, count: Number(count) || 0,
      targetSeconds: minutes ? Number(minutes) * 60 : null, theme: `${theme} ${typeLabel}`.trim(),
      include, exclude, keys, lastUsed: usage.data ?? {}, refSongIds, refCategory, favorites: favs.data,
    }
  }
  const [lastInput, setLastInput] = useState<AutoInput | null>(null)
  const generate = async () => {
    setBusy(true)
    try { const inp = await buildInput(); setLastInput(inp); setOut(buildSetlist(inp)) } finally { setBusy(false) }
  }
  const swap = (i: number) => {
    if (!out || !lastInput) return
    const cur = out.items[i]
    const cat = orderedCats.find((c) => c.id === cur.category_id) ?? null
    const alt = alternativeFor(lastInput, cat, new Set(out.items.map((x) => x.song.id)))
    if (!alt) return
    const items = out.items.map((x, n) => (n === i ? { song: alt, category_id: cur.category_id, reasons: ['Troca sugerida'] } : x))
    setOut({ ...out, items })
  }
  const remove = (i: number) => out && setOut({ ...out, items: out.items.filter((_, n) => n !== i) })
  const apply = async () => {
    if (!out) return
    setBusy(true)
    try { await onApply(out.items.map((x) => ({ song: x.song, category_id: x.category_id })), mode); onClose() } finally { setBusy(false) }
  }
  const total = out ? out.items.reduce((a, i) => a + (i.song.duration_seconds ?? 0), 0) : 0
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
  const filteredSongs = useMemo(() => {
    const n = normalize(songQ)
    return (songs.data ?? []).filter((s) => !s.archived && (!n || normalize(`${s.title} ${s.artist ?? ''}`).includes(n))).slice(0, 40)
  }, [songs.data, songQ])
  const titleOf = (id: string) => songs.data?.find((s) => s.id === id)?.title ?? '—'

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Montar repertório automaticamente"
      footer={out ? (
        <>
          <Select className="!w-auto" value={mode} onChange={(e) => setMode(e.target.value as 'append' | 'replace')}>
            <option value="replace">Substituir repertório atual</option><option value="append">Adicionar ao final</option>
          </Select>
          <Button variant="ghost" onClick={() => setOut(null)}>Voltar aos critérios</Button>
          <Button variant="outline" loading={busy} onClick={generate}><RefreshCw className="h-4 w-4" />Gerar outra sugestão</Button>
          <Button variant="primary" loading={busy} disabled={out.items.length === 0} onClick={apply}>Aplicar sugestão ao repertório</Button>
        </>
      ) : (
        <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={generate}><Sparkles className="h-4 w-4" />Gerar sugestão</Button></>
      )}>
      {!out ? (
        <div className="space-y-5">
          <p className="rounded-xl bg-surface2 p-3 text-sm text-muted">A sugestão usa apenas músicas da sua biblioteca e considera categorias, tema, tom, duração e quando cada música foi tocada pela última vez. Você revisa e edita tudo antes de aplicar — nada é publicado automaticamente.</p>
          {(songs.data?.length ?? 0) === 0 && <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Sua biblioteca ainda não tem músicas. Cadastre algumas para gerar sugestões.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de culto"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="">Qualquer</option>{Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
            <Field label="Tema ou objetivo" hint="Ex.: gratidão, cura, missões — busca em tags, títulos, observações e letras."><Input value={theme} onChange={(e) => setTheme(e.target.value)} /></Field>
            <Field label="Quantidade de músicas"><Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} placeholder="5" /></Field>
            <Field label="Duração aproximada (min)" hint="Se a quantidade ficar vazia, ela é calculada pela duração."><Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="25" /></Field>
          </div>
          <Field label="Categorias desejadas (na ordem do culto)">
            <div className="flex flex-wrap gap-2">{(cats.data ?? []).map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(catIds, setCatIds, c.id)} className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold', catIds.includes(c.id) ? 'border-accent bg-accent/15 text-accenttext' : 'border-border text-muted')}>{c.name}</button>))}</div>
          </Field>
          <Field label="Tonalidades mais confortáveis para os ministros">
            <div className="flex flex-wrap gap-1.5">{KEYS.filter((k) => !k.endsWith('m')).map((k) => (
              <button key={k} type="button" onClick={() => setKeys((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))} className={cn('rounded-lg border px-2.5 py-1 text-sm font-bold', keys.includes(k) ? 'border-accent bg-accent text-accentfg' : 'border-border text-muted')}>{k}</button>))}</div>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Field label="Músicas que precisam entrar / não devem ser usadas"><Input value={songQ} onChange={(e) => setSongQ(e.target.value)} placeholder="Buscar música…" /></Field>
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
                {filteredSongs.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface2">
                    <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                    <button type="button" onClick={() => { setExclude((x) => x.filter((i) => i !== s.id)); toggle(include, setInclude, s.id) }} className={cn('rounded-md px-2 py-0.5 text-xs font-bold', include.includes(s.id) ? 'bg-ok/20 text-ok' : 'bg-surface2 text-muted')}>Incluir</button>
                    <button type="button" onClick={() => { setInclude((x) => x.filter((i) => i !== s.id)); toggle(exclude, setExclude, s.id) }} className={cn('rounded-md px-2 py-0.5 text-xs font-bold', exclude.includes(s.id) ? 'bg-danger/20 text-danger' : 'bg-surface2 text-muted')}>Evitar</button>
                  </div>))}
                {filteredSongs.length === 0 && <p className="p-3 text-center text-xs text-muted">Nenhuma música.</p>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {include.map((id) => <Badge key={id} tone="ok">+ {titleOf(id)}</Badge>)}
                {exclude.map((id) => <Badge key={id} tone="danger">− {titleOf(id)}</Badge>)}
              </div>
            </div>
            <div>
              <Field label="Repertórios anteriores como referência" hint="Evita repetir as mesmas músicas e aproveita as etapas em que foram usadas." />
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
                {(refList.data ?? []).length === 0 && <p className="p-3 text-center text-xs text-muted">Ainda não há repertórios anteriores.</p>}
                {(refList.data ?? []).map((r) => {
                  const ev = Array.isArray(r.event) ? r.event[0] : r.event
                  return (
                    <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface2">
                      <input type="checkbox" checked={refs.includes(r.id)} onChange={() => toggle(refs, setRefs, r.id)} className="accent-[rgb(var(--accent))]" />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                      <span className="text-xs text-muted">{ev ? fmtDate(ev.event_date) : r.is_template ? 'Modelo' : ''}</span>
                    </label>)
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {out.warnings.map((w, i) => <p key={i} className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{w}</p>)}
          {out.items.length === 0 ? <p className="py-8 text-center text-sm text-muted">Não foi possível montar uma sugestão com os critérios informados.</p> : (
            <>
              <div className="flex items-center justify-between text-sm"><span className="font-semibold"><Wand2 className="mr-1.5 inline h-4 w-4 text-accenttext" />Sugestão editável — {out.items.length} músicas</span><span className="text-muted">≈ {fmtTotal(total)}</span></div>
              {out.items.map((it, i) => {
                const cat = orderedCats.find((c) => c.id === it.category_id)
                return (
                  <div key={it.song.id + i} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                    <span className="w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                    <Cover url={it.song.cover_url} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{it.song.title}</p>
                      <p className="truncate text-xs text-muted">{[cat?.name, it.song.artist, it.song.church_key || it.song.original_key, it.song.duration_seconds ? fmtDuration(it.song.duration_seconds) : null].filter(Boolean).join(' · ')}</p>
                      {it.reasons.length > 0 && <p className="truncate text-[11px] text-accenttext">{it.reasons.join(' · ')}</p>}
                    </div>
                    <IconButton label="Trocar por outra sugestão" onClick={() => swap(i)}><RefreshCw className="h-4 w-4" /></IconButton>
                    <IconButton label="Remover da sugestão" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>)
              })}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

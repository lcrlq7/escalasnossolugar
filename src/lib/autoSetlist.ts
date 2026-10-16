import type { Category, Song } from '../types'
import { normalize, parseDate, todayStr } from './utils'
import { normKey } from './setlist'

export interface AutoInput {
  songs: Song[]
  categories: Category[]           // categorias escolhidas, na ordem
  count: number                    // 0 = definir pela duração
  targetSeconds: number | null
  theme: string
  include: string[]
  exclude: string[]
  keys: string[]                   // tonalidades confortáveis
  lastUsed: Record<string, string> // song_id -> última data de uso (YYYY-MM-DD)
  refSongIds: Set<string>
  refCategory: Record<string, string>
  favorites?: Set<string>
}
export interface AutoItem { song: Song; category_id: string | null; reasons: string[] }
export interface AutoOutput { items: AutoItem[]; totalSeconds: number; unknownDurations: number; warnings: string[] }

const DEFAULT_SEC = 300

function daysSince(d: string) {
  return Math.floor((parseDate(todayStr()).getTime() - parseDate(d).getTime()) / 86400000)
}

export function scoreSong(s: Song, cat: Category | null, inp: AutoInput, jitter = 0): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  if (s.is_habitual) { score += 3; reasons.push('Repertório habitual') }
  if (inp.favorites?.has(s.id)) { score += 1; reasons.push('Favorita') }

  const tokens = normalize(inp.theme).split(' ').filter((t) => t.length >= 3)
  if (tokens.length) {
    const tags = normalize(s.tags.join(' ')), title = normalize(s.title), notes = normalize(s.notes ?? ''), lyrics = normalize(s.lyrics ?? '')
    let t = 0
    for (const tok of tokens) {
      if (tags.includes(tok)) t += 4
      if (title.includes(tok)) t += 3
      if (notes.includes(tok)) t += 2
      if (lyrics.includes(tok)) t += 1
    }
    if (t > 0) { score += Math.min(t, 10); reasons.push('Combina com o tema') }
  }
  if (cat) {
    const cn = normalize(cat.name)
    if (normalize(s.tags.join(' ')).includes(cn)) { score += 3; reasons.push(`Marcada como ${cat.name.toLowerCase()}`) }
    if (inp.refCategory[s.id] === cat.id) { score += 2; reasons.push('Usada nesta etapa em repertório de referência') }
    if (s.bpm) {
      if (/abertura|celebra/.test(cn)) score += s.bpm >= 100 ? 1 : -0.5
      if (/adora|ministra/.test(cn)) score += s.bpm <= 85 ? 1 : -0.5
    }
  }
  if (inp.keys.length) {
    const k = normKey(s.church_key || s.original_key)
    if (k) {
      if (inp.keys.map(normKey).includes(k)) { score += 2; reasons.push('Tom confortável') } else score -= 1
    }
  }
  const last = inp.lastUsed[s.id]
  if (last) {
    const d = daysSince(last)
    if (d >= 0 && d < 14) { score -= 4; reasons.push(`Tocada há ${d} dia(s)`) }
    else if (d >= 0 && d < 30) { score -= 2; reasons.push(`Tocada há ${d} dias`) }
    else if (d >= 0 && d < 60) score -= 1
  } else score += 0.5
  if (inp.refSongIds.has(s.id)) score -= 1.5
  return { score: score + jitter, reasons }
}

function slotsFor(n: number, cats: Category[]): (Category | null)[] {
  if (cats.length === 0) return Array.from({ length: n }, () => null)
  const k = cats.length
  const base = Math.floor(n / k)
  const counts = cats.map(() => base)
  let extra = n - base * k
  const mid = (k - 1) / 2
  const order = cats.map((_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
  for (const i of order) { if (extra <= 0) break; counts[i]++; extra-- }
  return cats.flatMap((c, i) => Array.from({ length: counts[i] }, () => c))
}

export function buildSetlist(inp: AutoInput): AutoOutput {
  const warnings: string[] = []
  const pool = inp.songs.filter((s) => !s.archived && !inp.exclude.includes(s.id))
  if (pool.length === 0) {
    return { items: [], totalSeconds: 0, unknownDurations: 0, warnings: ['A biblioteca não tem músicas disponíveis. Cadastre músicas antes de montar o repertório.'] }
  }
  const known = pool.filter((s) => s.duration_seconds).map((s) => s.duration_seconds as number)
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : DEFAULT_SEC
  let n = inp.count
  if (!n && inp.targetSeconds) n = Math.max(1, Math.round(inp.targetSeconds / avg))
  if (!n) n = 5
  if (inp.include.length > n) n = inp.include.length
  if (n > pool.length) { warnings.push(`A biblioteca tem apenas ${pool.length} música(s) disponíveis; o repertório sugerido terá ${pool.length}.`); n = pool.length }

  const slots = slotsFor(n, inp.categories)
  const chosen: (AutoItem | null)[] = slots.map(() => null)
  const used = new Set<string>()
  const jit = () => Math.random() * 0.8

  // 1) músicas obrigatórias: melhor etapa por afinidade
  for (const id of inp.include) {
    const s = inp.songs.find((x) => x.id === id)
    if (!s) continue
    if (inp.exclude.includes(id)) { warnings.push(`"${s.title}" estava em "incluir" e "não usar"; foi mantida de fora.`); continue }
    let bestIdx = -1, bestScore = -Infinity
    slots.forEach((c, i) => {
      if (chosen[i]) return
      const sc = scoreSong(s, c, inp).score
      if (sc > bestScore) { bestScore = sc; bestIdx = i }
    })
    if (bestIdx === -1) { slots.push(null); chosen.push(null); bestIdx = slots.length - 1 }
    const r = scoreSong(s, slots[bestIdx], inp)
    chosen[bestIdx] = { song: s, category_id: slots[bestIdx]?.id ?? null, reasons: ['Incluída por você', ...r.reasons] }
    used.add(s.id)
  }
  // 2) demais vagas pelo melhor score
  for (let i = 0; i < slots.length; i++) {
    if (chosen[i]) continue
    let best: { s: Song; score: number; reasons: string[] } | null = null
    for (const s of pool) {
      if (used.has(s.id)) continue
      const r = scoreSong(s, slots[i], inp, jit())
      if (!best || r.score > best.score) best = { s, score: r.score, reasons: r.reasons }
    }
    if (best) { chosen[i] = { song: best.s, category_id: slots[i]?.id ?? null, reasons: best.reasons }; used.add(best.s.id) }
  }
  const items = chosen.filter(Boolean) as AutoItem[]
  let total = 0, unknown = 0
  for (const it of items) { if (it.song.duration_seconds) total += it.song.duration_seconds; else unknown++ }
  if (unknown > 0) warnings.push(`${unknown} música(s) estão sem duração cadastrada; o tempo total é uma estimativa mínima.`)
  if (inp.targetSeconds) {
    const est = total + unknown * avg
    const diff = Math.round((est - inp.targetSeconds) / 60)
    if (Math.abs(diff) >= 4) warnings.push(`A duração estimada difere da meta em cerca de ${Math.abs(diff)} min (${diff > 0 ? 'acima' : 'abaixo'}). Ajuste manualmente se necessário.`)
  }
  if (inp.keys.length && items.every((i) => !normKey(i.song.church_key || i.song.original_key))) {
    warnings.push('Nenhuma música selecionada tem tom cadastrado; o filtro de tonalidade não pôde ser considerado.')
  }
  return { items, totalSeconds: total, unknownDurations: unknown, warnings }
}

/** Próxima melhor opção para trocar uma música sugerida. */
export function alternativeFor(inp: AutoInput, cat: Category | null, currentIds: Set<string>): Song | null {
  let best: { s: Song; score: number } | null = null
  for (const s of inp.songs) {
    if (s.archived || inp.exclude.includes(s.id) || currentIds.has(s.id)) continue
    const r = scoreSong(s, cat, inp, Math.random() * 0.8)
    if (!best || r.score > best.score) best = { s, score: r.score }
  }
  return best?.s ?? null
}

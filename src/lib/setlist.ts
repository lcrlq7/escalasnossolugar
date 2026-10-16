import type { Category, Setlist, SetlistItem, Song } from '../types'

export interface ResolvedItem {
  id: string; position: number; kind: SetlistItem['kind']; note: string | null
  category: string | null; key: string | null; duration: number | null; song: Song | null; rehearsed: boolean
}

export const effectiveKey = (i: Pick<SetlistItem, 'key_override'>, s?: Song | null) =>
  i.key_override?.trim() || s?.church_key || s?.original_key || null

export function resolveItems(items: SetlistItem[], cats: Category[]): ResolvedItem[] {
  const cm = new Map(cats.map((c) => [c.id, c.name]))
  return [...items].sort((a, b) => a.position - b.position).map((i) => ({
    id: i.id, position: i.position, kind: i.kind, note: i.note,
    category: i.category_id ? cm.get(i.category_id) ?? null : null,
    key: i.kind === 'song' ? effectiveKey(i, i.song) : null,
    duration: i.duration_override_seconds ?? i.song?.duration_seconds ?? null,
    song: i.song ?? null, rehearsed: !!i.rehearsed,
  }))
}

export function totalSeconds(items: ResolvedItem[]) {
  let total = 0, unknown = 0
  for (const i of items) {
    if (i.kind !== 'song') { total += i.duration ?? 0; continue }
    if (i.duration) total += i.duration; else unknown++
  }
  return { total, unknown }
}

export const shareUrl = (s: Pick<Setlist, 'share_token'>) => `${window.location.origin}/r/${s.share_token}`

export const KIND_LABEL: Record<SetlistItem['kind'], string> = {
  song: 'Música', note: 'Observação', prayer: 'Momento de oração', transition: 'Transição',
}

/** Equivalência de tons (bemol/sustenido). */
const ENH: Record<string, string> = { 'A#': 'Bb', Db: 'C#', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', Cb: 'B', 'E#': 'F', 'B#': 'C' }
export function normKey(k?: string | null): string | null {
  if (!k) return null
  const t = k.trim().replace('♭', 'b').replace('♯', '#')
  const m = t.match(/^([A-Ga-g])([#b]?)(m|min)?/)
  if (!m) return null
  const root = m[1].toUpperCase() + m[2]
  return (ENH[root] ?? root) + (m[3] ? 'm' : '')
}

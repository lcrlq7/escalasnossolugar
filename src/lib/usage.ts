import { useQuery } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'

export interface UsageRow { song_id: string; title: string; artist: string | null; date: string; event_id: string; event_title: string; key: string | null }

/** Uso de músicas em cultos publicados/concluídos no período (dados reais do banco). */
export const useSongUsage = (from: string, to: string) => useQuery({
  queryKey: ['song-usage-range', from, to],
  queryFn: async () => {
    const rows = unwrap(await supabase.from('setlist_items')
      .select('song_id, key_override, song:songs(title, artist, church_key, original_key), setlist:setlists!inner(event:events!inner(id, title, event_date, status))')
      .not('song_id', 'is', null).gte('setlist.event.event_date', from).lte('setlist.event.event_date', to)) as unknown as {
        song_id: string; key_override: string | null
        song: { title: string; artist: string | null; church_key: string | null; original_key: string | null } | { title: string; artist: string | null; church_key: string | null; original_key: string | null }[] | null
        setlist: { event: { id: string; title: string; event_date: string; status: string } | { id: string; title: string; event_date: string; status: string }[] | null } | null
      }[]
    const out: UsageRow[] = []
    for (const r of rows) {
      const ev = Array.isArray(r.setlist?.event) ? r.setlist?.event[0] : r.setlist?.event
      const s = Array.isArray(r.song) ? r.song[0] : r.song
      if (!ev || !s || !['published', 'completed'].includes(ev.status) || ev.event_date < from || ev.event_date > to) continue
      out.push({ song_id: r.song_id, title: s.title, artist: s.artist, date: ev.event_date, event_id: ev.id, event_title: ev.title, key: r.key_override || s.church_key || s.original_key })
    }
    return out
  },
})

export function countBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
  return m
}

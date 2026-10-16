import { supabase } from './supabase'
import type { ExternalResult } from '../types'

export interface SearchResponse { results: ExternalResult[]; sources: Record<string, string> }

export async function searchMusic(q: string, gospelOnly = true): Promise<SearchResponse> {
  const { data, error } = await supabase.functions.invoke('music-search', { body: { q, gospelOnly } })
  if (error) throw new Error('A pesquisa externa está indisponível no momento. Você pode cadastrar a música manualmente.')
  return data as SearchResponse
}

const PRIORITY: ExternalResult['source'][] = ['itunes', 'spotify', 'youtube', 'link']

/** Combina resultados selecionados em dados iniciais de uma música (sem inventar nada). */
export function mergeResults(sel: ExternalResult[]) {
  const sorted = [...sel].sort((a, b) => PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source))
  const base = sorted[0]
  const pick = <K extends keyof ExternalResult>(k: K) => sorted.find((r) => r[k])?.[k] ?? null
  return {
    title: base?.title ?? '',
    artist: (pick('artist') as string | null) ?? '',
    album: (pick('album') as string | null) ?? '',
    cover_url: (pick('cover_url') as string | null) ?? '',
    duration_seconds: (pick('duration_seconds') as number | null) ?? null,
    youtube_url: (pick('youtube_url') as string | null) ?? '',
    spotify_url: (pick('spotify_url') as string | null) ?? '',
    source: base?.source ?? 'manual',
  }
}

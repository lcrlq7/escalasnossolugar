// Edge Function: pesquisa de músicas em fontes externas.
// - Catálogo iTunes/Apple Music (gratuito, sem chave): título, artista, álbum, capa, duração.
// - YouTube Data API v3 (opcional): defina o secret YOUTUBE_API_KEY.
// - Spotify Web API (opcional): defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET.
// - Links do YouTube colados: resolvidos via oEmbed (sem chave).
// Nada é inventado: campos que a fonte não fornece ficam nulos.
// As chaves ficam SOMENTE nos secrets da função (nunca no frontend).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface R {
  source: 'itunes' | 'youtube' | 'spotify' | 'link'
  title: string; artist: string | null; album: string | null; cover_url: string | null
  duration_seconds: number | null; youtube_url: string | null; spotify_url: string | null
  external_ref: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}
function ytId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}
async function fetchJson(url: string, init?: RequestInit, ms = 8000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

async function itunes(q: string): Promise<R[]> {
  const d = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&country=BR&limit=10`)
  return (d.results ?? []).map((x: Record<string, unknown>) => ({
    source: 'itunes' as const,
    title: String(x.trackName ?? ''),
    artist: (x.artistName as string) ?? null,
    album: (x.collectionName as string) ?? null,
    cover_url: x.artworkUrl100 ? String(x.artworkUrl100).replace('100x100bb', '600x600bb') : null,
    duration_seconds: x.trackTimeMillis ? Math.round(Number(x.trackTimeMillis) / 1000) : null,
    youtube_url: null, spotify_url: null,
    external_ref: `itunes:${x.trackId}`,
  })).filter((r: R) => r.title)
}

async function youtube(q: string, key: string): Promise<R[]> {
  const s = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(q)}&key=${key}`)
  const ids = (s.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId).filter(Boolean)
  const dur: Record<string, number> = {}
  if (ids.length) {
    try {
      const v = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(',')}&key=${key}`)
      for (const it of v.items ?? []) {
        const m = String(it.contentDetails?.duration ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
        if (m) dur[it.id] = (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0)
      }
    } catch { /* duração é opcional */ }
  }
  return (s.items ?? []).map((i: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> } }) => ({
    source: 'youtube' as const,
    title: decodeEntities(i.snippet.title),
    artist: decodeEntities(i.snippet.channelTitle),
    album: null,
    cover_url: i.snippet.thumbnails?.high?.url ?? i.snippet.thumbnails?.medium?.url ?? null,
    duration_seconds: dur[i.id.videoId] ?? null,
    youtube_url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
    spotify_url: null,
    external_ref: `youtube:${i.id.videoId}`,
  }))
}

async function spotify(q: string, id: string, secret: string): Promise<R[]> {
  const tok = await fetchJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: 'grant_type=client_credentials',
  })
  const d = await fetchJson(`https://api.spotify.com/v1/search?type=track&limit=8&market=BR&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${tok.access_token}` } })
  return (d.tracks?.items ?? []).map((t: { id: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; duration_ms: number; external_urls: { spotify: string } }) => ({
    source: 'spotify' as const,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', ') || null,
    album: t.album?.name ?? null,
    cover_url: t.album?.images?.[0]?.url ?? null,
    duration_seconds: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
    youtube_url: null,
    spotify_url: t.external_urls?.spotify ?? null,
    external_ref: `spotify:${t.id}`,
  }))
}

async function resolveLink(url: string): Promise<R[]> {
  const id = ytId(url)
  if (!id) return []
  const o = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`)
  return [{
    source: 'link', title: decodeEntities(String(o.title ?? '')), artist: decodeEntities(String(o.author_name ?? '')) || null,
    album: null, cover_url: o.thumbnail_url ?? null, duration_seconds: null,
    youtube_url: `https://www.youtube.com/watch?v=${id}`, spotify_url: null, external_ref: `link:${id}`,
  }]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  let q = ''
  try { q = String((await req.json()).q ?? '').trim().slice(0, 150) } catch { return json({ error: 'Requisição inválida' }, 400) }
  if (q.length < 2) return json({ results: [], sources: {} })

  const yk = Deno.env.get('YOUTUBE_API_KEY')
  const sid = Deno.env.get('SPOTIFY_CLIENT_ID')
  const ssec = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  const sources: Record<string, string> = {}
  const results: R[] = []

  if (/^https?:\/\//i.test(q)) {
    try { results.push(...await resolveLink(q)); sources.link = 'ok' } catch { sources.link = 'não foi possível ler o link' }
    return json({ results, sources })
  }

  const jobs: Promise<void>[] = []
  jobs.push(itunes(q).then((r) => { results.push(...r); sources.itunes = 'ok' }).catch(() => { sources.itunes = 'indisponível' }))
  if (yk) jobs.push(youtube(q, yk).then((r) => { results.push(...r); sources.youtube = 'ok' }).catch(() => { sources.youtube = 'indisponível (verifique a chave/cota)' }))
  else sources.youtube = 'não configurado — cole o link do vídeo na busca'
  if (sid && ssec) jobs.push(spotify(q, sid, ssec).then((r) => { results.push(...r); sources.spotify = 'ok' }).catch(() => { sources.spotify = 'indisponível' }))
  else sources.spotify = 'não configurado'
  await Promise.all(jobs)

  const order = { itunes: 0, spotify: 1, youtube: 2, link: 3 } as const
  results.sort((a, b) => order[a.source] - order[b.source])
  return json({ results, sources })
})

// Importa as músicas de uma playlist do Spotify (usa a conta conectada do usuário) ou do YouTube (usa YOUTUBE_API_KEY).
// Apenas LÊ a playlist e devolve a lista; quem grava na biblioteca é o app (respeitando RLS).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CID = Deno.env.get('SPOTIFY_CLIENT_ID'), CSEC = Deno.env.get('SPOTIFY_CLIENT_SECRET'), YK = Deno.env.get('YOUTUBE_API_KEY')
const MAX = 300

interface T { title: string; artist: string | null; album: string | null; cover_url: string | null; duration_seconds: number | null; youtube_url: string | null; spotify_url: string | null; source: 'spotify' | 'youtube'; ref: string }

async function spToken(uid: string): Promise<string | null> {
  const { data: c } = await admin.from('music_connections').select('*').eq('user_id', uid).eq('provider', 'spotify').maybeSingle()
  if (!c) return null
  if (new Date(c.expires_at).getTime() > Date.now()) return c.access_token
  if (!c.refresh_token || !CID || !CSEC) return null
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${CID}:${CSEC}`)}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
  })
  if (!r.ok) return null
  const t = await r.json()
  await admin.from('music_connections').update({ access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token, expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60000).toISOString(), updated_at: new Date().toISOString() }).eq('user_id', uid).eq('provider', 'spotify')
  return t.access_token
}

async function getJson(url: string, headers: Record<string, string> = {}, tries = 3): Promise<{ ok: boolean; status: number; body: any }> {
  const r = await fetch(url, { headers })
  const text = await r.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if ((r.status >= 500 || r.status === 429) && tries > 1) { await new Promise((x) => setTimeout(x, 700)); return getJson(url, headers, tries - 1) }
  return { ok: r.ok, status: r.status, body }
}
const msg = (b: any) => (b?.error?.message ? String(b.error.message) : '')

async function fromSpotify(uid: string, id: string): Promise<{ tracks?: T[]; name?: string; error?: string; needsConnect?: boolean }> {
  if (!CID || !CSEC) return { error: 'Integração com Spotify ainda não configurada no servidor.' }
  const token = await spToken(uid)
  if (!token) return { error: 'Conecte sua conta do Spotify primeiro (botão “Criar playlist” em qualquer escala).', needsConnect: true }
  const h = { Authorization: `Bearer ${token}` }
  const meta = await getJson(`https://api.spotify.com/v1/playlists/${id}?fields=name`, h)
  const tracks: T[] = []
  for (let off = 0; off < MAX; off += 100) {
    let r = await getJson(`https://api.spotify.com/v1/playlists/${id}/items?limit=100&offset=${off}&market=BR`, h)
    if (!r.ok && r.status !== 401) r = await getJson(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=${off}&market=BR`, h)
    if (!r.ok) {
      if (off === 0) return { error: `O Spotify não liberou a leitura desta playlist (${r.status}${msg(r.body) ? ': ' + msg(r.body) : ''}). Em apps em modo de desenvolvimento, só é possível ler playlists que são suas.` }
      break
    }
    for (const it of (r.body?.items ?? []) as any[]) {
      const t = it.track ?? it.item
      if (!t || !t.id || t.type === 'episode') continue
      tracks.push({
        title: t.name, artist: (t.artists ?? []).map((a: any) => a.name).join(', ') || null, album: t.album?.name ?? null,
        cover_url: t.album?.images?.[0]?.url ?? null, duration_seconds: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
        youtube_url: null, spotify_url: t.external_urls?.spotify ?? null, source: 'spotify', ref: `spotify:${t.id}`,
      })
    }
    if (!r.body?.next) break
  }
  return { tracks, name: meta.body?.name }
}

const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

async function fromYouTube(listId: string): Promise<{ tracks?: T[]; name?: string; error?: string; needsKey?: boolean }> {
  if (!YK) return { error: 'Para importar playlists do YouTube é preciso cadastrar a chave YOUTUBE_API_KEY nos Secrets do Supabase.', needsKey: true }
  const items: { id: string; title: string; channel: string; cover: string | null }[] = []
  let page = ''
  for (let i = 0; i < 6 && items.length < MAX; i++) {
    const r = await getJson(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(listId)}&key=${YK}${page ? `&pageToken=${page}` : ''}`)
    if (!r.ok) return { error: `O YouTube não liberou a playlist (${r.status}${msg(r.body) ? ': ' + msg(r.body) : ''}). Ela precisa ser pública ou não listada.` }
    for (const it of (r.body?.items ?? []) as any[]) {
      const sn = it.snippet
      const vid = sn?.resourceId?.videoId
      if (!vid || /^(private video|deleted video|vídeo privado|vídeo excluído)/i.test(sn.title ?? '')) continue
      items.push({ id: vid, title: dec(sn.title), channel: dec(sn.videoOwnerChannelTitle ?? sn.channelTitle ?? ''), cover: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? null })
    }
    page = r.body?.nextPageToken ?? ''
    if (!page) break
  }
  const dur: Record<string, number> = {}
  for (let i = 0; i < items.length; i += 50) {
    const ids = items.slice(i, i + 50).map((x) => x.id).join(',')
    const v = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YK}`)
    for (const it of (v.body?.items ?? []) as any[]) {
      const m = String(it.contentDetails?.duration ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
      if (m) dur[it.id] = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
    }
  }
  const meta = await getJson(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(listId)}&key=${YK}`)
  const tracks: T[] = items.map((x) => {
    let title = x.title, artist: string | null = x.channel.replace(/\s*-\s*Topic$/i, '') || null
    // Remove sufixos comuns de vídeo e separa "Artista - Título"
    title = title.replace(/\s*[\(\[][^\)\]]*(official|oficial|clipe|video|vídeo|lyric|letra|áudio|audio|ao vivo|live)[^\)\]]*[\)\]]/gi, '').trim()
    const parts = title.split(/\s+[-–|]\s+/)
    if (parts.length === 2) { artist = parts[0].trim(); title = parts[1].trim() }
    return { title, artist, album: null, cover_url: x.cover, duration_seconds: dur[x.id] ?? null, youtube_url: `https://www.youtube.com/watch?v=${x.id}`, spotify_url: null, source: 'youtube' as const, ref: `youtube:${x.id}` }
  })
  return { tracks, name: meta.body?.items?.[0]?.snippet?.title }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(jwt)
  const uid = u?.user?.id
  if (!uid) return json({ error: 'Não autenticado' }, 401)
  const { data: ok } = await admin.from('user_roles').select('role').eq('user_id', uid).in('role', ['admin', 'leader']).limit(1)
  if (!ok?.length) return json({ error: 'Apenas líderes e administradores podem importar playlists.' }, 403)
  let url = ''
  try { url = String((await req.json()).url ?? '').trim().slice(0, 400) } catch { return json({ error: 'Requisição inválida' }, 400) }

  const sp = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{22})/)
  if (sp) return json({ provider: 'spotify', ...(await fromSpotify(uid, sp[1])) })
  const yt = url.match(/[?&]list=([\w-]+)/)
  if (/youtu(\.be|be\.com)/.test(url) && yt) return json({ provider: 'youtube', ...(await fromYouTube(yt[1])) })
  return json({ error: 'Link não reconhecido. Use o link de uma playlist do Spotify (open.spotify.com/playlist/…) ou do YouTube (youtube.com/playlist?list=…).' }, 400)
})

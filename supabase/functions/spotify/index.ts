// Integração Spotify (requer login do usuário no app): status, connect, search, create.
// Tokens ficam só no banco (tabela music_connections, sem acesso pelo navegador).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CID = Deno.env.get('SPOTIFY_CLIENT_ID'), CSEC = Deno.env.get('SPOTIFY_CLIENT_SECRET')
const REDIRECT = `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-callback`
const SCOPE = 'playlist-modify-private playlist-modify-public playlist-read-private playlist-read-collaborative'

async function accessToken(uid: string): Promise<string | null> {
  const { data: c } = await admin.from('music_connections').select('*').eq('user_id', uid).eq('provider', 'spotify').maybeSingle()
  if (!c) return null
  if (new Date(c.expires_at).getTime() > Date.now()) return c.access_token
  if (!c.refresh_token || !CID || !CSEC) return null
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${CID}:${CSEC}`)}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
  })
  if (!r.ok) { await admin.from('music_connections').delete().eq('user_id', uid).eq('provider', 'spotify'); return null }
  const t = await r.json()
  await admin.from('music_connections').update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60000).toISOString(), updated_at: new Date().toISOString(),
  }).eq('user_id', uid).eq('provider', 'spotify')
  return t.access_token
}

const trackIdOf = (u?: string | null) => (u ?? '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})/)?.[1] ?? null

async function sp(token: string, path: string, init?: RequestInit, tries = 3): Promise<{ ok: boolean; status: number; body: Record<string, any> | null }> {
  const res = await sp1(token, path, init)
  if ((res.status >= 500 || res.status === 429) && tries > 1) {
    await new Promise((r) => setTimeout(r, 700))
    return sp(token, path, init, tries - 1)
  }
  return res
}
const errMsg = (b: Record<string, any> | null) => (b?.error?.message ? String(b.error.message) : typeof b === 'string' ? b : '')

async function sp1(token: string, path: string, init?: RequestInit) {
  const r = await fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const text = await r.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: r.ok, status: r.status, body: body as Record<string, any> | null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(jwt)
  const uid = u?.user?.id
  if (!uid) return json({ error: 'Não autenticado' }, 401)
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida' }, 400) }

  if (!CID || !CSEC) return json({ configured: false, error: 'Integração com Spotify ainda não configurada no servidor.' })

  if (body.action === 'status') {
    const t = await accessToken(uid)
    return json({ configured: true, connected: !!t })
  }

  if (body.action === 'connect') {
    // líderes/admins, ou o ministro (responsável ou principal) de alguma escala ativa, criam playlists
    const { data: ok } = await admin.from('user_roles').select('role').eq('user_id', uid).in('role', ['admin', 'leader']).limit(1)
    let allowed = !!ok?.length
    if (!allowed) {
      const { data: m } = await admin.from('members').select('id').eq('profile_id', uid).eq('active', true).maybeSingle()
      if (m) {
        const { data: ev } = await admin.from('events').select('id').eq('leader_member_id', m.id).neq('status', 'cancelled').limit(1)
        allowed = !!ev?.length
        if (!allowed) {
          const { data: asg } = await admin.from('event_assignments').select('id, worship_functions!inner(is_main), events!inner(status)')
            .eq('member_id', m.id).eq('worship_functions.is_main', true).neq('events.status', 'cancelled').limit(1)
          allowed = !!asg?.length
        }
      }
    }
    if (!allowed) return json({ error: 'Apenas líderes, administradores e ministros responsáveis por uma escala podem conectar o Spotify.' }, 403)
    const state = crypto.randomUUID()
    const returnTo = typeof body.returnTo === 'string' ? body.returnTo.slice(0, 300) : '/'
    await admin.from('oauth_states').insert({ state, user_id: uid, provider: 'spotify', return_to: returnTo })
    const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: CID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE, state, show_dialog: 'true' })}`
    return json({ url })
  }

  const token = await accessToken(uid)
  if (!token) return json({ connected: false, error: 'Conecte sua conta do Spotify primeiro.' }, 409)

  if (body.action === 'search') {
    const songs = (body.songs ?? []) as { id: string; title: string; artist?: string | null; spotify_url?: string | null }[]
    const out: unknown[] = []
    for (const s of songs.slice(0, 30)) {
      const known = trackIdOf(s.spotify_url)
      const q = `track:${s.title}${s.artist ? ` artist:${s.artist.split(/[,&]/)[0].trim()}` : ''}`
      const r = await sp(token, `/search?type=track&limit=5&market=BR&q=${encodeURIComponent(q)}`)
      let items = ((r.body?.tracks?.items ?? []) as any[])
      if (!items.length && r.ok) {
        const r2 = await sp(token, `/search?type=track&limit=5&market=BR&q=${encodeURIComponent(`${s.title} ${s.artist ?? ''}`)}`)
        items = (r2.body?.tracks?.items ?? []) as any[]
      }
      const cands = items.map((t) => ({ id: t.id, title: t.name, artist: (t.artists ?? []).map((a: any) => a.name).join(', '), album: t.album?.name ?? null, url: t.external_urls?.spotify ?? null, cover: t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url ?? null }))
      out.push({ song_id: s.id, known_id: known, candidates: cands, error: r.ok ? null : `Spotify respondeu ${r.status}${errMsg(r.body) ? ': ' + errMsg(r.body) : ''}` })
    }
    return json({ results: out })
  }

  if (body.action === 'create') {
    const name = String(body.name ?? 'Louvor em Escala').slice(0, 100)
    const ids = ((body.trackIds ?? []) as string[]).filter((x) => /^[A-Za-z0-9]{22}$/.test(x)).slice(0, 100)
    if (!ids.length) return json({ error: 'Nenhuma faixa selecionada.' }, 400)
    const pl = await sp(token, '/me/playlists', { method: 'POST', body: JSON.stringify({ name, public: false, description: 'Criada pelo Louvor em Escala' }) })
    if (!pl.ok || !pl.body?.id) return json({ error: `Não foi possível criar a playlist (Spotify ${pl.status}${errMsg(pl.body) ? ': ' + errMsg(pl.body) : ''}).` }, 502)
    const uris = ids.map((i) => `spotify:track:${i}`)
    let add = await sp(token, `/playlists/${pl.body.id}/items`, { method: 'POST', body: JSON.stringify({ uris }) })
    if (!add.ok) add = await sp(token, `/playlists/${pl.body.id}/tracks`, { method: 'POST', body: JSON.stringify({ uris }) })
    if (!add.ok) return json({ error: `A playlist foi criada, mas não foi possível adicionar as faixas (Spotify ${add.status}${errMsg(add.body) ? ': ' + errMsg(add.body) : ''}).`, url: pl.body.external_urls?.spotify ?? null }, 502)
    return json({ url: pl.body.external_urls?.spotify ?? null, added: ids.length })
  }

  return json({ error: 'Ação desconhecida' }, 400)
})

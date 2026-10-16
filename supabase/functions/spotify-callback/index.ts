// Callback do login Spotify (público): troca o "code" por tokens e guarda em music_connections.
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, APP_URL (opcional). SUPABASE_* são injetados automaticamente.
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://escalasnossolugar.vercel.app'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const back = (path: string, ok: boolean) => {
    const safe = path.startsWith('/') && !path.startsWith('//') ? path : '/'
    const u = new URL(safe, APP_URL)
    u.searchParams.set('spotify', ok ? 'ok' : 'erro')
    return Response.redirect(u.toString(), 302)
  }
  if (!state) return back('/', false)
  const { data: st } = await admin.from('oauth_states').select('*').eq('state', state).eq('provider', 'spotify').maybeSingle()
  if (!st) return back('/', false)
  await admin.from('oauth_states').delete().eq('state', state)
  if (Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) return back(st.return_to, false)
  if (!code) return back(st.return_to, false)

  const id = Deno.env.get('SPOTIFY_CLIENT_ID'), secret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!id || !secret) return back(st.return_to, false)
  const redirect = `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-callback`
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
  })
  if (!r.ok) return back(st.return_to, false)
  const t = await r.json()
  const { error } = await admin.from('music_connections').upsert({
    user_id: st.user_id, provider: 'spotify', access_token: t.access_token, refresh_token: t.refresh_token ?? null,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60000).toISOString(), scope: t.scope ?? null, updated_at: new Date().toISOString(),
  })
  return back(st.return_to, !error)
})

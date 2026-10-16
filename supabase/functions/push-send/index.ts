// Envia Web Push quando uma notificação é criada.
// Chamada pelo Database Webhook (tabela notifications, INSERT) com a chave de serviço — verify_jwt ligado
// e, além disso, exige role=service_role. As chaves VAPID ficam em public.app_secrets (acesso só por service role).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

function roleOf(req: Request): string | null {
  try {
    const t = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
    return JSON.parse(atob(t.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  if (roleOf(req) !== 'service_role') return json({ error: 'forbidden' }, 403)
  let body: any = {}
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const id: string | undefined = body?.record?.id ?? body?.notification_id
  if (!id) return json({ error: 'sem id' }, 400)

  const { data: n } = await admin.from('notifications').select('id,user_id,title,body,link,push_sent_at').eq('id', id).maybeSingle()
  if (!n || n.push_sent_at) return json({ ok: true, skipped: true })
  const { data: subs } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', n.user_id)
  if (!subs?.length) return json({ ok: true, subs: 0 })

  const { data: keys } = await admin.from('app_secrets').select('key,value').in('key', ['vapid_public', 'vapid_private', 'vapid_subject'])
  const k = Object.fromEntries((keys ?? []).map((r) => [r.key, r.value]))
  if (!k.vapid_public || !k.vapid_private) return json({ error: 'VAPID ausente' }, 500)
  webpush.setVapidDetails(k.vapid_subject ?? 'mailto:admin@example.com', k.vapid_public, k.vapid_private)

  const payload = JSON.stringify({ title: n.title, body: n.body ?? '', url: n.link ?? '/', tag: n.id })
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
      sent++
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  if (sent) await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', n.id)
  return json({ ok: true, sent })
})

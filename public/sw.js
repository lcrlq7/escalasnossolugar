/* Service worker: recebe Web Push e abre o app ao tocar na notificação. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// necessário para o navegador oferecer "instalar app"; só repassa as navegações
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => new Response('Sem conexão. Tente de novo.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })))
})

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Louvor em Escala', body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(d.title || 'Louvor em Escala', {
    body: d.body || '', icon: '/brand/icon-192.png', badge: '/brand/icon-192.png', tag: d.tag || undefined, data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url) } catch (_) {} } return } }
    await self.clients.openWindow(url)
  })())
})

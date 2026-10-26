const CACHE_NAME = 'jemor-space-shell-v2';
const APP_SHELL = ['/offline.html', '/pwa-icon-192.png', '/pwa-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).then((response) => {
    if (response && response.ok) return response;
    return caches.match('/offline.html').then((fallback) => fallback || response);
  }).catch(async () => (await caches.match('/offline.html')) || Response.error()));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = payload.title || 'Jémor Space';
  const options = {
    body: payload.body || 'Tu as une nouvelle activité dans ton cercle.',
    icon: payload.icon || '/pwa-icon-192.png',
    badge: payload.badge || '/pwa-icon-192.png',
    tag: payload.tag || `jemor-push-${Date.now()}`,
    data: { url: payload.url || '/notifications', ...(payload.data || {}) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin) && 'focus' in client);
    if (existing) { existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});

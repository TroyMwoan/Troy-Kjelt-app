// Eenvoudige service worker: app-shell offline, Google-API's nooit cachen.
const C = 'mop-v5';
const B = '/Troy-Kjelt-app/';
const SHELL = [B, B + 'index.html', B + 'app.js', B + 'style.css', B + 'config.js', B + 'manifest.webmanifest', B + 'icon-192.png', B + 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // netwerk eerst (altijd de nieuwste versie), cache als terugval
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match(B + 'index.html')).then((r) => r || caches.match(B))));
});

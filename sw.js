/* ═══════════════════════════════════════════════════════
   sw.js · Service Worker
   Legt die App im Cache ab, damit sie ohne Netz startet.
   Bei Änderungen an den Dateien VERSION erhöhen.
   ═══════════════════════════════════════════════════════ */

const VERSION = 'v3';
const CACHE = `vokabeln-${VERSION}`;
// the AI library (~25 MB) gets its own cache so app updates do not re-download it
const LIB_CACHE = 'vokabeln-wllama-3.8.1';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/dict.js',
  './js/store.js',
  './js/ui.js',
  './js/train.js',
  './js/ai.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // bypass the HTTP cache, otherwise an update can pick up the old files
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== LIB_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // other pages (e.g. ki-test.html) are not part of the app shell
    const page = new URL(req.url).pathname.split('/').pop();
    if (page && page !== 'index.html') return;
    event.respondWith(
      caches.match('./index.html').then(hit => hit || fetch(req))
    );
    return;
  }

  if (req.url.includes('/js/vendor/')) {
    event.respondWith(
      caches.open(LIB_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

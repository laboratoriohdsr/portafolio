/* ===========================================================
   Service Worker · Portafolio Lab (HDSR)

   Estrategia:
   - La página y el código: red primero. Así, cuando publiques una
     versión nueva en GitHub, el personal la recibe de inmediato.
     Si no hay conexión, se sirve la última copia guardada.
   - Iconos y manifiesto: caché primero (no cambian casi nunca).
   - Firebase / Firestore: NUNCA se cachea. Los datos deben venir
     siempre en vivo del servidor.
   =========================================================== */

const VERSION = 'portafolio-lab-v11';
const CACHE_APP = `${VERSION}-app`;
const CACHE_EST = `${VERSION}-estaticos`;

// Lo mínimo para que la app abra sin conexión
const BASICOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico',
  // SDK de Firebase: se precarga para que la app abra sin esperarlo
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE_EST)
      .then(c => c.addAll(BASICOS).catch(err => console.warn('SW: precarga parcial', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(
        claves.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Dominios cuyas respuestas jamás se guardan
const SIN_CACHE = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'google-analytics.com'
];

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Datos en vivo: siempre a la red, sin tocar la caché
  if (SIN_CACHE.some(d => url.hostname.includes(d))) return;

  // Navegación (abrir la app): red primero
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_APP).then(c => c.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Iconos, manifiesto, tipografías y el SDK de Firebase: caché primero.
  // Las URLs del SDK llevan el número de versión, así que es seguro guardarlas.
  const esSDK = url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/');
  const estatico = /\.(png|ico|svg|webp|jpg|jpeg|woff2?|json)$/i.test(url.pathname)
    || url.hostname.includes('fonts.g') || esSDK;
  if (estatico) {
    evento.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_EST).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => hit))
    );
    return;
  }

  // Resto (incluido el SDK de Firebase): red primero con respaldo
  evento.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok && url.origin === location.origin) {
          const copia = resp.clone();
          caches.open(CACHE_APP).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});

// Permite que la página pida activar una versión nueva de inmediato
self.addEventListener('message', e => {
  if (e.data === 'actualizar') self.skipWaiting();
});

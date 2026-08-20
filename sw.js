// RAPCA Campo — Service Worker v1.0
const CACHE_NAME = 'rapca-v34';
const CDN_CACHE = 'rapca-cdn-v1';

const APP_FILES = [
  './',
  './index.html',
  './app.js',
  './auth.js',
  './forms.js',
  './camera.js',
  './sync.js',
  './map.js',
  './panel.js',
  './admin.js',
  './gabinete.js',
  './precarga.js',
  './dashboard.js',
  './timeline.js',
  './comparador.js',
  './galeria.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const CDN_FILES = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

// Instalar: cachear archivos
self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((c) => c.addAll(APP_FILES)),
      caches.open(CDN_CACHE).then((c) => c.addAll(CDN_FILES))
    ]).then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches antiguos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== CDN_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: estrategia según tipo
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only para PHP endpoints
  if (url.pathname.endsWith('.php')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({error: 'offline'}), {headers: {'Content-Type': 'application/json'}})));
    return;
  }

  // Cache-first para CDN y teselas de mapa.
  // Las teselas se piden de dos formas: como <img> normal (mapa general,
  // respuesta "opaca") y en modo CORS (mini-mapa de la cámara, que necesita
  // leer los píxeles). Una respuesta opaca cacheada NO sirve para una
  // petición CORS: por eso las teselas se descargan siempre en modo CORS,
  // válido para ambos consumidores, y las entradas opacas antiguas se
  // sobrescriben cuando llega una petición CORS con conexión.
  if (url.origin !== location.origin) {
    const esTesela = /tile\.openstreetmap\.org|opentopomap\.org|www\.ign\.es\/wmts/.test(url.href);
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const opacaParaCors = cached && esTesela && e.request.mode === 'cors' && cached.type === 'opaque';
        // La precarga usa cache:'reload' para refrescar de verdad (repara
        // teselas corruptas); el resto de peticiones son cache-first
        const forzarRed = esTesela && e.request.cache === 'reload';
        if (cached && !opacaParaCors && !forzarRed) return cached;
        const req = esTesela ? new Request(url.href, {mode: 'cors', cache: forzarRed ? 'reload' : 'default'}) : e.request;
        const guardar = (resp) => {
          // NUNCA cachear errores: un 404/5xx pisaría una tesela buena y,
          // con cache-first, se serviría corrupta para siempre
          if (resp && (resp.ok || resp.type === 'opaque')) {
            const clone = resp.clone();
            caches.open(CDN_CACHE).then((c) => c.put(e.request, clone));
          }
          return resp;
        };
        return fetch(req).then(guardar).catch(() => {
          // Una respuesta opaca cacheada NO es utilizable para peticiones CORS
          if (cached && !opacaParaCors) return cached;
          // Degradación del mapa general: si el refetch CORS falló (servidor
          // sin cabeceras ACAO), reintentar la petición original no-cors
          if (esTesela && e.request.mode !== 'cors') {
            return fetch(e.request).then(guardar).catch(() => Response.error());
          }
          return Response.error();
        });
      })
    );
    return;
  }

  // Network-first CON TIMEOUT para HTML y JS propios: los cambios llegan de
  // inmediato con buena conexión, pero con cobertura débil (señal presente
  // pero inservible) no se espera a que la red muera por timeout — a los
  // 3.5s se sirve la caché y la app arranca. La petición de red sigue en
  // segundo plano y actualiza la caché para la próxima vez.
  // cache:'no-cache' revalida contra el servidor: sin él, la caché HTTP del
  // navegador (Expires de 1 año en .htaccess) podía servir JS rancio.
  const esHtmlOJs = e.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/';
  if (esHtmlOJs) {
    const redP = fetch(e.request.url, {cache: 'no-cache', credentials: 'same-origin'}).then((resp) => {
      if (resp && resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
      }
      return resp;
    });
    redP.catch(() => {}); // la rama en segundo plano nunca debe quedar sin manejar
    const timeoutP = new Promise((resolve) => setTimeout(() => resolve('timeout'), 3500));
    e.respondWith(
      Promise.race([redP.catch(() => 'error'), timeoutP]).then((ganador) => {
        const esRespuesta = ganador !== 'timeout' && ganador !== 'error' && ganador;
        if (esRespuesta && ganador.ok) return ganador;
        // Timeout, error de red o respuesta no-ok (500 del servidor): caché
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          if (esRespuesta) return ganador; // respuesta real aunque no-ok
          // Sin caché: esperar a la red de verdad. El fallback a index.html
          // SOLO vale para navegaciones (devolver HTML donde se esperaba un
          // JS rompía la app entera con un SyntaxError)
          return redP.catch(() =>
            e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
          );
        });
      })
    );
    return;
  }

  // Stale-while-revalidate para el resto de archivos propios (manifest, iconos)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchP = fetch(e.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return resp;
      }).catch(() => cached);
      return cached || fetchP;
    })
  );
});

// Sync en background
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-registros') {
    e.waitUntil(self.clients.matchAll().then((clients) => {
      clients.forEach((c) => c.postMessage({tipo: 'sync-registros'}));
    }));
  }
});

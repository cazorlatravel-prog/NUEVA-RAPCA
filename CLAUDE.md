# RAPCA Campo — Contexto del proyecto para Claude

PWA de evaluación de pastos en campo (Andalucía) para operadores del programa
RAPCA. Vanilla JS sin framework, offline-first. Usuario: cazorlatravel
(no programador — explicar en castellano llano, él sube los archivos al
hosting a mano).

## Regla de oro

**NUNCA modificar datos ya guardados**: ni esquema de la BD del servidor, ni
ids, ni la estructura de registros existentes, ni lógica que borre datos.
Los cambios de estructura deben ser aditivos y retrocompatibles (los
registros antiguos sin los campos nuevos deben seguir funcionando).

## Arquitectura

- **Un solo ámbito global**: index.html carga en orden app, auth, forms,
  camera, sync, map, panel, admin, gabinete, precarga, timeline, comparador,
  galeria, dashboard. Todos comparten globals (`registros`, `sesion`,
  `gpsPos`, `fotosPagina`, `transectosDatos`, `db`...).
- **Datos**: registros en `localStorage` (array global, persistido con
  `guardarRegistros()`); fotos en IndexedDB `RAPCA_Fotos` **v6**: `fotos`
  (thumbnails 400px), `subidas_pendientes` (full-res W1/W2 por subir),
  `fotos_locales` (full-res generales, SOLO teléfono, nunca se limpian),
  `fotos_precargadas`, `waypoints_comp`, `capas_kml`, `kml_infraestructuras`.
- **Backend**: PHP en Hostinger (`datos.php` upsert por registro_id con
  columna JSON `datos` — sin migraciones para campos nuevos; `upload.php` →
  Cloudinary `rapca/TIPO/UNIDAD/CODIGO`; `auth.php` tokens). Copia secundaria
  a Google Forms (flag `enviadoForm` por registro para no duplicar filas).
- **Tipos de ficha**: VP (prefijo ids `vp`), EL (`el`), EI (`ev`). EI tiene
  3 transectos T1/T2/T3 individuales (pastoreo, observación, plantas 10×10
  notas, palatables, herbáceas, matorral, fotos propias) guardados en
  `datos.transectos`; el nivel superior de `datos` es copia de T1 + unión de
  fotos (retrocompatibilidad). Registros antiguos no tienen `.transectos`.
  Una sola ficha EI por unidad+día (fusión con `esTransectoVacio`); EL
  bloquea duplicados mismo día.
- **Códigos de foto**: `UNIDAD_VP_n` / `UNIDAD_EV_n` (generales) y
  `UNIDAD_VP_W1_n` / `UNIDAD_EV_W1_n` (comparativas W1/W2). EL y EI
  comparten prefijo EV. El código es la clave de los stores de fotos.

## Decisiones de producto vigentes

- **Solo las comparativas W1/W2 se suben a internet**; las generales quedan
  a resolución completa en `fotos_locales` (solo en el teléfono que las hizo).
- Ghost (foto fantasma para reencuadrar W1/W2): busca la más reciente de
  CUALQUIER visita anterior en fotos → pendientes → locales → precargadas →
  registros+Cloudinary, **siempre por claves** (nunca getAll de stores
  full-res: mataba la app por memoria).
- **Cámara WYSIWYG (v39)**: vídeo 4:3 (`aspectRatio ideal 4/3`) mostrado
  con `object-fit: contain` — el visor enseña el encuadre EXACTO de la foto
  final y el ghost encaja píxel a píxel. NO volver a cover ni a 16:9.
- Captura: UNA sola codificación JPEG (0.96) reutilizada para descarga y
  subida, lanzada en el mismo tick (el canvas se reutiliza). EXIF GPS
  inyectado a mano (`inyectarGPSenJPEG`).
- Borrador EI: diálogo continuar/descartar al abrir con evaluación a medias
  (guard `window._dialogoBorradorPendiente`); botón "Guardar sin terminar";
  badge "⏸ a medias" en el menú. `guardarBorrador` sale si `editandoRegistro`.
- Mapa: seguimiento GPS en tiempo real (wake lock, watch sin timeout,
  filtro de fixes imprecisos >100m si hay uno 3× mejor <15s, aviso de
  "ubicación aproximada" a los 25s >150m); gestor de waypoints 📌 con
  filtros unidad/año/tipo y borrado por filtro con modal propio.
- Indicador de distancia al waypoint anterior en la cámara (`cam-distancia`,
  solo pantalla, no sale en la foto).
- Cartografía offline: precarga de teselas por zona (página Precarga);
  mapa general y mini-mapa de cámara comparten URLs EXACTAS (IGN
  mapa-raster y pnoa-ma con el mismo orden de parámetros) — no cambiarlas
  por separado. El SW pide teselas siempre en modo CORS.
- `confirm()` nativo PROHIBIDO (se suprime en PWA instalada): usar
  `confirmarAccion()` (app.js) o modales propios.
- Peticiones de red siempre con `fetchConTimeout` (sync.js); subidas de
  fotos con `TIMEOUT_SUBIDA_FOTO` (120s); sin subida automática con 2G.
- Memoria: JAMÁS `obtenerTodosDB` sobre stores con fotos full-res
  (`subidas_pendientes`, `fotos_locales`) — usar `obtenerClavesDB`/`contarDB`
  y leer de una en una.

## Versionado y despliegue (MUY IMPORTANTE)

- En CADA cambio: bump conjunto de `CACHE_NAME` en sw.js (`rapca-vNN`) y
  `APP_VERSION` en app.js (`vNN`) — se muestra en la barra inferior y en el
  login para que el usuario confirme que la actualización llegó.
- Tras editar fuentes: `bash build.sh` regenera `dist/` (index.html NO usa
  dist, carga archivos individuales; dist es copia de respaldo).
- El usuario despliega subiendo los archivos a Hostinger a mano. La web es
  `rapca.app` (con CDN de Hostinger, `server: hcdn`): si una actualización
  "no llega", primero `curl` a rapca.app/sw.js para ver qué versión sirve,
  y si la CDN sirve viejo → purgar caché de CDN en hPanel. El `.htaccess`
  fuerza `no-cache` en HTML/JS/CSS (no tocar: sin eso los navegadores
  guardaban JS 7 días y las actualizaciones no llegaban).
- SW: network-first con timeout 3.5s para HTML/JS (cobertura débil arranca
  de caché); nunca responder index.html a una petición de .js.

## Tests

Suite E2E real con Playwright/Chromium: `tests/e2e-rapca.js` (~99 casos).
Para ejecutar: servidor local `python3 -m http.server 8899` en la raíz,
`npm install playwright` en un dir de trabajo, descargar las CDN a `./cdn/`
(ver CDN_MAP del propio test), `node e2e-rapca.js`. Los tests interceptan
CDN/tiles/cloudinary/rapca.app con rutas de Playwright y siembran la sesión
por localStorage. **Ejecutar la suite completa antes de cada push** y añadir
casos para cada feature/bug nuevo. Los agentes de auditoría adversarial
(2 en paralelo: diff reciente + transversal) han cazado decenas de bugs:
úsalos tras cambios grandes.

## Flujo de trabajo con el usuario

- Trabaja en campo con cobertura mala: toda feature debe asumir offline y
  memoria limitada del móvil.
- Commits en castellano explicando el porqué; push a la rama
  `claude/create-rapca-pwa-cCvsu`.
- Al terminar cualquier cambio: suite completa → build.sh → bump versión →
  commit → push → recordarle subir archivos y confirmar la versión en la
  barra inferior.

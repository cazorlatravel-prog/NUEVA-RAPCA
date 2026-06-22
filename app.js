// ============================================================
// RAPCA Campo — app.js — Núcleo: globals, utilidades, init
// Módulos: auth.js, forms.js, camera.js, sync.js, map.js,
//          panel.js, admin.js, gabinete.js, precarga.js
// ============================================================

// --- Constantes globales ---
var API_BASE = 'https://rapca.app/';
var GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe8kPl5QErboQmrAJ6hSnbkiAJb3h9Mi6_Fntgws_Z1NWj1TQ/formResponse';
var CLOUDINARY_UPLOAD_URL = 'https://rapca.app/upload.php';
var ESPECIES = [
  'Arbutus unedo','Asparagus acutifolius','Chamaerops humilis','Cistus sp.',
  'Crataegus monogyna','Cytisus sp.','Daphne gnidium','Dittrichia viscosa',
  'Foeniculum vulgare','Genista sp.','Halimium sp.','Helichrysum stoechas',
  'Juncus spp.','Juniperus sp.','Lavandula latifolia','Myrtus communis',
  'Olea europaea var. sylvestris','Phillyrea angustifolia','Phlomis purpurea',
  'Pistacia lentiscus','Quercus coccifera','Quercus ilex','Quercus sp.',
  'Retama sphaerocarpa','Rhamnus sp.','Rosa sp.','Rosmarinus officinalis',
  'Rubus ulmifolius','Salvia rosmarinus','Spartium junceum','Thymus sp.','Ulex sp.'
];
var PASTOREO_OPCIONES = ['NP','PL','PM','PI','PMI'];
var OBS_OPCIONES = ['A','B','M','N'];
var OBS_CAMPOS = ['senal','veredas','cagarrutas'];
var OBS_LABELS = ['Señal Paso','Veredas','Cagarrutas'];

// --- Utilidades de seguridad ---
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function safeParse(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch(e) { console.error('JSON parse error for', key, e); return fallback; }
}

function safeStore(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch(e) { console.error('localStorage write error for', key, e); showToast('Error guardando datos locales. Libera espacio.', 'error'); }
}

// --- Estado global ---
var sincronizando = false;
var sesion = null;
var registros = [];
var infraestructuras = [];
var mapa = null;
var mapaMarkers = null;
var gpsWatchId = null;
var gpsPos = null;
var camaraStream = null;
var camaraTipo = '';
var camaraSubtipo = '';
var camaraFacing = 'environment';
var fotoCapturada = null;
var fotoCodigo = '';
var fotosPagina = {};
var ghostingActivo = false;
var ghostOpacity = 50;
var transectoActual = 'T1';
var transectosDatos = {T1:null,T2:null,T3:null};
var editandoRegistro = null;
var deferredPrompt = null;
var db = null;
var compassHeading = 0;
var miniMapaCamera = null;
var anotaciones = [];
var medirActivo = false;
var medirPuntos = [];
var medirLinea = null;
var wmsCapas = [];
var attrData = [];
var kmlCapas = [];
var capaFotosComp = null;
var lightboxFotos = [];
var lightboxIdx = 0;

// --- IndexedDB ---
function abrirDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('RAPCA_Fotos', 5);
    req.onupgradeneeded = function(e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', {keyPath:'codigo'});
      if (!d.objectStoreNames.contains('subidas_pendientes')) d.createObjectStore('subidas_pendientes', {keyPath:'codigo'});
      if (!d.objectStoreNames.contains('fotos_precargadas')) d.createObjectStore('fotos_precargadas', {keyPath:'codigo'});
      if (!d.objectStoreNames.contains('capas_kml')) d.createObjectStore('capas_kml', {keyPath:'nombre'});
      if (!d.objectStoreNames.contains('waypoints_comp')) d.createObjectStore('waypoints_comp', {keyPath:'id'});
      if (!d.objectStoreNames.contains('kml_infraestructuras')) d.createObjectStore('kml_infraestructuras', {keyPath:'nombre'});
    };
    req.onsuccess = function(e) { db = e.target.result; resolve(db); };
    req.onerror = function(e) { reject(e); };
  });
}

function guardarEnDB(store, data) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function obtenerDeDB(store, key) {
  return new Promise(function(resolve, reject) {
    var tx;
    try { tx = db.transaction(store, 'readonly'); }
    catch(e) { return reject(e); }
    tx.onerror = function() { reject(tx.error); };
    tx.onabort = function() { reject(tx.error || new Error('Transacción abortada')); };
    var req = tx.objectStore(store).get(key);
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function obtenerTodosDB(store) {
  return new Promise(function(resolve, reject) {
    var tx;
    try { tx = db.transaction(store, 'readonly'); }
    catch(e) { return reject(e); }
    tx.onerror = function() { reject(tx.error); };
    tx.onabort = function() { reject(tx.error || new Error('Transacción abortada')); };
    var req = tx.objectStore(store).getAll();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function eliminarDeDB(store, key) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// Buscar foto en todas las fuentes disponibles
function buscarFotoData(codigo, tipo, unidad) {
  if (!db) return Promise.resolve(null);

  return obtenerDeDB('fotos', codigo).then(function(f) {
    if (f && f.data) return f.data;
    return obtenerDeDB('fotos_precargadas', codigo);
  }).then(function(f) {
    if (typeof f === 'string') return f;
    if (f && f.data) return f.data;
    return obtenerDeDB('subidas_pendientes', codigo);
  }).then(function(f) {
    if (typeof f === 'string') return f;
    if (f && f.data) return f.data;

    // Último recurso: Cloudinary (si online y tenemos tipo/unidad)
    if (!navigator.onLine || !tipo || !unidad) return null;
    // q_auto + f_auto: calidad adaptativa alta y formato óptimo (WebP/AVIF).
    // w_1600 da buena resolución para rejillas/popups sin descargar el original completo.
    var cloudUrl = 'https://res.cloudinary.com/drnqs1jwl/image/upload/w_1600,q_auto:good,f_auto/rapca/' + tipo + '/' + unidad + '/' + codigo + '.jpg';
    return fetch(cloudUrl, {mode: 'cors'}).then(function(resp) {
      if (!resp.ok) return null;
      return resp.blob();
    }).then(function(blob) {
      if (!blob) return null;
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.readAsDataURL(blob);
      });
    }).catch(function() { return null; });
  });
}

// Reconstruye {tipo, unidad} de un código de foto buscándolo en los registros.
function fotoInfoDesdeCodigo(codigo) {
  if (!codigo || typeof registros === 'undefined' || !registros) return null;
  for (var i = 0; i < registros.length; i++) {
    var r = registros[i];
    if (!r || !r.datos) continue;
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      var lista = r.datos.fotos.split(',');
      for (var j = 0; j < lista.length; j++) {
        if (lista[j].trim() === codigo) return {tipo: r.tipo, unidad: r.unidad};
      }
    }
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      for (var k = 0; k < r.datos.fotosComp.length; k++) {
        var fc = r.datos.fotosComp[k];
        if (fc && (fc.numero === codigo || fc.codigo === codigo)) return {tipo: r.tipo, unidad: r.unidad};
      }
    }
  }
  return null;
}

// Carga la MEJOR versión disponible de una foto (alta resolución) para el visor.
// Prioriza: full-res local aún sin subir → Cloudinary en alta calidad.
// Devuelve Promise<string|null> (data URL o URL remota).
function cargarFotoHD(codigo, tipo, unidad) {
  if (!codigo || !db) return Promise.resolve(null);
  return obtenerDeDB('subidas_pendientes', codigo).then(function(f) {
    if (f && f.data) return f.data; // full-res local (antes de subir)
    if (!tipo || !unidad) {
      var info = fotoInfoDesdeCodigo(codigo);
      if (info) { tipo = tipo || info.tipo; unidad = unidad || info.unidad; }
    }
    if (navigator.onLine && tipo && unidad) {
      // q_auto:best + f_auto: máxima calidad con formato óptimo (WebP/AVIF)
      return 'https://res.cloudinary.com/drnqs1jwl/image/upload/q_auto:best,f_auto/rapca/' + tipo + '/' + unidad + '/' + codigo + '.jpg';
    }
    return null;
  }).catch(function() { return null; });
}

// --- UI: Toast, Vibrar, Utilidades ---
function showToast(msg, tipo) {
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + (tipo || 'info');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add('show'); }, 10);
  setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
}

function vibrar(ms) { if (navigator.vibrate) navigator.vibrate(ms || 15); }

function hoy() { return new Date().toISOString().split('T')[0]; }

function autoZona(prefix) {
  var u = document.getElementById(prefix + '-unidad').value;
  var z = u.length >= 5 ? u.substring(0, 5) : '';
  document.getElementById(prefix + '-zona').value = z;
}

function latLonToUTM(lat, lon) {
  var zone = Math.floor((lon + 180) / 6) + 1;
  var a = 6378137;
  var e = 0.081819191;
  var k0 = 0.9996;
  var latRad = lat * Math.PI / 180;
  var lonRad = lon * Math.PI / 180;
  var lonOrigin = (zone - 1) * 6 - 180 + 3;
  var lonOriginRad = lonOrigin * Math.PI / 180;
  var eccPrimeSquared = (e * e) / (1 - e * e);
  var N = a / Math.sqrt(1 - e * e * Math.sin(latRad) * Math.sin(latRad));
  var T = Math.tan(latRad) * Math.tan(latRad);
  var C = eccPrimeSquared * Math.cos(latRad) * Math.cos(latRad);
  var A = Math.cos(latRad) * (lonRad - lonOriginRad);
  var M = a * ((1 - e * e / 4 - 3 * e * e * e * e / 64 - 5 * e * e * e * e * e * e / 256) * latRad
    - (3 * e * e / 8 + 3 * e * e * e * e / 32 + 45 * e * e * e * e * e * e / 1024) * Math.sin(2 * latRad)
    + (15 * e * e * e * e / 256 + 45 * e * e * e * e * e * e / 1024) * Math.sin(4 * latRad)
    - (35 * e * e * e * e * e * e / 3072) * Math.sin(6 * latRad));
  var easting = k0 * N * (A + (1 - T + C) * A * A * A / 6 + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A * A * A * A * A / 120) + 500000;
  var northing = k0 * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24 + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A * A * A * A * A * A / 720));
  if (lat < 0) northing += 10000000;
  return {zone: zone, letter: lat >= 0 ? 'N' : 'S', easting: Math.round(easting), northing: Math.round(northing)};
}

// --- Install Banner ---
function mostrarInstallBanner() {
  var banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'flex';
}

function ocultarInstallBanner() {
  var banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
}

function cerrarInstallBanner() {
  ocultarInstallBanner();
  localStorage.setItem('rapca_install_dismissed', '1');
}

function instalarApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choice) {
      if (choice.outcome === 'accepted') ocultarInstallBanner();
      deferredPrompt = null;
    });
  }
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('rapca_install_dismissed')) {
    setTimeout(mostrarInstallBanner, 2000);
  }
});

// --- Estado online/offline ---
function actualizarEstado() {
  var online = navigator.onLine;
  var dot = document.getElementById('status-dot');
  var txt = document.getElementById('status-text');
  if (dot) dot.className = 'status-dot ' + (online ? 'online' : 'offline');
  if (txt) txt.textContent = online ? 'En línea' : 'Sin conexión';

  var offlineWarn = document.getElementById('menu-offline-warning');
  var btnSync = document.getElementById('btn-sync-manual');
  var btnFotos = document.getElementById('btn-fotos-manual');
  var pendRegs = misRegistros().filter(function(r) { return !r.enviado; }).length;

  if (!online && (pendRegs > 0)) {
    if (offlineWarn) offlineWarn.style.display = '';
    if (btnSync) btnSync.style.display = '';
  } else {
    if (offlineWarn) offlineWarn.style.display = 'none';
    if (btnSync) btnSync.style.display = 'none';
  }

  if (!online && db) {
    obtenerTodosDB('subidas_pendientes').then(function(items) {
      if (btnFotos) btnFotos.style.display = items.length > 0 ? '' : 'none';
    });
  } else {
    if (btnFotos) btnFotos.style.display = 'none';
  }

  if (online && typeof sincronizarAuto === 'function') sincronizarAuto();
  if (typeof actualizarIndicadorSync === 'function') actualizarIndicadorSync();
  if (typeof actualizarColaSubida === 'function') actualizarColaSubida();
  if (typeof mostrarPrecisionGPS === 'function') mostrarPrecisionGPS();
}

window.addEventListener('online', actualizarEstado);
window.addEventListener('offline', actualizarEstado);

// --- Navegación ---
function irPagina(id) {
  vibrar();
  if (typeof detenerAutoGuardado === 'function') detenerAutoGuardado();
  // Detener GPS del mapa al salir de la página de mapa
  if (id !== 'mapa' && typeof detenerGPSMapa === 'function') detenerGPSMapa();
  // Limpiar editandoRegistro si NO viene de editarRegistro()
  if (!window._desdeEditarRegistro) {
    editandoRegistro = null;
  }
  window._desdeEditarRegistro = false;
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');
  var target = document.getElementById(id + '-page');
  if (target) target.classList.add('active');
  // Empujar estado al historial para proteger botón atrás
  pushHistoryState();

  if (id === 'vp') initFormVP();
  if (id === 'el') initFormEL();
  if (id === 'ei') initFormEI();
  if (id === 'mapa') initMapa();
  if (id === 'panel') renderPanel();
  if (id === 'timeline' && typeof renderTimeline === 'function') renderTimeline();
  if (id === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (id === 'comparador' && typeof renderComparador === 'function') renderComparador();
  if (id === 'galeria' && typeof renderGaleria === 'function') renderGaleria();
  if (id === 'infraestructuras' && typeof renderInfras === 'function') renderInfras();
  if (id === 'admin' && typeof renderAdmin === 'function') renderAdmin();
  if (id === 'precarga' && typeof irPrecarga === 'function') irPrecarga();
}

// --- Teclado: Ctrl+K ---
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    abrirBusqueda();
  }
});

// --- Alto contraste ---
function toggleContraste() {
  document.body.classList.toggle('high-contrast');
  vibrar();
}

// ============================================================
// DATOS — Cargar / Guardar
// ============================================================
function cargarDatos() {
  registros = safeParse('rapca_registros', []);
  infraestructuras = safeParse('rapca_infraestructuras', []);
  actualizarEstado();
  if (typeof actualizarContadorFotos === 'function') actualizarContadorFotos();
  if (typeof reconstruirContadores === 'function') reconstruirContadores();
}

function guardarRegistros() { safeStore('rapca_registros', registros); }
function guardarInfras() { safeStore('rapca_infraestructuras', infraestructuras); }

function misRegistros() {
  if (!sesion) return [];
  if (sesion.rol === 'admin') return registros;
  return registros.filter(function(r) { return r.operador_email === sesion.email; });
}

// ============================================================
// BÚSQUEDA GLOBAL
// ============================================================
function abrirBusqueda() {
  document.getElementById('search-overlay').classList.add('open');
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').focus();
}

function cerrarBusqueda() {
  document.getElementById('search-overlay').classList.remove('open');
}

function busquedaGlobal(val) {
  var results = document.getElementById('search-results');
  if (val.length < 2) { results.innerHTML = ''; return; }
  var html = '';
  var lv = val.toLowerCase();

  infraestructuras.forEach(function(inf, i) {
    var match = Object.values(inf).some(function(v) { return v && v.toString().toLowerCase().indexOf(lv) >= 0; });
    if (match) html += '<div class="search-result" onclick="cerrarBusqueda();irPagina(\'infraestructuras\')"><strong>🏗️ ' + escapeHtml(inf.nombre || inf.idUnidad) + '</strong><small>Infraestructura · ' + escapeHtml(inf.municipio || '') + '</small></div>';
  });

  misRegistros().forEach(function(r) {
    if ((r.unidad || '').toLowerCase().indexOf(lv) >= 0 || (r.zona || '').toLowerCase().indexOf(lv) >= 0) {
      html += '<div class="search-result" onclick="cerrarBusqueda();editarRegistro(' + r.id + ')"><strong>' + escapeHtml(r.tipo) + ' ' + escapeHtml(r.unidad) + '</strong><small>' + escapeHtml(r.fecha) + ' · ' + escapeHtml(r.operador_nombre || '') + '</small></div>';
    }
  });

  var ops = [];
  misRegistros().forEach(function(r) {
    if (r.operador_nombre && r.operador_nombre.toLowerCase().indexOf(lv) >= 0 && ops.indexOf(r.operador_nombre) < 0) {
      ops.push(r.operador_nombre);
      html += '<div class="search-result" onclick="cerrarBusqueda()"><strong>👤 ' + escapeHtml(r.operador_nombre) + '</strong><small>Operador</small></div>';
    }
  });

  results.innerHTML = html || '<div class="search-result" style="color:#888">Sin resultados</div>';
}

// ============================================================
// LIGHTBOX
// ============================================================
function abrirLightboxFoto(src, info) {
  lightboxFotos = [{src: src, info: info}];
  lightboxIdx = 0;
  mostrarLightbox();
}

function abrirLightboxMultiple(fotos, idx) {
  lightboxFotos = fotos;
  lightboxIdx = idx || 0;
  mostrarLightbox();
}

var _lbHDToken = 0;

// Muestra la foto actual del visor: primero el thumbnail (instantáneo) y
// luego, en segundo plano, sustituye por la versión en alta resolución.
function _aplicarFotoLightbox() {
  var foto = lightboxFotos[lightboxIdx];
  if (!foto) return;
  var imgEl = document.getElementById('lb-img');
  imgEl.src = foto.src; // placeholder instantáneo (normalmente el thumbnail)
  document.getElementById('lb-info').textContent = foto.info || '';

  // Si ya tenemos la versión HD cargada para esta foto, no repetir
  if (foto._hd) return;

  var token = ++_lbHDToken;
  var codigo = foto.info;
  // Solo intentar mejora si 'info' parece un código de foto RAPCA
  if (!codigo || !/_(VP|EV)_/.test(codigo)) return;

  cargarFotoHD(codigo, foto.tipo, foto.unidad).then(function(hd) {
    if (!hd || token !== _lbHDToken) return; // el usuario ya cambió de imagen
    // Precargar para evitar parpadeo; solo intercambiar si carga bien
    var pre = new Image();
    pre.onload = function() {
      if (token !== _lbHDToken) return;
      imgEl.src = hd;
      foto.src = hd;   // para que la descarga use también la HD
      foto._hd = true;
    };
    pre.onerror = function() {};
    if (hd.indexOf('data:') !== 0) pre.crossOrigin = 'anonymous';
    pre.src = hd;
  });
}

function mostrarLightbox() {
  var lb = document.getElementById('lightbox');
  lb.classList.add('open');
  _aplicarFotoLightbox();
}

function cerrarLightbox() {
  _lbHDToken++; // invalida cualquier carga HD en curso
  document.getElementById('lightbox').classList.remove('open');
}

function navLightbox(dir) {
  lightboxIdx = (lightboxIdx + dir + lightboxFotos.length) % lightboxFotos.length;
  _aplicarFotoLightbox();
}

function descargarFotoLB() {
  var foto = lightboxFotos[lightboxIdx];
  if (!foto) return;
  var nombre = (foto.info || 'foto') + '.jpg';
  var src = foto.src;
  // Si es data URL o blob local, descarga directa
  if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) {
    var a = document.createElement('a');
    a.href = src;
    a.download = nombre;
    a.click();
    return;
  }
  // URL remota (Cloudinary): el atributo download se ignora por CORS,
  // así que descargamos el blob primero
  fetch(src, {mode: 'cors'}).then(function(resp) {
    if (!resp.ok) throw new Error('No disponible');
    return resp.blob();
  }).then(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
  }).catch(function() {
    // Fallback: abrir en nueva pestaña
    window.open(src, '_blank');
  });
}

// ============================================================
// MODAL
// ============================================================
function abrirModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ============================================================
// CONTADORES DE FOTOS
// ============================================================
function actualizarContadorFotos() {
  if (!db) return;
  obtenerTodosDB('subidas_pendientes').then(function(items) {
    var el = document.getElementById('menu-pending-fotos');
    if (el) el.textContent = items.length;
  });
}

function reconstruirContadores() {
  if (localStorage.getItem('rapca_contadores_reiniciados') === 'true') return;
  var tipos = ['VP', 'EL', 'EI'];
  tipos.forEach(function(tipo) {
    var contadores = safeParse('rapca_contadores_' + tipo, {});
    var codeTipo = (tipo === 'EI' || tipo === 'EL') ? 'EV' : tipo;
    var actualizado = false;

    registros.forEach(function(r) {
      if (!r.datos || !r.unidad) return;

      function procesarCodigo(codigo, subtipo) {
        if (!codigo) return;
        var prefijo = subtipo === 'G' ? r.unidad + '_' + codeTipo + '_' : r.unidad + '_' + codeTipo + '_' + subtipo + '_';
        if (codigo.indexOf(prefijo) !== 0) return;
        var num = parseInt(codigo.substring(prefijo.length), 10);
        if (isNaN(num)) return;
        var contKey = r.unidad + '_' + codeTipo + '_' + subtipo;
        if (!contadores[contKey] || contadores[contKey] < num) {
          contadores[contKey] = num;
          actualizado = true;
        }
      }

      if (r.datos.fotos && typeof r.datos.fotos === 'string') {
        r.datos.fotos.split(',').forEach(function(f) { procesarCodigo(f.trim(), 'G'); });
      }
      if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
        r.datos.fotosComp.forEach(function(fc) { procesarCodigo(fc.numero || '', fc.waypoint || 'W1'); });
      }
    });

    if (actualizado) {
      safeStore('rapca_contadores_' + tipo, contadores);
    }
  });
}

// ============================================================
// LIMPIEZA IndexedDB (fotos > 5 días)
// ============================================================
function limpiarFotosAntiguas() {
  if (!db) return;
  var limite = Date.now() - (5 * 24 * 60 * 60 * 1000);
  // No borrar thumbnails de fotos que aún estén pendientes de subir
  obtenerTodosDB('subidas_pendientes').then(function(pendientes) {
    var pendMap = {};
    pendientes.forEach(function(p) { pendMap[p.codigo] = true; });
    return obtenerTodosDB('fotos').then(function(fotos) {
      fotos.forEach(function(f) {
        if (f.fecha < limite && !pendMap[f.codigo]) eliminarDeDB('fotos', f.codigo);
      });
    });
  }).catch(function(e) { console.warn('limpiarFotosAntiguas:', e); });
}

// ============================================================
// AUTO-GUARDADO al cambiar de página o cerrar
// ============================================================
window.addEventListener('beforeunload', function(e) {
  var activePage = document.querySelector('.page.active');
  if (!activePage) return;
  if (activePage.id === 'vp-page' && typeof guardarBorrador === 'function') guardarBorrador('VP');
  if (activePage.id === 'el-page' && typeof guardarBorrador === 'function') guardarBorrador('EL');
  if (activePage.id === 'ei-page' && typeof guardarBorrador === 'function') guardarBorrador('EI');
  // Pedir confirmación si hay formulario activo
  if (hayFormularioActivo()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    var activePage = document.querySelector('.page.active');
    if (!activePage) return;
    if (activePage.id === 'vp-page' && typeof guardarBorrador === 'function') guardarBorrador('VP');
    if (activePage.id === 'el-page' && typeof guardarBorrador === 'function') guardarBorrador('EL');
    if (activePage.id === 'ei-page' && typeof guardarBorrador === 'function') guardarBorrador('EI');
  }
});

// ============================================================
// PROTECCIÓN BOTÓN ATRÁS (móvil)
// ============================================================
function hayFormularioActivo() {
  var activePage = document.querySelector('.page.active');
  if (!activePage) return false;
  return activePage.id === 'vp-page' || activePage.id === 'el-page' || activePage.id === 'ei-page';
}

function getTipoFormActivo() {
  var activePage = document.querySelector('.page.active');
  if (!activePage) return null;
  if (activePage.id === 'vp-page') return 'VP';
  if (activePage.id === 'el-page') return 'EL';
  if (activePage.id === 'ei-page') return 'EI';
  return null;
}

// Empujar estado al historial para atrapar el botón atrás
function pushHistoryState() {
  history.pushState({rapca: true}, '');
}

var _ignorandoPopstate = false;

window.addEventListener('popstate', function(e) {
  if (_ignorandoPopstate) { _ignorandoPopstate = false; return; }

  // Si hay un modal abierto, cerrarlo en vez de salir
  var modal = document.getElementById('modal-overlay');
  if (modal && modal.classList.contains('open')) {
    pushHistoryState();
    cerrarModal();
    return;
  }

  // Si hay formulario activo, mostrar diálogo de confirmación
  if (hayFormularioActivo()) {
    // Re-empujar estado para no perder la protección
    pushHistoryState();
    mostrarDialogoSalir();
    return;
  }

  // Si estamos en una página que no es inicio, volver a inicio
  var activePage = document.querySelector('.page.active');
  if (activePage && activePage.id !== 'panel-page') {
    pushHistoryState();
    irPagina('panel');
    return;
  }

  // En el panel principal: dejar salir pero re-empujar por si acaso
  pushHistoryState();
});

function mostrarDialogoSalir() {
  var tipo = getTipoFormActivo();
  var nombreForm = tipo === 'VP' ? 'Vegetación Pasto' : tipo === 'EL' ? 'Evaluación Leñosa' : tipo === 'EI' ? 'Evaluación Infraestructura' : 'formulario';

  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">⚠️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">¿Salir del formulario?</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 16px">Tienes datos en <strong>' + nombreForm + '</strong> que no se han guardado.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="guardarYSalir()" style="padding:12px;font-size:14px;border-radius:8px">💾 Guardar borrador y salir</button>';
  html += '<button class="btn btn-outline" onclick="salirSinGuardar()" style="padding:12px;font-size:14px;border-radius:8px;color:#e74c3c;border-color:#e74c3c">🚪 Salir sin guardar</button>';
  html += '<button class="btn btn-outline" onclick="cancelarSalida()" style="padding:12px;font-size:14px;border-radius:8px">↩️ Continuar editando</button>';
  html += '</div></div>';

  abrirModal(html);
}

function guardarYSalir() {
  var tipo = getTipoFormActivo();
  if (tipo && typeof guardarBorrador === 'function') {
    guardarBorrador(tipo);
    showToast('Borrador de ' + tipo + ' guardado', 'success');
  }
  cerrarModal();
  irPagina('panel');
}

function salirSinGuardar() {
  cerrarModal();
  irPagina('panel');
}

function cancelarSalida() {
  cerrarModal();
}

// ============================================================
// INIT APP
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar protección del botón atrás
  pushHistoryState();

  abrirDB().then(function() {
    console.log('IndexedDB lista');
    actualizarContadorFotos();
    limpiarFotosAntiguas();
    if (typeof actualizarColaSubida === 'function') actualizarColaSubida();
    // Migrar waypoints existentes al store persistente
    if (typeof migrarWaypointsDeRegistros === 'function') {
      setTimeout(function() { migrarWaypointsDeRegistros(); }, 2000);
    }
  });
  if (typeof verificarSesion === 'function') verificarSesion();
  actualizarEstado();

  // GPS inicial con precisión
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude, accuracy: pos.coords.accuracy};
      if (typeof mostrarPrecisionGPS === 'function') mostrarPrecisionGPS();
    }, function() {}, {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000});
  }

  // Service worker: registrar y escuchar mensajes
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function(reg) {
      console.log('Service Worker registrado:', reg.scope);
    }).catch(function(e) {
      console.warn('Service Worker no registrado:', e.message);
    });
    navigator.serviceWorker.addEventListener('message', function(e) {
      if (e.data && e.data.tipo === 'sync-registros' && typeof sincronizar === 'function') sincronizar();
    });
  }

  // Cerrar modales/lightbox con Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var lb = document.getElementById('lightbox');
      if (lb && lb.classList.contains('open')) { cerrarLightbox(); return; }
      var mo = document.getElementById('modal-overlay');
      if (mo && mo.classList.contains('open')) { cerrarModal(); return; }
      var so = document.getElementById('search-overlay');
      if (so && so.classList.contains('open')) { cerrarBusqueda(); return; }
    }
  });
});

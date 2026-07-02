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
// ============================================================
// AUTH.JS - Módulo de Autenticación
// Extraído de app.js — funciones de login, sesión y seguridad
// ============================================================
// Nota: Estas funciones dependen de variables globales definidas
// en app.js (sesion, API_BASE, etc.) y funciones como showToast,
// irPagina, cargarDatos, cargarRegistrosServidor, actualizarEstado.
// Todos los scripts comparten el mismo ámbito global del navegador.
// ============================================================

// ============================================================
// VARIABLES
// ============================================================
var loginIntentos = {};

// ============================================================
// INICIO DE SESIÓN (servidor + fallback local)
// ============================================================
function iniciarSesion() {
  var email = document.getElementById('login-email').value.trim();
  var pass = document.getElementById('login-pass').value;
  var errDiv = document.getElementById('login-error');

  if (!email || !pass) { errDiv.textContent = 'Introduce email y contraseña'; errDiv.style.display = 'block'; return; }

  // Rate limiting local (10 intentos en 15 min)
  var ahora = Date.now();
  var key = 'login_' + email;
  if (!loginIntentos[key]) loginIntentos[key] = [];
  loginIntentos[key] = loginIntentos[key].filter(function(t) { return ahora - t < 900000; });
  if (loginIntentos[key].length >= 10) {
    errDiv.textContent = 'Demasiados intentos. Espera 15 minutos.';
    errDiv.style.display = 'block';
    return;
  }
  loginIntentos[key].push(ahora);

  // Intentar servidor primero
  var btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  fetch(API_BASE + 'auth.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({accion: 'login', email: email, password: pass})
  }).then(function(r) { return r.json(); }).then(function(data) {
    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (data.ok) {
      sesion = {token: data.token, email: data.email, nombre: data.nombre, rol: data.rol, id: data.id};
      localStorage.setItem('rapca_sesion', JSON.stringify(sesion));
      // Guardar también en local para acceso offline futuro
      guardarUsuarioLocal(email, pass, data.nombre, data.rol);
      loginExito();
    } else {
      // Servidor respondió y rechazó las credenciales: NO intentar el fallback
      // local (permitía entrar con una contraseña antigua ya cambiada o con un
      // usuario desactivado en el servidor). El acceso offline queda solo para
      // cuando no hay conexión (rama catch).
      errDiv.textContent = data.error || 'Credenciales incorrectas';
      errDiv.style.display = 'block';
    }
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = 'Entrar';
    // Sin conexión al servidor — solo fallback local
    console.log('Servidor no disponible, intentando login local:', err);
    var localOk = loginLocal(email, pass, errDiv);
    if (!localOk) {
      errDiv.textContent = 'Sin conexión al servidor. Solo disponible acceso offline con credenciales guardadas.';
      errDiv.style.display = 'block';
    }
  });
}

// ============================================================
// LOGIN LOCAL (offline, credenciales guardadas)
// ============================================================
function loginLocal(email, pass, errDiv) {
  // Usuarios locales (guardados tras logins previos exitosos con servidor)
  var usuarios = JSON.parse(localStorage.getItem('rapca_usuarios_local') || '[]');
  var found = usuarios.find(function(u) { return u.email === email && u.passHash === simpleHash(pass) && u.activo; });
  if (found) {
    sesion = {token: 'local_' + Date.now(), email: found.email, nombre: found.nombre, rol: found.rol, id: found.id};
    localStorage.setItem('rapca_sesion', JSON.stringify(sesion));
    loginExito();
    return true;
  }
  return false;
}

// ============================================================
// UTILIDADES DE HASH Y ALMACENAMIENTO LOCAL
// ============================================================
function simpleHash(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

function guardarUsuarioLocal(email, pass, nombre, rol) {
  var usuarios = JSON.parse(localStorage.getItem('rapca_usuarios_local') || '[]');
  var exists = usuarios.findIndex(function(u) { return u.email === email; });
  var user = {id: Date.now(), email: email, passHash: simpleHash(pass), nombre: nombre, rol: rol, activo: true};
  if (exists >= 0) usuarios[exists] = user; else usuarios.push(user);
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
}

// ============================================================
// POST-LOGIN Y GESTIÓN DE SESIÓN
// ============================================================
function loginExito() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('menu-user-name').textContent = sesion.nombre + ' (' + sesion.rol + ')';
  document.getElementById('status-user').textContent = sesion.email;
  if (sesion.rol === 'admin') {
    document.getElementById('menu-admin').style.display = 'grid';
    document.getElementById('menu-campo').style.display = 'none';
    document.getElementById('menu-campo-label').style.display = 'none';
    document.getElementById('menu-btn-precarga').style.display = 'none';
  } else {
    document.getElementById('menu-campo').style.display = '';
    document.getElementById('menu-campo-label').style.display = '';
    document.getElementById('menu-btn-precarga').style.display = '';
  }
  showToast('Bienvenido, ' + sesion.nombre, 'success');
  cargarDatos();
  // Descargar registros del servidor (admin ve todos, operador los suyos)
  if (sesion.token && !sesion.token.startsWith('local_') && navigator.onLine) {
    cargarRegistrosServidor().then(function() {
      actualizarEstado();
    }).catch(function(e) {
      console.warn('No se pudieron cargar registros del servidor:', e);
      actualizarEstado();
    });
  }
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  localStorage.removeItem('rapca_pass_tmp');
  // Invalidar token en servidor
  if (sesion && sesion.token && !sesion.token.startsWith('local_')) {
    fetch(API_BASE + 'auth.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify({accion: 'logout'})
    }).catch(function() {});
  }
  localStorage.removeItem('rapca_sesion');
  sesion = null;
  window._serverUsers = null;
  document.getElementById('login-overlay').style.display = 'flex';
  showToast('Sesión cerrada', 'info');
}

function verificarSesion() {
  var sesionGuardada = safeParse('rapca_sesion', null);
  if (sesionGuardada && sesionGuardada.email) {
    sesion = sesionGuardada;
    loginExito();
  } else if (localStorage.getItem('rapca_sesion')) {
    // Sesión corrupta: limpiar para no bloquear el arranque
    localStorage.removeItem('rapca_sesion');
  }
}

// ============================================================
// RE-AUTENTICACIÓN (sesión expirada)
// ============================================================
async function reautenticar() {
  if (!sesion || !sesion.email) return false;

  // Pedir contraseña al usuario
  var pass = prompt('Tu sesión ha expirado. Introduce tu contraseña para continuar:');
  if (!pass) return false;

  try {
    var resp = await fetch(API_BASE + 'auth.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({accion: 'login', email: sesion.email, password: pass})
    });
    var data = await resp.json();
    if (data.ok) {
      sesion = {token: data.token, email: data.email, nombre: data.nombre, rol: data.rol, id: data.id};
      localStorage.setItem('rapca_sesion', JSON.stringify(sesion));
      console.log('Re-autenticación exitosa');
      return true;
    } else {
      showToast('Contraseña incorrecta', 'error');
    }
  } catch (e) {
    console.warn('Re-autenticación falló:', e.message);
  }
  return false;
}
// ============================================================
// forms.js — Form-related code extracted from app.js
// ============================================================

// ============================================================
// AUTO-GUARDADO BORRADORES (mejorado)
// ============================================================
var autoGuardadoInterval = null;

function iniciarAutoGuardado(tipo) {
  if (autoGuardadoInterval) clearInterval(autoGuardadoInterval);
  autoGuardadoInterval = setInterval(function() { guardarBorrador(tipo); }, 30000);
}

function detenerAutoGuardado() {
  if (autoGuardadoInterval) { clearInterval(autoGuardadoInterval); autoGuardadoInterval = null; }
}

function guardarBorrador(tipo) {
  // Nunca sobrescribir el borrador mientras se edita un registro existente:
  // contaminaría la próxima visita nueva con los datos (y fotos) del registro,
  // y al borrar ese duplicado se podrían eliminar fotos del registro original
  if (editandoRegistro) return;
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var data = {};

  // Campos basicos
  var fecha = document.getElementById(prefix + '-fecha');
  var unidad = document.getElementById(prefix + '-unidad');
  if (fecha) data.fecha = fecha.value;
  if (unidad) data.unidad = unidad.value;
  var obs = document.getElementById(prefix + '-observaciones');
  if (obs) data.observaciones = obs.value;

  // Pastoreo
  data.pastoreo = obtenerPastoreo(prefix);

  // Observacion
  data.observacion = obtenerObservacion(prefix);

  // Fotos
  data.fotosPagina = JSON.parse(JSON.stringify(fotosPagina));

  // EI specific data
  if (tipo === 'EI') {
    // Save current transect data first
    transectosDatos[transectoActual] = recogerDatosEI();
    data.transectoActual = transectoActual;
    data.transectosDatos = JSON.parse(JSON.stringify(transectosDatos));
  }

  localStorage.setItem('rapca_borrador_' + tipo.toLowerCase(), JSON.stringify(data));
}

function cargarBorrador(tipo) {
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var data = JSON.parse(localStorage.getItem('rapca_borrador_' + tipo.toLowerCase()) || 'null');
  if (!data) return;

  // Campos basicos
  var fecha = document.getElementById(prefix + '-fecha');
  var unidad = document.getElementById(prefix + '-unidad');
  if (fecha && data.fecha) fecha.value = data.fecha;
  if (unidad && data.unidad) { unidad.value = data.unidad; autoZona(prefix); }
  var obs = document.getElementById(prefix + '-observaciones');
  if (obs && data.observaciones) obs.value = data.observaciones;

  // Pastoreo
  if (data.pastoreo && data.pastoreo.length) {
    var container = document.getElementById(prefix + '-pastoreo-container');
    if (container) {
      for (var p = 0; p < data.pastoreo.length; p++) {
        if (data.pastoreo[p]) {
          var btn = container.querySelector('.pastoreo-btn[data-punto="' + (p + 1) + '"][data-val="' + data.pastoreo[p] + '"]');
          if (btn) btn.classList.add('selected');
        }
      }
    }
  }

  // Observacion
  if (data.observacion) {
    var obsContainer = document.getElementById(prefix + '-obs-container');
    if (obsContainer) {
      for (var i = 0; i < OBS_CAMPOS.length; i++) {
        if (data.observacion[OBS_CAMPOS[i]]) {
          var btn = obsContainer.querySelector('.obs-btn[data-campo="' + OBS_CAMPOS[i] + '"][data-val="' + data.observacion[OBS_CAMPOS[i]] + '"]');
          if (btn) btn.classList.add('selected');
        }
      }
    }
  }

  // Fotos: restaurar y renderizar previews (antes quedaban restauradas pero
  // invisibles: se adjuntaban al guardar sin que el usuario pudiera verlas)
  if (data.fotosPagina && Object.keys(data.fotosPagina).length && typeof restaurarFotosRegistro === 'function') {
    var fp = data.fotosPagina;
    var fcU = [];
    (fp.W1 || []).forEach(function(f) { fcU.push({numero: f.codigo || f, waypoint: 'W1', lat: f.lat || null, lon: f.lon || null}); });
    (fp.W2 || []).forEach(function(f) { fcU.push({numero: f.codigo || f, waypoint: 'W2', lat: f.lat || null, lon: f.lon || null}); });
    var grid = document.getElementById(prefix + '-fotos-preview');
    if (grid) grid.innerHTML = '';
    restaurarFotosRegistro({
      tipo: tipo,
      unidad: (unidad && unidad.value) || '',
      datos: {fotos: (fp.G || []).join(', '), fotosComp: fcU}
    }, prefix);
  }

  // EI specific data
  if (tipo === 'EI') {
    if (data.transectoActual) {
      transectoActual = data.transectoActual;
    }
    if (data.transectosDatos) {
      transectosDatos = data.transectosDatos;
      // Restore current transect data into form
      if (transectosDatos[transectoActual]) {
        restaurarDatosEI(transectosDatos[transectoActual]);
      }
      actualizarTransectoTabs();
    }
  }
}

function limpiarBorrador(tipo) { localStorage.removeItem('rapca_borrador_' + tipo.toLowerCase()); }

// Nota: los listeners 'beforeunload' y 'visibilitychange' para auto-guardar
// borradores están centralizados en app.js (versión más completa con guards).

// ============================================================
// FORMULARIOS VP / EL — Pastoreo + Observacion
// ============================================================
function generarPastoreo(containerId, prefix) {
  var html = '';
  for (var p = 1; p <= 3; p++) {
    html += '<div style="margin-bottom:8px"><label style="font-size:12px;font-weight:700;color:#555">Punto ' + p + '</label>';
    html += '<div class="pastoreo-grid">';
    for (var o = 0; o < PASTOREO_OPCIONES.length; o++) {
      var op = PASTOREO_OPCIONES[o];
      html += '<button class="pastoreo-btn" data-punto="' + p + '" data-val="' + op + '" onclick="selPastoreo(this,\'' + prefix + '\')">' + op + '</button>';
    }
    html += '<button class="pastoreo-btn pastoreo-clear" data-punto="' + p + '" onclick="limpiarPastoreo(this,' + p + ',\'' + prefix + '\')" title="Limpiar">\u2715</button>';
    html += '</div></div>';
  }
  document.getElementById(containerId).innerHTML = html;
}

function limpiarPastoreo(btn, punto, prefix) {
  var container = document.getElementById(prefix + '-pastoreo-container');
  if (!container) return;
  var btns = container.querySelectorAll('.pastoreo-btn[data-punto="' + punto + '"]');
  btns.forEach(function(b) { b.classList.remove('selected'); });
}

function selPastoreo(btn, prefix) {
  vibrar();
  var punto = btn.getAttribute('data-punto');
  var container = btn.parentElement;
  var btns = container.querySelectorAll('.pastoreo-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  btn.classList.add('selected');
}

function obtenerPastoreo(prefix) {
  var result = [];
  var container = document.getElementById(prefix + '-pastoreo-container');
  if (!container) return ['', '', ''];
  for (var p = 1; p <= 3; p++) {
    var sel = container.querySelector('.pastoreo-btn.selected[data-punto="' + p + '"]');
    result.push(sel ? sel.getAttribute('data-val') : '');
  }
  return result;
}

function generarObservacion(containerId, prefix) {
  var html = '';
  for (var i = 0; i < OBS_CAMPOS.length; i++) {
    html += '<div class="obs-row"><span class="lbl">' + OBS_LABELS[i] + '</span>';
    for (var o = 0; o < OBS_OPCIONES.length; o++) {
      var op = OBS_OPCIONES[o];
      html += '<button class="obs-btn" data-campo="' + OBS_CAMPOS[i] + '" data-val="' + op + '" onclick="selObs(this)">' + op + '</button>';
    }
    html += '</div>';
  }
  document.getElementById(containerId).innerHTML = html;
}

function selObs(btn) {
  vibrar();
  var campo = btn.getAttribute('data-campo');
  var row = btn.parentElement;
  var btns = row.querySelectorAll('.obs-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  btn.classList.add('selected');
}

function obtenerObservacion(prefix) {
  var result = {};
  var container = document.getElementById(prefix + '-obs-container');
  if (!container) { OBS_CAMPOS.forEach(function(c) { result[c] = ''; }); return result; }
  for (var i = 0; i < OBS_CAMPOS.length; i++) {
    var sel = container.querySelector('.obs-btn.selected[data-campo="' + OBS_CAMPOS[i] + '"]');
    result[OBS_CAMPOS[i]] = sel ? sel.getAttribute('data-val') : '';
  }
  return result;
}

// ============================================================
// INIT FORMS
// ============================================================
function initFormVP() {
  // Resetear todos los campos del formulario
  document.getElementById('vp-fecha').value = hoy();
  document.getElementById('vp-unidad').value = '';
  document.getElementById('vp-zona').value = '';
  document.getElementById('vp-observaciones').value = '';
  generarPastoreo('vp-pastoreo-container', 'vp');
  generarObservacion('vp-obs-container', 'vp');
  fotosPagina = {};
  document.getElementById('vp-fotos-preview').innerHTML = '';
  if (editandoRegistro && editandoRegistro.tipo === 'VP') {
    // Editando registro existente: cargar sus datos (NO el borrador).
    // No se limpia el borrador: puede pertenecer a una visita nueva a medias.
    cargarRegistroEnForm(editandoRegistro, 'vp');
  } else {
    // Nueva visita: cargar borrador si existe
    cargarBorrador('VP');
  }
  iniciarAutoGuardado('VP');
}

function initFormEL() {
  // Resetear todos los campos del formulario
  document.getElementById('el-fecha').value = hoy();
  document.getElementById('el-unidad').value = '';
  document.getElementById('el-zona').value = '';
  document.getElementById('el-observaciones').value = '';
  generarPastoreo('el-pastoreo-container', 'el');
  generarObservacion('el-obs-container', 'el');
  fotosPagina = {};
  document.getElementById('el-fotos-preview').innerHTML = '';
  if (editandoRegistro && editandoRegistro.tipo === 'EL') {
    // Editando registro existente: cargar sus datos (NO el borrador).
    // No se limpia el borrador: puede pertenecer a una visita nueva a medias.
    cargarRegistroEnForm(editandoRegistro, 'el');
  } else {
    // Nueva visita: cargar borrador si existe
    cargarBorrador('EL');
  }
  iniciarAutoGuardado('EL');
}

function initFormEI() {
  // Resetear todos los campos del formulario
  document.getElementById('ev-fecha').value = hoy();
  document.getElementById('ev-unidad').value = '';
  document.getElementById('ev-zona').value = '';
  document.getElementById('ev-observaciones').value = '';
  generarPastoreo('ev-pastoreo-container', 'ev');
  generarObservacion('ev-obs-container', 'ev');
  generarPlantas();
  generarPalatables();
  generarHerbaceas();
  generarMatorral();
  fotosPagina = {};
  document.getElementById('ev-fotos-preview').innerHTML = '';
  transectoActual = 'T1';
  transectosDatos = {T1: null, T2: null, T3: null};
  actualizarTransectoTabs();
  if (editandoRegistro && editandoRegistro.tipo === 'EI') {
    // Editando registro existente: cargar sus datos (NO el borrador).
    // No se limpia el borrador: puede pertenecer a una visita nueva a medias.
    cargarRegistroEnForm(editandoRegistro, 'ev');
    if (editandoRegistro.datos) {
      // Restaurar todos los transectos si existen
      if (editandoRegistro.datos.transectos) {
        transectosDatos.T1 = editandoRegistro.datos.transectos.T1 || null;
        transectosDatos.T2 = editandoRegistro.datos.transectos.T2 || null;
        transectosDatos.T3 = editandoRegistro.datos.transectos.T3 || null;
      } else {
        // Registro antiguo sin estructura transectos: todo es T1
        transectosDatos.T1 = editandoRegistro.datos;
      }
      // Determinar en qué transecto estaba al guardar
      if (editandoRegistro.transecto && ['T1','T2','T3'].indexOf(editandoRegistro.transecto) >= 0) {
        transectoActual = editandoRegistro.transecto;
      } else {
        transectoActual = 'T1';
      }
      // Restaurar datos del transecto actual en el formulario
      if (transectosDatos[transectoActual]) {
        restaurarDatosEI(transectosDatos[transectoActual]);
      }
      actualizarTransectoTabs();
    }
  } else {
    // Nueva visita: cargar borrador si existe
    cargarBorrador('EI');
  }
  iniciarAutoGuardado('EI');
}

// ============================================================
// EI — Plantas, Palatables, Herbaceas, Matorral
// ============================================================
function generarPlantas() {
  var html = '';
  for (var p = 1; p <= 10; p++) {
    html += '<div class="planta-card"><div class="planta-header"><span>Planta ' + p + '</span>';
    html += '<div class="autocomplete-wrap" style="flex:1"><input type="text" id="ev-planta' + p + '-nombre" placeholder="Especie..." oninput="autocompletarEspecie(this)" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;font-style:italic">';
    html += '<div class="autocomplete-list" id="ev-planta' + p + '-nombre-ac"></div></div></div>';
    html += '<div class="planta-notas">';
    for (var n = 1; n <= 10; n++) {
      html += '<select id="ev-planta' + p + '-n' + n + '" onchange="calcMediaPlanta(' + p + ')"><option value="">-</option>';
      for (var v = 0; v <= 5; v++) html += '<option value="' + v + '">' + v + '</option>';
      html += '</select>';
    }
    html += '<span class="planta-media" id="ev-planta' + p + '-media">\u2014</span></div></div>';
  }
  document.getElementById('ev-plantas-container').innerHTML = html;
}

function generarPalatables() {
  var html = '';
  for (var p = 1; p <= 3; p++) {
    html += '<div class="planta-card" style="border-left-color:var(--c-secondary)"><div class="planta-header"><span style="color:var(--c-secondary)">Palatable ' + p + '</span>';
    html += '<div class="autocomplete-wrap" style="flex:1"><input type="text" id="ev-pal' + p + '-nombre" placeholder="Especie..." oninput="autocompletarEspecie(this)" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;font-style:italic">';
    html += '<div class="autocomplete-list" id="ev-pal' + p + '-nombre-ac"></div></div></div>';
    html += '<div class="planta-notas">';
    for (var n = 1; n <= 15; n++) {
      html += '<select id="ev-pal' + p + '-n' + n + '" onchange="calcMediaPalatable(' + p + ')"><option value="">-</option>';
      for (var v = 0; v <= 5; v++) html += '<option value="' + v + '">' + v + '</option>';
      html += '</select>';
    }
    html += '<span class="planta-media" id="ev-pal' + p + '-media">\u2014</span></div></div>';
  }
  document.getElementById('ev-palatables-container').innerHTML = html;
}

function generarHerbaceas() {
  var html = '';
  for (var h = 1; h <= 7; h++) {
    html += '<div class="herb-row"><label>H' + h + '</label>';
    html += '<select id="ev-herb' + h + '" onchange="calcMediaHerbaceas()"><option value="">-</option>';
    for (var v = 0; v <= 5; v++) html += '<option value="' + v + '">' + v + '</option>';
    html += '</select>';
    if (h === 7) html += '<span class="herb-media" id="ev-herbaceas-media-inline">\u2014</span>';
    else html += '<span></span>';
    html += '</div>';
  }
  document.getElementById('ev-herbaceas-container').innerHTML = html;
}

function generarMatorral() {
  var html = '';
  for (var m = 1; m <= 2; m++) {
    html += '<div class="mat-punto"><h4>Punto ' + m + '</h4>';
    html += '<div class="form-row">';
    html += '<div class="form-group"><label>Cobertura (%)</label><input type="number" id="ev-mat' + m + 'cob" min="0" max="100" oninput="actualizarResumenMatorral()"></div>';
    html += '<div class="form-group"><label>Altura (cm)</label><input type="number" id="ev-mat' + m + 'alt" min="0" oninput="actualizarResumenMatorral()"></div>';
    html += '</div>';
    html += '<div class="form-group"><label>Especie</label><div class="autocomplete-wrap"><input type="text" id="ev-mat' + m + 'esp" placeholder="Especie..." oninput="autocompletarEspecie(this)" style="font-style:italic">';
    html += '<div class="autocomplete-list" id="ev-mat' + m + 'esp-ac"></div></div></div>';
    html += '</div>';
  }
  document.getElementById('ev-matorral-container').innerHTML = html;
}

function calcMediaPlanta(p) {
  var sum = 0, count = 0;
  for (var n = 1; n <= 10; n++) {
    var v = document.getElementById('ev-planta' + p + '-n' + n).value;
    if (v !== '') { sum += parseInt(v); count++; }
  }
  var media = count > 0 ? (sum / count).toFixed(2) : '\u2014';
  document.getElementById('ev-planta' + p + '-media').textContent = media;
  calcMediaGeneralPlantas();
}

function calcMediaGeneralPlantas() {
  var sum = 0, count = 0;
  for (var p = 1; p <= 10; p++) {
    var m = document.getElementById('ev-planta' + p + '-media').textContent;
    if (m !== '\u2014') { sum += parseFloat(m); count++; }
  }
  document.getElementById('ev-plantas-media').textContent = count > 0 ? (sum / count).toFixed(2) : '\u2014';
}

function calcMediaPalatable(p) {
  var sum = 0, count = 0;
  for (var n = 1; n <= 15; n++) {
    var v = document.getElementById('ev-pal' + p + '-n' + n).value;
    if (v !== '') { sum += parseInt(v); count++; }
  }
  var media = count > 0 ? (sum / count).toFixed(2) : '\u2014';
  document.getElementById('ev-pal' + p + '-media').textContent = media;
  calcMediaGeneralPalatables();
}

function calcMediaGeneralPalatables() {
  var sum = 0, count = 0;
  for (var p = 1; p <= 3; p++) {
    var m = document.getElementById('ev-pal' + p + '-media').textContent;
    if (m !== '\u2014') { sum += parseFloat(m); count++; }
  }
  document.getElementById('ev-palatables-media').textContent = count > 0 ? (sum / count).toFixed(2) : '\u2014';
}

function calcMediaHerbaceas() {
  var sum = 0, count = 0;
  for (var h = 1; h <= 7; h++) {
    var v = document.getElementById('ev-herb' + h).value;
    if (v !== '') { sum += parseInt(v); count++; }
  }
  var media = count > 0 ? (sum / count).toFixed(2) : '\u2014';
  document.getElementById('ev-herbaceas-media').textContent = media;
  var inline = document.getElementById('ev-herbaceas-media-inline');
  if (inline) inline.textContent = media;
}

function actualizarResumenMatorral() {
  var e1 = document.getElementById('ev-mat1cob'), e2 = document.getElementById('ev-mat2cob');
  var e3 = document.getElementById('ev-mat1alt'), e4 = document.getElementById('ev-mat2alt');
  if (!e1 || !e2 || !e3 || !e4) return;
  var c1 = parseFloat(e1.value) || 0;
  var c2 = parseFloat(e2.value) || 0;
  var a1 = parseFloat(e3.value) || 0;
  var a2 = parseFloat(e4.value) || 0;
  var mediaCob = (c1 + c2) / 2;
  var mediaAlt = (a1 + a2) / 2;
  var volumen = (mediaCob / 100) * (mediaAlt / 100) * 10000;
  var elCob = document.getElementById('ev-mat-cob-media');
  var elAlt = document.getElementById('ev-mat-alt-media');
  var elVol = document.getElementById('ev-mat-volumen');
  var elRes = document.getElementById('ev-mat-resultado');
  if (elCob) elCob.textContent = mediaCob.toFixed(1);
  if (elAlt) elAlt.textContent = mediaAlt.toFixed(1);
  if (elVol) elVol.textContent = volumen.toFixed(2) + ' m\u00B3/ha';
  if (elRes) elRes.style.display = 'block';
}

// --- Autocomplete especies ---
function autocompletarEspecie(input) {
  var val = input.value.toLowerCase();
  var acId = input.id + '-ac';
  var acList = document.getElementById(acId);
  if (!acList) return;
  if (val.length < 2) { acList.classList.remove('open'); return; }
  var matches = ESPECIES.filter(function(e) { return e.toLowerCase().indexOf(val) >= 0; });
  if (matches.length === 0) { acList.classList.remove('open'); return; }
  var html = '';
  for (var i = 0; i < matches.length && i < 8; i++) {
    html += '<div onclick="selEspecie(this,\'' + input.id + '\')" style="font-style:italic">' + matches[i] + '</div>';
  }
  acList.innerHTML = html;
  acList.classList.add('open');
}

function selEspecie(div, inputId) {
  document.getElementById(inputId).value = div.textContent;
  div.parentElement.classList.remove('open');
}

// Cerrar autocomplete al clickar fuera
document.addEventListener('click', function(e) {
  var lists = document.querySelectorAll('.autocomplete-list.open');
  for (var i = 0; i < lists.length; i++) {
    if (!lists[i].parentElement.contains(e.target)) lists[i].classList.remove('open');
  }
});

// --- Aplicar selecciones de pastoreo/observación (limpia y re-selecciona) ---
function aplicarPastoreo(prefix, valores) {
  var container = document.getElementById(prefix + '-pastoreo-container');
  if (!container) return;
  container.querySelectorAll('.pastoreo-btn.selected').forEach(function(b) { b.classList.remove('selected'); });
  if (!valores) return;
  for (var p = 0; p < valores.length; p++) {
    if (valores[p]) {
      var btn = container.querySelector('.pastoreo-btn[data-punto="' + (p + 1) + '"][data-val="' + valores[p] + '"]');
      if (btn) btn.classList.add('selected');
    }
  }
}

function aplicarObservacion(prefix, obj) {
  var container = document.getElementById(prefix + '-obs-container');
  if (!container) return;
  container.querySelectorAll('.obs-btn.selected').forEach(function(b) { b.classList.remove('selected'); });
  if (!obj) return;
  for (var i = 0; i < OBS_CAMPOS.length; i++) {
    if (obj[OBS_CAMPOS[i]]) {
      var btn = container.querySelector('.obs-btn[data-campo="' + OBS_CAMPOS[i] + '"][data-val="' + obj[OBS_CAMPOS[i]] + '"]');
      if (btn) btn.classList.add('selected');
    }
  }
}

// --- Transecto tabs ---
function cambiarTransecto(t) {
  vibrar();
  if (t === transectoActual) return;
  // Save current transect data first
  transectosDatos[transectoActual] = recogerDatosEI();
  showToast('Transecto ' + transectoActual + ' guardado temporalmente', 'info');
  transectoActual = t;
  actualizarTransectoTabs();
  // Si hay datos guardados para este transecto, restaurarlos
  if (transectosDatos[t]) {
    restaurarDatosEI(transectosDatos[t]);
  } else {
    limpiarFormEI();
  }
}

function actualizarTransectoTabs() {
  var tabs = document.querySelectorAll('.transecto-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active', 'done');
    var t = tabs[i].getAttribute('data-t');
    if (t === transectoActual) tabs[i].classList.add('active');
    if (transectosDatos[t]) tabs[i].classList.add('done');
  }
}

function limpiarFormEI() {
  // Limpiar pastoreo, observación y observaciones (individuales por transecto)
  aplicarPastoreo('ev', null);
  aplicarObservacion('ev', null);
  var obsTxt = document.getElementById('ev-observaciones');
  if (obsTxt) obsTxt.value = '';
  // Limpiar plantas
  for (var p = 1; p <= 10; p++) {
    document.getElementById('ev-planta' + p + '-nombre').value = '';
    for (var n = 1; n <= 10; n++) document.getElementById('ev-planta' + p + '-n' + n).value = '';
    document.getElementById('ev-planta' + p + '-media').textContent = '\u2014';
  }
  document.getElementById('ev-plantas-media').textContent = '\u2014';
  // Limpiar palatables
  for (var p = 1; p <= 3; p++) {
    document.getElementById('ev-pal' + p + '-nombre').value = '';
    for (var n = 1; n <= 15; n++) document.getElementById('ev-pal' + p + '-n' + n).value = '';
    document.getElementById('ev-pal' + p + '-media').textContent = '\u2014';
  }
  document.getElementById('ev-palatables-media').textContent = '\u2014';
  // Limpiar herbaceas
  for (var h = 1; h <= 7; h++) document.getElementById('ev-herb' + h).value = '';
  document.getElementById('ev-herbaceas-media').textContent = '\u2014';
  var herbInline = document.getElementById('ev-herbaceas-media-inline');
  if (herbInline) herbInline.textContent = '\u2014';
  // Limpiar matorral
  for (var m = 1; m <= 2; m++) {
    document.getElementById('ev-mat' + m + 'cob').value = '';
    document.getElementById('ev-mat' + m + 'alt').value = '';
    document.getElementById('ev-mat' + m + 'esp').value = '';
  }
  document.getElementById('ev-mat-resultado').style.display = 'none';
  // Limpiar fotos del transecto (cada transecto tiene las suyas)
  fotosPagina = {};
  var fotoGrid = document.getElementById('ev-fotos-preview');
  if (fotoGrid) fotoGrid.innerHTML = '';
  if (typeof actualizarBtnEliminarFotos === 'function') actualizarBtnEliminarFotos('ev');
}

// ============================================================
// GUARDAR REGISTROS VP / EL / EI
// ============================================================
function guardarVP() {
  if (!sesion) { showToast('Sesión no válida. Vuelve a iniciar sesión.', 'error'); return; }
  var fecha = document.getElementById('vp-fecha').value;
  var unidad = document.getElementById('vp-unidad').value.trim();
  var zona = document.getElementById('vp-zona').value;
  if (!fecha || !unidad) { showToast('Fecha y Unidad son obligatorios', 'error'); return; }

  var fotos = fotosPagina['G'] || [];
  var fotosComp = [];
  if (fotosPagina['W1']) fotosPagina['W1'].forEach(function(f) { fotosComp.push({numero: f.codigo || f, waypoint: 'W1', lat: f.lat || null, lon: f.lon || null}); });
  if (fotosPagina['W2']) fotosPagina['W2'].forEach(function(f) { fotosComp.push({numero: f.codigo || f, waypoint: 'W2', lat: f.lat || null, lon: f.lon || null}); });

  var reg = {
    id: editandoRegistro ? editandoRegistro.id : Date.now(),
    tipo: 'VP',
    fecha: fecha,
    zona: zona,
    unidad: unidad,
    transecto: '',
    datos: {
      pastoreo: obtenerPastoreo('vp'),
      observacionPastoreo: obtenerObservacion('vp'),
      fotos: fotos.join(', '),
      fotosComp: fotosComp,
      observaciones: document.getElementById('vp-observaciones').value
    },
    enviado: false,
    lat: gpsPos ? gpsPos.lat : null,
    lon: gpsPos ? gpsPos.lon : null,
    operador_email: sesion.email,
    operador_nombre: sesion.nombre
  };

  if (editandoRegistro) {
    var idx = registros.findIndex(function(r) { return r.id === editandoRegistro.id; });
    if (idx >= 0) registros[idx] = reg;
    editandoRegistro = null;
  } else {
    registros.push(reg);
  }

  guardarRegistros();
  limpiarBorrador('VP');
  fotosPagina = {};
  detenerAutoGuardado();
  vibrar(50);
  if (navigator.onLine) {
    showToast('Visita Previa guardada. Sincronizando...', 'success');
    sincronizarAuto();
  } else {
    showToast('Visita Previa guardada. Sin conexion \u2014 se sincronizara al conectar.', 'info');
  }
  irPagina('menu');
}

function guardarEL() {
  if (!sesion) { showToast('Sesión no válida. Vuelve a iniciar sesión.', 'error'); return; }
  var fecha = document.getElementById('el-fecha').value;
  var unidad = document.getElementById('el-unidad').value.trim();
  var zona = document.getElementById('el-zona').value;
  if (!fecha || !unidad) { showToast('Fecha y Unidad son obligatorios', 'error'); return; }

  // Evitar 2 fichas EL el mismo día para la misma unidad
  if (!editandoRegistro) {
    var dupEL = registros.find(function(r) {
      return r.tipo === 'EL' && r.fecha === fecha && r.unidad === unidad && r.operador_email === sesion.email;
    });
    if (dupEL) {
      showToast('Ya existe una Evaluación Ligera de ' + unidad + ' con fecha ' + fecha + '. Edítala desde Registros.', 'error');
      return;
    }
  }

  var fotos = fotosPagina['G'] || [];
  var fotosComp = [];
  if (fotosPagina['W1']) fotosPagina['W1'].forEach(function(f) { fotosComp.push({numero: f.codigo || f, waypoint: 'W1', lat: f.lat || null, lon: f.lon || null}); });
  if (fotosPagina['W2']) fotosPagina['W2'].forEach(function(f) { fotosComp.push({numero: f.codigo || f, waypoint: 'W2', lat: f.lat || null, lon: f.lon || null}); });

  var reg = {
    id: editandoRegistro ? editandoRegistro.id : Date.now(),
    tipo: 'EL',
    fecha: fecha,
    zona: zona,
    unidad: unidad,
    transecto: '',
    datos: {
      pastoreo: obtenerPastoreo('el'),
      observacionPastoreo: obtenerObservacion('el'),
      fotos: fotos.join(', '),
      fotosComp: fotosComp,
      observaciones: document.getElementById('el-observaciones').value
    },
    enviado: false,
    lat: gpsPos ? gpsPos.lat : null,
    lon: gpsPos ? gpsPos.lon : null,
    operador_email: sesion.email,
    operador_nombre: sesion.nombre
  };

  if (editandoRegistro) {
    var idx = registros.findIndex(function(r) { return r.id === editandoRegistro.id; });
    if (idx >= 0) registros[idx] = reg;
    editandoRegistro = null;
  } else {
    registros.push(reg);
  }

  guardarRegistros();
  limpiarBorrador('EL');
  fotosPagina = {};
  detenerAutoGuardado();
  vibrar(50);
  if (navigator.onLine) {
    showToast('Evaluacion Ligera guardada. Sincronizando...', 'success');
    sincronizarAuto();
  } else {
    showToast('Evaluacion Ligera guardada. Sin conexion \u2014 se sincronizara al conectar.', 'info');
  }
  irPagina('menu');
}

// ¿Tiene el transecto algún dato real introducido por el operador?
// (cambiar de pestaña materializa transectos "visitados" como objetos con
// todo vacío, que no deben confundirse con transectos rellenados)
function esTransectoVacio(t) {
  if (!t) return true;
  function algunaPlanta(arr) {
    return arr && arr.some(function(x) {
      return x && (x.nombre || (x.notas && x.notas.some(function(n) { return n !== null && n !== ''; })));
    });
  }
  if (algunaPlanta(t.plantas) || algunaPlanta(t.palatables)) return false;
  if (t.herbaceas && t.herbaceas.some(function(n) { return n !== null && n !== ''; })) return false;
  if (t.matorral) {
    var p1 = t.matorral.punto1 || {}, p2 = t.matorral.punto2 || {};
    if (p1.cobertura || p1.altura || p1.especie || p2.cobertura || p2.altura || p2.especie) return false;
  }
  if (t.pastoreo && t.pastoreo.some(function(v) { return v; })) return false;
  if (t.observacionPastoreo) {
    for (var k in t.observacionPastoreo) { if (t.observacionPastoreo[k]) return false; }
  }
  if (t.fotos) return false;
  if (t.fotosComp && t.fotosComp.length) return false;
  if (t.observaciones) return false;
  return true;
}

function recogerDatosEI() {
  var plantas = [];
  for (var p = 1; p <= 10; p++) {
    var notas = [];
    for (var n = 1; n <= 10; n++) {
      var v = document.getElementById('ev-planta' + p + '-n' + n).value;
      notas.push(v !== '' ? parseInt(v) : null);
    }
    plantas.push({
      nombre: document.getElementById('ev-planta' + p + '-nombre').value,
      notas: notas,
      media: document.getElementById('ev-planta' + p + '-media').textContent
    });
  }
  var palatables = [];
  for (var p = 1; p <= 3; p++) {
    var notas = [];
    for (var n = 1; n <= 15; n++) {
      var v = document.getElementById('ev-pal' + p + '-n' + n).value;
      notas.push(v !== '' ? parseInt(v) : null);
    }
    palatables.push({
      nombre: document.getElementById('ev-pal' + p + '-nombre').value,
      notas: notas,
      media: document.getElementById('ev-pal' + p + '-media').textContent
    });
  }
  var herbaceas = [];
  for (var h = 1; h <= 7; h++) {
    var v = document.getElementById('ev-herb' + h).value;
    herbaceas.push(v !== '' ? parseInt(v) : null);
  }
  var matorral = {
    punto1: {
      cobertura: parseFloat(document.getElementById('ev-mat1cob').value) || 0,
      altura: parseFloat(document.getElementById('ev-mat1alt').value) || 0,
      especie: document.getElementById('ev-mat1esp').value
    },
    punto2: {
      cobertura: parseFloat(document.getElementById('ev-mat2cob').value) || 0,
      altura: parseFloat(document.getElementById('ev-mat2alt').value) || 0,
      especie: document.getElementById('ev-mat2esp').value
    }
  };
  matorral.mediaCob = (matorral.punto1.cobertura + matorral.punto2.cobertura) / 2;
  matorral.mediaAlt = (matorral.punto1.altura + matorral.punto2.altura) / 2;
  matorral.volumen = ((matorral.mediaCob / 100) * (matorral.mediaAlt / 100) * 10000).toFixed(2);

  return {
    pastoreo: obtenerPastoreo('ev'),
    observacionPastoreo: obtenerObservacion('ev'),
    plantas: plantas,
    plantasMedia: document.getElementById('ev-plantas-media').textContent,
    palatables: palatables,
    palatablesMedia: document.getElementById('ev-palatables-media').textContent,
    herbaceas: herbaceas,
    herbaceasMedia: document.getElementById('ev-herbaceas-media').textContent,
    matorral: matorral,
    fotos: (fotosPagina['G'] || []).join(', '),
    fotosComp: (function() {
      var fc = [];
      if (fotosPagina['W1']) fotosPagina['W1'].forEach(function(f) { fc.push({numero: f.codigo || f, waypoint: 'W1', lat: f.lat || null, lon: f.lon || null}); });
      if (fotosPagina['W2']) fotosPagina['W2'].forEach(function(f) { fc.push({numero: f.codigo || f, waypoint: 'W2', lat: f.lat || null, lon: f.lon || null}); });
      return fc;
    })(),
    observaciones: document.getElementById('ev-observaciones').value
  };
}

function restaurarDatosEI(datos) {
  if (!datos) return;
  // Restaurar pastoreo y observación propios del transecto
  // (cada transecto tiene sus grados de pastoreo y observación individuales)
  aplicarPastoreo('ev', datos.pastoreo);
  aplicarObservacion('ev', datos.observacionPastoreo);
  var obsTxt = document.getElementById('ev-observaciones');
  if (obsTxt) obsTxt.value = datos.observaciones || '';
  // Restaurar plantas
  if (datos.plantas) {
    for (var p = 0; p < datos.plantas.length && p < 10; p++) {
      var pl = datos.plantas[p];
      if (!pl) continue;
      document.getElementById('ev-planta' + (p+1) + '-nombre').value = pl.nombre || '';
      if (pl.notas && pl.notas.length) {
        for (var n = 0; n < pl.notas.length && n < 10; n++) {
          document.getElementById('ev-planta' + (p+1) + '-n' + (n+1)).value = pl.notas[n] !== null ? pl.notas[n] : '';
        }
      }
      document.getElementById('ev-planta' + (p+1) + '-media').textContent = pl.media || '\u2014';
    }
  }
  if (datos.palatables) {
    for (var p = 0; p < datos.palatables.length && p < 3; p++) {
      var pal = datos.palatables[p];
      if (!pal) continue;
      document.getElementById('ev-pal' + (p+1) + '-nombre').value = pal.nombre || '';
      if (pal.notas && pal.notas.length) {
        for (var n = 0; n < pal.notas.length && n < 15; n++) {
          document.getElementById('ev-pal' + (p+1) + '-n' + (n+1)).value = pal.notas[n] !== null ? pal.notas[n] : '';
        }
      }
      document.getElementById('ev-pal' + (p+1) + '-media').textContent = pal.media || '\u2014';
    }
  }
  if (datos.herbaceas) {
    for (var h = 0; h < datos.herbaceas.length && h < 7; h++) {
      document.getElementById('ev-herb' + (h+1)).value = datos.herbaceas[h] !== null ? datos.herbaceas[h] : '';
    }
  }
  if (datos.matorral) {
    var p1 = datos.matorral.punto1 || {};
    var p2 = datos.matorral.punto2 || {};
    document.getElementById('ev-mat1cob').value = p1.cobertura || '';
    document.getElementById('ev-mat1alt').value = p1.altura || '';
    document.getElementById('ev-mat1esp').value = p1.especie || '';
    document.getElementById('ev-mat2cob').value = p2.cobertura || '';
    document.getElementById('ev-mat2alt').value = p2.altura || '';
    document.getElementById('ev-mat2esp').value = p2.especie || '';
    actualizarResumenMatorral();
  }
  // Restaurar medias generales (antes quedaban las del transecto anterior)
  document.getElementById('ev-plantas-media').textContent = datos.plantasMedia || '—';
  document.getElementById('ev-palatables-media').textContent = datos.palatablesMedia || '—';
  document.getElementById('ev-herbaceas-media').textContent = datos.herbaceasMedia || '—';
  var herbInline = document.getElementById('ev-herbaceas-media-inline');
  if (herbInline) herbInline.textContent = datos.herbaceasMedia || '—';
  // Restaurar las fotos propias del transecto (cada transecto tiene las suyas)
  restaurarFotosEI(datos);
}

// Restaura fotosPagina y el preview con las fotos de un transecto concreto
function restaurarFotosEI(datos) {
  var grid = document.getElementById('ev-fotos-preview');
  if (grid) grid.innerHTML = '';
  if (typeof restaurarFotosRegistro !== 'function') return;
  restaurarFotosRegistro({
    tipo: 'EI',
    unidad: (document.getElementById('ev-unidad') || {}).value || '',
    datos: {
      fotos: (datos && datos.fotos) || '',
      fotosComp: (datos && datos.fotosComp) || []
    }
  }, 'ev');
}

function guardarEI() {
  if (!sesion) { showToast('Sesión no válida. Vuelve a iniciar sesión.', 'error'); return; }
  var fecha = document.getElementById('ev-fecha').value;
  var unidad = document.getElementById('ev-unidad').value.trim();
  var zona = document.getElementById('ev-zona').value;
  if (!fecha || !unidad) { showToast('Fecha y Unidad son obligatorios', 'error'); return; }

  // Save current transect data
  transectosDatos[transectoActual] = recogerDatosEI();

  // Evitar 2 fichas EI el mismo día para la misma unidad:
  // si ya existe una, se actualiza esa misma ficha fusionando los transectos
  // (así T1, T2 y T3 quedan en una única ficha, no en tres)
  if (!editandoRegistro) {
    var existenteEI = registros.find(function(r) {
      return r.tipo === 'EI' && r.fecha === fecha && r.unidad === unidad && r.operador_email === sesion.email;
    });
    if (existenteEI) {
      // Registros antiguos sin datos.transectos: sus datos top-level son T1
      var prevT = (existenteEI.datos && existenteEI.datos.transectos) ||
                  {T1: existenteEI.datos || null, T2: null, T3: null};
      // Un transecto visitado pero SIN datos reales (objeto vacío) no debe
      // pisar un transecto ya guardado en la ficha existente
      if (esTransectoVacio(transectosDatos.T1) && prevT.T1) transectosDatos.T1 = prevT.T1;
      if (esTransectoVacio(transectosDatos.T2) && prevT.T2) transectosDatos.T2 = prevT.T2;
      if (esTransectoVacio(transectosDatos.T3) && prevT.T3) transectosDatos.T3 = prevT.T3;
      editandoRegistro = existenteEI;
    }
  }

  // Build combined datos with all 3 transects
  var datosT1 = transectosDatos['T1'] || {};
  var datosT2 = transectosDatos['T2'] || null;
  var datosT3 = transectosDatos['T3'] || null;

  // T1 is the primary/default, plus all transects stored together
  var datosCombinados = {};
  var keys = Object.keys(datosT1);
  for (var i = 0; i < keys.length; i++) {
    datosCombinados[keys[i]] = datosT1[keys[i]];
  }
  datosCombinados.transectos = {T1: datosT1, T2: datosT2, T3: datosT3};

  // Fotos a nivel de ficha: unión de las fotos de los 3 transectos
  // (cada transecto guarda las suyas; la ficha las muestra todas)
  var fotosU = [], fotosCompU = [];
  [datosT1, datosT2, datosT3].forEach(function(dt) {
    if (!dt) return;
    if (dt.fotos) {
      dt.fotos.split(',').forEach(function(c) {
        c = c.trim();
        if (c && fotosU.indexOf(c) < 0) fotosU.push(c);
      });
    }
    if (dt.fotosComp) {
      dt.fotosComp.forEach(function(fc) {
        if (!fotosCompU.some(function(x) { return x.numero === fc.numero; })) fotosCompU.push(fc);
      });
    }
  });
  datosCombinados.fotos = fotosU.join(', ');
  datosCombinados.fotosComp = fotosCompU;

  var reg = {
    id: editandoRegistro ? editandoRegistro.id : Date.now(),
    tipo: 'EI',
    fecha: fecha,
    zona: zona,
    unidad: unidad,
    transecto: transectoActual,
    datos: datosCombinados,
    enviado: false,
    lat: gpsPos ? gpsPos.lat : null,
    lon: gpsPos ? gpsPos.lon : null,
    operador_email: sesion.email,
    operador_nombre: sesion.nombre
  };

  if (editandoRegistro) {
    var idx = registros.findIndex(function(r) { return r.id === editandoRegistro.id; });
    if (idx >= 0) registros[idx] = reg;
    editandoRegistro = null;
  } else {
    registros.push(reg);
  }

  guardarRegistros();
  fotosPagina = {};
  vibrar(50);
  if (navigator.onLine) {
    showToast('Evaluacion Intensiva guardada. Sincronizando...', 'success');
    sincronizarAuto();
  } else {
    showToast('Evaluacion Intensiva guardada. Sin conexion \u2014 se sincronizara al conectar.', 'info');
  }

  // Si es T3, resetear completamente
  if (transectoActual === 'T3') {
    // La unidad est\u00e1 completa: ya no hace falta auto-guardar borrador
    detenerAutoGuardado();
    transectosDatos = {T1: null, T2: null, T3: null};
    transectoActual = 'T1';
    fotosPagina = {};
    document.getElementById('ev-unidad').value = '';
    document.getElementById('ev-zona').value = '';
    limpiarFormEI();
    actualizarTransectoTabs();
    limpiarBorrador('EI');
    showToast('Unidad completada. Formulario reseteado.', 'info');
  } else {
    // Avanzar al siguiente transecto SIN re-recoger el formulario:
    // fotosPagina ya se vació y llamar aquí a cambiarTransecto volvería a
    // ejecutar recogerDatosEI, borrando las fotos del transecto recién guardado
    var next = transectoActual === 'T1' ? 'T2' : 'T3';
    transectoActual = next;
    actualizarTransectoTabs();
    if (transectosDatos[next]) restaurarDatosEI(transectosDatos[next]);
    else limpiarFormEI();
  }
}
// RAPCA Campo — camera.js — Cámara y fotos
// ============================================================

// Objeto ImageCapture para tomar fotos a resolución nativa del sensor
var imageCaptureObj = null;

// Heading de brújula en grados (0-359, sentido horario desde el Norte geográfico)
var compassHeading = null;

// Crea el objeto ImageCapture a partir del stream actual (si el navegador lo soporta)
function crearImageCapture(stream) {
  imageCaptureObj = null;
  try {
    var vt = stream.getVideoTracks()[0];
    if (window.ImageCapture && vt) {
      imageCaptureObj = new ImageCapture(vt);
    }
  } catch(e) {
    imageCaptureObj = null;
  }
}

function abrirCamara(tipo, subtipo) {
  camaraTipo = tipo;
  camaraSubtipo = subtipo;
  vibrar();

  // Generar código de foto
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || 'SIN_ID';
  // EI y EL usan 'EV' en el código de foto, VP usa 'VP'
  var codeTipo = (tipo === 'EI' || tipo === 'EL') ? 'EV' : tipo;
  var contKey = unidad + '_' + codeTipo + '_' + subtipo;
  var contadores = safeParse('rapca_contadores_' + tipo, {});

  // Buscar el máximo número usado en TODOS los registros (locales + servidor) para evitar colisiones
  var maxEnRegistros = 0;
  var prefijoBuscar = subtipo === 'G' ? unidad + '_' + codeTipo + '_' : unidad + '_' + codeTipo + '_' + subtipo + '_';

  function extraerNumDeCodigo(codigo) {
    if (!codigo || codigo.indexOf(prefijoBuscar) !== 0) return 0;
    var num = parseInt(codigo.substring(prefijoBuscar.length));
    return isNaN(num) ? 0 : num;
  }

  registros.forEach(function(r) {
    if (!r.datos) return;
    // Buscar en fotos generales
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').forEach(function(f) {
        var n = extraerNumDeCodigo(f.trim());
        if (n > maxEnRegistros) maxEnRegistros = n;
      });
    }
    // Buscar en fotos comparativas (fotosComp)
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        var n = extraerNumDeCodigo(fc.numero || '');
        if (n > maxEnRegistros) maxEnRegistros = n;
      });
    }
  });

  // También buscar en fotos de la página/formulario actual
  var todasFotosPagina = [].concat(fotosPagina['G'] || [], fotosPagina['W1'] || [], fotosPagina['W2'] || []);
  todasFotosPagina.forEach(function(f) {
    var codigo = typeof f === 'object' ? f.codigo : f;
    var n = extraerNumDeCodigo(codigo);
    if (n > maxEnRegistros) maxEnRegistros = n;
  });

  // Y en los borradores sin guardar de los 3 formularios: EL y EI comparten
  // el prefijo 'EV', y una foto de un borrador EL podía colisionar (y
  // sobrescribirse en IndexedDB) con una nueva foto EI de la misma unidad
  ['vp', 'el', 'ei'].forEach(function(bt) {
    var borr = safeParse('rapca_borrador_' + bt, null);
    if (!borr) return;
    function escanearFP(fp) {
      if (!fp) return;
      [].concat(fp['G'] || [], fp['W1'] || [], fp['W2'] || []).forEach(function(f) {
        var codigo = typeof f === 'object' ? f.codigo : f;
        var n = extraerNumDeCodigo(codigo);
        if (n > maxEnRegistros) maxEnRegistros = n;
      });
    }
    escanearFP(borr.fotosPagina);
    // Borrador EI: fotos guardadas dentro de cada transecto
    if (borr.transectosDatos) {
      ['T1', 'T2', 'T3'].forEach(function(t) {
        var dt = borr.transectosDatos[t];
        if (!dt) return;
        if (dt.fotos && typeof dt.fotos === 'string') {
          dt.fotos.split(',').forEach(function(f) {
            var n = extraerNumDeCodigo(f.trim());
            if (n > maxEnRegistros) maxEnRegistros = n;
          });
        }
        if (dt.fotosComp && Array.isArray(dt.fotosComp)) {
          dt.fotosComp.forEach(function(fc) {
            var n = extraerNumDeCodigo(fc.numero || '');
            if (n > maxEnRegistros) maxEnRegistros = n;
          });
        }
      });
    }
  });

  // Usar el mayor entre el contador localStorage y el máximo en registros
  // Si se reiniciaron manualmente, ignorar registros anteriores
  var contadorLocal = contadores[contKey] || 0;
  var reiniciados = localStorage.getItem('rapca_contadores_reiniciados') === 'true';
  var nuevoContador = reiniciados ? contadorLocal + 1 : Math.max(contadorLocal, maxEnRegistros) + 1;
  contadores[contKey] = nuevoContador;
  safeStore('rapca_contadores_' + tipo, contadores);
  // Quitar flag de reinicio tras la primera foto nueva
  if (reiniciados) localStorage.removeItem('rapca_contadores_reiniciados');

  if (subtipo === 'G') {
    fotoCodigo = unidad + '_' + codeTipo + '_' + nuevoContador;
  } else {
    fotoCodigo = unidad + '_' + codeTipo + '_' + subtipo + '_' + nuevoContador;
  }

  document.getElementById('cam-code').textContent = fotoCodigo;

  // Abrir cámara
  var constraints = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    camaraStream = stream;
    var video = document.getElementById('camera-video');
    video.srcObject = stream;
    document.getElementById('camera-modal').classList.add('open');
    iniciarOverlayCamara();
    cargarGhostFoto(tipo, subtipo);
    // Iniciar tap-to-focus y ajuste de exposición
    iniciarTapToFocus();
    iniciarExposureSlide();
    // Configurar focus y exposición continuos por defecto
    configurarCamaraInicial(stream);
    // Preparar captura a resolución nativa del sensor
    crearImageCapture(stream);
  }).catch(function(err) {
    showToast('Error al acceder a la cámara: ' + err.message, 'error');
    // Decrementar contador
    contadores[contKey]--;
    safeStore('rapca_contadores_' + tipo, contadores);
  });
}

function cerrarCamara() {
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
    camaraStream = null;
  }
  imageCaptureObj = null;
  // Quitar listeners de orientación para evitar fugas
  if (window._compassHandler) {
    window.removeEventListener('deviceorientationabsolute', window._compassHandler, true);
    window.removeEventListener('deviceorientation', window._compassHandler, true);
    window._compassHandler = null;
  }
  if (window._compassSensor) {
    try { window._compassSensor.stop(); } catch(e) {}
    window._compassSensor = null;
  }
  document.getElementById('camera-modal').classList.remove('open');
  if (miniMapaCamera) { miniMapaCamera.remove(); miniMapaCamera = null; }
  // Limpiar ghost
  document.getElementById('ghost-overlay').style.display = 'none';
  document.getElementById('ghost-controls').style.display = 'none';
  ghostingActivo = false;

  // Decrementar contador si se cancela
  var prefix = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || 'SIN_ID';
  var codeTipo = (camaraTipo === 'EI' || camaraTipo === 'EL') ? 'EV' : camaraTipo;
  var contKey = unidad + '_' + codeTipo + '_' + camaraSubtipo;
  var contadores = safeParse('rapca_contadores_' + camaraTipo, {});
  if (contadores[contKey] > 0) contadores[contKey]--;
  safeStore('rapca_contadores_' + camaraTipo, contadores);
}

function switchCamara() {
  var anterior = camaraFacing;
  camaraFacing = camaraFacing === 'environment' ? 'user' : 'environment';
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
  }
  var constraints = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    camaraStream = stream;
    document.getElementById('camera-video').srcObject = stream;
    configurarCamaraInicial(stream);
    crearImageCapture(stream);
    iniciarTapToFocus();
    iniciarExposureSlide();
  }).catch(function(err) {
    // Restaurar la cámara anterior si el cambio falla (p.ej. solo hay una cámara)
    camaraFacing = anterior;
    var fallback = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
    navigator.mediaDevices.getUserMedia(fallback).then(function(stream) {
      camaraStream = stream;
      document.getElementById('camera-video').srcObject = stream;
      configurarCamaraInicial(stream);
      crearImageCapture(stream);
      iniciarTapToFocus();
      iniciarExposureSlide();
      showToast('No se pudo cambiar de cámara', 'info');
    }).catch(function() {
      showToast('Error al acceder a la cámara', 'error');
    });
  });
}

// ============================================================
// CONFIGURACIÓN INICIAL DE CÁMARA (calidad, focus, exposición)
// ============================================================

function configurarCamaraInicial(stream) {
  var track = stream.getVideoTracks()[0];
  if (!track) return;

  var caps;
  try { caps = track.getCapabilities(); } catch(e) { return; }

  var constraints = {};
  var hasChanges = false;

  // Focus continuo automático
  if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
    constraints.focusMode = 'continuous';
    hasChanges = true;
  }

  // Exposición continua automática
  if (caps.exposureMode && caps.exposureMode.indexOf('continuous') >= 0) {
    constraints.exposureMode = 'continuous';
    hasChanges = true;
  }

  // Balance de blancos automático continuo
  if (caps.whiteBalanceMode && caps.whiteBalanceMode.indexOf('continuous') >= 0) {
    constraints.whiteBalanceMode = 'continuous';
    hasChanges = true;
  }

  if (hasChanges) {
    track.applyConstraints({advanced: [constraints]}).catch(function(err) {
      console.log('Config cámara inicial:', err.message);
    });
  }
}

// ============================================================
// TAP-TO-FOCUS Y AUTO-EXPOSICIÓN
// ============================================================

function iniciarTapToFocus() {
  var video = document.getElementById('camera-video');
  var wrap = video.parentElement;
  if (!video || !wrap) return;

  // Limpiar listener anterior si existe
  if (video._tapFocusHandler) {
    video.removeEventListener('touchstart', video._tapFocusHandler);
    video.removeEventListener('click', video._tapFocusHandler);
  }

  var handler = function(e) {
    // No interferir con ghost controls ni botones
    if (e.target.closest('#ghost-controls') || e.target.closest('.camera-overlay') || e.target.closest('.camera-controls')) return;
    e.preventDefault();

    var touch = e.touches ? e.touches[0] : e;
    var rect = video.getBoundingClientRect();

    // Coordenadas relativas al video (0-1)
    var x = (touch.clientX - rect.left) / rect.width;
    var y = (touch.clientY - rect.top) / rect.height;

    // Clamp
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Mostrar indicador visual
    mostrarFocusIndicator(wrap, touch.clientX - rect.left, touch.clientY - rect.top);

    // Medir brillo real del punto tocado desde el frame del video
    var luminancia = medirLuminancia(video, x, y);

    // Aplicar focus y exposición al track de video
    aplicarFocusExposicion(x, y, luminancia);
  };

  video._tapFocusHandler = handler;
  video.addEventListener('touchstart', handler, {passive: false});
  video.addEventListener('click', handler);
}

function mostrarFocusIndicator(container, px, py) {
  // Eliminar indicadores previos
  var prevs = container.querySelectorAll('.focus-ring');
  prevs.forEach(function(p) { p.remove(); });

  var ring = document.createElement('div');
  ring.className = 'focus-ring';
  ring.style.left = px + 'px';
  ring.style.top = py + 'px';
  ring.innerHTML = '<div class="focus-ring-inner"></div><div class="focus-ring-cross-h"></div><div class="focus-ring-cross-v"></div>';
  container.appendChild(ring);

  // Limpiar después de la animación
  setTimeout(function() {
    if (ring.parentNode) ring.remove();
  }, 800);
}

// Mide la luminancia media (0-255) de una región alrededor del punto tocado
function medirLuminancia(video, x, y) {
  try {
    if (!video.videoWidth || !video.videoHeight) return null;
    var c = document.createElement('canvas');
    var regionSize = 60; // muestreo de 60x60 px
    c.width = regionSize;
    c.height = regionSize;
    var ctx = c.getContext('2d');
    var sx = Math.max(0, x * video.videoWidth - regionSize / 2);
    var sy = Math.max(0, y * video.videoHeight - regionSize / 2);
    sx = Math.min(sx, video.videoWidth - regionSize);
    sy = Math.min(sy, video.videoHeight - regionSize);
    ctx.drawImage(video, sx, sy, regionSize, regionSize, 0, 0, regionSize, regionSize);
    var data = ctx.getImageData(0, 0, regionSize, regionSize).data;
    var sum = 0, n = 0;
    for (var i = 0; i < data.length; i += 4) {
      // Luminancia aprox: 0.299R + 0.587G + 0.114B
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
    return n > 0 ? sum / n : null;
  } catch(e) {
    console.log('No se pudo medir luminancia:', e.message);
    return null;
  }
}

function aplicarFocusExposicion(x, y, luminancia) {
  if (!camaraStream) return;

  var track = camaraStream.getVideoTracks()[0];
  if (!track) return;

  // Verificar capacidades del dispositivo
  var capabilities;
  try {
    capabilities = track.getCapabilities();
  } catch(e) {
    return;
  }

  // PRIMERA PASADA: Solo enfoque (focus) + point of interest.
  // No tocamos exposureMode para no bloquear el auto-ajuste del sistema.
  var focusConstraints = {};
  var focusChanges = false;

  if (capabilities.focusMode) {
    if (capabilities.focusMode.indexOf('single-shot') >= 0) {
      focusConstraints.focusMode = 'single-shot';
      focusChanges = true;
    } else if (capabilities.focusMode.indexOf('continuous') >= 0) {
      focusConstraints.focusMode = 'continuous';
      focusChanges = true;
    }
  }

  if (capabilities.pointsOfInterest) {
    focusConstraints.pointsOfInterest = [{x: x, y: y}];
    focusChanges = true;
  }

  if (focusChanges) {
    track.applyConstraints({advanced: [focusConstraints]}).catch(function(err) {
      console.log('Focus no soportado:', err.message);
    });
  }

  // SEGUNDA PASADA: Compensación de exposición basada en luminancia real medida
  // Esto funciona de forma fiable en todos los Androids.
  if (capabilities.exposureCompensation && luminancia !== null) {
    var min = capabilities.exposureCompensation.min;
    var max = capabilities.exposureCompensation.max;
    var step = capabilities.exposureCompensation.step || 0.33;

    // Objetivo: llevar la luminancia del punto hacia ~128 (gris medio)
    // Cada +1 EV aproximadamente dobla el brillo (factor 2x)
    // luminancia=60 -> +1 EV ; luminancia=30 -> +2 EV ; luminancia=200 -> -0.7 EV
    var target = 128;
    var ev = 0;
    if (luminancia > 0) {
      ev = Math.log2(target / Math.max(10, luminancia));
    }
    // Clamp
    ev = Math.max(min, Math.min(max, ev));
    // Ajustar a step
    ev = Math.round(ev / step) * step;

    var expoConstraints = {
      exposureMode: 'continuous',
      exposureCompensation: ev
    };

    track.applyConstraints({advanced: [expoConstraints]}).catch(function(err) {
      // Fallback: sólo exposureCompensation sin exposureMode
      track.applyConstraints({advanced: [{exposureCompensation: ev}]}).catch(function() {});
    });
  } else if (capabilities.exposureMode && capabilities.exposureMode.indexOf('continuous') >= 0) {
    // Si no hay exposureCompensation, al menos asegurar que esté en continuo
    track.applyConstraints({advanced: [{exposureMode: 'continuous'}]}).catch(function() {});
  }

  // White balance continuo (no lo bloqueamos)
  if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.indexOf('continuous') >= 0) {
    track.applyConstraints({advanced: [{whiteBalanceMode: 'continuous'}]}).catch(function() {});
  }
}

// Ajuste manual de exposición (deslizar verticalmente después de tocar)
var _exposureSlideActive = false;
var _exposureStartY = 0;
var _exposureBaseComp = 0;

function iniciarExposureSlide() {
  var video = document.getElementById('camera-video');
  if (!video) return;

  video.addEventListener('touchmove', function(e) {
    if (!camaraStream || e.touches.length !== 1) return;

    var track = camaraStream.getVideoTracks()[0];
    if (!track) return;

    var caps;
    try { caps = track.getCapabilities(); } catch(e2) { return; }

    if (!caps.exposureCompensation) return;

    var touch = e.touches[0];

    // Requerir un mínimo de movimiento para activar el slide
    // (evita que un tap normal active el modo manual y oscurezca la imagen)
    var THRESHOLD = 25;

    if (!_exposureSlideActive) {
      if (_exposureStartY === 0) {
        _exposureStartY = touch.clientY;
        try {
          var settings = track.getSettings();
          _exposureBaseComp = settings.exposureCompensation || 0;
        } catch(e3) {
          _exposureBaseComp = 0;
        }
        return;
      }
      // Aún no activado: comprobar si se ha superado el umbral
      if (Math.abs(touch.clientY - _exposureStartY) < THRESHOLD) return;
      _exposureSlideActive = true;
    }

    // Deslizar hacia arriba = más brillo, hacia abajo = menos
    var deltaY = _exposureStartY - touch.clientY;
    var range = caps.exposureCompensation.max - caps.exposureCompensation.min;
    var step = caps.exposureCompensation.step || 0.1;
    // 200px de movimiento = rango completo
    var factor = deltaY / 200;
    var newComp = _exposureBaseComp + factor * range;
    newComp = Math.max(caps.exposureCompensation.min, Math.min(caps.exposureCompensation.max, newComp));
    // Ajustar a step
    newComp = Math.round(newComp / step) * step;

    // NO cambiar exposureMode a 'manual' aquí porque bloquearía el auto-ajuste.
    // Solo ajustar exposureCompensation (que funciona con modo continuous).
    track.applyConstraints({advanced: [{exposureCompensation: newComp}]}).catch(function() {});
  }, {passive: true});

  video.addEventListener('touchend', function() {
    _exposureSlideActive = false;
    _exposureStartY = 0;
  });
}

var miniMapaImg = null; // Imagen capturada del mini mapa para overlay

function capturarMiniMapaDesdeDiv(mapDiv) {
  try {
    var mapCanvas = document.createElement('canvas');
    var mapRect = mapDiv.getBoundingClientRect();
    if (mapRect.width === 0 || mapRect.height === 0) return;
    mapCanvas.width = mapRect.width * 2;
    mapCanvas.height = mapRect.height * 2;
    var mctx = mapCanvas.getContext('2d');

    var tiles = mapDiv.querySelectorAll('.leaflet-tile');
    var dibujados = 0;
    tiles.forEach(function(tile) {
      if (!tile.complete || tile.naturalWidth === 0) return;
      var tileRect = tile.getBoundingClientRect();
      var dx = (tileRect.left - mapRect.left) * 2;
      var dy = (tileRect.top - mapRect.top) * 2;
      try { mctx.drawImage(tile, dx, dy, tileRect.width * 2, tileRect.height * 2); dibujados++; } catch(e) {}
    });

    if (dibujados > 0) {
      var centerX = mapCanvas.width / 2;
      var centerY = mapCanvas.height / 2;
      mctx.beginPath();
      mctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
      mctx.fillStyle = '#e74c3c';
      mctx.fill();
      mctx.strokeStyle = '#fff';
      mctx.lineWidth = 4;
      mctx.stroke();
      miniMapaImg = mapCanvas;
    }
  } catch(e) { console.warn('No se pudo capturar mini mapa:', e); }
}

// Espera a que TODAS las tiles del mini-mapa estén cargadas y luego captura.
// Reintenta hasta maxRetries veces si quedan tiles pendientes.
function esperarTilesYCapturar(mapDiv, maxRetries) {
  if (!mapDiv) return;
  var retries = maxRetries || 20;

  function intentar(n) {
    var tiles = mapDiv.querySelectorAll('.leaflet-tile');
    if (tiles.length === 0) {
      if (n > 0) setTimeout(function() { intentar(n - 1); }, 500);
      return;
    }
    var pendientes = 0;
    tiles.forEach(function(tile) {
      if (!tile.complete || tile.naturalWidth === 0) pendientes++;
    });
    if (pendientes === 0) {
      capturarMiniMapaDesdeDiv(mapDiv);
    } else if (n > 0) {
      setTimeout(function() { intentar(n - 1); }, 500);
    } else {
      capturarMiniMapaDesdeDiv(mapDiv);
    }
  }

  intentar(retries);
}

function iniciarOverlayCamara() {
  var cfg = typeof obtenerConfigWatermark === 'function' ? obtenerConfigWatermark() : {
    mostrarBrujula: true, tipoMiniMapa: 'topografico', escalaMiniMapa: 14,
    tipoCoordenadas: 'utm', mostrarMunicipio: false
  };

  // Brújula — limpiar handlers/sensores previos
  if (window._compassHandler) {
    window.removeEventListener('deviceorientationabsolute', window._compassHandler, true);
    window.removeEventListener('deviceorientation', window._compassHandler, true);
    window._compassHandler = null;
  }
  if (window._compassSensor) {
    try { window._compassSensor.stop(); } catch(e) {}
    window._compassSensor = null;
  }
  window._compassAbsolute = false;
  compassHeading = null;

  function actualizarBrujulaUI(heading) {
    compassHeading = Math.round(heading) % 360;
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    var dir = dirs[Math.floor((compassHeading + 22.5) / 45) % 8];
    var el = document.getElementById('cam-compass');
    if (el) el.textContent = dir + ' ' + compassHeading + '°';
  }

  // --- Método 1: AbsoluteOrientationSensor (más fiable en Android Chrome) ---
  var sensorIniciado = false;
  if ('AbsoluteOrientationSensor' in window) {
    try {
      var sensor = new AbsoluteOrientationSensor({frequency: 10});
      sensor.addEventListener('reading', function() {
        var q = sensor.quaternion;
        var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        // Dirección de la cámara (0,0,-1 en coords dispositivo) rotada al marco terrestre
        var fx = -2 * (qw * qy + qx * qz); // componente Este
        var fy = 2 * (qw * qx - qy * qz);  // componente Norte
        var h = Math.atan2(fx, fy) * 180 / Math.PI;
        if (h < 0) h += 360;
        window._compassAbsolute = true;
        actualizarBrujulaUI(h);
      });
      sensor.addEventListener('error', function(e) {
        console.warn('Sensor brújula error:', e.error.message);
      });
      sensor.start();
      window._compassSensor = sensor;
      sensorIniciado = true;
    } catch(e) {
      // Sensor no disponible, continuar con fallback
    }
  }

  // --- Método 2 (fallback): deviceorientation events ---
  var handler = function(e) {
    if (sensorIniciado && window._compassAbsolute) return;
    var heading = null;
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading;
      window._compassAbsolute = true;
    } else if (e.absolute === true && typeof e.alpha === 'number') {
      heading = (360 - e.alpha) % 360;
      window._compassAbsolute = true;
    } else if (typeof e.alpha === 'number' && !window._compassAbsolute) {
      heading = (360 - e.alpha) % 360;
    }
    if (heading !== null) actualizarBrujulaUI(heading);
  };
  window._compassHandler = handler;

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(state) {
      if (state === 'granted') {
        window.addEventListener('deviceorientationabsolute', handler, true);
        window.addEventListener('deviceorientation', handler, true);
      }
    }).catch(function() {
      window.addEventListener('deviceorientation', handler, true);
    });
  } else if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
  }

  miniMapaImg = null;

  // GPS para overlay
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};

      // Mostrar coordenadas según config
      if (cfg.tipoCoordenadas === 'geograficas') {
        document.getElementById('cam-coords').textContent = formatCoordGeo(gpsPos.lat, gpsPos.lon);
      } else {
        document.getElementById('cam-coords').textContent = formatUTMString(gpsPos.lat, gpsPos.lon);
      }

      // Geocodificación inversa para municipio/provincia/CP
      if (cfg.mostrarMunicipio) {
        geocodificarInverso(gpsPos.lat, gpsPos.lon, function(geo) {
          gpsPos._geo = geo;
        });
      }

      // Mini mapa configurable
      if (cfg.tipoMiniMapa !== 'ninguno') {
        try {
          var mapDiv = document.getElementById('camera-minimap');
          if (miniMapaCamera) miniMapaCamera.remove();
          var zoomLevel = cfg.escalaMiniMapa || 14;
          miniMapaCamera = L.map(mapDiv, {zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false}).setView([gpsPos.lat, gpsPos.lon], zoomLevel);

          var CORSTileLayer = L.TileLayer.extend({
            createTile: function(coords, done) {
              var tile = document.createElement('img');
              tile.crossOrigin = 'anonymous';
              tile.alt = '';
              tile.setAttribute('role', 'presentation');
              tile.onload = function() { done(null, tile); };
              tile.onerror = function(e) { done(e, tile); };
              tile.src = this.getTileUrl(coords);
              return tile;
            }
          });

          // Seleccionar capa según configuración
          var tileUrl;
          if (cfg.tipoMiniMapa === 'ortofoto') {
            tileUrl = 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}';
            new CORSTileLayer(tileUrl, {maxZoom: 20}).addTo(miniMapaCamera);
          } else {
            // Topográfico (IGN España)
            tileUrl = 'https://www.ign.es/wmts/mapa-raster?layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}';
            new CORSTileLayer(tileUrl, {maxZoom: 20}).addTo(miniMapaCamera);
          }

          L.marker([gpsPos.lat, gpsPos.lon], {
            icon: L.divIcon({className: '', html: '<div style="width:14px;height:14px;background:#e74c3c;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>', iconSize: [14,14], iconAnchor: [7,7]})
          }).addTo(miniMapaCamera);

          // Esperar a que las tiles se carguen realmente antes de capturar.
          // 'load' de Leaflet salta cuando todas las tiles visibles están listas.
          miniMapaCamera.on('load', function() {
            setTimeout(function() { capturarMiniMapaDesdeDiv(mapDiv); }, 200);
          });

          // Además, polling robusto: comprueba cada 500ms si todas las tiles
          // <img> del DOM tienen .complete=true (hasta 20 intentos = 10s).
          esperarTilesYCapturar(mapDiv, 20);
        } catch(e) {}
      }
    }, function() {}, {enableHighAccuracy: true});
  }
}

// Dibujar rosa de los vientos en canvas, rotada según heading del dispositivo
function dibujarRosaVientos(ctx, cx, cy, size) {
  ctx.save();

  // Fondo circular semitransparente (no rota)
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(80,80,80,0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Rotar todo el contenido interior según el heading del dispositivo.
  // compassHeading = grados desde el Norte geográfico en sentido horario.
  // Si el dispositivo apunta al Este (heading=90), el Norte real queda a la
  // izquierda del usuario → rotamos la rosa -90° para que la flecha N apunte
  // hacia la izquierda en la imagen.
  var headingRad = 0;
  if (compassHeading !== null) {
    headingRad = -(compassHeading * Math.PI / 180);
  }

  ctx.translate(cx, cy);
  ctx.rotate(headingRad);

  var r = size * 0.7;

  // Flecha Norte (cian)
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(-r * 0.18, 0);
  ctx.lineTo(0, -r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#00e5ff';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.18, 0);
  ctx.lineTo(0, -r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#00b8d4';
  ctx.fill();

  // Flecha Sur
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(-r * 0.18, 0);
  ctx.lineTo(0, r * 0.15);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.18, 0);
  ctx.lineTo(0, r * 0.15);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Flecha Este
  ctx.beginPath();
  ctx.moveTo(r * 0.6, 0);
  ctx.lineTo(0, -r * 0.12);
  ctx.lineTo(r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.6, 0);
  ctx.lineTo(0, r * 0.12);
  ctx.lineTo(r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // Flecha Oeste
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(0, -r * 0.12);
  ctx.lineTo(-r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(0, r * 0.12);
  ctx.lineTo(-r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // Letras cardinales (también rotan con la rosa)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var fs = size * 0.28;
  ctx.font = 'bold ' + fs + 'px sans-serif';

  ctx.fillStyle = '#00e5ff';
  ctx.fillText('N', 0, -size * 0.88);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('S', 0, size * 0.90);
  ctx.fillText('E', size * 0.88, 0);
  ctx.fillText('W', -size * 0.88, 0);

  ctx.restore();
}

// Formatear coordenadas geográficas con grados/minutos/segundos
function formatCoordGeo(lat, lon) {
  function toDMS(val, pos, neg) {
    var abs = Math.abs(val);
    var d = Math.floor(abs);
    var m = Math.floor((abs - d) * 60);
    var s = ((abs - d) * 60 - m) * 60;
    return d + '° ' + ('0' + m).slice(-2) + "' " + s.toFixed(1) + '" ' + (val >= 0 ? pos : neg);
  }
  return toDMS(lat, 'N', 'S') + '  ' + toDMS(lon, 'E', 'W');
}

// Formatear coordenadas UTM como string
function formatUTMString(lat, lon) {
  var u = latLonToUTM(lat, lon);
  return 'UTM ' + u.zone + u.letter + ' ' + u.easting + ' ' + u.northing;
}

// Geocodificación inversa usando Nominatim (cacheada)
var _geocodeCache = {};
function geocodificarInverso(lat, lon, callback) {
  var key = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (_geocodeCache[key]) { callback(_geocodeCache[key]); return; }
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&zoom=16&addressdetails=1&accept-language=es')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var addr = data.address || {};
      var result = {
        municipio: addr.city || addr.town || addr.village || addr.municipality || '',
        provincia: addr.province || addr.state || '',
        cp: addr.postcode || ''
      };
      _geocodeCache[key] = result;
      callback(result);
    })
    .catch(function() { callback({municipio: '', provincia: '', cp: ''}); });
}

function capturarFoto() {
  vibrar(30);
  var video = document.getElementById('camera-video');

  // Intentar capturar a la RESOLUCIÓN NATIVA del sensor con ImageCapture.
  // El vídeo de previsualización es 1080p, pero takePhoto() entrega la foto
  // a plena resolución (p.ej. 4000x3000), dando imágenes mucho más nítidas.
  if (imageCaptureObj && typeof imageCaptureObj.takePhoto === 'function') {

    var procesarBlob = function(blob) {
      // createImageBitmap con orientación EXIF garantiza que la foto se
      // dibuje siempre derecha, independientemente de cómo el navegador
      // interprete la rotación del sensor (evita fotos giradas 90°).
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(blob, {imageOrientation: 'from-image'}).then(function(bmp) {
          _renderizarFotoFinal(bmp, bmp.width, bmp.height);
          try { bmp.close(); } catch(e) {}
        }).catch(function() {
          procesarBlobConImagen(blob);
        });
      } else {
        procesarBlobConImagen(blob);
      }
    };

    var procesarBlobConImagen = function(blob) {
      var img = new Image();
      img.onload = function() {
        _renderizarFotoFinal(img, img.naturalWidth, img.naturalHeight);
        try { URL.revokeObjectURL(img.src); } catch(e) {}
      };
      img.onerror = function() {
        // Si falla la carga del blob, usar el frame del vídeo
        _renderizarFotoFinal(video, video.videoWidth, video.videoHeight);
      };
      img.src = URL.createObjectURL(blob);
    };

    var tomarFoto = function(opciones) {
      imageCaptureObj.takePhoto(opciones).then(procesarBlob).catch(function() {
        // Reintentar sin opciones por si las opciones no son válidas
        if (opciones && Object.keys(opciones).length > 0) {
          imageCaptureObj.takePhoto().then(procesarBlob).catch(function() {
            _renderizarFotoFinal(video, video.videoWidth, video.videoHeight);
          });
        } else {
          _renderizarFotoFinal(video, video.videoWidth, video.videoHeight);
        }
      });
    };

    // Consultar capacidades para pedir la MÁXIMA resolución del sensor
    if (typeof imageCaptureObj.getPhotoCapabilities === 'function') {
      imageCaptureObj.getPhotoCapabilities().then(function(caps) {
        var opts = {};
        if (caps && caps.imageWidth && caps.imageWidth.max) opts.imageWidth = caps.imageWidth.max;
        if (caps && caps.imageHeight && caps.imageHeight.max) opts.imageHeight = caps.imageHeight.max;
        // Desactivar flash en campo (rara vez útil, puede falsear color de vegetación)
        if (caps && caps.fillLightMode && caps.fillLightMode.indexOf('off') >= 0) {
          opts.fillLightMode = 'off';
        }
        tomarFoto(opts);
      }).catch(function() { tomarFoto({}); });
    } else {
      tomarFoto({});
    }

  } else {
    _renderizarFotoFinal(video, video.videoWidth, video.videoHeight);
  }
}

function _renderizarFotoFinal(fuente, fw, fh) {
  var cfg = typeof obtenerConfigWatermark === 'function' ? obtenerConfigWatermark() : {
    tamanoTexto: 'mediano', mostrarCodigo: true, formatoFecha: 'fecha',
    tipoCoordenadas: 'utm', mostrarOrientacion: true, mostrarMunicipio: false,
    mostrarBrujula: true, tipoMiniMapa: 'topografico', escalaMiniMapa: 14
  };

  // Intentar capturar mini mapa una última vez si no se tiene
  if (!miniMapaImg && cfg.tipoMiniMapa !== 'ninguno') {
    var mapDiv = document.getElementById('camera-minimap');
    if (mapDiv) capturarMiniMapaDesdeDiv(mapDiv);
  }

  var canvas = document.getElementById('preview-canvas');
  var vw = fw || 1920, vh = fh || 1080;

  // --- CANVAS ADAPTATIVO: respeta la ORIENTACIÓN real de la fuente ---
  // Antes se forzaba SIEMPRE retrato (H=srcLong), lo que en fuentes
  // landscape (vídeo 1080p, fotos sin EXIF) provocaba un upscale del
  // 33–122% y recortaba más de la mitad de la escena.
  // Ahora: si la fuente es horizontal → lienzo horizontal (4:3); si es
  // vertical → lienzo vertical (3:4). En ambos casos escala ≤ 1 (sin
  // ampliar) y recorte mínimo.
  var W, H;
  var srcShort = Math.min(vw, vh);
  var srcLong = Math.max(vw, vh);
  var esLandscape = vw > vh;

  if (esLandscape) {
    // Lienzo horizontal 4:3
    W = srcLong;
    H = Math.round(W * 3 / 4);
    if (H > srcShort) {
      H = srcShort;
      W = Math.round(H * 4 / 3);
      if (W > srcLong) W = srcLong;
    }
  } else {
    // Lienzo vertical 3:4 (caso típico: teléfono en vertical)
    H = srcLong;
    W = Math.round(H * 3 / 4);
    if (W > srcShort) {
      W = srcShort;
      H = Math.round(W * 4 / 3);
      if (H > srcLong) H = srcLong;
    }
  }

  // Mínimo de tamaño para watermarks legibles, SIN ampliar por encima
  // de la resolución nativa de la fuente (evita pixelado de vídeo 720p).
  var ladoCorto = Math.min(W, H);
  if (ladoCorto < 1200) {
    var objetivo = Math.min(1200, srcShort);
    if (objetivo > ladoCorto) {
      var minScale = objetivo / ladoCorto;
      W = Math.round(W * minScale);
      H = Math.round(H * minScale);
    }
  }
  // Máximo 5000px en el lado largo por memoria
  var ladoLargo = Math.max(W, H);
  if (ladoLargo > 5000) {
    var maxScale = 5000 / ladoLargo;
    W = Math.round(W * maxScale);
    H = Math.round(H * maxScale);
  }

  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Dibujar foto (recorte "cover")
  var scale = Math.max(W / vw, H / vh);
  var sw = W / scale, sh = H / scale;
  var sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, W, H);

  // Postproceso: reducción de ruido (adaptada a la luz) + micro-nitidez,
  // en una sola pasada para minimizar memoria en móvil.
  _postprocesarFoto(ctx, W, H);

  // --- Factor de escala proporcional para watermarks ---
  // El diseño base era un lienzo retrato de 3060px de ancho (lado corto).
  // Usar el lado corto mantiene el tamaño de los watermarks consistente
  // tanto en fotos verticales como horizontales.
  var refScale = Math.min(W, H) / 3060;
  var factorTexto = cfg.tamanoTexto === 'pequeno' ? 0.75 : (cfg.tamanoTexto === 'grande' ? 1.3 : 1.0);

  // --- ROSA DE LOS VIENTOS ---
  if (cfg.mostrarBrujula) {
    var rPos = Math.round(120 * refScale);
    dibujarRosaVientos(ctx, rPos, rPos, Math.round(95 * refScale));
  }

  // --- MINI MAPA ---
  if (cfg.tipoMiniMapa !== 'ninguno') {
    var mapSize = Math.round(500 * refScale);
    var mapMargin = Math.round(30 * refScale);
    var mapX = mapMargin, mapY = H - mapSize - mapMargin;
    var mapRadius = Math.round(16 * refScale);
    if (miniMapaImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius);
      ctx.clip();
      ctx.drawImage(miniMapaImg, mapX, mapY, mapSize, mapSize);
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.round(4 * refScale);
      ctx.stroke();
    } else if (gpsPos) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius);
      ctx.fillStyle = 'rgba(200,220,200,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.round(4 * refScale);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, Math.round(16 * refScale), 0, Math.PI * 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.round(5 * refScale);
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.font = Math.round(22 * refScale) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Zoom ' + cfg.escalaMiniMapa, mapX + mapSize / 2, mapY + mapSize - Math.round(20 * refScale));
      ctx.textAlign = 'start';
    }
  }

  // --- INFO PANEL (esquina inferior derecha) ---
  var coordStr = 'Sin GPS';
  if (gpsPos) {
    if (cfg.tipoCoordenadas === 'geograficas') {
      coordStr = formatCoordGeo(gpsPos.lat, gpsPos.lon);
    } else {
      coordStr = formatUTMString(gpsPos.lat, gpsPos.lon);
    }
  }

  var fechaFoto = new Date();
  var dd = ('0' + fechaFoto.getDate()).slice(-2);
  var mm = ('0' + (fechaFoto.getMonth() + 1)).slice(-2);
  var yyyy = fechaFoto.getFullYear();
  var fechaStr = dd + '/' + mm + '/' + yyyy;
  if (cfg.formatoFecha === 'fechahora') {
    try {
      var horaM = fechaFoto.toLocaleTimeString('es-ES', {timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false});
      fechaStr += ' ' + horaM;
    } catch(e) {
      var hh = ('0' + fechaFoto.getHours()).slice(-2);
      var mi = ('0' + fechaFoto.getMinutes()).slice(-2);
      fechaStr += ' ' + hh + ':' + mi;
    }
  }

  var orientStr = '';
  if (cfg.mostrarOrientacion && compassHeading !== null) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    var dir = dirs[Math.floor((compassHeading + 22.5) / 45) % 8];
    orientStr = dir + ' ' + compassHeading + '°';
  }

  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = Math.round(8 * refScale);
  ctx.shadowOffsetX = Math.round(2 * refScale);
  ctx.shadowOffsetY = Math.round(2 * refScale);
  ctx.textAlign = 'right';

  var textRight = W - Math.round(50 * refScale);
  var lineY = H - Math.round(40 * refScale);
  var lineSpacing = Math.round(65 * refScale * factorTexto);
  var fontBase = Math.round(42 * refScale * factorTexto);

  if (cfg.mostrarMunicipio && gpsPos && gpsPos._geo) {
    var geo = gpsPos._geo;
    var geoStr = [geo.municipio, geo.provincia, geo.cp].filter(Boolean).join(', ');
    if (geoStr) {
      ctx.fillStyle = '#ffffff';
      ctx.font = Math.round(34 * refScale * factorTexto) + 'px sans-serif';
      ctx.fillText(geoStr, textRight, lineY);
      lineY -= lineSpacing;
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = Math.round(38 * refScale * factorTexto) + 'px sans-serif';
  ctx.fillText(coordStr, textRight, lineY);
  lineY -= lineSpacing;

  if (orientStr) {
    ctx.fillStyle = '#ffffff';
    ctx.font = Math.round(38 * refScale * factorTexto) + 'px sans-serif';
    ctx.fillText(orientStr, textRight, lineY);
    lineY -= lineSpacing;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = fontBase + 'px sans-serif';
  ctx.fillText(fechaStr, textRight, lineY);
  lineY -= lineSpacing;

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.round(48 * refScale * factorTexto) + 'px sans-serif';
  ctx.fillText(fotoCodigo, textRight, lineY);
  lineY -= lineSpacing;

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.round(56 * refScale * factorTexto) + 'px sans-serif';
  ctx.fillText('RAPCA EMA', textRight, lineY);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.textAlign = 'start';

  fotoCapturada = canvas;
  anotaciones = [];

  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
    camaraStream = null;
  }
  document.getElementById('camera-modal').classList.remove('open');
  document.getElementById('preview-modal').classList.add('open');
}

// Postproceso en una sola pasada: reducción de ruido adaptada a la luz
// + realce sutil de bordes (unsharp mask). Una pasada para limitar el
// uso de memoria en móviles (un único getImageData/putImageData).
//
// Combina dos operaciones lineales sobre cada canal:
//   denoise = d·(1-nr) + a·nr           (acerca al promedio local: suaviza ruido)
//   sharp   = denoise + (denoise - a)·s (unsharp mask)
// que se reduce a: result = d·(1-nr)(1+s) + a·(nr·(1+s) - s)
// donde d = píxel, a = promedio de los 4 vecinos ortogonales.
// Con nr=0 equivale al sharpening puro de antes.
function _postprocesarFoto(ctx, w, h) {
  if (w * h > 20000000) return;
  try {
    var imgData = ctx.getImageData(0, 0, w, h);
    var d = imgData.data;
    var src = new Uint8ClampedArray(d);
    var stride = w * 4;

    // Estimar luz media muestreando luminancia (1 de cada ~50 px)
    var sumL = 0, nL = 0;
    var paso = Math.max(4, Math.round(src.length / 4 / 20000)) * 4;
    for (var p = 0; p < src.length; p += paso) {
      sumL += 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
      nL++;
    }
    var meanLum = nL > 0 ? sumL / nL : 128;

    // Reducción de ruido proporcional a la oscuridad de la escena.
    // Escenas luminosas (campo soleado): nr=0 → solo nitidez, color fiel.
    // Escenas oscuras (amanecer/sombra densa): más suavizado del ruido.
    var nr = 0;
    if (meanLum < 60) nr = 0.35;
    else if (meanLum < 120) nr = 0.35 * (120 - meanLum) / 60;

    // En muy poca luz, bajar el realce para no amplificar ruido residual.
    var s = meanLum < 60 ? 0.18 : 0.3;

    // Coeficientes precalculados: result = kd·d + ka·a
    var kd = (1 - nr) * (1 + s);
    var ka = nr * (1 + s) - s;

    for (var y = 1; y < h - 1; y++) {
      var row = y * stride;
      for (var x = 1; x < w - 1; x++) {
        var i = row + x * 4;
        for (var c = 0; c < 3; c++) {
          var center = src[i + c];
          var a = (src[i - stride + c] + src[i + stride + c] + src[i - 4 + c] + src[i + 4 + c]) * 0.25;
          d[i + c] = kd * center + ka * a;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch(e) {}
}

// --- SISTEMA DE GHOSTING PARA FOTOS COMPARATIVAS ---

function cargarGhostFoto(tipo, subtipo) {
  // Buscar foto previa del mismo waypoint y unidad para usar como ghost
  var ghostEl = document.getElementById('ghost-overlay');
  var ghostControls = document.getElementById('ghost-controls');
  ghostEl.style.display = 'none';
  ghostControls.style.display = 'none';
  ghostingActivo = false;

  // Solo para fotos comparativas W1/W2
  if (subtipo !== 'W1' && subtipo !== 'W2') return;

  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || '';
  if (!unidad) return;

  // Buscar en registros anteriores fotos comparativas del mismo waypoint/unidad
  var codeTipo = (tipo === 'EI' || tipo === 'EL') ? 'EV' : tipo;
  var patronBusqueda = unidad + '_' + codeTipo + '_' + subtipo;

  function activarGhost(src) {
    ghostEl.src = src;
    ghostEl.onload = function() {
      ghostEl.style.display = 'block';
      ghostEl.style.opacity = ghostOpacity / 100;
      ghostControls.style.display = 'flex';
      ghostingActivo = true;

      var btn = document.getElementById('ghost-toggle-btn');
      btn.textContent = '👻 Ghost ON';
      btn.style.color = '#00e5ff';
      btn.style.borderColor = '#00e5ff';

      var slider = document.getElementById('ghost-slider');
      slider.value = ghostOpacity;
    };
  }

  // Buscar en IndexedDB el thumbnail más reciente que coincida
  if (!db) return;
  obtenerTodosDB('fotos').then(function(fotos) {
    // Buscar la foto más reciente cuyo código empiece con el patrón
    var matches = fotos.filter(function(f) {
      return f.codigo && f.codigo.indexOf(patronBusqueda) === 0;
    }).sort(function(a, b) { return (b.fecha || 0) - (a.fecha || 0); });

    if (matches.length > 0 && matches[0].data) {
      activarGhost(matches[0].data);
    } else {
      // Buscar en subidas_pendientes
      obtenerTodosDB('subidas_pendientes').then(function(pendientes) {
        var matchesPend = pendientes.filter(function(f) {
          return f.codigo && f.codigo.indexOf(patronBusqueda) === 0;
        }).sort(function(a, b) { return (b.fecha || 0) - (a.fecha || 0); });

        if (matchesPend.length > 0 && matchesPend[0].data) {
          activarGhost(matchesPend[0].data);
        } else {
          // Buscar en fotos precargadas offline
          buscarGhostEnPrecargadas(unidad, subtipo, activarGhost);
        }
      });
    }
  });
}

function buscarGhostEnPrecargadas(unidad, subtipo, callback) {
  if (!db) return;
  // El store 'fotos_precargadas' no tiene índice 'unidad', así que filtramos en memoria
  obtenerTodosDB('fotos_precargadas').then(function(fotos) {
    var matches = (fotos || []).filter(function(f) {
      return f.unidad === unidad && f.waypoint === subtipo;
    }).sort(function(a, b) {
      // Más reciente primero
      return (b.fecha || '').localeCompare(a.fecha || '');
    });

    if (matches.length > 0 && matches[0].data) {
      callback(matches[0].data);
    }
  }).catch(function(e) {
    console.warn('Error buscando ghost en precargadas:', e);
  });
}

function toggleGhost() {
  var ghostEl = document.getElementById('ghost-overlay');
  var btn = document.getElementById('ghost-toggle-btn');
  ghostingActivo = !ghostingActivo;
  if (ghostingActivo) {
    ghostEl.style.display = 'block';
    ghostEl.style.opacity = ghostOpacity / 100;
    btn.textContent = '👻 Ghost ON';
    btn.style.color = '#00e5ff';
    btn.style.borderColor = '#00e5ff';
  } else {
    ghostEl.style.display = 'none';
    btn.textContent = '👻 Ghost OFF';
    btn.style.color = '#888';
    btn.style.borderColor = '#888';
  }
}

function ajustarGhost(val) {
  ghostOpacity = parseInt(val);
  var ghostEl = document.getElementById('ghost-overlay');
  if (ghostingActivo) {
    ghostEl.style.opacity = ghostOpacity / 100;
  }
  var label = document.getElementById('ghost-label');
  if (label) label.textContent = ghostOpacity + '%';
}

function repetirFoto() {
  limpiarAnotaciones();
  document.getElementById('preview-modal').classList.remove('open');
  abrirCamara(camaraTipo, camaraSubtipo);
}

// --- Anotaciones interactivas ---
var anotDragging = null;
var anotResizing = null;
var anotStartPos = null;

function anotarFoto() {
  var previewModal = document.getElementById('preview-modal');
  var canvas = document.getElementById('preview-canvas');

  // Crear overlay de anotaciones si no existe
  var overlay = document.getElementById('anot-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'anot-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    // Posicionar relativamente al canvas
    var canvasWrap = document.getElementById('anot-canvas-wrap');
    if (!canvasWrap) {
      canvasWrap = document.createElement('div');
      canvasWrap.id = 'anot-canvas-wrap';
      canvasWrap.style.cssText = 'position:relative;display:inline-block;max-width:95vw;max-height:70vh;';
      canvas.parentNode.insertBefore(canvasWrap, canvas);
      canvasWrap.appendChild(canvas);
      canvasWrap.appendChild(overlay);
    }
  }

  var numAnot = anotaciones.length + 1;
  var circleSize = 50; // Radio en píxeles de pantalla

  // Mostrar diálogo para escribir la anotación
  mostrarDialogoAnotacion(numAnot, function(texto) {
    if (texto === null) return; // Cancelado

    // Crear elemento de anotación
    var anot = document.createElement('div');
    anot.className = 'anot-circle';
    anot.dataset.num = numAnot;
    anot.dataset.radius = circleSize;
    anot.dataset.texto = texto;
    anot.style.cssText = 'position:absolute;left:50%;top:50%;width:' + (circleSize * 2) + 'px;height:' + (circleSize * 2) + 'px;' +
      'margin-left:-' + circleSize + 'px;margin-top:-' + circleSize + 'px;' +
      'border:3px solid #e74c3c;border-radius:50%;pointer-events:auto;touch-action:none;cursor:grab;' +
      'display:flex;align-items:center;justify-content:center;z-index:10;';
    anot.innerHTML = '<span style="color:#e74c3c;font-weight:700;font-size:18px;pointer-events:none;text-shadow:0 0 3px #fff,0 0 5px #fff;">' + numAnot + '</span>' +
      '<div class="anot-resize-handle" style="position:absolute;bottom:-6px;right:-6px;width:18px;height:18px;background:#e74c3c;border-radius:50%;cursor:nwse-resize;pointer-events:auto;touch-action:none;border:2px solid #fff;"></div>';

    // Etiqueta de texto debajo del círculo
    if (texto) {
      var label = document.createElement('div');
      label.className = 'anot-label';
      label.style.cssText = 'position:absolute;top:' + (circleSize * 2 + 4) + 'px;left:50%;transform:translateX(-50%);' +
        'background:rgba(231,76,60,0.9);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;' +
        'white-space:nowrap;pointer-events:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
      label.textContent = texto;
      anot.appendChild(label);
    }

    overlay.appendChild(anot);

    // Eventos táctiles y ratón para arrastrar
    anot.addEventListener('mousedown', anotStartDrag);
    anot.addEventListener('touchstart', anotStartDrag, {passive: false});

    // Eventos para redimensionar
    var handle = anot.querySelector('.anot-resize-handle');
    handle.addEventListener('mousedown', anotStartResize);
    handle.addEventListener('touchstart', anotStartResize, {passive: false});

    anotaciones.push({el: anot, num: numAnot, radius: circleSize, texto: texto});
    showToast('Anotación ' + numAnot + (texto ? ': ' + texto : '') + '. Arrastra para mover.', 'info');
  });
}

function mostrarDialogoAnotacion(numAnot, callback) {
  // Crear modal de anotación
  var modal = document.createElement('div');
  modal.id = 'anot-dialog';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);' +
    'display:flex;align-items:center;justify-content:center;z-index:10000;';

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;max-width:90vw;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
  box.innerHTML = '<h3 style="margin:0 0 12px;color:#1a3d2e;font-size:16px;">Anotación ' + numAnot + '</h3>' +
    '<textarea id="anot-texto-input" placeholder="Escribe la anotación..." ' +
    'style="width:100%;height:80px;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;" autofocus></textarea>' +
    '<div style="display:flex;gap:10px;margin-top:12px;">' +
    '<button id="anot-cancelar-btn" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;font-size:14px;cursor:pointer;">Cancelar</button>' +
    '<button id="anot-guardar-btn" style="flex:1;padding:10px;border:none;border-radius:8px;background:#1a3d2e;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Guardar</button>' +
    '</div>';

  modal.appendChild(box);
  document.body.appendChild(modal);

  var input = document.getElementById('anot-texto-input');
  setTimeout(function() { input.focus(); }, 100);

  document.getElementById('anot-guardar-btn').addEventListener('click', function() {
    var texto = input.value.trim();
    document.body.removeChild(modal);
    callback(texto);
  });

  document.getElementById('anot-cancelar-btn').addEventListener('click', function() {
    document.body.removeChild(modal);
    callback(null);
  });

  // Enter para guardar
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('anot-guardar-btn').click();
    }
  });
}

function anotStartDrag(e) {
  // Evitar si es el handle de resize
  if (e.target.classList.contains('anot-resize-handle')) return;
  e.preventDefault();
  e.stopPropagation();

  var anot = e.currentTarget;
  anotDragging = anot;
  anot.style.cursor = 'grabbing';

  var touch = e.touches ? e.touches[0] : e;
  anotStartPos = {
    x: touch.clientX,
    y: touch.clientY,
    left: anot.offsetLeft + parseInt(anot.style.marginLeft || 0),
    top: anot.offsetTop + parseInt(anot.style.marginTop || 0)
  };
}

function anotStartResize(e) {
  e.preventDefault();
  e.stopPropagation();

  var anot = e.currentTarget.parentElement;
  anotResizing = anot;

  var touch = e.touches ? e.touches[0] : e;
  var rect = anot.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  anotStartPos = {
    x: touch.clientX,
    y: touch.clientY,
    cx: cx,
    cy: cy,
    origRadius: parseInt(anot.dataset.radius)
  };
}

document.addEventListener('mousemove', anotOnMove);
document.addEventListener('touchmove', anotOnMove, {passive: false});
document.addEventListener('mouseup', anotEndDrag);
document.addEventListener('touchend', anotEndDrag);

function anotOnMove(e) {
  if (!anotDragging && !anotResizing) return;
  e.preventDefault();

  var touch = e.touches ? e.touches[0] : e;

  if (anotDragging) {
    var dx = touch.clientX - anotStartPos.x;
    var dy = touch.clientY - anotStartPos.y;
    anotDragging.style.left = (anotStartPos.left + dx) + 'px';
    anotDragging.style.top = (anotStartPos.top + dy) + 'px';
    anotDragging.style.marginLeft = '0';
    anotDragging.style.marginTop = '0';
  }

  if (anotResizing) {
    var dx2 = touch.clientX - anotStartPos.cx;
    var dy2 = touch.clientY - anotStartPos.cy;
    var newRadius = Math.max(20, Math.round(Math.sqrt(dx2 * dx2 + dy2 * dy2)));
    anotResizing.style.width = (newRadius * 2) + 'px';
    anotResizing.style.height = (newRadius * 2) + 'px';
    anotResizing.dataset.radius = newRadius;
    // Ajustar posición para mantener centrado
    var currentLeft = anotResizing.offsetLeft;
    var currentTop = anotResizing.offsetTop;
    var oldRadius = parseInt(anotResizing.style.width) / 2;
    // No recentrar, dejar que el usuario mueva después si quiere
  }
}

function anotEndDrag() {
  if (anotDragging) {
    anotDragging.style.cursor = 'grab';
    anotDragging = null;
  }
  anotResizing = null;
  anotStartPos = null;
}

// Renderizar anotaciones sobre el canvas antes de guardar
function renderizarAnotaciones() {
  var canvas = document.getElementById('preview-canvas');
  var overlay = document.getElementById('anot-overlay');
  if (!overlay || anotaciones.length === 0) return;

  var ctx = canvas.getContext('2d');
  var canvasRect = canvas.getBoundingClientRect();

  // Escala entre el canvas visual y el canvas real
  var scaleX = canvas.width / canvasRect.width;
  var scaleY = canvas.height / canvasRect.height;

  for (var i = 0; i < anotaciones.length; i++) {
    var a = anotaciones[i];
    var el = a.el;
    if (!el) continue;

    var elRect = el.getBoundingClientRect();
    // Centro del elemento relativo al canvas
    var cx = (elRect.left + elRect.width / 2 - canvasRect.left) * scaleX;
    var cy = (elRect.top + elRect.height / 2 - canvasRect.top) * scaleY;
    var radius = (elRect.width / 2) * scaleX;

    // Dibujar círculo
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = Math.max(4, radius * 0.08);
    ctx.stroke();

    // Dibujar número
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold ' + Math.max(24, radius * 0.6) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.num.toString(), cx, cy);

    // Dibujar texto de anotación debajo del círculo
    if (a.texto) {
      var fontSize = Math.max(18, radius * 0.35);
      ctx.font = 'bold ' + fontSize + 'px sans-serif';
      var textWidth = ctx.measureText(a.texto).width;
      var padding = 8 * scaleX;
      var textY = cy + radius + fontSize + padding;
      // Fondo del texto
      ctx.fillStyle = 'rgba(231,76,60,0.85)';
      ctx.beginPath();
      var rr = 6 * scaleX;
      var bx = cx - textWidth / 2 - padding;
      var by = textY - fontSize;
      var bw = textWidth + padding * 2;
      var bh = fontSize + padding;
      ctx.roundRect(bx, by, bw, bh, rr);
      ctx.fill();
      // Texto
      ctx.fillStyle = '#fff';
      ctx.fillText(a.texto, cx, textY - padding / 2);
    }
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// Limpiar overlay de anotaciones
function limpiarAnotaciones() {
  var overlay = document.getElementById('anot-overlay');
  if (overlay) overlay.innerHTML = '';
  anotaciones = [];
}

// Codifica un canvas a JPEG de forma asíncrona (no bloquea la UI).
// Devuelve {dataUrl, blob}. Usa toBlob si está disponible; si no, cae a
// toDataURL síncrono como respaldo.
function _canvasAJpeg(canvas, quality) {
  return new Promise(function(resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('toBlob devolvió null')); return; }
        var r = new FileReader();
        r.onload = function() { resolve({dataUrl: r.result, blob: blob}); };
        r.onerror = function() { reject(r.error || new Error('FileReader')); };
        r.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    } else {
      try { resolve({dataUrl: canvas.toDataURL('image/jpeg', quality), blob: null}); }
      catch(e) { reject(e); }
    }
  });
}

// Convierte un Blob a data URL (base64).
function _blobADataURL(blob) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { reject(r.error || new Error('FileReader')); };
    r.readAsDataURL(blob);
  });
}

// Codifica un canvas a Blob JPEG (para descarga directa, sin base64).
function _canvasABlob(canvas, quality) {
  return new Promise(function(resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('toBlob devolvió null')); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    } else {
      try {
        var du = canvas.toDataURL('image/jpeg', quality);
        var bin = atob(du.split(',')[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], {type: 'image/jpeg'}));
      } catch(e) { reject(e); }
    }
  });
}

// Descarga un Blob como archivo (escritorio o respaldo en móvil)
function descargarBlob(blob, nombre) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}

// ============================================================
// EXIF GPS: inyecta la posición en los metadatos del JPEG
// ============================================================
// Construye un segmento APP1 (Exif) con un IFD0 que apunta a un IFD GPS
// con latitud/longitud (y altitud si está disponible). Big-endian (MM).
// Autónomo, sin librerías externas (la app funciona offline).
function _construirEXIFGPS(lat, lon, alt) {
  function dms(v) {
    v = Math.abs(v);
    var d = Math.floor(v);
    var mf = (v - d) * 60;
    var m = Math.floor(mf);
    var s = (mf - m) * 60;
    return {d: d, m: m, sNum: Math.round(s * 100), sDen: 100};
  }

  var hasAlt = (typeof alt === 'number' && isFinite(alt));
  var latR = dms(lat), lonR = dms(lon);
  var latRef = lat >= 0 ? 'N' : 'S';
  var lonRef = lon >= 0 ? 'E' : 'W';
  var altRef = (hasAlt && alt < 0) ? 1 : 0;

  var nEntries = hasAlt ? 7 : 5;
  // Offsets relativos al inicio del bloque TIFF
  var GPS_IFD = 26;                              // tras IFD0 (8 + 18)
  var dataRel = GPS_IFD + 2 + nEntries * 12 + 4; // inicio del área de datos
  var tiffSize = dataRel + (hasAlt ? 56 : 48);

  var totalApp1 = 2 /*FFE1*/ + 2 /*len*/ + 6 /*Exif\0\0*/ + tiffSize;
  var buf = new ArrayBuffer(totalApp1);
  var dv = new DataView(buf);
  var u8 = new Uint8Array(buf);

  u8[0] = 0xFF; u8[1] = 0xE1;
  dv.setUint16(2, 2 + 6 + tiffSize);            // longitud del segmento
  u8[4] = 0x45; u8[5] = 0x78; u8[6] = 0x69; u8[7] = 0x66; u8[8] = 0; u8[9] = 0; // "Exif\0\0"

  var T = 10;                                    // inicio del bloque TIFF
  dv.setUint16(T + 0, 0x4D4D);                   // "MM" big-endian
  dv.setUint16(T + 2, 0x002A);                   // 42
  dv.setUint32(T + 4, 8);                        // offset a IFD0

  // IFD0: una sola entrada → puntero al IFD GPS
  var ifd0 = T + 8;
  dv.setUint16(ifd0, 1);
  dv.setUint16(ifd0 + 2, 0x8825);                // GPSInfoIFDPointer
  dv.setUint16(ifd0 + 4, 4);                     // tipo LONG
  dv.setUint32(ifd0 + 6, 1);                     // count
  dv.setUint32(ifd0 + 10, GPS_IFD);              // offset al IFD GPS
  dv.setUint32(ifd0 + 14, 0);                    // siguiente IFD = 0

  // IFD GPS
  var gps = T + GPS_IFD;
  dv.setUint16(gps, nEntries);
  var e = gps + 2;
  function entry(tag, type, count, val) {
    dv.setUint16(e, tag); dv.setUint16(e + 2, type);
    dv.setUint32(e + 4, count); dv.setUint32(e + 8, val);
    e += 12;
  }
  entry(0x0000, 1, 4, 0x02030000);                       // GPSVersionID 2.3.0.0
  entry(0x0001, 2, 2, latRef.charCodeAt(0) << 24);       // LatitudeRef
  entry(0x0002, 5, 3, dataRel);                          // Latitude (offset)
  entry(0x0003, 2, 2, lonRef.charCodeAt(0) << 24);       // LongitudeRef
  entry(0x0004, 5, 3, dataRel + 24);                     // Longitude (offset)
  if (hasAlt) {
    entry(0x0005, 1, 1, altRef << 24);                   // AltitudeRef
    entry(0x0006, 5, 1, dataRel + 48);                   // Altitude (offset)
  }
  dv.setUint32(e, 0);                                     // siguiente IFD = 0

  // Área de datos: racionales (numerador, denominador)
  var dataAbs = T + dataRel;
  function rat(p, num, den) { dv.setUint32(p, num); dv.setUint32(p + 4, den); }
  rat(dataAbs, latR.d, 1); rat(dataAbs + 8, latR.m, 1); rat(dataAbs + 16, latR.sNum, latR.sDen);
  rat(dataAbs + 24, lonR.d, 1); rat(dataAbs + 32, lonR.m, 1); rat(dataAbs + 40, lonR.sNum, lonR.sDen);
  if (hasAlt) rat(dataAbs + 48, Math.round(Math.abs(alt) * 100), 100);

  return u8;
}

// Inserta el segmento Exif-GPS justo tras el SOI del JPEG. Devuelve un
// Blob nuevo; si algo falla o no hay GPS, devuelve el blob original.
function inyectarGPSenJPEG(blob, lat, lon, alt) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) {
    return Promise.resolve(blob);
  }
  var leer = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function(res, rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result); };
    r.onerror = function() { rej(r.error); };
    r.readAsArrayBuffer(blob);
  });
  return leer.then(function(ab) {
    var bytes = new Uint8Array(ab);
    if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return blob; // no es JPEG
    var app1 = _construirEXIFGPS(lat, lon, alt);
    var out = new Uint8Array(bytes.length + app1.length);
    out.set(bytes.subarray(0, 2), 0);             // SOI (FFD8)
    out.set(app1, 2);                             // APP1 Exif
    out.set(bytes.subarray(2), 2 + app1.length);  // resto del JPEG
    return new Blob([out], {type: 'image/jpeg'});
  }).catch(function() { return blob; });
}

function aceptarFoto() {
  vibrar(30);

  // Renderizar anotaciones sobre el canvas antes de exportar
  renderizarAnotaciones();

  var canvas = document.getElementById('preview-canvas');

  // Verificar db disponible
  if (!db) {
    showToast('Base de datos no disponible. Reintenta.', 'error');
    return;
  }

  // Capturar variables en closure ANTES de cualquier trabajo asíncrono
  var _fotoCodigo = fotoCodigo;
  var _camaraSubtipo = camaraSubtipo;
  var _camaraTipo = camaraTipo;
  var _gpsLat = gpsPos ? gpsPos.lat : null;
  var _gpsLon = gpsPos ? gpsPos.lon : null;
  var _gpsAlt = (gpsPos && typeof gpsPos.alt === 'number') ? gpsPos.alt : null;

  // Thumbnail proporcional al canvas real
  var thumbW = 400;
  var thumbH = Math.round(thumbW * canvas.height / canvas.width);
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  var tCtx = thumbCanvas.getContext('2d');
  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'high';
  tCtx.drawImage(canvas, 0, 0, thumbW, thumbH);

  // Limpiar anotaciones y cerrar inmediatamente (la UI no se congela
  // porque la codificación JPEG ahora es asíncrona vía toBlob).
  limpiarAnotaciones();
  document.getElementById('preview-modal').classList.remove('open');

  // Codificar la foto de plena calidad PRIMERO, inyectar el GPS en el EXIF
  // y descargarla. Después se codifican thumbnail y versión de subida.
  var thumbData, uploadData;
  _canvasABlob(canvas, 0.97).then(function(downloadBlob) {
    // Insertar coordenadas GPS en los metadatos EXIF del archivo descargado
    return inyectarGPSenJPEG(downloadBlob, _gpsLat, _gpsLon, _gpsAlt);
  }).then(function(blobFinal) {
    descargarBlob(blobFinal, _fotoCodigo + '.jpg');
    return _canvasAJpeg(thumbCanvas, 0.8);
  }).then(function(thumb) {
    thumbData = thumb.dataUrl;
    // Versión de subida: codificar a blob, inyectar GPS en EXIF y
    // reconvertir a data URL (formato que espera sync.js/upload.php),
    // para que la copia de Cloudinary también quede geolocalizada.
    return _canvasABlob(canvas, 0.94);
  }).then(function(upBlob) {
    return inyectarGPSenJPEG(upBlob, _gpsLat, _gpsLon, _gpsAlt);
  }).then(function(upBlobExif) {
    return _blobADataURL(upBlobExif);
  }).then(function(upDataUrl) {
    uploadData = upDataUrl;

  return guardarEnDB('fotos', {codigo: _fotoCodigo, data: thumbData, fecha: Date.now()}).then(function() {
    return guardarEnDB('subidas_pendientes', {codigo: _fotoCodigo, data: uploadData, tipo: _camaraTipo, fecha: Date.now()});
  }).then(function() {
    // Añadir preview a la página
    if (!fotosPagina[_camaraSubtipo]) fotosPagina[_camaraSubtipo] = [];
    if (_camaraSubtipo === 'W1' || _camaraSubtipo === 'W2') {
      fotosPagina[_camaraSubtipo].push({codigo: _fotoCodigo, lat: _gpsLat, lon: _gpsLon});
      // Guardar waypoint persistente en IndexedDB
      if (_gpsLat && _gpsLon && db) {
        var prefix = _camaraTipo === 'EI' ? 'ev' : _camaraTipo.toLowerCase();
        var _unidad = document.getElementById(prefix + '-unidad') ? document.getElementById(prefix + '-unidad').value : '';
        guardarEnDB('waypoints_comp', {
          id: _fotoCodigo,
          codigo: _fotoCodigo,
          waypoint: _camaraSubtipo,
          lat: _gpsLat,
          lon: _gpsLon,
          unidad: _unidad,
          tipo: _camaraTipo,
          fecha: new Date().toISOString(),
          operador: sesion ? sesion.nombre : ''
        }).catch(function(e) { console.warn('Error guardando waypoint:', e); });
      }
    } else {
      fotosPagina[_camaraSubtipo].push(_fotoCodigo);
    }

    var prefix = _camaraTipo === 'EI' ? 'ev' : _camaraTipo.toLowerCase();
    var previewGrid = document.getElementById(prefix + '-fotos-preview');
    if (previewGrid) {
      var img = document.createElement('img');
      img.src = thumbData;
      img.title = _fotoCodigo;
      img.onclick = function() { abrirLightboxFoto(this.src, _fotoCodigo); };
      previewGrid.appendChild(img);
    }

    actualizarBtnEliminarFotos(prefix);
    actualizarContadorFotos();
    if (navigator.onLine) {
      showToast('Foto ' + _fotoCodigo + ' guardada. Subiendo...', 'success');
      subirFotosPendientesAuto();
    } else {
      showToast('Foto ' + _fotoCodigo + ' guardada. Sin conexión — se subirá al conectar.', 'info');
    }
  }).catch(function(err) {
    console.error('Error guardando foto:', err);
    showToast('Error al guardar foto: ' + (err.message || err), 'error');
  });

  }).catch(function(err) {
    console.error('Error codificando foto:', err);
    showToast('Error al procesar foto. Reintenta.', 'error');
  });
}

// ============================================================
// sync.js - Módulo de sincronización para RAPCA
// Extraído de app.js con mejoras de reintentos, indicadores
// de estado y cola de subida visible.
// ============================================================

// --- Cola de reintentos con backoff exponencial ---
var syncRetryCola = [];
var syncRetryTimer = null;

function programarReintento(registro, intento) {
  if (intento >= 4) return; // max 4 reintentos
  var delay = Math.pow(2, intento) * 1000;
  syncRetryCola.push({registro: registro, intento: intento});
  if (!syncRetryTimer) {
    syncRetryTimer = setTimeout(function() {
      syncRetryTimer = null;
      procesarReintentos();
    }, delay);
  }
}

async function procesarReintentos() {
  if (syncRetryCola.length === 0) return;
  // No competir con una sincronización en curso ni quemar reintentos offline:
  // volver a intentarlo más tarde manteniendo la cola intacta
  if (sincronizando || !navigator.onLine) {
    if (!syncRetryTimer) {
      syncRetryTimer = setTimeout(function() {
        syncRetryTimer = null;
        procesarReintentos();
      }, 5000);
    }
    return;
  }
  var cola = syncRetryCola.slice();
  syncRetryCola = [];

  for (var i = 0; i < cola.length; i++) {
    var item = cola[i];
    var r = item.registro;
    var intento = item.intento;

    // Ya sincronizado por otra vía (p. ej. sincronizar() lo procesó): saltar
    if (r.enviado) continue;

    r.syncEstado = 'sincronizando';
    actualizarIndicadorSync();

    try {
      if (sesion && sesion.token) {
        var resp = await fetch(API_BASE + 'datos.php', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
          body: JSON.stringify({
            accion: 'upsert',
            registro_id: r.id,
            email: r.operador_email,
            tipo: r.tipo,
            fecha: r.fecha,
            zona: r.zona,
            unidad: r.unidad,
            transecto: r.transecto,
            datos: JSON.stringify(r.datos),
            lat: r.lat,
            lon: r.lon
          })
        });
        if (resp.ok) {
          var result = await resp.json();
          if (result.ok) {
            r.enviado = true;
            r.syncEstado = 'sincronizado';
            guardarRegistros();
            console.log('Reintento exitoso para registro', r.id, 'en intento', intento + 1);
          } else {
            r.syncEstado = 'error';
            programarReintento(r, intento + 1);
          }
        } else {
          r.syncEstado = 'error';
          programarReintento(r, intento + 1);
        }
      } else {
        r.syncEstado = 'error';
        programarReintento(r, intento + 1);
      }
    } catch (e) {
      console.warn('Reintento fallido para registro', r.id, ':', e.message);
      r.syncEstado = 'error';
      programarReintento(r, intento + 1);
    }
  }

  guardarRegistros();
  actualizarEstado();
  actualizarIndicadorSync();
}

// --- Indicador de estado de sync ---
function actualizarIndicadorSync() {
  var pendientes = registros.filter(function(r) { return !r.enviado; }).length;
  var errores = registros.filter(function(r) { return r.syncEstado === 'error'; }).length;
  var badge = document.getElementById('sync-status-badge');
  if (!badge) return;
  if (pendientes === 0) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'inline-block';
    badge.textContent = pendientes + (errores > 0 ? ' (' + errores + ' err)' : '');
    badge.style.background = errores > 0 ? '#e74c3c' : '#f39c12';
  }
}

// --- Cola de subida visible ---
function actualizarColaSubida() {
  if (!db) return;
  obtenerTodosDB('subidas_pendientes').then(function(items) {
    var el = document.getElementById('upload-queue-status');
    if (!el) return;
    if (items.length === 0) {
      el.style.display = 'none';
    } else {
      el.style.display = 'block';
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff3cd;border-radius:8px;font-size:13px">' +
        '<span style="font-size:18px">📤</span>' +
        '<div><strong>' + items.length + ' fotos pendientes</strong><br>' +
        '<small>Se subirán automáticamente con conexión</small></div>' +
        (navigator.onLine ? '<button class="btn btn-sm" onclick="subirFotosPendientes()" style="margin-left:auto">Subir ahora</button>' : '') +
        '</div>';
    }
  });
}

// --- Sincronización principal (con reintentos y estados) ---
var syncPendienteTrasFinalizar = false;
async function sincronizar() {
  if (sincronizando) {
    // Encolar re-sync para cuando termine el actual
    syncPendienteTrasFinalizar = true;
    return;
  }
  sincronizando = true;
  syncPendienteTrasFinalizar = false;
  try {
  var pendientes = registros.filter(function(r) { return !r.enviado; });
  if (pendientes.length === 0) { showToast('No hay registros pendientes de sincronizar', 'info'); return; }

  // Si el token es local o no existe, intentar re-autenticar antes de sincronizar
  if (!sesion || !sesion.token || sesion.token.startsWith('local_')) {
    var reauth = await reautenticar();
    if (!reauth) {
      showToast('Necesitas iniciar sesión online para sincronizar. Cierra sesión y vuelve a entrar.', 'error');
      return;
    }
  }

  showToast('Sincronizando ' + pendientes.length + ' registros...', 'info');

  // Marcar todos los pendientes como 'sincronizando'
  for (var p = 0; p < pendientes.length; p++) {
    pendientes[p].syncEstado = 'sincronizando';
  }
  actualizarIndicadorSync();

  var exitos = 0;
  var yaReautenticado = false;
  for (var i = 0; i < pendientes.length; i++) {
    var r = pendientes[i];
    // Intentar Google Forms (solo una vez por registro: con mode no-cors la
    // respuesta es opaca y reenviarlo en cada reintento duplica filas en la hoja)
    try {
      if (GOOGLE_FORM_URL && !r.enviadoForm) {
        var formData = new FormData();
        formData.append('entry.tipo', r.tipo);
        formData.append('entry.fecha', r.fecha);
        formData.append('entry.zona', r.zona);
        formData.append('entry.unidad', r.unidad);
        formData.append('entry.transecto', r.transecto);
        formData.append('entry.datos', JSON.stringify(r.datos));
        await fetch(GOOGLE_FORM_URL, {method: 'POST', body: formData, mode: 'no-cors'});
        r.enviadoForm = true;
      }
    } catch(e) {}

    // Intentar PHP backend
    try {
      if (sesion && sesion.token) {
        var resp = await fetch(API_BASE + 'datos.php', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
          body: JSON.stringify({
            accion: 'upsert',
            registro_id: r.id,
            email: r.operador_email,
            tipo: r.tipo,
            fecha: r.fecha,
            zona: r.zona,
            unidad: r.unidad,
            transecto: r.transecto,
            datos: JSON.stringify(r.datos),
            lat: r.lat,
            lon: r.lon
          })
        });
        if (resp.ok) {
          var result = await resp.json();
          if (result.ok) {
            r.enviado = true;
            r.syncEstado = 'sincronizado';
            exitos++;
            // Persistir cada éxito al momento: si la app se cierra a mitad
            // de la cola, no se pierde el estado y no se reenvía
            guardarRegistros();
          } else {
            r.syncEstado = 'error';
            programarReintento(r, 0);
          }
        } else if (resp.status === 401 && !yaReautenticado) {
          // Token expirado, intentar re-autenticar y reintentar este registro
          yaReautenticado = true;
          var reauth = await reautenticar();
          if (reauth) {
            console.log('Re-autenticado durante sync, reintentando registro', r.id);
            i--; // Reintentar este mismo registro
            continue;
          } else {
            showToast('Token expirado. Cierra sesión y vuelve a entrar.', 'error');
            r.syncEstado = 'error';
            break;
          }
        } else {
          console.warn('Sync HTTP error:', r.id, resp.status);
          r.syncEstado = 'error';
          programarReintento(r, 0);
        }
      } else {
        console.warn('Sync: sin token válido para registro', r.id);
        r.syncEstado = 'error';
      }
    } catch(e) {
      console.warn('Sync error:', r.id, e.message);
      r.syncEstado = 'error';
      programarReintento(r, 0);
    }

    // Stagger
    if (i < pendientes.length - 1) await new Promise(function(res) { setTimeout(res, 600); });
  }

  guardarRegistros();
  actualizarEstado();
  actualizarIndicadorSync();
  actualizarColaSubida();
  showToast(exitos + '/' + pendientes.length + ' registros sincronizados', exitos > 0 ? 'success' : 'error');
  // Recargar registros del servidor para tener datos actualizados
  if (exitos > 0) cargarRegistrosServidor();
  } finally {
    sincronizando = false;
    // Si se encoló un re-sync mientras estábamos sincronizando, lanzarlo ahora
    if (syncPendienteTrasFinalizar) {
      syncPendienteTrasFinalizar = false;
      setTimeout(function() { sincronizar(); }, 1000);
    }
  }
}

// --- Subida de fotos pendientes ---
async function subirFotosPendientes() {
  if (!db) { showToast('Base de datos no lista', 'error'); return; }
  var pendientes = await obtenerTodosDB('subidas_pendientes');
  if (pendientes.length === 0) { showToast('No hay fotos pendientes', 'info'); return; }

  // Si el token es local o no existe, intentar re-autenticar antes de subir
  if (!sesion || !sesion.token || sesion.token.startsWith('local_')) {
    var reauth = await reautenticar();
    if (!reauth) {
      showToast('Necesitas iniciar sesión online para subir fotos. Cierra sesión y vuelve a entrar con conexión.', 'error');
      return;
    }
  }

  var progDiv = document.getElementById('upload-progress');
  var progText = document.getElementById('prog-text');
  var progFill = document.getElementById('prog-fill');
  progDiv.classList.add('show');

  var total = pendientes.length;
  var subidas = 0;
  var fallos = 0;
  var avisos = [];

  for (var i = 0; i < pendientes.length; i++) {
    var foto = pendientes[i];
    progText.textContent = 'Subiendo ' + (i + 1) + '/' + total + ': ' + foto.codigo;
    progFill.style.width = ((i / total) * 100) + '%';

    var ok = false;

    // Intento 1: Subir al servidor (que sube a Cloudinary)
    if (!sesion || !sesion.token) {
      showToast('Sesión no iniciada. Inicia sesión para subir fotos.', 'error');
      fallos++;
      continue;
    }
    var yaReautenticado = false;
    for (var intento = 0; intento < 3; intento++) {
      try {
        var resp = await fetch(API_BASE + 'upload.php', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
          body: JSON.stringify({codigo: foto.codigo, tipo: foto.tipo, imagen: foto.data})
        });
        if (!resp.ok) {
          console.warn('Upload HTTP error:', foto.codigo, resp.status, resp.statusText);
          if (resp.status === 401 && !yaReautenticado) {
            // Intentar re-autenticar una vez y reintentar
            yaReautenticado = true;
            var reauth = await reautenticar();
            if (reauth) {
              console.log('Re-autenticado, reintentando subida...');
              continue;
            }
            showToast('Token expirado. Cierra sesión y vuelve a entrar.', 'error');
            break;
          } else if (resp.status === 401) {
            break;
          }
          if (intento < 2) await new Promise(function(r) { setTimeout(r, 1000 * (intento + 1)); });
          continue;
        }
        var result = await resp.json();
        if (result.ok) {
          await eliminarDeDB('subidas_pendientes', foto.codigo);
          subidas++;
          ok = true;
          if (result.aviso) avisos.push(foto.codigo + ': ' + result.aviso);
          if (result.modo === 'cloudinary') {
            console.log('Subida a Cloudinary OK:', foto.codigo, result.url);
          } else {
            console.log('Subida local:', foto.codigo, result.modo, result.url);
          }
          break;
        } else {
          console.warn('Upload falló:', foto.codigo, result.error);
        }
      } catch (e) {
        console.warn('Upload error intento ' + (intento + 1) + ':', e.message);
        if (intento < 2) await new Promise(function(r) { setTimeout(r, 1000 * (intento + 1)); });
      }
    }

    // Intento 2: Subida directa a Cloudinary (unsigned) si el servidor falló
    if (!ok) {
      try {
        ok = await subirDirectoCloudinary(foto);
        if (ok) {
          await eliminarDeDB('subidas_pendientes', foto.codigo);
          subidas++;
          avisos.push(foto.codigo + ': subida directa a Cloudinary');
        }
      } catch (e) {
        console.warn('Upload directo Cloudinary falló:', e.message);
      }
    }

    if (!ok) fallos++;

    // Actualizar cola de subida visible después de cada foto
    actualizarColaSubida();
  }

  progFill.style.width = '100%';
  progText.textContent = 'Completado: ' + subidas + ' subidas, ' + fallos + ' fallos';
  setTimeout(function() { progDiv.classList.remove('show'); }, 4000);
  actualizarContadorFotos();
  actualizarColaSubida();

  if (avisos.length > 0) console.log('Avisos de subida:', avisos);

  if (fallos > 0) {
    showToast(fallos + ' fotos fallaron al subir', 'error');
    fetch(API_BASE + 'notificar.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tipo: 'fallo_subida', fallos: fallos, operador: sesion ? sesion.email : ''})
    }).catch(function() {});
  } else {
    showToast('Todas las fotos subidas correctamente', 'success');
  }
}

// --- Subida directa a Cloudinary (unsigned upload con upload preset) ---
async function subirDirectoCloudinary(foto) {
  var cloudName = 'drnqs1jwl';
  var uploadPreset = 'rapca_unsigned';

  // Convertir base64 a Blob
  var byteString = atob(foto.data.split(',')[1] || foto.data);
  var ab = new ArrayBuffer(byteString.length);
  var ia = new Uint8Array(ab);
  for (var i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  var blob = new Blob([ab], {type: 'image/jpeg'});

  var parts = foto.codigo.split('_');
  var unidad = parts[0] || 'sin_unidad';
  var folder = 'rapca/' + foto.tipo + '/' + unidad;

  var formData = new FormData();
  formData.append('file', blob, foto.codigo + '.jpg');
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', folder);
  formData.append('public_id', foto.codigo);

  var resp = await fetch('https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload', {
    method: 'POST',
    body: formData
  });
  if (!resp.ok) {
    console.warn('Cloudinary directo HTTP error:', resp.status, resp.statusText);
    return false;
  }
  var result = await resp.json();
  if (result.secure_url) {
    console.log('Cloudinary directo OK:', result.secure_url);
    return true;
  }
  console.warn('Cloudinary directo error:', result);
  return false;
}

// --- Cargar registros del servidor ---
async function cargarRegistrosServidor() {
  // Si el token es local, intentar re-autenticar primero
  if (!sesion || !sesion.token || sesion.token.startsWith('local_')) {
    var reauth = await reautenticar();
    if (!reauth) {
      return;
    }
  }

  try {
    var resp = await fetch(API_BASE + 'datos.php?accion=listar', {
      headers: {'Authorization': 'Bearer ' + sesion.token}
    });
    if (resp.status === 401) {
      var reauth = await reautenticar();
      if (reauth) {
        resp = await fetch(API_BASE + 'datos.php?accion=listar', {
          headers: {'Authorization': 'Bearer ' + sesion.token}
        });
      } else {
        return;
      }
    }
    var data = await resp.json();
    if (data.ok && data.registros) {
      // Integrar registros del servidor en el array local
      // Los del servidor tienen registro_id que corresponde al id local
      var localesIds = {};
      registros.forEach(function(r) { localesIds[r.id] = true; });

      data.registros.forEach(function(sr) {
        // Asegurar que localId sea siempre número (PDO devuelve BIGINT como string)
        var localId = sr.registro_id ? Number(sr.registro_id) : Number(sr.id);
        if (!localesIds[localId]) {
          // Parsear datos JSON si viene como string
          var datos = sr.datos;
          if (typeof datos === 'string') {
            try { datos = JSON.parse(datos); } catch(e) { datos = {}; }
          }
          registros.push({
            id: localId,
            server_id: sr.id,
            tipo: sr.tipo,
            fecha: sr.fecha,
            zona: sr.zona || '',
            unidad: sr.unidad || '',
            transecto: sr.transecto || '',
            datos: datos || {},
            enviado: true,
            syncEstado: 'sincronizado',
            lat: sr.lat ? parseFloat(sr.lat) : null,
            lon: sr.lon ? parseFloat(sr.lon) : null,
            operador_email: sr.email,
            operador_nombre: sr.operador_nombre || sr.email
          });
        } else {
          // Marcar como enviado si ya existe localmente, PERO nunca pisar
          // registros con cambios locales pendientes de subir (enviado === false),
          // p. ej. ediciones hechas offline que aún no se han sincronizado.
          var idx = registros.findIndex(function(r) { return r.id === localId; });
          if (idx >= 0 && registros[idx].enviado !== false) {
            registros[idx].enviado = true;
            registros[idx].syncEstado = 'sincronizado';
          }
        }
      });

      guardarRegistros();
      reconstruirContadores();
      actualizarIndicadorSync();

      // Actualizar panel admin si existe (escapando datos de otros operadores)
      var div = document.getElementById('admin-server-records');
      if (div) {
        var htmlSrv = '<p>' + data.registros.length + ' registros en servidor</p>';
        data.registros.forEach(function(r) {
          htmlSrv += '<div class="card" style="font-size:12px"><strong>' + escapeHtml(r.tipo) + '</strong> ' + escapeHtml(r.unidad || '') + ' · ' + escapeHtml(r.fecha) + ' · <small>' + escapeHtml(r.email) + '</small></div>';
        });
        div.innerHTML = htmlSrv;
      }
    }
  } catch(e) {
    console.warn('No se pudo cargar registros del servidor:', e.message);
  }
}

// --- Sincronización automática ---
function sincronizarAuto() {
  var pend = registros.filter(function(r) { return !r.enviado; });
  if (pend.length > 0) {
    var badge = document.getElementById('pending-sync');
    badge.textContent = pend.length;
    badge.style.display = 'inline';
    // Sincronizar automáticamente si hay token válido del servidor
    if (sesion && sesion.token && !sesion.token.startsWith('local_')) {
      sincronizar();
    }
  } else {
    var badge = document.getElementById('pending-sync');
    badge.style.display = 'none';
  }
  // Auto-subir fotos pendientes si hay conexión
  if (navigator.onLine && sesion && sesion.token && !sesion.token.startsWith('local_')) {
    subirFotosPendientesAuto();
  }
  // Actualizar indicadores visuales
  actualizarIndicadorSync();
  actualizarColaSubida();
}

// --- Subida automática de fotos en segundo plano (sin bloquear UI con toast excesivos) ---
var subiendoFotosAuto = false;
var subiendoFotosAutoTimer = null;
async function subirFotosPendientesAuto() {
  if (!db || subiendoFotosAuto) return;
  // Sin token válido no hay nada que subir (evita TypeError y prompts espontáneos)
  if (!sesion || !sesion.token || sesion.token.startsWith('local_')) return;
  // Poner el flag ANTES de cualquier await: dos eventos 'online' casi simultáneos
  // pasaban ambos el guard y subían la misma lista de fotos por duplicado
  subiendoFotosAuto = true;
  try {
    var pendientes = await obtenerTodosDB('subidas_pendientes');
    if (pendientes.length === 0) return;
    // Safety timeout: si después de 2 min por foto sigue bloqueado, liberar el flag
    subiendoFotosAutoTimer = setTimeout(function() {
      console.warn('subirFotosPendientesAuto: timeout de seguridad alcanzado, liberando flag');
      subiendoFotosAuto = false;
      subiendoFotosAutoTimer = null;
    }, Math.max(120000, pendientes.length * 30000)); // mín 2min, o 30s por foto
    for (var i = 0; i < pendientes.length; i++) {
      var foto = pendientes[i];
      try {
        var resp = await fetch(API_BASE + 'upload.php', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
          body: JSON.stringify({codigo: foto.codigo, tipo: foto.tipo, imagen: foto.data})
        });
        if (resp.ok) {
          var result = await resp.json();
          if (result.ok) {
            await eliminarDeDB('subidas_pendientes', foto.codigo);
          }
        } else if (resp.status === 401) {
          var reauth = await reautenticar();
          if (reauth) { i--; continue; }
          break;
        }
      } catch(e) { break; } // Sin conexión, parar
    }
    actualizarContadorFotos();
    actualizarColaSubida();
  } finally {
    subiendoFotosAuto = false;
    if (subiendoFotosAutoTimer) { clearTimeout(subiendoFotosAutoTimer); subiendoFotosAutoTimer = null; }
  }
}

// --- Sync automático al reconectar ---
window.addEventListener('online', function() {
  showToast('Conexión recuperada. Sincronizando...', 'info');
  // sincronizarAuto ya lanza la subida de fotos pendientes; llamarla aquí
  // de nuevo provocaba dos subidas concurrentes de las mismas fotos
  setTimeout(function() {
    sincronizarAuto();
  }, 2000);
});
// ============================================================
// RAPCA Campo — map.js — Mapa, KML, GPS, exportaciones geo
// ============================================================

// Escapa texto para XML (exportaciones KML/GPX): una unidad con '&' o '<'
// generaba archivos inválidos que Google Earth/GPS rechazan
function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Escapa una cadena para usarla dentro de un literal JS con comillas simples
// en un atributo HTML inline (escapeHtml solo no basta: el parser HTML
// decodifica &#39; de vuelta a comilla dentro del atributo)
function escapeJsAttr(s) {
  return escapeHtml(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

// Capa persistente de waypoints comparativos
var capaWaypointsPersist = null;
// Capa de infraestructuras KML
var capaInfraKML = null;
var infraKMLFeatures = []; // Array de {nombre, lat, lon, attrs}
var gpxCapas = []; // Array de {nombre, layer}

// GPS tracking del operador en mapa
var gpsMapMarker = null;
var gpsMapCircle = null;
var gpsMapWatchId = null;
// Modo seguimiento: el mapa se recentra con cada actualización GPS.
// Se desactiva al arrastrar el mapa manualmente; el botón 📍 lo reactiva.
var gpsMapSeguir = true;

function initMapa() {
  if (mapa) {
    mapa.invalidateSize();
    actualizarMarcadores();
    // Reactivar tracking y centrado al volver a entrar en el mapa
    // (al salir de la página se detiene el GPS con detenerGPSMapa)
    gpsMapSeguir = true;
    if (!gpsMapWatchId) iniciarGPSMapa();
    centrarMapaEnGPS();
    return;
  }
  var mapDiv = document.getElementById('map-container');
  mapa = L.map(mapDiv, {zoomControl: false}).setView([37.78, -3.79], 10);

  // Si el usuario arrastra el mapa, dejar de seguir su posición
  mapa.on('dragstart', function() { gpsMapSeguir = false; });

  // Basemaps
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OSM', maxZoom: 19});
  var pnoa = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {attribution: '© IGN PNOA', maxZoom: 19});
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {attribution: '© OpenTopoMap', maxZoom: 17});
  osm.addTo(mapa);

  // Capa de fotos comparativas (W1/W2)
  capaFotosComp = L.layerGroup();
  // Capa persistente de waypoints
  capaWaypointsPersist = L.layerGroup();
  // Capa de infraestructuras KML
  capaInfraKML = L.layerGroup();

  L.control.layers(
    {'OpenStreetMap': osm, 'PNOA Ortofoto': pnoa, 'Topográfico': topo},
    {'Fotos comparativas W1/W2': capaFotosComp, 'Waypoints persistentes': capaWaypointsPersist, 'Infraestructuras KML': capaInfraKML},
    {position: 'topright'}
  ).addTo(mapa);
  L.control.zoom({position: 'topright'}).addTo(mapa);

  // MarkerCluster
  mapaMarkers = L.markerClusterGroup();
  mapa.addLayer(mapaMarkers);
  mapa.addLayer(capaFotosComp);
  mapa.addLayer(capaWaypointsPersist);
  mapa.addLayer(capaInfraKML);

  actualizarMarcadores();
  cargarCapasKML();
  cargarWaypointsPersistentes();
  cargarInfraKMLGuardada();

  // Iniciar tracking GPS automático del operador
  gpsMapSeguir = true;
  iniciarGPSMapa();
  centrarMapaEnGPS();
}

// Centrar el mapa en la posición GPS actual (última conocida o nueva lectura)
function centrarMapaEnGPS() {
  if (!mapa) return;
  if (gpsPos) {
    mapa.setView([gpsPos.lat, gpsPos.lon], Math.max(mapa.getZoom(), 15));
    return;
  }
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function(pos) {
    gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    // Solo centrar si el usuario no ha movido el mapa mientras tanto
    if (mapa && gpsMapSeguir) mapa.setView([gpsPos.lat, gpsPos.lon], 16);
  }, function() {}, {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000});
}

function actualizarMarcadores() {
  if (!mapaMarkers) return;
  mapaMarkers.clearLayers();
  var regs = misRegistros();
  var colores = {VP: '#88d8b0', EL: '#2ecc71', EI: '#fd9853'};

  for (var i = 0; i < regs.length; i++) {
    var r = regs[i];
    if (!r.lat || !r.lon) continue;
    var color = colores[r.tipo] || '#888';
    var marker = L.circleMarker([r.lat, r.lon], {radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9});
    var primerFoto = r.datos && r.datos.fotos ? r.datos.fotos.split(',')[0].trim() : '';
    var popupHtml = '<strong>' + escapeHtml(r.tipo) + '</strong><br>' + escapeHtml(r.unidad) + '<br>' + escapeHtml(r.fecha) + '<br><small>' + escapeHtml(r.operador_nombre || '') + '</small>';
    if (primerFoto) {
      popupHtml += '<div id="popup-foto-' + r.id + '" style="margin-top:6px;text-align:center"><span style="color:#888;font-size:11px">Cargando foto...</span></div>';
    }
    marker.bindPopup(popupHtml, {minWidth: 140, maxWidth: 200});
    if (primerFoto) {
      (function(regId, codigo) {
        marker.on('popupopen', function() {
          var container = document.getElementById('popup-foto-' + regId);
          if (!container || container.dataset.loaded) return;
          container.dataset.loaded = '1';
          obtenerDeDB('fotos', codigo).then(function(f) {
            if (f && container) {
              container.innerHTML = '<img src="' + f.data + '" style="width:100%;max-width:180px;border-radius:6px;cursor:pointer" onclick="abrirLightboxFoto(this.src,\'' + escapeJsAttr(codigo) + '\')">';
            } else if (container) {
              container.innerHTML = '<span style="color:#888;font-size:11px">' + escapeHtml(codigo) + '</span>';
            }
          }).catch(function() {
            if (container) container.innerHTML = '';
          });
        });
      })(r.id, primerFoto);
    }
    mapaMarkers.addLayer(marker);
  }

  // Infraestructuras
  for (var i = 0; i < infraestructuras.length; i++) {
    var inf = infraestructuras[i];
    if (!inf.lat || !inf.lon) continue;
    var m = L.circleMarker([inf.lat, inf.lon], {radius: 8, fillColor: '#8e44ad', color: '#fff', weight: 2, fillOpacity: 0.9});
    // Badges
    var vpCount = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'VP'; }).length;
    var elCount = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'EL'; }).length;
    var eiCount = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'EI'; }).length;
    m.bindPopup('<strong>' + escapeHtml(inf.nombre || inf.idUnidad) + '</strong><br>' +
      '<span class="badge badge-vp">VP:' + vpCount + '</span> ' +
      '<span class="badge badge-el">EL:' + elCount + '</span> ' +
      '<span class="badge badge-ei">EI:' + eiCount + '</span>');
    mapaMarkers.addLayer(m);
  }

  // Capa de fotos comparativas W1/W2
  if (capaFotosComp) {
    capaFotosComp.clearLayers();
    var coloresWP = {W1: '#e74c3c', W2: '#3498db'};
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var fc = r.datos && r.datos.fotosComp ? r.datos.fotosComp : [];
      for (var j = 0; j < fc.length; j++) {
        var foto = fc[j];
        var fLat = foto.lat || r.lat;
        var fLon = foto.lon || r.lon;
        if (!fLat || !fLon) continue;
        var wColor = coloresWP[foto.waypoint] || '#888';
        var wMarker = L.circleMarker([fLat, fLon], {radius: 6, fillColor: wColor, color: '#fff', weight: 2, fillOpacity: 0.9});
        var wPopupId = 'popup-wfoto-' + r.id + '-' + j;
        wMarker.bindPopup('<strong>' + escapeHtml(foto.waypoint) + '</strong><br>' +
          '<small>' + escapeHtml(foto.numero) + '</small><br>' +
          escapeHtml(r.tipo) + ' - ' + escapeHtml(r.unidad) + '<br>' +
          escapeHtml(r.fecha) +
          '<div id="' + wPopupId + '" style="margin-top:6px;text-align:center"><span style="color:#888;font-size:11px">Cargando foto...</span></div>',
          {minWidth: 140, maxWidth: 200});
        (function(popId, codigo) {
          wMarker.on('popupopen', function() {
            var container = document.getElementById(popId);
            if (!container || container.dataset.loaded) return;
            container.dataset.loaded = '1';
            obtenerDeDB('fotos', codigo).then(function(f) {
              if (f && container) {
                container.innerHTML = '<img src="' + f.data + '" style="width:100%;max-width:180px;border-radius:6px;cursor:pointer" onclick="abrirLightboxFoto(this.src,\'' + escapeJsAttr(codigo) + '\')">';
              } else if (container) {
                container.innerHTML = '<span style="color:#888;font-size:11px">' + escapeHtml(codigo) + '</span>';
              }
            }).catch(function() {
              if (container) container.innerHTML = '';
            });
          });
        })(wPopupId, foto.numero);
        capaFotosComp.addLayer(wMarker);
      }
    }
  }

  // Poblar tabla de atributos
  attrData = regs.map(function(r) { return {tipo: r.tipo, unidad: r.unidad, zona: r.zona, fecha: r.fecha, operador: r.operador_nombre, coordenadas: r.lat ? formatCoordNW(r.lat, r.lon) : '—'}; });
}

function iniciarGPSMapa() {
  if (!navigator.geolocation || !mapa) return;
  // Limpiar watch anterior si existe
  if (gpsMapWatchId) navigator.geolocation.clearWatch(gpsMapWatchId);

  gpsMapWatchId = navigator.geolocation.watchPosition(function(pos) {
    gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    var latlng = [pos.coords.latitude, pos.coords.longitude];
    var accuracy = pos.coords.accuracy || 30;
    var heading = pos.coords.heading;
    var esPrimerFix = !gpsMapMarker;

    if (!gpsMapMarker) {
      // Crear marcador con punto azul pulsante
      var icon = L.divIcon({
        className: '',
        html: '<div style="position:relative;width:18px;height:18px">' +
              '<div class="gps-marker-pulse"></div>' +
              '<div class="gps-marker-dot"></div>' +
              '<div class="gps-marker-heading" id="gps-heading-arrow" style="display:none"></div>' +
              '</div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      gpsMapMarker = L.marker(latlng, {icon: icon, zIndexOffset: 9999}).addTo(mapa);
      gpsMapMarker.bindPopup('Mi posición');
      // Círculo de precisión
      gpsMapCircle = L.circle(latlng, {radius: accuracy, color: '#3498db', fillColor: '#3498db', fillOpacity: 0.08, weight: 1, opacity: 0.3}).addTo(mapa);
    } else {
      gpsMapMarker.setLatLng(latlng);
      gpsMapCircle.setLatLng(latlng);
      gpsMapCircle.setRadius(accuracy);
    }

    // Flecha de dirección
    var arrow = document.getElementById('gps-heading-arrow');
    if (arrow) {
      if (heading !== null && !isNaN(heading)) {
        arrow.style.display = '';
        arrow.style.transform = 'rotate(' + heading + 'deg)';
      } else {
        arrow.style.display = 'none';
      }
    }

    // Seguimiento: recentrar el mapa según te mueves
    if (gpsMapSeguir && mapa) {
      if (esPrimerFix) mapa.setView(latlng, Math.max(mapa.getZoom(), 16));
      else mapa.panTo(latlng);
    }
  }, function(err) {
    if (err.code === 1) showToast('GPS: permiso denegado', 'error');
  }, {enableHighAccuracy: true, maximumAge: 3000, timeout: 10000});
}

function detenerGPSMapa() {
  if (gpsMapWatchId) {
    navigator.geolocation.clearWatch(gpsMapWatchId);
    gpsMapWatchId = null;
  }
  if (gpsMapMarker && mapa) { mapa.removeLayer(gpsMapMarker); gpsMapMarker = null; }
  if (gpsMapCircle && mapa) { mapa.removeLayer(gpsMapCircle); gpsMapCircle = null; }
  // Detener también el watch del panel de coordenadas: seguía vivo en
  // segundo plano (gastando batería) al salir del mapa con el panel abierto
  if (typeof gpsWatchId !== 'undefined' && gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    var gpsPanel = document.getElementById('gps-panel');
    if (gpsPanel) gpsPanel.classList.remove('visible');
  }
}

function miPosicion() {
  if (!navigator.geolocation) { showToast('GPS no disponible', 'error'); return; }
  // Reactivar el seguimiento continuo
  gpsMapSeguir = true;
  // Si no hay tracking activo, iniciarlo
  if (!gpsMapWatchId) iniciarGPSMapa();
  // Centrar en posición actual
  if (gpsPos && mapa) {
    mapa.setView([gpsPos.lat, gpsPos.lon], 16);
  } else {
    showToast('Obteniendo posición...', 'info');
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
      if (mapa) mapa.setView([gpsPos.lat, gpsPos.lon], 16);
    }, function() { showToast('No se pudo obtener posición', 'error'); }, {enableHighAccuracy: true});
  }
}

function toggleGPS() {
  var panel = document.getElementById('gps-panel');
  if (panel.classList.contains('visible')) {
    panel.classList.remove('visible');
    if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    return;
  }
  panel.classList.add('visible');
  if (!navigator.geolocation) return;
  gpsWatchId = navigator.geolocation.watchPosition(function(pos) {
    gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    var coordNW = formatCoordNW(pos.coords.latitude, pos.coords.longitude);
    document.getElementById('gps-lat').textContent = coordNW.split('  ')[0];
    document.getElementById('gps-lon').textContent = coordNW.split('  ')[1];
    document.getElementById('gps-alt').textContent = pos.coords.altitude ? pos.coords.altitude.toFixed(1) + 'm' : '—';
    document.getElementById('gps-utm').textContent = latLonToUTM(pos.coords.latitude, pos.coords.longitude);
    document.getElementById('gps-speed').textContent = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) + ' km/h' : '—';
    document.getElementById('gps-acc').textContent = pos.coords.accuracy ? pos.coords.accuracy.toFixed(0) + 'm' : '—';
    document.getElementById('gps-heading').textContent = pos.coords.heading ? pos.coords.heading.toFixed(0) + '°' : '—';
  }, function() {}, {enableHighAccuracy: true, maximumAge: 1000, timeout: 5000});
}

function toggleGPSPanelBody() {
  var body = document.getElementById('gps-panel-body');
  var btn = document.getElementById('gps-panel-collapse');
  body.classList.toggle('collapsed');
  btn.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
}

function toggleMapToolbar() {
  var toolbar = document.getElementById('map-toolbar');
  var btn = document.getElementById('map-toolbar-toggle');
  toolbar.classList.toggle('open');
  btn.classList.toggle('shifted');
  btn.textContent = toolbar.classList.contains('open') ? '✕' : '🔧';
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('mapa-page').requestFullscreen().catch(function() {});
  } else {
    document.exitFullscreen();
  }
}

function toggleMapSearch() {
  var s = document.getElementById('map-search');
  s.classList.toggle('open');
  if (s.classList.contains('open')) document.getElementById('map-search-input').focus();
}

function buscarEnMapa(val) {
  if (!val || val.length < 2) return;
  var v = val.toLowerCase();

  // Buscar en infraestructuras KML
  for (var i = 0; i < infraKMLFeatures.length; i++) {
    var f = infraKMLFeatures[i];
    if (f.nombre && f.nombre.toLowerCase().indexOf(v) >= 0) {
      if (f.lat && f.lon) {
        mapa.setView([f.lat, f.lon], 16);
        // Abrir popup si existe
        if (f.marker) f.marker.openPopup();
        return;
      }
    }
    // Buscar en todos los atributos
    if (f.attrs) {
      var found = false;
      for (var k in f.attrs) {
        if (String(f.attrs[k]).toLowerCase().indexOf(v) >= 0) { found = true; break; }
      }
      if (found && f.lat && f.lon) {
        mapa.setView([f.lat, f.lon], 16);
        if (f.marker) f.marker.openPopup();
        return;
      }
    }
  }

  // Buscar en registros
  var regs = misRegistros();
  var found = regs.find(function(r) { return r.unidad.toLowerCase().indexOf(v) >= 0; });
  if (found && found.lat && found.lon) { mapa.setView([found.lat, found.lon], 16); return; }

  // Buscar en waypoints persistentes
  if (db) {
    obtenerTodosDB('waypoints_comp').then(function(wps) {
      var wp = wps.find(function(w) { return (w.unidad || '').toLowerCase().indexOf(v) >= 0 || (w.codigo || '').toLowerCase().indexOf(v) >= 0; });
      if (wp && wp.lat && wp.lon) mapa.setView([wp.lat, wp.lon], 16);
    });
  }
}

function medirDistancia() {
  medirActivo = !medirActivo;
  if (medirActivo) {
    showToast('Toca el mapa para medir distancia', 'info');
    medirPuntos = [];
    if (medirLinea) { mapa.removeLayer(medirLinea); medirLinea = null; }
    mapa.on('click', medirClick);
  } else {
    mapa.off('click', medirClick);
    if (medirLinea) { mapa.removeLayer(medirLinea); medirLinea = null; }
    medirPuntos = [];
  }
}

function medirClick(e) {
  medirPuntos.push(e.latlng);
  if (medirPuntos.length >= 2) {
    if (medirLinea) mapa.removeLayer(medirLinea);
    medirLinea = L.polyline(medirPuntos, {color: '#e74c3c', weight: 3}).addTo(mapa);
    var dist = 0;
    for (var i = 1; i < medirPuntos.length; i++) dist += medirPuntos[i-1].distanceTo(medirPuntos[i]);
    showToast('Distancia: ' + (dist > 1000 ? (dist/1000).toFixed(2) + ' km' : dist.toFixed(0) + ' m'), 'info');
  }
}

function agregarWaypoint() {
  if (!gpsPos) { showToast('Esperando GPS...', 'error'); return; }
  var name = prompt('Nombre del waypoint:');
  if (!name) return;
  L.marker([gpsPos.lat, gpsPos.lon]).addTo(mapa).bindPopup('<strong>' + escapeHtml(name) + '</strong><br>' + formatCoordNW(gpsPos.lat, gpsPos.lon)).openPopup();
  showToast('Waypoint añadido', 'success');
}

function toggleCapas() { showToast('Usa el control de capas en la esquina superior derecha', 'info'); }

function toggleKMLPanel() {
  var panel = document.getElementById('kml-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderKMLPanel();
}

function toggleWMS() {
  var panel = document.getElementById('wms-panel');
  panel.classList.toggle('open');
}

function agregarWMS() {
  var url = document.getElementById('wms-url').value.trim();
  if (!url) return;
  var layer = L.tileLayer.wms(url, {layers: '', format: 'image/png', transparent: true});
  layer.addTo(mapa);
  wmsCapas.push({url: url, layer: layer});
  var list = document.getElementById('wms-layers-list');
  var idx = wmsCapas.length - 1;
  var div = document.createElement('div');
  div.className = 'wms-layer';
  div.innerHTML = '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)">' +
    '<span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis">' + url.substring(0, 40) + '...</span>' +
    '<button onclick="removeWMSLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0" title="Eliminar capa">✕</button>';
  list.appendChild(div);
  document.getElementById('wms-url').value = '';
  showToast('Capa WMS añadida', 'success');
}

function toggleWMSLayer(idx, visible) {
  if (visible) mapa.addLayer(wmsCapas[idx].layer);
  else mapa.removeLayer(wmsCapas[idx].layer);
}

function removeWMSLayer(idx) {
  if (!wmsCapas[idx]) return;
  mapa.removeLayer(wmsCapas[idx].layer);
  wmsCapas.splice(idx, 1);
  renderWMSList();
  showToast('Capa WMS eliminada', 'info');
}

function renderWMSList() {
  var list = document.getElementById('wms-layers-list');
  if (!list) return;
  list.innerHTML = '';
  wmsCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'wms-layer';
    div.innerHTML = '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)">' +
      '<span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis">' + capa.url.substring(0, 40) + '...</span>' +
      '<button onclick="removeWMSLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0" title="Eliminar capa">✕</button>';
    list.appendChild(div);
  });
}

function toggleAttrTable() {
  var panel = document.getElementById('attr-table-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderAttrTable();
}

function renderAttrTable() {
  var thead = document.getElementById('attr-thead');
  var tbody = document.getElementById('attr-tbody');
  if (attrData.length === 0) { tbody.innerHTML = '<tr><td>Sin datos</td></tr>'; return; }
  var cols = Object.keys(attrData[0]);
  thead.innerHTML = '<tr>' + cols.map(function(c) { return '<th onclick="ordenarAttrTable(\'' + c + '\')">' + c + '</th>'; }).join('') + '</tr>';
  tbody.innerHTML = attrData.map(function(row) {
    return '<tr>' + cols.map(function(c) { return '<td>' + escapeHtml(row[c] || '') + '</td>'; }).join('') + '</tr>';
  }).join('');
}

function filtrarTablaAttr(val) {
  var rows = document.getElementById('attr-tbody').querySelectorAll('tr');
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(val.toLowerCase()) >= 0 ? '' : 'none';
  }
}

function ordenarAttrTable(col) {
  attrData.sort(function(a, b) { return (a[col] || '').toString().localeCompare((b[col] || '').toString()); });
  renderAttrTable();
}

// ============================================================
// KML / GPX
// ============================================================
function cargarKML() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kml,.kmz';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    if (file.name.endsWith('.kmz')) {
      reader.onload = function(ev) {
        JSZip.loadAsync(ev.target.result).then(function(zip) {
          var kmlFile = Object.keys(zip.files).find(function(f) { return f.endsWith('.kml'); });
          if (kmlFile) return zip.files[kmlFile].async('string');
        }).then(function(kmlStr) {
          if (kmlStr) parsearKML(kmlStr, file.name);
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function(ev) { parsearKML(ev.target.result, file.name); };
      reader.readAsText(file);
    }
  };
  input.click();
}

function parsearKML(kmlStr, nombre, opts) {
  opts = opts || {};
  var parser = new DOMParser();
  var doc = parser.parseFromString(kmlStr, 'text/xml');
  var placemarks = doc.querySelectorAll('Placemark');
  var layerGroup = L.featureGroup();
  var allAttrs = [];
  var attrFields = [];
  var popupField = opts.popupField || null;

  // Extract all attribute fields from ExtendedData
  placemarks.forEach(function(pm) {
    var attrs = extraerAtributosKML(pm);
    var keys = Object.keys(attrs);
    keys.forEach(function(k) { if (attrFields.indexOf(k) < 0) attrFields.push(k); });
  });

  // If no popupField set, use 'name' or first available field
  if (!popupField && attrFields.length > 0) popupField = attrFields[0];

  placemarks.forEach(function(pm, featureIdx) {
    var attrs = extraerAtributosKML(pm);
    allAttrs.push(attrs);
    var popupContent = buildKMLPopup(attrs, popupField);

    // Detect geometry type
    var pointEl = pm.querySelector('Point');
    var lineEl = pm.querySelector('LineString');
    var polyEl = pm.querySelector('Polygon');
    var multiGeom = pm.querySelector('MultiGeometry');

    var addedLayers = [];
    if (multiGeom) {
      var subPoints = multiGeom.querySelectorAll('Point');
      var subLines = multiGeom.querySelectorAll('LineString');
      var subPolys = multiGeom.querySelectorAll('Polygon');
      subPoints.forEach(function(el) { addedLayers.push(addKMLPoint(el, popupContent, layerGroup)); });
      subLines.forEach(function(el) { addedLayers.push(addKMLLine(el, popupContent, layerGroup)); });
      subPolys.forEach(function(el) { addedLayers.push(addKMLPolygon(el, popupContent, layerGroup)); });
      if ((subLines.length > 0 || subPolys.length > 0) && subPoints.length === 0) {
        addedLayers.push(addKMLCenterMarker(multiGeom, popupContent, layerGroup));
      }
    } else if (pointEl) {
      addedLayers.push(addKMLPoint(pointEl, popupContent, layerGroup));
    } else if (lineEl) {
      addedLayers.push(addKMLLine(lineEl, popupContent, layerGroup));
      addedLayers.push(addKMLCenterMarker(lineEl, popupContent, layerGroup));
    } else if (polyEl) {
      addedLayers.push(addKMLPolygon(polyEl, popupContent, layerGroup));
      addedLayers.push(addKMLCenterMarker(polyEl, popupContent, layerGroup));
    }
    // Tag each sublayer with its feature index
    addedLayers.forEach(function(l) { if (l) l._kmlFeatureIdx = featureIdx; });
  });

  layerGroup.addTo(mapa);

  // Store layer info
  var capaInfo = {
    nombre: nombre,
    layer: layerGroup,
    attrs: allAttrs,
    attrFields: attrFields,
    popupField: popupField,
    color: opts.color || '#8e44ad',
    weight: opts.weight || 3,
    opacity: opts.opacity || 0.8
  };
  kmlCapas.push(capaInfo);
  applyKMLLayerStyle(kmlCapas.length - 1);

  // Persist
  var capas = JSON.parse(localStorage.getItem('rapca_kml_capas') || '[]');
  if (!capas.includes(nombre)) { capas.push(nombre); localStorage.setItem('rapca_kml_capas', JSON.stringify(capas)); }
  guardarEnDB('capas_kml', {nombre: nombre, data: kmlStr});

  var featureCount = layerGroup.getLayers().length;
  showToast(featureCount + ' elementos cargados de ' + nombre, 'success');
  if (featureCount > 0) {
    try { mapa.fitBounds(layerGroup.getBounds().pad(0.1)); } catch(e) {}
  }

  renderKMLPanel();
}

function extraerAtributosKML(pm) {
  var attrs = {};
  var nameEl = pm.querySelector('name');
  var descEl = pm.querySelector('description');
  if (nameEl) attrs['name'] = nameEl.textContent.trim();
  // Parsear description: si contiene HTML con tabla, extraer campos
  if (descEl) {
    var descText = descEl.textContent.trim();
    if (descText.indexOf('<table') >= 0 || descText.indexOf('<TABLE') >= 0 || descText.indexOf('<html') >= 0 || descText.indexOf('<HTML') >= 0) {
      var descAttrs = parsearHTMLDescription(descText);
      for (var dk in descAttrs) { if (!attrs[dk]) attrs[dk] = descAttrs[dk]; }
    } else if (descText.indexOf('<') >= 0 && descText.indexOf('>') >= 0) {
      // HTML simple sin tabla, guardar como description limpia
      var tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = descText;
      var cleanText = tmpDiv.textContent.trim();
      if (cleanText) attrs['description'] = cleanText;
    } else {
      if (descText) attrs['description'] = descText;
    }
  }
  // SimpleData / SchemaData
  var simpleData = pm.querySelectorAll('SimpleData');
  simpleData.forEach(function(sd) {
    var key = sd.getAttribute('name');
    if (key) attrs[key] = sd.textContent.trim();
  });
  // Data elements
  var dataEls = pm.querySelectorAll('Data');
  dataEls.forEach(function(d) {
    var key = d.getAttribute('name');
    var val = d.querySelector('value');
    if (key && val) attrs[key] = val.textContent.trim();
  });
  // ExtendedData with namespace
  var extData = pm.querySelectorAll('ExtendedData *');
  extData.forEach(function(el) {
    if (el.tagName !== 'Data' && el.tagName !== 'value' && el.tagName !== 'SchemaData' && el.tagName !== 'SimpleData') {
      var key = el.tagName;
      if (el.textContent && !attrs[key]) attrs[key] = el.textContent.trim();
    }
  });
  return attrs;
}

// Parsear HTML de description que contiene tabla de atributos (común en KML de ArcGIS/QGIS)
function parsearHTMLDescription(htmlStr) {
  var attrs = {};
  try {
    var div = document.createElement('div');
    div.innerHTML = htmlStr;
    // Buscar filas de tabla con 2 celdas (clave-valor)
    var rows = div.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (cells.length >= 2) {
        var key = cells[0].textContent.trim();
        var val = cells[1].textContent.trim();
        if (key && key !== '' && val !== '') {
          attrs[key] = val;
        }
      }
    }
    // Si no se encontraron pares clave-valor en tabla, buscar texto limpio
    if (Object.keys(attrs).length === 0) {
      var text = div.textContent.trim();
      if (text) attrs['description'] = text;
    }
  } catch(e) {
    attrs['description'] = htmlStr.replace(/<[^>]+>/g, ' ').trim();
  }
  return attrs;
}

function parseKMLCoords(coordEl) {
  if (!coordEl) return [];
  return coordEl.textContent.trim().split(/\s+/).map(function(c) {
    var p = c.split(',');
    return p.length >= 2 ? [parseFloat(p[1]), parseFloat(p[0])] : null;
  }).filter(function(l) { return l && !isNaN(l[0]) && !isNaN(l[1]); });
}

function addKMLPoint(el, popup, group) {
  var coords = parseKMLCoords(el.querySelector('coordinates'));
  if (coords.length > 0) {
    var m = L.marker(coords[0]).bindPopup(popup).addTo(group);
    return m;
  }
  return null;
}

function addKMLLine(el, popup, group) {
  var coords = parseKMLCoords(el.querySelector('coordinates'));
  if (coords.length > 1) {
    var l = L.polyline(coords, {className: 'kml-vector'}).bindPopup(popup).addTo(group);
    return l;
  }
  return null;
}

function addKMLPolygon(el, popup, group) {
  var outerRing = el.querySelector('outerBoundaryIs coordinates') || el.querySelector('coordinates');
  var coords = parseKMLCoords(outerRing);
  if (coords.length > 2) {
    var p = L.polygon(coords, {className: 'kml-vector'}).bindPopup(popup).addTo(group);
    return p;
  }
  return null;
}

function addKMLCenterMarker(geomEl, popup, group) {
  var allCoords = geomEl.querySelectorAll('coordinates');
  var lats = [], lons = [];
  allCoords.forEach(function(coordEl) {
    parseKMLCoords(coordEl).forEach(function(c) { lats.push(c[0]); lons.push(c[1]); });
  });
  if (lats.length > 0) {
    var centerLat = lats.reduce(function(a, b) { return a + b; }) / lats.length;
    var centerLon = lons.reduce(function(a, b) { return a + b; }) / lons.length;
    var icon = L.divIcon({className: 'kml-center-icon', html: '<div style="width:10px;height:10px;background:#8e44ad;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>', iconSize: [14, 14], iconAnchor: [7, 7]});
    var m = L.marker([centerLat, centerLon], {icon: icon}).bindPopup(popup).addTo(group);
    return m;
  }
  return null;
}

function buildKMLPopup(attrs, popupField) {
  var keys = Object.keys(attrs);
  if (keys.length === 0) return '<i>Sin datos</i>';
  var html = '<div style="max-height:250px;overflow-y:auto;font-size:12px;line-height:1.5">';
  if (popupField && attrs[popupField]) {
    html += '<b style="font-size:13px;color:#1a3d2e">' + escapeHtml(String(attrs[popupField])) + '</b><hr style="margin:4px 0;border:none;border-top:1px solid #ddd">';
  }
  keys.forEach(function(k) {
    if (k !== popupField) {
      var val = String(attrs[k] || '');
      if (val.length > 100) val = val.substring(0, 100) + '...';
      html += '<b>' + escapeHtml(k) + ':</b> ' + escapeHtml(val) + '<br>';
    }
  });
  html += '</div>';
  return html;
}

function applyKMLLayerStyle(idx) {
  var info = kmlCapas[idx];
  if (!info) return;
  info.layer.eachLayer(function(l) {
    if (l.setStyle) {
      l.setStyle({color: info.color, weight: info.weight, opacity: info.opacity, fillOpacity: info.opacity * 0.3});
    }
    if (l.setOpacity) l.setOpacity(info.opacity);
  });
}

function renderKMLPanel() {
  var list = document.getElementById('kml-layers-list');
  if (!list) return;
  list.innerHTML = '';
  kmlCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'kml-layer-item';
    div.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox" checked onchange="toggleKMLLayer(' + idx + ',this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📂 ' + escapeHtml(capa.nombre) + '</span>' +
        '</label>' +
        '<button onclick="removeKMLLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>' +
      '<div class="kml-layer-controls">' +
        '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Color <input type="color" value="' + capa.color + '" onchange="updateKMLStyle(' + idx + ',\'color\',this.value)" style="width:28px;height:20px;border:none;padding:0;cursor:pointer"></label>' +
        '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Grosor <input type="range" min="1" max="10" value="' + capa.weight + '" onchange="updateKMLStyle(' + idx + ',\'weight\',this.value)" style="width:60px"></label>' +
        '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Opacidad <input type="range" min="10" max="100" value="' + Math.round(capa.opacity * 100) + '" onchange="updateKMLStyle(' + idx + ',\'opacity\',this.value/100)" style="width:60px"></label>' +
      '</div>' +
      (capa.attrFields.length > 0 ?
        '<div class="kml-layer-controls">' +
          '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Popup: <select onchange="updateKMLPopupField(' + idx + ',this.value)" style="font-size:10px;flex:1;min-width:0">' +
            capa.attrFields.map(function(f) { return '<option value="' + escapeHtml(f) + '"' + (f === capa.popupField ? ' selected' : '') + '>' + escapeHtml(f) + '</option>'; }).join('') +
          '</select></label>' +
        '</div>' : '') +
    '';
    list.appendChild(div);
  });
  // GPX layers
  gpxCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'kml-layer-item';
    div.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox" checked onchange="toggleGPXLayer(' + idx + ',this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🗺️ ' + capa.nombre + '</span>' +
        '</label>' +
        '<button onclick="removeGPXLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>';
    list.appendChild(div);
  });
  // WMS layers
  wmsCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'kml-layer-item';
    div.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🌐 ' + capa.url.substring(0, 35) + '</span>' +
        '</label>' +
        '<button onclick="removeWMSLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>';
    list.appendChild(div);
  });
  // Infrastructure KML layer
  if (infraKMLFeatures.length > 0) {
    var infraNombre = localStorage.getItem('rapca_infra_kml_nombre') || 'Infraestructuras KML';
    var infraVisible = mapa.hasLayer(capaInfraKML);
    var divInfra = document.createElement('div');
    divInfra.className = 'kml-layer-item';
    divInfra.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox"' + (infraVisible ? ' checked' : '') + ' onchange="toggleInfraKMLLayer(this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🌳 ' + infraNombre + ' (' + infraKMLFeatures.length + ')</span>' +
        '</label>' +
        '<button onclick="eliminarInfraKML();renderKMLPanel()" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>';
    list.appendChild(divInfra);
  }
  // Empty state
  var totalCapas = kmlCapas.length + gpxCapas.length + wmsCapas.length + (infraKMLFeatures.length > 0 ? 1 : 0);
  if (totalCapas === 0) {
    list.innerHTML = '<div style="padding:12px;color:#888;font-size:12px;text-align:center">No hay capas cargadas</div>';
  }
}

function toggleGPXLayer(idx, visible) {
  if (!gpxCapas[idx]) return;
  if (visible) mapa.addLayer(gpxCapas[idx].layer);
  else mapa.removeLayer(gpxCapas[idx].layer);
}

function removeGPXLayer(idx) {
  if (!gpxCapas[idx]) return;
  mapa.removeLayer(gpxCapas[idx].layer);
  gpxCapas.splice(idx, 1);
  renderKMLPanel();
  showToast('Capa GPX eliminada', 'info');
}

function toggleKMLLayer(idx, visible) {
  if (!kmlCapas[idx]) return;
  if (visible) mapa.addLayer(kmlCapas[idx].layer);
  else mapa.removeLayer(kmlCapas[idx].layer);
}

function removeKMLLayer(idx) {
  if (!kmlCapas[idx]) return;
  mapa.removeLayer(kmlCapas[idx].layer);
  var nombre = kmlCapas[idx].nombre;
  kmlCapas.splice(idx, 1);
  var capas = JSON.parse(localStorage.getItem('rapca_kml_capas') || '[]');
  capas = capas.filter(function(c) { return c !== nombre; });
  localStorage.setItem('rapca_kml_capas', JSON.stringify(capas));
  renderKMLPanel();
  showToast('Capa eliminada', 'info');
}

function updateKMLStyle(idx, prop, val) {
  if (!kmlCapas[idx]) return;
  if (prop === 'weight') val = parseInt(val);
  if (prop === 'opacity') val = parseFloat(val);
  kmlCapas[idx][prop] = val;
  applyKMLLayerStyle(idx);
}

function updateKMLPopupField(idx, field) {
  if (!kmlCapas[idx]) return;
  kmlCapas[idx].popupField = field;
  var attrs = kmlCapas[idx].attrs;
  kmlCapas[idx].layer.eachLayer(function(l) {
    var fi = l._kmlFeatureIdx;
    if (fi !== undefined && attrs[fi] && l.getPopup) {
      l.setPopupContent(buildKMLPopup(attrs[fi], field));
    }
  });
}

function cargarCapasKML() {
  var capas = JSON.parse(localStorage.getItem('rapca_kml_capas') || '[]');
  capas.forEach(function(nombre) {
    obtenerDeDB('capas_kml', nombre).then(function(capa) {
      if (capa) parsearKML(capa.data, nombre);
    });
  });
}

function exportarKML() {
  var regs = misRegistros().filter(function(r) { return r.lat && r.lon; });
  var kml = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>RAPCA Registros</name>';
  regs.forEach(function(r) {
    kml += '<Placemark><name>' + escapeXml(r.tipo + ' - ' + r.unidad) + '</name><description>' + escapeXml(r.fecha) + '</description><Point><coordinates>' + r.lon + ',' + r.lat + ',0</coordinates></Point></Placemark>';
  });
  kml += '</Document></kml>';
  descargarArchivo(kml, 'rapca_registros.kml', 'application/vnd.google-earth.kml+xml');
}

function exportarKMLRegistros() { exportarKML(); }

function importarGPX() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(ev.target.result, 'text/xml');
      var gpxGroup = L.featureGroup();
      var wpts = doc.querySelectorAll('wpt');
      var count = 0;
      wpts.forEach(function(wpt) {
        var lat = parseFloat(wpt.getAttribute('lat'));
        var lon = parseFloat(wpt.getAttribute('lon'));
        var name = wpt.querySelector('name');
        if (!isNaN(lat) && !isNaN(lon)) {
          L.marker([lat, lon]).bindPopup(name ? name.textContent : 'Waypoint').addTo(gpxGroup);
          count++;
        }
      });
      var trks = doc.querySelectorAll('trkpt');
      var latlngs = [];
      trks.forEach(function(pt) {
        var lat = parseFloat(pt.getAttribute('lat'));
        var lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) latlngs.push([lat, lon]);
      });
      if (latlngs.length > 1) L.polyline(latlngs, {color: '#e74c3c', weight: 3}).addTo(gpxGroup);
      gpxGroup.addTo(mapa);
      gpxCapas.push({nombre: file.name, layer: gpxGroup});
      if (gpxGroup.getLayers().length > 0) {
        try { mapa.fitBounds(gpxGroup.getBounds().pad(0.1)); } catch(e) {}
      }
      showToast((count + latlngs.length) + ' elementos GPX cargados', 'success');
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportarGPX() {
  var regs = misRegistros().filter(function(r) { return r.lat && r.lon; });
  var gpx = '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="RAPCA Campo">';
  regs.forEach(function(r) {
    gpx += '<wpt lat="' + r.lat + '" lon="' + r.lon + '"><name>' + escapeXml(r.tipo + ' - ' + r.unidad) + '</name><desc>' + escapeXml(r.fecha) + '</desc></wpt>';
  });
  gpx += '</gpx>';
  descargarArchivo(gpx, 'rapca_registros.gpx', 'application/gpx+xml');
}

function exportarMapaPDF() {
  showToast('Generando PDF del mapa...', 'info');
  html2canvas(document.getElementById('map-container')).then(function(canvas) {
    var win = window.open('', '_blank');
    win.document.write('<html><head><title>Mapa RAPCA</title><style>@page{size:A4 landscape;margin:1cm}body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body>');
    win.document.write('<h2 style="font-family:sans-serif;color:#1a3d2e">RAPCA Campo — Mapa</h2>');
    win.document.write('<img src="' + canvas.toDataURL('image/png') + '">');
    win.document.write('<p style="font-size:12px;color:#888">' + new Date().toLocaleString('es-ES') + '</p>');
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  });
}

function filtrarOperadorMapa() {
  var misRegs = misRegistros();
  var ops = [];
  misRegs.forEach(function(r) { if (r.operador_nombre && ops.indexOf(r.operador_nombre) < 0) ops.push(r.operador_nombre); });
  var sel = prompt('Filtrar por operador (' + ops.join(', ') + '):');
  if (!sel) { actualizarMarcadores(); return; }
  mapaMarkers.clearLayers();
  var regs = misRegs.filter(function(r) { return r.operador_nombre === sel && r.lat && r.lon; });
  var colores = {VP: '#88d8b0', EL: '#2ecc71', EI: '#fd9853'};
  regs.forEach(function(r) {
    var marker = L.circleMarker([r.lat, r.lon], {radius: 8, fillColor: colores[r.tipo], color: '#fff', weight: 2, fillOpacity: 0.9});
    marker.bindPopup(escapeHtml(r.tipo + ' - ' + r.unidad));
    mapaMarkers.addLayer(marker);
  });
}

// ============================================================
// GPS Precision Improvement
// ============================================================
function capturarGPSConPrecision(callback) {
  if (!navigator.geolocation) {
    callback(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(function(pos) {
    var data = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      alt: pos.coords.altitude,
      accuracy: pos.coords.accuracy
    };
    gpsPos = data;
    callback(data);
  }, function(err) {
    callback(null);
  }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 5000});
}

function mostrarPrecisionGPS() {
  var el = document.getElementById('gps-precision-indicator');
  if (!el || !gpsPos) return;
  var acc = gpsPos.accuracy;
  var color = acc <= 10 ? '#27ae60' : acc <= 30 ? '#f39c12' : '#e74c3c';
  var label = acc <= 10 ? 'Excelente' : acc <= 30 ? 'Buena' : 'Baja';
  el.innerHTML = '<span style="color:' + color + '">📡 GPS: ±' + Math.round(acc) + 'm (' + label + ')</span>';
  el.style.display = 'block';
}

// ============================================================
// WAYPOINTS PERSISTENTES (IndexedDB — sobreviven cierre/reinicio/borrar caché)
// ============================================================

function cargarWaypointsPersistentes() {
  if (!db || !capaWaypointsPersist) return;
  capaWaypointsPersist.clearLayers();

  obtenerTodosDB('waypoints_comp').then(function(wps) {
    if (!wps || wps.length === 0) {
      var badge = document.getElementById('wp-persist-count');
      if (badge) badge.textContent = '0';
      return;
    }
    var coloresWP = {W1: '#e74c3c', W2: '#3498db'};

    wps.forEach(function(wp) {
      if (!wp.lat || !wp.lon) return;
      var wColor = coloresWP[wp.waypoint] || '#888';
      var marker = L.circleMarker([wp.lat, wp.lon], {
        radius: 7, fillColor: wColor, color: '#fff', weight: 2, fillOpacity: 0.9
      });

      var safeId = wp.id.replace(/[^a-zA-Z0-9_]/g, '_');
      var popupId = 'popup-wp-' + safeId;
      var escapedId = escapeHtml(wp.id).replace(/'/g, "\\'");
      marker.bindPopup(
        '<strong style="color:' + wColor + '">' + escapeHtml(wp.waypoint) + '</strong>' +
        '<br><small>' + escapeHtml(wp.codigo) + '</small>' +
        '<br>' + escapeHtml(wp.unidad || '') +
        '<br><span style="color:#888;font-size:11px">' + escapeHtml(wp.fecha ? wp.fecha.split('T')[0] : '') + '</span>' +
        (wp.operador ? '<br><span style="color:#888;font-size:11px">' + escapeHtml(wp.operador) + '</span>' : '') +
        '<div id="' + popupId + '" style="margin-top:6px;text-align:center"></div>' +
        '<button onclick="borrarWaypointPersistente(\'' + escapedId + '\')" style="margin-top:6px;width:100%;padding:4px;background:#e74c3c;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer">Borrar waypoint</button>',
        {minWidth: 140, maxWidth: 200}
      );

      // Lazy load foto
      (function(pId, codigo) {
        marker.on('popupopen', function() {
          var container = document.getElementById(pId);
          if (!container || container.dataset.loaded) return;
          container.dataset.loaded = '1';
          obtenerDeDB('fotos', codigo).then(function(f) {
            if (f && f.data && container) {
              container.innerHTML = '<img src="' + f.data + '" style="width:100%;max-width:180px;border-radius:6px;cursor:pointer" onclick="abrirLightboxFoto(this.src,\'' + escapeJsAttr(codigo) + '\')">';
            }
          }).catch(function() {});
        });
      })(popupId, wp.codigo);

      capaWaypointsPersist.addLayer(marker);
    });

    // Actualizar contador en toolbar
    var badge = document.getElementById('wp-persist-count');
    if (badge) badge.textContent = wps.length;
  }).catch(function(e) { console.warn('Error cargando waypoints persistentes:', e); });
}

function borrarWaypointPersistente(id) {
  if (!confirm('¿Borrar este waypoint?')) return;
  if (!db) return;
  eliminarDeDB('waypoints_comp', id).then(function() {
    mapa.closePopup();
    cargarWaypointsPersistentes();
    showToast('Waypoint borrado', 'info');
  }).catch(function(e) { showToast('Error al borrar: ' + e, 'error'); });
}

function borrarTodosWaypointsPersistentes() {
  if (!confirm('¿Borrar TODOS los waypoints persistentes? Esta acción no se puede deshacer.')) return;
  if (!db) return;
  obtenerTodosDB('waypoints_comp').then(function(wps) {
    var promises = wps.map(function(wp) { return eliminarDeDB('waypoints_comp', wp.id); });
    return Promise.all(promises);
  }).then(function() {
    capaWaypointsPersist.clearLayers();
    var badge = document.getElementById('wp-persist-count');
    if (badge) badge.textContent = '0';
    showToast('Todos los waypoints borrados', 'info');
  }).catch(function(e) { showToast('Error: ' + e, 'error'); });
}

// También guardar waypoints desde registros existentes (migración)
function migrarWaypointsDeRegistros() {
  if (!db) return;
  var regs = registros || [];
  var promises = [];
  regs.forEach(function(r) {
    if (!r.datos || !r.datos.fotosComp) return;
    r.datos.fotosComp.forEach(function(fc) {
      if (!fc.lat || !fc.lon) return;
      promises.push(
        obtenerDeDB('waypoints_comp', fc.numero).then(function(existing) {
          if (existing) return; // Ya existe
          return guardarEnDB('waypoints_comp', {
            id: fc.numero,
            codigo: fc.numero,
            waypoint: fc.waypoint || 'W1',
            lat: fc.lat,
            lon: fc.lon,
            unidad: r.unidad,
            tipo: r.tipo,
            fecha: r.fecha,
            operador: r.operador_nombre || ''
          });
        })
      );
    });
  });
  Promise.all(promises).then(function() {
    cargarWaypointsPersistentes();
  });
}

// ============================================================
// KML INFRAESTRUCTURAS (carga, selección de campo nombre, búsqueda)
// ============================================================

function cargarKMLInfraestructuras() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kml,.kmz';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    if (file.name.endsWith('.kmz')) {
      reader.onload = function(ev) {
        JSZip.loadAsync(ev.target.result).then(function(zip) {
          var kmlFile = Object.keys(zip.files).find(function(f) { return f.endsWith('.kml'); });
          if (kmlFile) return zip.files[kmlFile].async('string');
        }).then(function(kmlStr) {
          if (kmlStr) mostrarSelectorCampoInfraKML(kmlStr, file.name);
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function(ev) { mostrarSelectorCampoInfraKML(ev.target.result, file.name); };
      reader.readAsText(file);
    }
  };
  input.click();
}

function mostrarSelectorCampoInfraKML(kmlStr, nombre) {
  // Parsear para obtener los campos disponibles
  var parser = new DOMParser();
  var doc = parser.parseFromString(kmlStr, 'text/xml');
  var placemarks = doc.querySelectorAll('Placemark');
  if (placemarks.length === 0) { showToast('No se encontraron elementos en el KML', 'error'); return; }

  // Extraer campos de la primera entidad
  var camposDisponibles = [];
  var ejemplo = {};
  placemarks.forEach(function(pm) {
    var attrs = extraerAtributosKML(pm);
    Object.keys(attrs).forEach(function(k) {
      if (camposDisponibles.indexOf(k) < 0) {
        camposDisponibles.push(k);
        if (!ejemplo[k]) ejemplo[k] = attrs[k];
      }
    });
  });

  // Guardar KML temporalmente
  window._infraKMLTemp = kmlStr;
  window._infraKMLNombre = nombre;

  var html = '<h2>Cargar Infraestructuras KML</h2>';
  html += '<p style="color:#666;font-size:13px">' + placemarks.length + ' elementos encontrados en <strong>' + escapeHtml(nombre) + '</strong></p>';

  html += '<div class="form-group"><label style="font-weight:700">Campo para el nombre de la infraestructura</label>';
  html += '<select id="infra-kml-campo-nombre" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc">';
  camposDisponibles.forEach(function(c) {
    var preview = ejemplo[c] ? ' (' + String(ejemplo[c]).substring(0, 30) + ')' : '';
    html += '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + escapeHtml(preview) + '</option>';
  });
  html += '</select></div>';

  // Vista previa de los campos
  html += '<div style="max-height:200px;overflow-y:auto;margin:8px 0;border:1px solid #eee;border-radius:6px;padding:8px">';
  html += '<div style="font-size:11px;color:#888;margin-bottom:4px">Vista previa del primer elemento:</div>';
  camposDisponibles.forEach(function(c) {
    html += '<div style="font-size:12px;padding:2px 0"><strong>' + escapeHtml(c) + ':</strong> ' + escapeHtml(String(ejemplo[c] || '')) + '</div>';
  });
  html += '</div>';

  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="ejecutarCargaInfraKML()">Cargar en mapa</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function ejecutarCargaInfraKML() {
  var kmlStr = window._infraKMLTemp;
  var nombre = window._infraKMLNombre;
  var campoNombre = document.getElementById('infra-kml-campo-nombre').value;
  if (!kmlStr) return;

  cerrarModal();

  // Parsear KML y crear marcadores
  var parser = new DOMParser();
  var doc = parser.parseFromString(kmlStr, 'text/xml');
  var placemarks = doc.querySelectorAll('Placemark');

  capaInfraKML.clearLayers();
  infraKMLFeatures = [];

  placemarks.forEach(function(pm) {
    var attrs = extraerAtributosKML(pm);
    var nombreInfra = attrs[campoNombre] || attrs['name'] || 'Sin nombre';

    // Obtener coordenadas
    var lat = null, lon = null;
    var pointEl = pm.querySelector('Point');
    var lineEl = pm.querySelector('LineString');
    var polyEl = pm.querySelector('Polygon');
    var geomEl = pointEl || lineEl || polyEl;
    if (!geomEl) {
      var multi = pm.querySelector('MultiGeometry');
      if (multi) geomEl = multi.querySelector('Point') || multi.querySelector('LineString') || multi.querySelector('Polygon');
    }
    if (geomEl) {
      var coordEl = geomEl.querySelector('coordinates');
      if (coordEl) {
        var txt = coordEl.textContent.trim().split(/\s+/)[0];
        var parts = txt.split(',');
        if (parts.length >= 2) {
          lon = parseFloat(parts[0]);
          lat = parseFloat(parts[1]);
        }
      }
    }

    // Construir popup con todos los atributos
    var popupHtml = '<strong style="color:#8e44ad;font-size:14px">' + escapeHtml(nombreInfra) + '</strong><br>';
    for (var k in attrs) {
      if (k !== campoNombre) {
        popupHtml += '<span style="font-size:11px"><strong>' + escapeHtml(k) + ':</strong> ' + escapeHtml(String(attrs[k])) + '</span><br>';
      }
    }

    var marker = null;

    // También añadir geometrías de línea/polígono
    if (lineEl || polyEl) {
      var coords = parseKMLCoords(geomEl.querySelector('coordinates'));
      if (lineEl && coords.length > 1) {
        var line = L.polyline(coords, {color: '#8e44ad', weight: 3, opacity: 0.8});
        line.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
        capaInfraKML.addLayer(line);
      }
      if (polyEl && coords.length > 2) {
        var poly = L.polygon(coords, {color: '#8e44ad', fillColor: '#8e44ad', fillOpacity: 0.2, weight: 2});
        poly.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
        capaInfraKML.addLayer(poly);
      }
    }

    // Crear marcador con etiqueta
    if (lat && lon) {
      marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'infra-kml-marker',
          html: '<div class="infra-kml-dot"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      });
      marker.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
      marker.bindTooltip(nombreInfra, {
        permanent: true,
        direction: 'right',
        offset: [10, 0],
        className: 'infra-kml-label'
      });
      capaInfraKML.addLayer(marker);
    }

    infraKMLFeatures.push({
      nombre: nombreInfra,
      lat: lat,
      lon: lon,
      attrs: attrs,
      marker: marker
    });
  });

  // Persistir en IndexedDB
  guardarEnDB('kml_infraestructuras', {
    nombre: nombre,
    data: kmlStr,
    campoNombre: campoNombre
  });
  localStorage.setItem('rapca_infra_kml_nombre', nombre);
  localStorage.setItem('rapca_infra_kml_campo', campoNombre);

  // Zoom a los elementos
  if (capaInfraKML.getLayers().length > 0) {
    try { mapa.fitBounds(capaInfraKML.getBounds().pad(0.1)); } catch(e) {}
  }

  showToast(infraKMLFeatures.length + ' infraestructuras cargadas de ' + nombre, 'success');
  actualizarBuscadorInfraKML();

  window._infraKMLTemp = null;
  window._infraKMLNombre = null;
}

function cargarInfraKMLGuardada() {
  var nombre = localStorage.getItem('rapca_infra_kml_nombre');
  var campo = localStorage.getItem('rapca_infra_kml_campo');
  if (!nombre || !campo || !db) return;

  obtenerDeDB('kml_infraestructuras', nombre).then(function(stored) {
    if (!stored || !stored.data) return;
    // Simular la carga sin modal
    window._infraKMLTemp = stored.data;
    window._infraKMLNombre = nombre;
    // Parsear directamente
    var parser = new DOMParser();
    var doc = parser.parseFromString(stored.data, 'text/xml');
    var placemarks = doc.querySelectorAll('Placemark');

    capaInfraKML.clearLayers();
    infraKMLFeatures = [];

    placemarks.forEach(function(pm) {
      var attrs = extraerAtributosKML(pm);
      var nombreInfra = attrs[campo] || attrs['name'] || 'Sin nombre';
      var lat = null, lon = null;

      var pointEl = pm.querySelector('Point');
      var lineEl = pm.querySelector('LineString');
      var polyEl = pm.querySelector('Polygon');
      var geomEl = pointEl || lineEl || polyEl;
      if (!geomEl) {
        var multi = pm.querySelector('MultiGeometry');
        if (multi) geomEl = multi.querySelector('Point') || multi.querySelector('LineString') || multi.querySelector('Polygon');
      }
      if (geomEl) {
        var coordEl = geomEl.querySelector('coordinates');
        if (coordEl) {
          var txt = coordEl.textContent.trim().split(/\s+/)[0];
          var parts = txt.split(',');
          if (parts.length >= 2) { lon = parseFloat(parts[0]); lat = parseFloat(parts[1]); }
        }
      }

      var popupHtml = '<strong style="color:#8e44ad;font-size:14px">' + escapeHtml(nombreInfra) + '</strong><br>';
      for (var k in attrs) {
        if (k !== campo) popupHtml += '<span style="font-size:11px"><strong>' + escapeHtml(k) + ':</strong> ' + escapeHtml(String(attrs[k])) + '</span><br>';
      }

      var marker = null;

      if (lineEl) {
        var coords = parseKMLCoords(geomEl.querySelector('coordinates'));
        if (coords.length > 1) {
          var line = L.polyline(coords, {color: '#8e44ad', weight: 3, opacity: 0.8});
          line.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250}); capaInfraKML.addLayer(line);
        }
      }
      if (polyEl) {
        var coords = parseKMLCoords(geomEl.querySelector('coordinates'));
        if (coords.length > 2) {
          var poly = L.polygon(coords, {color: '#8e44ad', fillColor: '#8e44ad', fillOpacity: 0.2, weight: 2});
          poly.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250}); capaInfraKML.addLayer(poly);
        }
      }

      if (lat && lon) {
        marker = L.marker([lat, lon], {
          icon: L.divIcon({
            className: 'infra-kml-marker',
            html: '<div class="infra-kml-dot"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        });
        marker.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
        marker.bindTooltip(nombreInfra, {
          permanent: true,
          direction: 'right',
          offset: [10, 0],
          className: 'infra-kml-label'
        });
        capaInfraKML.addLayer(marker);
      }

      infraKMLFeatures.push({ nombre: nombreInfra, lat: lat, lon: lon, attrs: attrs, marker: marker });
    });

    actualizarBuscadorInfraKML();
    window._infraKMLTemp = null;
    window._infraKMLNombre = null;
  }).catch(function(e) { console.warn('Error cargando KML infraestructuras guardado:', e); });
}

function toggleInfraKMLLayer(visible) {
  if (visible) mapa.addLayer(capaInfraKML);
  else mapa.removeLayer(capaInfraKML);
}

function eliminarInfraKML() {
  if (!confirm('¿Borrar la capa de infraestructuras KML? Esta acción no se puede deshacer.')) return;
  var nombre = localStorage.getItem('rapca_infra_kml_nombre');
  capaInfraKML.clearLayers();
  infraKMLFeatures = [];
  localStorage.removeItem('rapca_infra_kml_nombre');
  localStorage.removeItem('rapca_infra_kml_campo');
  if (db && nombre) {
    eliminarDeDB('kml_infraestructuras', nombre);
  }
  actualizarBuscadorInfraKML();
  renderKMLPanel();
  showToast('Infraestructuras KML eliminadas', 'info');
}

function actualizarBuscadorInfraKML() {
  var container = document.getElementById('infra-kml-search-container');
  if (!container) return;
  if (infraKMLFeatures.length > 0) {
    container.style.display = 'block';
    container.querySelector('.infra-kml-count').textContent = infraKMLFeatures.length + ' infraestructuras';
  } else {
    container.style.display = 'none';
  }
}

function buscarInfraKML(val) {
  var results = document.getElementById('infra-kml-results');
  if (!results) return;
  if (!val || val.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }

  var v = val.toLowerCase();
  var matches = infraKMLFeatures.filter(function(f) {
    if (f.nombre && f.nombre.toLowerCase().indexOf(v) >= 0) return true;
    if (f.attrs) {
      for (var k in f.attrs) {
        if (String(f.attrs[k]).toLowerCase().indexOf(v) >= 0) return true;
      }
    }
    return false;
  }).slice(0, 10); // Max 10 resultados

  if (matches.length === 0) {
    results.innerHTML = '<div style="padding:8px;color:#888;font-size:13px">Sin resultados</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = matches.map(function(f, i) {
    return '<div class="infra-kml-result" onclick="irAInfraKML(' + i + ',\'' + escapeHtml(val) + '\')" style="padding:8px;cursor:pointer;border-bottom:1px solid #eee;font-size:13px">' +
      '<strong style="color:#8e44ad">' + escapeHtml(f.nombre) + '</strong>' +
      (f.lat ? '<br><span style="color:#888;font-size:11px">' + f.lat.toFixed(5) + ', ' + f.lon.toFixed(5) + '</span>' : '') +
      '</div>';
  }).join('');
  results.style.display = 'block';
}

function irAInfraKML(idx, searchVal) {
  // Encontrar el match real (ya que el idx es del slice filtrado)
  var v = searchVal.toLowerCase();
  var matches = infraKMLFeatures.filter(function(f) {
    if (f.nombre && f.nombre.toLowerCase().indexOf(v) >= 0) return true;
    if (f.attrs) { for (var k in f.attrs) { if (String(f.attrs[k]).toLowerCase().indexOf(v) >= 0) return true; } }
    return false;
  });
  var f = matches[idx];
  if (!f) return;

  if (f.lat && f.lon) {
    mapa.setView([f.lat, f.lon], 16);
    if (f.marker) setTimeout(function() { f.marker.openPopup(); }, 300);
  }

  var results = document.getElementById('infra-kml-results');
  if (results) { results.innerHTML = ''; results.style.display = 'none'; }
}
// ============================================================
// RAPCA Campo — panel.js — Panel de registros y exportaciones
// ============================================================

function renderPanel() {
  var regs = misRegistros();
  var tipoFiltro = document.getElementById('panel-filtro-tipo').value;
  var opFiltro = document.getElementById('panel-filtro-operador').value;
  var unidadFiltro = document.getElementById('panel-filtro-unidad').value;
  var desdeFiltro = document.getElementById('panel-filtro-desde').value;
  var hastaFiltro = document.getElementById('panel-filtro-hasta').value;

  // Poblar operadores (siempre refrescar, preservando selección)
  var opSelect = document.getElementById('panel-filtro-operador');
  var ops = [];
  regs.forEach(function(r) { if (r.operador_nombre && ops.indexOf(r.operador_nombre) < 0) ops.push(r.operador_nombre); });
  var opActual = opSelect.value;
  opSelect.innerHTML = '<option value="">Todos operadores</option>';
  ops.sort();
  ops.forEach(function(o) { var opt = document.createElement('option'); opt.value = o; opt.textContent = o; opSelect.appendChild(opt); });
  opSelect.value = opActual;

  // Poblar unidades (siempre refrescar, preservando selección)
  var unidadSelect = document.getElementById('panel-filtro-unidad');
  var unidades = [];
  regs.forEach(function(r) { if (r.unidad && unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  var unidadActual = unidadSelect.value;
  unidadSelect.innerHTML = '<option value="">Todas unidades</option>';
  unidades.sort();
  unidades.forEach(function(u) { var opt = document.createElement('option'); opt.value = u; opt.textContent = u; unidadSelect.appendChild(opt); });
  unidadSelect.value = unidadActual;

  if (tipoFiltro) regs = regs.filter(function(r) { return r.tipo === tipoFiltro; });
  if (opFiltro) regs = regs.filter(function(r) { return r.operador_nombre === opFiltro; });
  if (unidadFiltro) regs = regs.filter(function(r) { return r.unidad === unidadFiltro; });
  if (desdeFiltro) regs = regs.filter(function(r) { return r.fecha >= desdeFiltro; });
  if (hastaFiltro) regs = regs.filter(function(r) { return r.fecha <= hastaFiltro; });

  regs.sort(function(a, b) { return b.id - a.id; });

  var lista = document.getElementById('panel-lista');
  if (regs.length === 0) {
    lista.innerHTML = '<div class="card" style="text-align:center;color:#888;padding:30px">No hay registros</div>';
    return;
  }
  var esAdmin = sesion && sesion.rol === 'admin';
  lista.innerHTML = regs.map(function(r) {
    var badgeClass = 'badge-' + r.tipo.toLowerCase();
    var actions = '';
    if (esAdmin) {
      actions =
        '<button class="btn btn-sm btn-outline" onclick="abrirOpcionesPDF(' + r.id + ')">📄 PDF</button>' +
        '<button class="btn btn-sm btn-outline" onclick="descargarFotosZIP(' + r.id + ')">📷 Fotos</button>' +
        '<button class="btn btn-sm btn-danger" onclick="eliminarRegistro(' + r.id + ')">🗑️</button>';
    } else {
      actions =
        '<button class="btn btn-sm btn-outline" onclick="editarRegistro(' + r.id + ')">✏️ Editar</button>' +
        '<button class="btn btn-sm btn-outline" onclick="abrirOpcionesPDF(' + r.id + ')">📄 PDF</button>' +
        '<button class="btn btn-sm btn-outline" onclick="descargarFotosZIP(' + r.id + ')">📷 ZIP</button>' +
        '<button class="btn btn-sm btn-danger" onclick="eliminarRegistro(' + r.id + ')">🗑️</button>';
    }
    return '<div class="card registro-card">' +
      '<div class="reg-header"><span class="badge ' + badgeClass + '">' + escapeHtml(r.tipo) + '</span><h3>' + escapeHtml(r.unidad) + '</h3>' +
      (r.enviado ? '<span style="color:#27ae60;font-size:12px">✓ Sync</span>' : '<span style="color:#e74c3c;font-size:12px">● Pendiente</span>') + '</div>' +
      '<div class="reg-meta">' + escapeHtml(r.fecha) + (r.transecto ? ' · ' + escapeHtml(r.transecto) : '') + ' · ' + escapeHtml(r.operador_nombre || '') + '</div>' +
      '<div class="reg-actions">' + actions + '</div></div>';
  }).join('');

  // Botones globales según rol
  var accionesDiv = document.getElementById('panel-acciones-globales');
  if (esAdmin) {
    accionesDiv.innerHTML =
      '<button class="btn btn-sm btn-primary" onclick="exportarExcelRegistros()">📊 Excel</button>' +
      '<button class="btn btn-sm btn-primary" onclick="exportarCSV()">📋 CSV</button>' +
      '<button class="btn btn-sm btn-primary" onclick="abrirOpcionesTodosPDF()">📄 Todos PDF</button>' +
      '<button class="btn btn-sm btn-primary" onclick="descargarTodasFotosZIP()">📷 Fotos ZIP</button>' +
      '<button class="btn btn-sm btn-outline" onclick="abrirModalShapefile()">📍 Shapefile</button>' +
      '<button class="btn btn-sm btn-outline" onclick="renderDashboardCompletitud()">📊 Completitud</button>' +
      '<button class="btn btn-sm btn-outline" onclick="renderEstadisticasZona()">📈 Estadísticas</button>' +
      '<button class="btn btn-sm btn-outline" onclick="generarInformeZona()">📝 Informe zona</button>' +
      '<button class="btn btn-sm btn-danger" onclick="borrarTodosRegistros()">🗑️ Borrar todo</button>';
  } else {
    accionesDiv.innerHTML =
      '<button class="btn btn-sm btn-primary" onclick="exportarExcelRegistros()">📊 Excel</button>' +
      '<button class="btn btn-sm btn-primary" onclick="exportarCSV()">📋 CSV</button>' +
      '<button class="btn btn-sm btn-primary" onclick="abrirOpcionesTodosPDF()">📄 Todos PDF</button>' +
      '<button class="btn btn-sm btn-primary" onclick="descargarTodasFotosZIP()">📷 Fotos ZIP</button>' +
      '<button class="btn btn-sm btn-outline" onclick="exportarKMLRegistros()">🗺️ KML</button>' +
      '<button class="btn btn-sm btn-outline" onclick="abrirModalShapefile()">📍 Shapefile</button>' +
      '<button class="btn btn-sm btn-outline" onclick="renderDashboardCompletitud()">📊 Completitud</button>' +
      '<button class="btn btn-sm btn-outline" onclick="renderEstadisticasZona()">📈 Estadísticas</button>' +
      '<button class="btn btn-sm btn-outline" onclick="reiniciarContadoresFotos()">🔢 Contadores</button>' +
      '<button class="btn btn-sm btn-danger" onclick="borrarTodosRegistros()">🗑️ Borrar todo</button>';
  }
}

function filtrarPanel() { renderPanel(); }

function editarRegistro(id) {
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r) { showToast('No tienes acceso a este registro', 'error'); return; }
  editandoRegistro = r;
  window._desdeEditarRegistro = true;
  if (r.tipo === 'VP') irPagina('vp');
  else if (r.tipo === 'EL') irPagina('el');
  else if (r.tipo === 'EI') irPagina('ei');
}

function cargarRegistroEnForm(r, prefix) {
  var el;
  el = document.getElementById(prefix + '-fecha'); if (el) el.value = r.fecha;
  el = document.getElementById(prefix + '-unidad'); if (el) el.value = r.unidad;
  el = document.getElementById(prefix + '-zona'); if (el) el.value = r.zona;
  if (r.datos.observaciones) { el = document.getElementById(prefix + '-observaciones'); if (el) el.value = r.datos.observaciones; }
  // Pastoreo
  if (r.datos.pastoreo) {
    for (var p = 0; p < r.datos.pastoreo.length; p++) {
      var val = r.datos.pastoreo[p];
      if (val) {
        var btn = document.querySelector('#' + prefix + '-pastoreo-container .pastoreo-btn[data-punto="' + (p+1) + '"][data-val="' + val + '"]');
        if (btn) btn.classList.add('selected');
      }
    }
  }
  // Observación
  if (r.datos.observacionPastoreo) {
    for (var i = 0; i < OBS_CAMPOS.length; i++) {
      var val = r.datos.observacionPastoreo[OBS_CAMPOS[i]];
      if (val) {
        var btn = document.querySelector('#' + prefix + '-obs-container .obs-btn[data-campo="' + OBS_CAMPOS[i] + '"][data-val="' + val + '"]');
        if (btn) btn.classList.add('selected');
      }
    }
  }
  // Restaurar fotos en fotosPagina y preview
  restaurarFotosRegistro(r, prefix);
}

function restaurarFotosRegistro(r, prefix) {
  // Limpiar fotosPagina para evitar duplicados al editar
  fotosPagina = {};
  // Restaurar fotos generales (G)
  if (r.datos.fotos && typeof r.datos.fotos === 'string') {
    var codigos = r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
    if (codigos.length > 0) {
      fotosPagina['G'] = codigos;
    }
  }
  // Restaurar fotos comparativas (W1, W2)
  if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
    fotosPagina['W1'] = [];
    fotosPagina['W2'] = [];
    r.datos.fotosComp.forEach(function(fc) {
      var wp = fc.waypoint || 'W1';
      fotosPagina[wp].push({codigo: fc.numero, lat: fc.lat || null, lon: fc.lon || null});
    });
    // Limpiar arrays vacíos
    if (fotosPagina['W1'].length === 0) delete fotosPagina['W1'];
    if (fotosPagina['W2'].length === 0) delete fotosPagina['W2'];
  }
  // Renderizar previews
  var previewGrid = document.getElementById(prefix + '-fotos-preview');
  if (!previewGrid) return;

  var todasFotos = [];
  if (fotosPagina['G']) fotosPagina['G'].forEach(function(cod) { todasFotos.push(cod); });
  if (fotosPagina['W1']) fotosPagina['W1'].forEach(function(f) { todasFotos.push(f.codigo || f); });
  if (fotosPagina['W2']) fotosPagina['W2'].forEach(function(f) { todasFotos.push(f.codigo || f); });

  todasFotos.forEach(function(codigo) {
    var img = document.createElement('img');
    img.title = codigo;
    img.alt = codigo;
    img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:2px solid #ddd';
    img.onclick = function() { abrirLightboxFoto(this.src, codigo); };
    // Buscar thumbnail en IndexedDB
    buscarFotoData(codigo, r.tipo, r.unidad).then(function(data) {
      if (data) {
        img.src = data;
      } else {
        // Fallback: servidor/Cloudinary
        var serverUrl = API_BASE + 'uploads/rapca/' + r.tipo + '/' + r.unidad + '/' + codigo + '.jpg';
        img.onerror = function() {
          img.onerror = null;
          img.src = 'https://res.cloudinary.com/drnqs1jwl/image/upload/w_120,q_60/rapca/' + r.tipo + '/' + r.unidad + '/' + codigo;
        };
        img.src = serverUrl;
      }
    }).catch(function() {
      img.alt = codigo;
    });
    previewGrid.appendChild(img);
  });
  actualizarBtnEliminarFotos(prefix);
}

function actualizarBtnEliminarFotos(prefix) {
  var previewGrid = document.getElementById(prefix + '-fotos-preview');
  var btn = document.getElementById(prefix + '-btn-eliminar-fotos');
  if (!btn) return;
  btn.style.display = (previewGrid && previewGrid.children.length > 0) ? 'block' : 'none';
}

function eliminarTodasFotosForm(prefix) {
  var previewGrid = document.getElementById(prefix + '-fotos-preview');
  if (!previewGrid || previewGrid.children.length === 0) { showToast('No hay fotos', 'error'); return; }
  var n = previewGrid.children.length;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar todas las fotos</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px">Se eliminarán <strong>' + n + '</strong> foto' + (n > 1 ? 's' : '') + ' de este formulario.</p>';
  html += '<p style="font-size:13px;color:#e74c3c;margin:0 0 16px">⚠️ Esta acción no se puede deshacer.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="confirmarEliminarTodasFotosForm(\'' + prefix + '\')" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar ' + n + ' fotos</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function confirmarEliminarTodasFotosForm(prefix) {
  cerrarModal();
  // Recopilar todos los códigos de fotos del formulario
  var codigos = [];
  ['G', 'W1', 'W2'].forEach(function(key) {
    if (fotosPagina[key]) {
      fotosPagina[key].forEach(function(f) {
        var cod = typeof f === 'string' ? f : f.codigo;
        if (cod) codigos.push(cod);
      });
    }
  });
  if (codigos.length > 0) {
    eliminarFotosDeCodigos(codigos);
  }
  // Limpiar fotosPagina
  fotosPagina = {};
  // Limpiar preview
  var previewGrid = document.getElementById(prefix + '-fotos-preview');
  if (previewGrid) previewGrid.innerHTML = '';
  // Ocultar botón
  actualizarBtnEliminarFotos(prefix);
  showToast('Todas las fotos eliminadas', 'success');
}

function eliminarRegistro(id) {
  // Verificar que el operador tiene acceso a este registro
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r) { showToast('No tienes acceso a este registro', 'error'); return; }
  if (!confirm('¿Eliminar registro?')) return;

  // Recopilar fotos del registro para eliminarlas también
  var codigosFotos = [];
  if (r.datos.fotos && typeof r.datos.fotos === 'string') {
    r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(Boolean).forEach(function(cod) {
      codigosFotos.push(cod);
    });
  }
  if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
    r.datos.fotosComp.forEach(function(fc) {
      if (fc.numero) codigosFotos.push(fc.numero);
    });
  }

  // Eliminar fotos del servidor/Cloudinary
  if (codigosFotos.length > 0) {
    eliminarFotosDeCodigos(codigosFotos);
  }

  // Eliminar registro del servidor
  eliminarRegistroServidor(id);

  registros = registros.filter(function(r) { return r.id != id; });
  guardarRegistros();
  renderPanel();
  showToast('Registro eliminado', 'info');
}

function eliminarRegistroServidor(id) {
  if (!sesion || !sesion.token) return;
  fetch(API_BASE + 'datos.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
    body: JSON.stringify({accion: 'eliminar', registro_id: id})
  }).then(function(resp) { return resp.json(); }).then(function(data) {
    if (data.ok) {
      console.log('Registro eliminado del servidor:', id);
    } else {
      console.warn('Error eliminando del servidor:', data.error);
    }
  }).catch(function(e) {
    console.warn('No se pudo eliminar registro del servidor:', e.message);
  });
}

function reiniciarContadoresFotos() {
  if (!confirm('¿Reiniciar los contadores de numeración de fotos?\n\nLas fotos nuevas empezarán a numerarse desde 1. Usa esto solo si quieres empezar de nuevo.')) return;
  localStorage.removeItem('rapca_contadores_VP');
  localStorage.removeItem('rapca_contadores_EL');
  localStorage.removeItem('rapca_contadores_EI');
  localStorage.setItem('rapca_contadores_reiniciados', 'true');
  showToast('Contadores reiniciados. Las fotos empezarán desde 1.', 'success');
}

function borrarTodosRegistros() {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var nRegs = registros.length;
  var html = '<h2 style="color:#e74c3c">Borrar todos los datos</h2>' +
    '<p style="margin:10px 0">Se eliminarán <strong>' + nRegs + ' registros</strong>, todas las fotos y archivos pendientes de subir.</p>' +
    '<p style="margin:10px 0;color:#e74c3c;font-weight:600">Esta acción NO se puede deshacer.</p>' +
    '<div class="form-group"><label>Escribe <strong>BORRAR</strong> para confirmar:</label>' +
    '<input type="text" id="confirmar-borrar-input" placeholder="Escribe BORRAR" autocomplete="off" style="text-transform:uppercase"></div>' +
    '<div class="modal-actions">' +
    '<button class="btn btn-danger" onclick="ejecutarBorrarTodo()">Eliminar todo</button>' +
    '<button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button>' +
    '</div>';
  abrirModal(html);
  setTimeout(function() { document.getElementById('confirmar-borrar-input').focus(); }, 100);
}

async function ejecutarBorrarTodo() {
  var input = document.getElementById('confirmar-borrar-input');
  if (!input || input.value.trim().toUpperCase() !== 'BORRAR') {
    showToast('Escribe BORRAR para confirmar', 'error');
    input.value = '';
    input.focus();
    return;
  }

  // Borrar en el servidor primero
  if (sesion && sesion.token && !sesion.token.startsWith('local_') && navigator.onLine) {
    try {
      var resp = await fetch(API_BASE + 'datos.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
        body: JSON.stringify({accion: 'borrar_todo', confirmacion: 'BORRAR'})
      });
      var data = await resp.json();
      if (!data.ok) {
        showToast('Error del servidor: ' + (data.error || 'desconocido'), 'error');
        return;
      }
      showToast('Borrados ' + (data.borrados || 0) + ' registros del servidor', 'info');
    } catch(e) {
      showToast('No se pudo conectar al servidor. Inténtalo con conexión.', 'error');
      return;
    }
  }

  // Borrar localmente
  registros = [];
  guardarRegistros();

  // Limpiar fotos e IndexedDB
  if (db) {
    try {
      var tx = db.transaction(['fotos', 'subidas_pendientes'], 'readwrite');
      tx.objectStore('fotos').clear();
      tx.objectStore('subidas_pendientes').clear();
    } catch(e) { console.error('Error limpiando IndexedDB:', e); }
  }

  // Limpiar contadores de fotos
  localStorage.removeItem('rapca_contadores_VP');
  localStorage.removeItem('rapca_contadores_EL');
  localStorage.removeItem('rapca_contadores_EI');

  cerrarModal();
  renderPanel();
  showToast('Todos los registros y fotos eliminados', 'info');
}

// ============================================================
// MODAL OPCIONES PDF
// ============================================================
var _pdfPendienteId = null;
var _pdfPendienteTodos = false;

function abrirOpcionesPDF(id) {
  _pdfPendienteId = id;
  _pdfPendienteTodos = false;
  mostrarModalPDF();
}

function abrirOpcionesTodosPDF() {
  _pdfPendienteId = null;
  _pdfPendienteTodos = true;
  mostrarModalPDF();
}

function mostrarModalPDF() {
  var box = document.getElementById('modal-box');
  box.innerHTML =
    '<h2>📄 Opciones de Informe PDF</h2>' +
    '<div style="margin:14px 0">' +
      '<label style="font-weight:600;display:block;margin-bottom:8px">Fotografías:</label>' +
      '<label style="display:block;padding:8px 12px;border:2px solid #2e7d32;border-radius:8px;margin-bottom:6px;cursor:pointer;background:#e8f5e9">' +
        '<input type="radio" name="pdf-fotos" value="todas" checked style="margin-right:8px">Todas las fotos (comparativas + generales)' +
      '</label>' +
      '<label style="display:block;padding:8px 12px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;cursor:pointer">' +
        '<input type="radio" name="pdf-fotos" value="comparativas" style="margin-right:8px">Solo fotos comparativas (W1/W2)' +
      '</label>' +
      '<label style="display:block;padding:8px 12px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;cursor:pointer">' +
        '<input type="radio" name="pdf-fotos" value="ninguna" style="margin-right:8px">Sin fotos (solo datos)' +
      '</label>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-sm btn-outline" onclick="cerrarModal()">Cancelar</button>' +
      '<button class="btn btn-sm btn-primary" onclick="confirmarExportPDF()">Generar PDF</button>' +
    '</div>';
  document.getElementById('modal-overlay').classList.add('open');

  // Highlight selected radio
  box.querySelectorAll('input[name="pdf-fotos"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      box.querySelectorAll('label').forEach(function(lbl) {
        if (lbl.querySelector('input[name="pdf-fotos"]')) {
          lbl.style.border = '1px solid #ddd';
          lbl.style.background = '#fff';
        }
      });
      var sel = radio.closest('label');
      sel.style.border = '2px solid #2e7d32';
      sel.style.background = '#e8f5e9';
    });
  });
}

function confirmarExportPDF() {
  var seleccion = 'todas';
  var radios = document.querySelectorAll('input[name="pdf-fotos"]');
  radios.forEach(function(r) { if (r.checked) seleccion = r.value; });
  cerrarModal();

  var opcionesFotos = {
    incluirComparativas: seleccion === 'todas' || seleccion === 'comparativas',
    incluirGenerales: seleccion === 'todas'
  };

  if (_pdfPendienteTodos) {
    var regs = registrosFiltradosPanel();
    if (regs.length === 0) { showToast('No hay registros', 'error'); return; }
    regs.forEach(function(r, i) {
      setTimeout(function() { exportarPDFRegistro(r.id, opcionesFotos); }, i * 500);
    });
  } else if (_pdfPendienteId) {
    exportarPDFRegistro(_pdfPendienteId, opcionesFotos);
  }
}

// ============================================================
// EXPORTAR PDF
// ============================================================
async function exportarPDFRegistro(id, opcionesFotos) {
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r) return;

  if (!opcionesFotos) opcionesFotos = { incluirComparativas: true, incluirGenerales: true };

  var conFotos = opcionesFotos.incluirComparativas || opcionesFotos.incluirGenerales;
  showToast(conFotos ? 'Preparando informe con fotos...' : 'Preparando informe...', 'info');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RAPCA ' + escapeHtml(r.tipo) + ' - ' + escapeHtml(r.unidad) + '</title>';
  html += '<style>body{font-family:sans-serif;padding:20px;max-width:800px;margin:0 auto}h1{color:#1a3d2e}h2{color:#1a3d2e;margin-top:24px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f0}.badge{padding:3px 8px;border-radius:12px;color:#fff;font-weight:700}img{max-width:100%}@media print{div[style*="page-break"]{page-break-before:always}img{break-inside:avoid}}</style></head><body>';
  html += '<h1>RAPCA EMA — ' + escapeHtml(r.tipo) + '</h1>';
  html += '<table><tr><th>Fecha</th><td>' + escapeHtml(r.fecha) + '</td><th>Unidad</th><td>' + escapeHtml(r.unidad) + '</td></tr>';
  html += '<tr><th>Zona</th><td>' + escapeHtml(r.zona) + '</td><th>Transecto</th><td>' + escapeHtml(r.transecto || '—') + '</td></tr>';
  html += '<tr><th>Operador</th><td>' + escapeHtml(r.operador_nombre || '') + '</td><th>Coordenadas</th><td>' + (r.lat ? formatCoordNW(r.lat, r.lon) : '—') + '</td></tr></table>';

  // Secciones de datos de campo, reutilizable por transecto en fichas EI
  function seccionesDatos(d) {
    var s = '';
    if (d.pastoreo) {
      s += '<h3>Grados de Pastoreo</h3><table><tr>';
      d.pastoreo.forEach(function(p, i) { s += '<th>Punto ' + (i+1) + '</th>'; });
      s += '</tr><tr>';
      d.pastoreo.forEach(function(p) { s += '<td>' + escapeHtml(p || '—') + '</td>'; });
      s += '</tr></table>';
    }

    if (d.observacionPastoreo) {
      s += '<h3>Observación Pastoreo</h3><table><tr><th>Señal Paso</th><th>Veredas</th><th>Cagarrutas</th></tr><tr>';
      s += '<td>' + escapeHtml(d.observacionPastoreo.senal || '—') + '</td>';
      s += '<td>' + escapeHtml(d.observacionPastoreo.veredas || '—') + '</td>';
      s += '<td>' + escapeHtml(d.observacionPastoreo.cagarrutas || '—') + '</td></tr></table>';
    }

    if (d.plantas) {
      s += '<h3>Plantas</h3><table><tr><th>Especie</th><th>Notas</th><th>Media</th></tr>';
      d.plantas.forEach(function(p) {
        s += '<tr><td style="font-style:italic">' + escapeHtml(p.nombre || '—') + '</td><td>' + (p.notas || []).join(', ') + '</td><td><strong>' + escapeHtml(p.media || '—') + '</strong></td></tr>';
      });
      s += '</table><p><strong>Media general: ' + (d.plantasMedia || '—') + '</strong></p>';
    }

    if (d.palatables) {
      s += '<h3>Palatables</h3><table><tr><th>Especie</th><th>Notas</th><th>Media</th></tr>';
      d.palatables.forEach(function(p) {
        s += '<tr><td style="font-style:italic">' + escapeHtml(p.nombre || '—') + '</td><td>' + (p.notas || []).join(', ') + '</td><td><strong>' + escapeHtml(p.media || '—') + '</strong></td></tr>';
      });
      s += '</table><p><strong>Media general: ' + (d.palatablesMedia || '—') + '</strong></p>';
    }

    if (d.herbaceas) {
      s += '<h3>Herbáceas</h3><table><tr>';
      for (var h = 1; h <= 7; h++) s += '<th>H' + h + '</th>';
      s += '<th>Media</th></tr><tr>';
      d.herbaceas.forEach(function(v) { s += '<td>' + (v !== null ? v : '—') + '</td>'; });
      s += '<td><strong>' + (d.herbaceasMedia || '—') + '</strong></td></tr></table>';
    }

    if (d.matorral) {
      var mp1 = d.matorral.punto1 || {};
      var mp2 = d.matorral.punto2 || {};
      s += '<h3>Matorralización</h3><table><tr><th></th><th>Cobertura (%)</th><th>Altura (cm)</th><th>Especie</th></tr>';
      s += '<tr><td>Punto 1</td><td>' + (mp1.cobertura || 0) + '</td><td>' + (mp1.altura || 0) + '</td><td style="font-style:italic">' + escapeHtml(mp1.especie || '—') + '</td></tr>';
      s += '<tr><td>Punto 2</td><td>' + (mp2.cobertura || 0) + '</td><td>' + (mp2.altura || 0) + '</td><td style="font-style:italic">' + escapeHtml(mp2.especie || '—') + '</td></tr>';
      s += '</table><p><strong>Volumen: ' + (d.matorral.volumen || '—') + ' m³/ha</strong> (Cob media: ' + (d.matorral.mediaCob || '—') + '%, Alt media: ' + (d.matorral.mediaAlt || '—') + ' cm)</p>';
    }

    if (d.observaciones) s += '<h3>Observaciones</h3><p>' + escapeHtml(d.observaciones) + '</p>';
    return s;
  }

  if (r.datos.transectos) {
    // Ficha EI con transectos: imprimir cada transecto con datos
    // (antes el informe solo mostraba T1 y se perdían T2/T3)
    ['T1', 'T2', 'T3'].forEach(function(t) {
      var dt = r.datos.transectos[t];
      if (!dt) return;
      if (typeof esTransectoVacio === 'function' && esTransectoVacio(dt)) return;
      html += '<h2 style="background:#fd9853;color:#fff;padding:6px 12px;border-radius:6px;margin-top:24px">Transecto ' + t + '</h2>';
      html += seccionesDatos(dt);
    });
  } else {
    html += seccionesDatos(r.datos);
  }

  // ---- FOTOS COMPARATIVAS (prioridad alta, más grandes) ----
  if (opcionesFotos.incluirComparativas && r.datos.fotosComp && r.datos.fotosComp.length > 0) {
    html += '<div style="page-break-before:always"></div>';
    html += '<h2 style="color:#1a3d2e;border-bottom:2px solid #1a3d2e;padding-bottom:4px">Fotos Comparativas</h2>';

    // Agrupar por waypoint
    var porWP = {};
    r.datos.fotosComp.forEach(function(fc) {
      var wp = fc.waypoint || 'W';
      if (!porWP[wp]) porWP[wp] = [];
      porWP[wp].push(fc);
    });

    var waypoints = Object.keys(porWP).sort();
    for (var w = 0; w < waypoints.length; w++) {
      var wp = waypoints[w];
      var label = wp === 'W1' ? 'Waypoint 1' : wp === 'W2' ? 'Waypoint 2' : wp;
      html += '<h3 style="color:#2e7d32">' + label + '</h3>';
      var fcs = porWP[wp];
      for (var c = 0; c < fcs.length; c++) {
        var fc = fcs[c];
        try {
          var fotoData = await buscarFotoData(fc.numero || '', r.tipo, r.unidad);
          if (fotoData) {
            html += '<div style="margin-bottom:12px;text-align:center">';
            html += '<img src="' + fotoData + '" style="max-width:100%;width:500px;border-radius:8px;border:2px solid #2e7d32;box-shadow:0 2px 8px rgba(0,0,0,0.15)">';
            html += '<div style="font-size:11px;color:#555;margin-top:4px">' + (fc.numero || '') + (fc.lat ? ' · ' + formatCoordNW(fc.lat, fc.lon) : '') + '</div>';
            html += '</div>';
          } else {
            html += '<p style="color:#888;font-size:12px;font-style:italic">' + (fc.numero || '') + ' — foto no disponible</p>';
          }
        } catch(e) {
          html += '<p style="color:#888;font-size:12px;font-style:italic">' + (fc.numero || '') + ' — error cargando foto</p>';
        }
      }
    }
  }

  // ---- FOTOS GENERALES ----
  if (opcionesFotos.incluirGenerales && r.datos.fotos) {
    var codigos = r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    if (codigos.length > 0) {
      html += '<h2 style="color:#1a3d2e;border-bottom:2px solid #1a3d2e;padding-bottom:4px;margin-top:20px">Fotos Generales</h2>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">';
      for (var i = 0; i < codigos.length; i++) {
        try {
          var fotoData = await buscarFotoData(codigos[i], r.tipo, r.unidad);
          if (fotoData) {
            html += '<div style="text-align:center">';
            html += '<img src="' + fotoData + '" style="width:220px;border-radius:6px;border:1px solid #ddd">';
            html += '<div style="font-size:10px;color:#888;margin-top:2px">' + codigos[i] + '</div>';
            html += '</div>';
          }
        } catch(e) {}
      }
      html += '</div>';
    }
  }

  html += '<hr><p style="color:#888;font-size:11px">Generado por RAPCA Campo · ' + new Date().toLocaleString('es-ES') + '</p></body></html>';

  var win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    // Pequeña espera para que las imágenes se rendericen antes de imprimir
    setTimeout(function() { win.print(); }, 400);
  } else {
    // Popup bloqueado (habitual en móvil o al exportar varios): descargar HTML
    var nombreArch = 'informe_' + r.tipo + '_' + String(r.unidad).replace(/[^\w\-]/g, '_') + '_' + r.fecha + '.html';
    descargarArchivo(html, nombreArch, 'text/html');
    showToast('Popup bloqueado: informe descargado como HTML', 'info');
  }
}

function registrosFiltradosPanel() {
  var regs = misRegistros();
  var tipoFiltro = document.getElementById('panel-filtro-tipo').value;
  var opFiltro = document.getElementById('panel-filtro-operador').value;
  var unidadFiltro = document.getElementById('panel-filtro-unidad').value;
  var desdeFiltro = document.getElementById('panel-filtro-desde').value;
  var hastaFiltro = document.getElementById('panel-filtro-hasta').value;
  if (tipoFiltro) regs = regs.filter(function(r) { return r.tipo === tipoFiltro; });
  if (opFiltro) regs = regs.filter(function(r) { return r.operador_nombre === opFiltro; });
  if (unidadFiltro) regs = regs.filter(function(r) { return r.unidad === unidadFiltro; });
  if (desdeFiltro) regs = regs.filter(function(r) { return r.fecha >= desdeFiltro; });
  if (hastaFiltro) regs = regs.filter(function(r) { return r.fecha <= hastaFiltro; });
  return regs;
}

function exportarExcelRegistros() {
  var regs = registrosFiltradosPanel();
  if (regs.length === 0) { showToast('No hay registros para exportar', 'error'); return; }

  function filaExcel(r, datos, transectoLabel) {
    var fila = {
      'Tipo': r.tipo,
      'Fecha': r.fecha,
      'Unidad': r.unidad,
      'Zona': r.zona || '',
      'Transecto': transectoLabel || '',
      'Operador': r.operador_nombre || '',
      'Latitud': r.lat || '',
      'Longitud': r.lon || '',
      'Enviado': r.enviado ? 'Sí' : 'No'
    };

    if (datos) {
      // Pastoreo
      if (datos.pastoreo) {
        if (Array.isArray(datos.pastoreo)) {
          fila['Pastoreo'] = datos.pastoreo.join(', ');
        } else {
          fila['Pastoreo'] = String(datos.pastoreo);
        }
      }
      // Observación pastoreo
      if (datos.observacionPastoreo) {
        var obs = datos.observacionPastoreo;
        fila['Señal Paso'] = obs.senal || '';
        fila['Veredas'] = obs.veredas || '';
        fila['Cagarrutas'] = obs.cagarrutas || '';
      }
      // Fotos
      fila['Fotos'] = datos.fotos || '';
      // Fotos comparativas
      if (datos.fotosComp && datos.fotosComp.length > 0) {
        fila['Fotos Comparativas'] = datos.fotosComp.map(function(f) {
          return f.numero + ' (' + f.waypoint + ')';
        }).join(', ');
      }
      // Observaciones
      fila['Observaciones'] = datos.observaciones || '';

      // Datos EI específicos
      if (r.tipo === 'EI') {
        // Plantas
        if (datos.plantas) {
          datos.plantas.forEach(function(p, i) {
            if (p.nombre) {
              fila['Planta ' + (i + 1)] = p.nombre;
              fila['Planta ' + (i + 1) + ' Media'] = p.media || '';
              fila['Planta ' + (i + 1) + ' Notas'] = (p.notas || []).filter(function(n) { return n !== null; }).join(', ');
            }
          });
        }
        fila['Media Plantas'] = datos.plantasMedia || '';
        // Palatables
        if (datos.palatables) {
          datos.palatables.forEach(function(p, i) {
            if (p.nombre) {
              fila['Palatable ' + (i + 1)] = p.nombre;
              fila['Palatable ' + (i + 1) + ' Media'] = p.media || '';
              fila['Palatable ' + (i + 1) + ' Notas'] = (p.notas || []).filter(function(n) { return n !== null; }).join(', ');
            }
          });
        }
        fila['Media Palatables'] = datos.palatablesMedia || '';
        // Herbáceas
        if (datos.herbaceas) {
          fila['Herbáceas'] = datos.herbaceas.filter(function(n) { return n !== null; }).join(', ');
        }
        fila['Media Herbáceas'] = datos.herbaceasMedia || '';
        // Matorral
        if (datos.matorral) {
          var mat = datos.matorral;
          fila['Matorral P1 Cobertura'] = mat.punto1 ? mat.punto1.cobertura : '';
          fila['Matorral P1 Altura'] = mat.punto1 ? mat.punto1.altura : '';
          fila['Matorral P1 Especie'] = mat.punto1 ? mat.punto1.especie : '';
          fila['Matorral P2 Cobertura'] = mat.punto2 ? mat.punto2.cobertura : '';
          fila['Matorral P2 Altura'] = mat.punto2 ? mat.punto2.altura : '';
          fila['Matorral P2 Especie'] = mat.punto2 ? mat.punto2.especie : '';
          fila['Matorral Media Cob'] = mat.mediaCob || '';
          fila['Matorral Media Alt'] = mat.mediaAlt || '';
          fila['Matorral Volumen'] = mat.volumen || '';
        }
      }
    }

    return fila;
  }

  // Fichas EI con transectos: una fila por transecto con datos
  // (antes solo se exportaba T1 y se perdían T2/T3)
  var filas = [];
  regs.forEach(function(r) {
    if (r.tipo === 'EI' && r.datos && r.datos.transectos) {
      var alguna = false;
      ['T1', 'T2', 'T3'].forEach(function(t) {
        var dt = r.datos.transectos[t];
        if (!dt) return;
        filas.push(filaExcel(r, dt, t));
        alguna = true;
      });
      if (!alguna) filas.push(filaExcel(r, r.datos, r.transecto || ''));
    } else {
      filas.push(filaExcel(r, r.datos, r.transecto || ''));
    }
  });

  var ws = XLSX.utils.json_to_sheet(filas);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Registros');
  var fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, 'registros_rapca_' + fecha + '.xlsx');
  showToast('Excel exportado (' + regs.length + ' registros)', 'success');
}

function exportarTodosPDF() {
  var regs = registrosFiltradosPanel();
  if (regs.length === 0) { showToast('No hay registros', 'error'); return; }
  regs.forEach(function(r, i) {
    setTimeout(function() { exportarPDFRegistro(r.id); }, i * 500);
  });
}

async function descargarFotosZIP(id) {
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r || !r.datos.fotos) { showToast('No hay fotos', 'error'); return; }
  var zip = new JSZip();
  var codigos = r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
  var noEncontradas = 0;
  for (var i = 0; i < codigos.length; i++) {
    try {
      // Buscar en todas las fuentes (local, precarga, pendientes, Cloudinary)
      var data = await buscarFotoData(codigos[i], r.tipo, r.unidad);
      if (data && data.indexOf('data:') === 0) {
        zip.file(codigos[i] + '.jpg', data.split(',')[1], {base64: true});
      } else {
        noEncontradas++;
      }
    } catch(e) { noEncontradas++; }
  }
  if (noEncontradas === codigos.length) { showToast('No se pudo recuperar ninguna foto', 'error'); return; }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.unidad + '_fotos.zip';
    a.click();
    if (noEncontradas > 0) showToast(noEncontradas + ' fotos no disponibles', 'info');
  });
}

async function descargarTodasFotosZIP() {
  var zip = new JSZip();
  var all = await obtenerTodosDB('fotos');
  all.forEach(function(foto) {
    if (!foto || !foto.data || typeof foto.data !== 'string') return;
    var base64 = foto.data.split(',')[1];
    zip.file(foto.codigo + '.jpg', base64, {base64: true});
  });
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapca_todas_fotos.zip';
    a.click();
  });
  showToast('Descargando ZIP de fotos...', 'info');
}


// ============================================================
// INFRAESTRUCTURAS
// ============================================================
var INFRA_CAMPOS_BASE = ['provincia','idZona','idUnidad','codInfoca','nombre','superficie','pagoMaximo','municipio','pn','contrato','vegetacion','pendiente','distancia'];

// Campo de enlace con registros (por defecto idUnidad)
function obtenerCampoEnlace() {
  return localStorage.getItem('rapca_infra_campo_enlace') || 'idUnidad';
}

function obtenerTodosCamposInfra() {
  return INFRA_CAMPOS_BASE.concat(JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]'));
}

// Obtener registros vinculados a una infraestructura
function registrosDeInfra(inf) {
  var campoEnlace = obtenerCampoEnlace();
  var valorEnlace = inf[campoEnlace];
  if (!valorEnlace) return [];
  return misRegistros().filter(function(r) {
    return r.unidad === valorEnlace || r.zona === valorEnlace;
  });
}

function renderInfras() {
  var lista = document.getElementById('infra-lista');
  if (infraestructuras.length === 0) {
    lista.innerHTML = '<div class="card" style="text-align:center;color:#888;padding:30px">No hay infraestructuras registradas.<br>Importa un Excel/CSV o crea una manualmente.</div>';
    return;
  }
  var campoEnlace = obtenerCampoEnlace();
  lista.innerHTML = infraestructuras.map(function(inf, i) {
    var regsInf = registrosDeInfra(inf);
    var vpC = regsInf.filter(function(r) { return r.tipo === 'VP'; }).length;
    var elC = regsInf.filter(function(r) { return r.tipo === 'EL'; }).length;
    var eiC = regsInf.filter(function(r) { return r.tipo === 'EI'; }).length;
    var totalFotos = 0;
    regsInf.forEach(function(r) {
      if (r.datos.fotos) totalFotos += r.datos.fotos.split(',').filter(Boolean).length;
      if (r.datos.fotosComp) totalFotos += r.datos.fotosComp.length;
    });
    return '<div class="card infra-card" onclick="verDetalleInfra(' + i + ')">' +
      '<div class="infra-icon">🏗️</div>' +
      '<div class="infra-info"><h3>' + escapeHtml(inf.nombre || inf[campoEnlace] || 'Sin nombre') + '</h3>' +
      '<small>' + escapeHtml(inf.provincia || '') + (inf.municipio ? ' · ' + escapeHtml(inf.municipio) : '') + '</small>' +
      '<div class="infra-badges">' +
      '<span class="badge badge-vp">VP:' + vpC + '</span>' +
      '<span class="badge badge-el">EL:' + elC + '</span>' +
      '<span class="badge badge-ei">EI:' + eiC + '</span>' +
      (totalFotos > 0 ? '<span class="badge" style="background:#795548">📷' + totalFotos + '</span>' : '') +
      '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px">' +
      '<button class="btn-icon" onclick="event.stopPropagation();editarInfra(' + i + ')" title="Editar" style="color:#1a3d2e;font-size:14px">✏️</button>' +
      '<button class="btn-icon" onclick="event.stopPropagation();generarInformeInfraUnica(' + i + ')" title="Informe" style="color:#2e7d32;font-size:14px">📋</button>' +
      '<button class="btn-icon" onclick="event.stopPropagation();eliminarInfra(' + i + ')" title="Eliminar" style="color:#e74c3c;font-size:14px">🗑️</button>' +
      '</div></div>';
  }).join('');
}

// --- Vista detalle de infraestructura ---
function verDetalleInfra(idx) {
  var inf = infraestructuras[idx];
  var campos = obtenerTodosCamposInfra();
  var regsInf = registrosDeInfra(inf);

  var html = '<h2>' + escapeHtml(inf.nombre || inf.idUnidad || 'Infraestructura') + '</h2>';

  // Datos de la infraestructura
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px">';
  campos.forEach(function(c) {
    if (inf[c]) {
      html += '<tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #eee;color:#555;width:40%">' + escapeHtml(c) + '</th><td style="padding:4px 8px;border-bottom:1px solid #eee">' + escapeHtml(inf[c]) + '</td></tr>';
    }
  });
  // Mostrar campos extra que no estén en la lista base
  Object.keys(inf).forEach(function(k) {
    if (campos.indexOf(k) < 0 && inf[k]) {
      html += '<tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #eee;color:#555;width:40%">' + escapeHtml(k) + '</th><td style="padding:4px 8px;border-bottom:1px solid #eee">' + escapeHtml(String(inf[k])) + '</td></tr>';
    }
  });
  html += '</table>';

  // Registros vinculados
  html += '<h3 style="margin:12px 0 6px;color:#1a3d2e">Registros vinculados (' + regsInf.length + ')</h3>';
  if (regsInf.length > 0) {
    html += '<div style="max-height:200px;overflow-y:auto">';
    regsInf.forEach(function(r) {
      html += '<div style="padding:6px;border-bottom:1px solid #eee;font-size:13px">' +
        '<span class="badge" style="background:' + (r.tipo === 'VP' ? '#2e7d32' : r.tipo === 'EL' ? '#1565c0' : '#e65100') + '">' + r.tipo + '</span> ' +
        r.fecha + ' · ' + (r.operador_nombre || '') + ' · ' + r.unidad +
        '</div>';
    });
    html += '</div>';
  } else {
    html += '<p style="color:#888;font-size:13px">No hay registros vinculados a esta infraestructura</p>';
  }

  // Botones de acción
  html += '<div class="modal-actions" style="margin-top:12px">' +
    '<button class="btn btn-primary" onclick="cerrarModal();generarInformeInfraUnica(' + idx + ')">📋 Generar informe</button>' +
    '<button class="btn btn-outline" onclick="cerrarModal();editarInfra(' + idx + ')">✏️ Editar</button>' +
    '<button class="btn btn-outline" onclick="cerrarModal()">Cerrar</button>' +
    '</div>';
  abrirModal(html);
}

function filtrarInfras(val) {
  var cards = document.getElementById('infra-lista').querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].style.display = cards[i].textContent.toLowerCase().indexOf(val.toLowerCase()) >= 0 ? '' : 'none';
  }
}

// --- Gestión de campos personalizados ---
function gestionarCamposInfra() {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores pueden gestionar campos', 'error'); return; }
  var extras = JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]');
  var campoEnlace = obtenerCampoEnlace();
  var todosCampos = INFRA_CAMPOS_BASE.concat(extras);

  var html = '<h2>Gestionar Campos</h2>';

  // Campo de enlace
  html += '<div class="form-group"><label style="font-weight:700;color:#1a3d2e">Campo de enlace con registros</label>';
  html += '<select id="infra-campo-enlace" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc">';
  todosCampos.forEach(function(c) {
    html += '<option value="' + c + '"' + (c === campoEnlace ? ' selected' : '') + '>' + c + '</option>';
  });
  html += '</select>';
  html += '<small style="color:#888">Este campo se usa para vincular infraestructuras con registros de campo y fotos</small></div>';

  // Campos base (no editables)
  html += '<div class="form-group"><label>Campos base</label>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
  INFRA_CAMPOS_BASE.forEach(function(c) {
    html += '<span style="background:#e8f5e9;padding:3px 8px;border-radius:12px;font-size:12px">' + c + '</span>';
  });
  html += '</div></div>';

  // Campos extra (editables)
  html += '<div class="form-group"><label>Campos personalizados</label>';
  if (extras.length > 0) {
    extras.forEach(function(c, i) {
      html += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0">' +
        '<span style="flex:1;padding:4px 8px;background:#f5f5f5;border-radius:6px;font-size:13px">' + escapeHtml(c) + '</span>' +
        '<button class="btn btn-sm" onclick="eliminarCampoInfra(' + i + ')" style="color:#e74c3c;border:none;padding:4px">✕</button>' +
        '</div>';
    });
  } else {
    html += '<p style="color:#888;font-size:13px">No hay campos personalizados</p>';
  }
  html += '</div>';

  // Añadir nuevo campo
  html += '<div class="form-group"><label>Añadir campo</label>';
  html += '<div style="display:flex;gap:6px"><input type="text" id="infra-nuevo-campo" placeholder="Nombre del campo" style="flex:1"><button class="btn btn-sm btn-outline" onclick="agregarCampoInfraDesdeGestion()">＋ Añadir</button></div></div>';

  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="guardarConfigCamposInfra()">Guardar configuración</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function agregarCampoInfraDesdeGestion() {
  var campo = document.getElementById('infra-nuevo-campo').value.trim();
  if (!campo) return;
  var extras = JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]');
  if (extras.indexOf(campo) < 0 && INFRA_CAMPOS_BASE.indexOf(campo) < 0) {
    extras.push(campo);
    localStorage.setItem('rapca_campos_infra', JSON.stringify(extras));
  }
  gestionarCamposInfra();
}

function eliminarCampoInfra(idx) {
  var extras = JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]');
  extras.splice(idx, 1);
  localStorage.setItem('rapca_campos_infra', JSON.stringify(extras));
  gestionarCamposInfra();
}

function guardarConfigCamposInfra() {
  var enlace = document.getElementById('infra-campo-enlace').value;
  localStorage.setItem('rapca_infra_campo_enlace', enlace);
  cerrarModal();
  renderInfras();
  showToast('Configuración de campos guardada', 'success');
}

function nuevaInfra() {
  var campos = obtenerTodosCamposInfra();
  var html = '<h2>Nueva Infraestructura</h2>';
  campos.forEach(function(c) {
    html += '<div class="form-group"><label>' + escapeHtml(c) + '</label><input type="text" id="infra-f-' + c + '"></div>';
  });
  if (sesion && sesion.rol === 'admin') {
    html += '<div class="form-group"><label>Nuevo campo rápido</label><div style="display:flex;gap:6px"><input type="text" id="infra-nuevo-campo" placeholder="Nombre"><button class="btn btn-sm btn-outline" onclick="agregarCampoInfra()">＋</button></div></div>';
  }
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="guardarInfra()">Guardar</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function agregarCampoInfra() {
  var campo = document.getElementById('infra-nuevo-campo').value.trim();
  if (!campo) return;
  var extras = JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]');
  if (extras.indexOf(campo) < 0) { extras.push(campo); localStorage.setItem('rapca_campos_infra', JSON.stringify(extras)); }
  nuevaInfra();
}

function guardarInfra(idx) {
  var campos = obtenerTodosCamposInfra();
  var inf = {};
  // Si estamos editando, preservar campos que no estén en el formulario
  if (idx !== undefined && infraestructuras[idx]) {
    var prev = infraestructuras[idx];
    for (var k in prev) inf[k] = prev[k];
  }
  campos.forEach(function(c) {
    var el = document.getElementById('infra-f-' + c);
    if (el) inf[c] = el.value;
  });
  if (idx !== undefined) { infraestructuras[idx] = inf; } else { infraestructuras.push(inf); }
  guardarInfras();
  cerrarModal();
  renderInfras();
  showToast('Infraestructura guardada', 'success');
}

function editarInfra(idx) {
  var inf = infraestructuras[idx];
  var campos = obtenerTodosCamposInfra();
  var html = '<h2>Editar Infraestructura</h2>';
  campos.forEach(function(c) {
    html += '<div class="form-group"><label>' + escapeHtml(c) + '</label><input type="text" id="infra-f-' + c + '" value="' + escapeHtml(inf[c] || '') + '"></div>';
  });
  // Mostrar campos extra importados que no están en la lista
  Object.keys(inf).forEach(function(k) {
    if (campos.indexOf(k) < 0) {
      html += '<div class="form-group"><label>' + escapeHtml(k) + ' <small style="color:#888">(importado)</small></label><input type="text" id="infra-f-' + k + '" value="' + escapeHtml(String(inf[k] || '')) + '"></div>';
    }
  });
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="guardarInfra(' + idx + ')">Guardar</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function eliminarInfra(idx) {
  if (!confirm('¿Eliminar infraestructura?')) return;
  infraestructuras.splice(idx, 1);
  guardarInfras();
  renderInfras();
  showToast('Infraestructura eliminada', 'info');
}

// --- Importación mejorada con mapeo de campos ---
function importarExcelInfra() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = function(e) {
    var file = e.target.files[0];
    var reader = new FileReader();
    reader.onload = function(ev) {
      var data;
      if (file.name.endsWith('.csv')) {
        var text = new TextDecoder('utf-8').decode(new Uint8Array(ev.target.result));
        var workbook = XLSX.read(text, {type: 'string'});
        var sheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(sheet);
      } else {
        var workbook = XLSX.read(ev.target.result, {type: 'array'});
        var sheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(sheet);
      }
      if (!data || data.length === 0) { showToast('Archivo vacío', 'error'); return; }
      // Mostrar modal de mapeo de campos
      mostrarMapeoImportacion(data);
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function mostrarMapeoImportacion(data) {
  var columnasArchivo = Object.keys(data[0]);
  var camposApp = obtenerTodosCamposInfra();

  var html = '<h2>Mapear Campos de Importación</h2>';
  html += '<p style="color:#666;font-size:13px">' + data.length + ' filas encontradas. Asocia las columnas del archivo con los campos de la app:</p>';

  html += '<div style="max-height:50vh;overflow-y:auto">';
  columnasArchivo.forEach(function(col) {
    html += '<div class="form-group" style="margin:6px 0">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="flex:1;font-size:13px;font-weight:600">' + escapeHtml(col) + '</span>' +
      '<span style="color:#888">→</span>' +
      '<select class="infra-mapeo-select" data-col="' + escapeHtml(col) + '" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ccc">';
    // Auto-match por nombre similar
    var bestMatch = autoMatchCampo(col, camposApp);
    html += '<option value="' + escapeHtml(col) + '"' + (!bestMatch ? ' selected' : '') + '>→ ' + escapeHtml(col) + ' (nuevo)</option>';
    camposApp.forEach(function(c) {
      html += '<option value="' + c + '"' + (bestMatch === c ? ' selected' : '') + '>' + c + '</option>';
    });
    html += '<option value="_ignorar_">— Ignorar —</option>';
    html += '</select></div></div>';
  });
  html += '</div>';

  html += '<div style="margin-top:8px"><label style="display:flex;align-items:center;gap:6px;font-size:13px">' +
    '<input type="checkbox" id="infra-import-reemplazar"> Reemplazar infraestructuras existentes (mismo campo de enlace)</label></div>';

  // Guardar datos en variable temporal
  window._importData = data;
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="ejecutarImportacion()">Importar ' + data.length + ' filas</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function autoMatchCampo(col, campos) {
  var colLow = col.toLowerCase().replace(/[_\s-]/g, '');
  for (var i = 0; i < campos.length; i++) {
    var cLow = campos[i].toLowerCase().replace(/[_\s-]/g, '');
    if (colLow === cLow || colLow.indexOf(cLow) >= 0 || cLow.indexOf(colLow) >= 0) return campos[i];
  }
  // Alias comunes
  var alias = {
    'id_unidad': 'idUnidad', 'idunidad': 'idUnidad', 'unidad': 'idUnidad',
    'id_zona': 'idZona', 'zona': 'idZona',
    'pago_maximo': 'pagoMaximo', 'pagomaximo': 'pagoMaximo',
    'cod_infoca': 'codInfoca', 'codinfoca': 'codInfoca',
    'parque_natural': 'pn', 'parquenatural': 'pn'
  };
  return alias[colLow] || null;
}

function ejecutarImportacion() {
  var data = window._importData;
  if (!data) return;

  var selects = document.querySelectorAll('.infra-mapeo-select');
  var mapeo = {};
  selects.forEach(function(sel) {
    var colOrig = sel.dataset.col;
    var campoDestino = sel.value;
    if (campoDestino !== '_ignorar_') {
      mapeo[colOrig] = campoDestino;
    }
  });

  var reemplazar = document.getElementById('infra-import-reemplazar').checked;
  var campoEnlace = obtenerCampoEnlace();

  var importadas = 0;
  data.forEach(function(row) {
    var inf = {};
    for (var colOrig in mapeo) {
      if (row[colOrig] !== undefined && row[colOrig] !== null) {
        inf[mapeo[colOrig]] = String(row[colOrig]);
      }
    }
    if (Object.keys(inf).length === 0) return;

    if (reemplazar && inf[campoEnlace]) {
      var existeIdx = -1;
      for (var i = 0; i < infraestructuras.length; i++) {
        if (infraestructuras[i][campoEnlace] === inf[campoEnlace]) { existeIdx = i; break; }
      }
      if (existeIdx >= 0) {
        // Merge: preservar datos existentes, sobreescribir con nuevos
        for (var k in inf) infraestructuras[existeIdx][k] = inf[k];
      } else {
        infraestructuras.push(inf);
      }
    } else {
      infraestructuras.push(inf);
    }
    importadas++;
  });

  // Registrar campos nuevos que no estaban
  var extras = JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]');
  var allCampos = INFRA_CAMPOS_BASE.concat(extras);
  for (var colOrig in mapeo) {
    var campo = mapeo[colOrig];
    if (allCampos.indexOf(campo) < 0 && extras.indexOf(campo) < 0) {
      extras.push(campo);
    }
  }
  localStorage.setItem('rapca_campos_infra', JSON.stringify(extras));

  guardarInfras();
  cerrarModal();
  renderInfras();
  window._importData = null;
  showToast(importadas + ' infraestructuras importadas', 'success');
}

function exportarExcelInfra() {
  if (infraestructuras.length === 0) { showToast('No hay datos para exportar', 'error'); return; }
  var ws = XLSX.utils.json_to_sheet(infraestructuras);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Infraestructuras');
  XLSX.writeFile(wb, 'infraestructuras_rapca.xlsx');
  showToast('Excel exportado', 'success');
}

// ============================================================
// INFORMES DE INFRAESTRUCTURAS
// ============================================================

function abrirInformeInfra() {
  if (infraestructuras.length === 0) { showToast('No hay infraestructuras', 'error'); return; }

  var html = '<h2>Generar Informe de Infraestructuras</h2>';

  // Selección de infraestructuras
  html += '<div class="form-group"><label>Infraestructuras</label>';
  html += '<select id="informe-infra-sel" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc">';
  html += '<option value="_todas_">Todas las infraestructuras</option>';
  var campoEnlace = obtenerCampoEnlace();
  infraestructuras.forEach(function(inf, i) {
    html += '<option value="' + i + '">' + escapeHtml(inf.nombre || inf[campoEnlace] || 'Infraestructura ' + (i+1)) + '</option>';
  });
  html += '</select></div>';

  // Opciones de fotos
  html += '<div class="form-group"><label>Fotos en el informe</label>';
  html += '<select id="informe-fotos-tipo" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc">';
  html += '<option value="ninguna">Sin fotos</option>';
  html += '<option value="comparativas">Solo fotos comparativas (W1/W2)</option>';
  html += '<option value="todas" selected>Todas las fotos</option>';
  html += '</select></div>';

  // Tipos de registro
  html += '<div class="form-group"><label>Tipos de registro a incluir</label>';
  html += '<div style="display:flex;gap:12px">';
  html += '<label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" id="informe-tipo-vp" checked> VP</label>';
  html += '<label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" id="informe-tipo-el" checked> EL</label>';
  html += '<label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" id="informe-tipo-ei" checked> EI</label>';
  html += '</div></div>';

  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="ejecutarInformeInfra()">Generar informe</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function generarInformeInfraUnica(idx) {
  // Abrir modal de opciones con infraestructura preseleccionada
  abrirInformeInfra();
  setTimeout(function() {
    var sel = document.getElementById('informe-infra-sel');
    if (sel) sel.value = idx;
  }, 100);
}

async function ejecutarInformeInfra() {
  var selVal = document.getElementById('informe-infra-sel').value;
  var fotosTipo = document.getElementById('informe-fotos-tipo').value;
  var incluirVP = document.getElementById('informe-tipo-vp').checked;
  var incluirEL = document.getElementById('informe-tipo-el').checked;
  var incluirEI = document.getElementById('informe-tipo-ei').checked;

  var infrasInforme;
  if (selVal === '_todas_') {
    infrasInforme = infraestructuras.slice();
  } else {
    infrasInforme = [infraestructuras[parseInt(selVal)]];
  }

  cerrarModal();
  showToast('Generando informe, cargando fotos...', 'info');

  var campoEnlace = obtenerCampoEnlace();
  var campos = obtenerTodosCamposInfra();

  // Construir HTML del informe
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Informe RAPCA Infraestructuras</title>';
  html += '<style>';
  html += 'body{font-family:sans-serif;padding:20px;max-width:900px;margin:0 auto;color:#333}';
  html += 'h1{color:#1a3d2e;border-bottom:3px solid #1a3d2e;padding-bottom:8px}';
  html += 'h2{color:#1a3d2e;margin-top:30px;border-bottom:2px solid #2e7d32;padding-bottom:4px}';
  html += 'h3{color:#2e7d32;margin-top:20px}';
  html += 'table{width:100%;border-collapse:collapse;margin:10px 0}';
  html += 'th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}';
  html += 'th{background:#f5f5f0;font-weight:700}';
  html += '.badge{padding:2px 8px;border-radius:12px;color:#fff;font-weight:700;font-size:11px}';
  html += '.fotos-comp{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}';
  html += '.fotos-comp img{width:100%;border-radius:8px;border:2px solid #2e7d32;box-shadow:0 2px 8px rgba(0,0,0,0.15)}';
  html += '.fotos-gen{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0}';
  html += '.fotos-gen img{width:100%;border-radius:6px;border:1px solid #ddd}';
  html += '.foto-label{font-size:10px;color:#888;text-align:center;margin-top:2px}';
  html += '.page-break{page-break-before:always}';
  html += '@media print{.page-break{page-break-before:always}img{break-inside:avoid}}';
  html += '</style></head><body>';

  html += '<h1>Informe RAPCA EMA — Infraestructuras</h1>';
  html += '<p style="color:#666">Generado el ' + new Date().toLocaleDateString('es-ES') + ' a las ' + new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'}) + '</p>';

  for (var ii = 0; ii < infrasInforme.length; ii++) {
    var inf = infrasInforme[ii];
    if (ii > 0) html += '<div class="page-break"></div>';

    html += '<h2>' + escapeHtml(inf.nombre || inf[campoEnlace] || 'Infraestructura ' + (ii+1)) + '</h2>';

    // Tabla de datos de infraestructura
    html += '<table>';
    var allKeys = campos.slice();
    Object.keys(inf).forEach(function(k) { if (allKeys.indexOf(k) < 0) allKeys.push(k); });
    for (var ci = 0; ci < allKeys.length; ci += 2) {
      html += '<tr>';
      html += '<th style="width:20%">' + escapeHtml(allKeys[ci]) + '</th><td style="width:30%">' + escapeHtml(inf[allKeys[ci]] || '—') + '</td>';
      if (allKeys[ci+1]) {
        html += '<th style="width:20%">' + escapeHtml(allKeys[ci+1]) + '</th><td style="width:30%">' + escapeHtml(inf[allKeys[ci+1]] || '—') + '</td>';
      } else {
        html += '<th></th><td></td>';
      }
      html += '</tr>';
    }
    html += '</table>';

    // Registros vinculados
    var regsInf = registrosDeInfra(inf);
    var regsFiltrados = regsInf.filter(function(r) {
      if (r.tipo === 'VP' && !incluirVP) return false;
      if (r.tipo === 'EL' && !incluirEL) return false;
      if (r.tipo === 'EI' && !incluirEI) return false;
      return true;
    });

    if (regsFiltrados.length === 0) {
      html += '<p style="color:#888;font-style:italic">No hay registros vinculados</p>';
      continue;
    }

    // Resumen de registros
    html += '<h3>Registros de campo (' + regsFiltrados.length + ')</h3>';

    for (var ri = 0; ri < regsFiltrados.length; ri++) {
      var r = regsFiltrados[ri];
      html += '<div style="margin-top:16px;border-left:4px solid ' + (r.tipo === 'VP' ? '#2e7d32' : r.tipo === 'EL' ? '#1565c0' : '#e65100') + ';padding-left:12px">';
      html += '<h4 style="margin:0 0 8px;color:#1a3d2e"><span class="badge" style="background:' + (r.tipo === 'VP' ? '#2e7d32' : r.tipo === 'EL' ? '#1565c0' : '#e65100') + '">' + r.tipo + '</span> ' + escapeHtml(r.fecha) + ' — ' + escapeHtml(r.unidad) + (r.transecto ? ' (' + escapeHtml(r.transecto) + ')' : '') + '</h4>';

      // Datos del registro: en fichas EI con transectos, mostrar cada uno
      var muestrasReg = (r.tipo === 'EI' && r.datos.transectos)
        ? ['T1', 'T2', 'T3'].map(function(t) { return {t: t, d: r.datos.transectos[t]}; })
            .filter(function(m) { return m.d && !(typeof esTransectoVacio === 'function' && esTransectoVacio(m.d)); })
        : [{t: '', d: r.datos}];

      muestrasReg.forEach(function(m) {
        var d = m.d;
        if (m.t) html += '<p style="font-weight:700;color:#e65100;margin:10px 0 4px">Transecto ' + m.t + '</p>';

        if (d.pastoreo) {
          html += '<table><tr><th colspan="' + d.pastoreo.length + '">Grados de Pastoreo</th></tr><tr>';
          d.pastoreo.forEach(function(p, pi) { html += '<td style="text-align:center"><strong>P' + (pi+1) + ':</strong> ' + escapeHtml(p || '—') + '</td>'; });
          html += '</tr></table>';
        }

        if (d.observaciones) {
          html += '<p><strong>Observaciones:</strong> ' + escapeHtml(d.observaciones) + '</p>';
        }

        if (d.plantas) {
          html += '<table><tr><th>Especie</th><th>Media</th></tr>';
          d.plantas.forEach(function(p) { html += '<tr><td style="font-style:italic">' + escapeHtml(p.nombre || '—') + '</td><td>' + (p.media || '—') + '</td></tr>'; });
          html += '</table>';
        }

        if (d.herbaceas) {
          html += '<p><strong>Herbáceas media:</strong> ' + (d.herbaceasMedia || '—') + ' cm</p>';
        }
        if (d.matorral) {
          html += '<p><strong>Matorralización:</strong> Vol. ' + (d.matorral.volumen || '—') + ' m³/ha</p>';
        }
      });

      // ---- FOTOS ----
      if (fotosTipo !== 'ninguna') {
        // Fotos comparativas (2 por fila, ancho completo)
        if (r.datos.fotosComp && r.datos.fotosComp.length > 0 && (fotosTipo === 'comparativas' || fotosTipo === 'todas')) {
          html += '<h4 style="color:#2e7d32;margin:12px 0 4px">Fotos Comparativas</h4>';
          var porWP = {};
          r.datos.fotosComp.forEach(function(fc) {
            var wp = fc.waypoint || 'W';
            if (!porWP[wp]) porWP[wp] = [];
            porWP[wp].push(fc);
          });
          var wps = Object.keys(porWP).sort();
          for (var wi = 0; wi < wps.length; wi++) {
            html += '<p style="margin:8px 0 4px;font-weight:600;color:#555">' + (wps[wi] === 'W1' ? 'Waypoint 1' : 'Waypoint 2') + '</p>';
            html += '<div class="fotos-comp">';
            for (var fi = 0; fi < porWP[wps[wi]].length; fi++) {
              var fc = porWP[wps[wi]][fi];
              try {
                var fotoData = await buscarFotoData(fc.numero || '', r.tipo, r.unidad);
                if (fotoData) {
                  html += '<div><img src="' + fotoData + '"><div class="foto-label">' + escapeHtml(fc.numero || '') + '</div></div>';
                } else {
                  html += '<div style="background:#f5f5f5;border-radius:8px;padding:20px;text-align:center;color:#888;border:2px dashed #ccc">' + escapeHtml(fc.numero || '') + '<br><small>Foto no disponible</small></div>';
                }
              } catch(e) {
                html += '<div style="background:#f5f5f5;border-radius:8px;padding:20px;text-align:center;color:#888">' + escapeHtml(fc.numero || '') + '</div>';
              }
            }
            html += '</div>';
          }
        }

        // Fotos generales (3 por fila)
        if (fotosTipo === 'todas' && r.datos.fotos) {
          var codigos = r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          if (codigos.length > 0) {
            html += '<h4 style="color:#555;margin:12px 0 4px">Fotos Generales</h4>';
            html += '<div class="fotos-gen">';
            for (var gi = 0; gi < codigos.length; gi++) {
              try {
                var fotoData = await buscarFotoData(codigos[gi], r.tipo, r.unidad);
                if (fotoData) {
                  html += '<div><img src="' + fotoData + '"><div class="foto-label">' + escapeHtml(codigos[gi]) + '</div></div>';
                }
              } catch(e) {}
            }
            html += '</div>';
          }
        }
      }

      html += '</div>'; // fin registro
    }
  }

  html += '<div style="margin-top:40px;border-top:2px solid #ddd;padding-top:10px;color:#888;font-size:11px;text-align:center">RAPCA EMA — Informe generado automáticamente</div>';
  html += '</body></html>';

  // Abrir en nueva ventana
  var win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    // Fallback: descargar como HTML
    var blob = new Blob([html], {type: 'text/html'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'informe_infraestructuras_rapca.html';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  }
  showToast('Informe generado', 'success');
}

// ============================================================

// ============================================================
// SHAPEFILE
// ============================================================
function abrirModalShapefile() {
  var regs = misRegistros().filter(function(r) { return r.tipo === 'VP' && r.datos.fotosComp && r.datos.fotosComp.length > 0; });
  var zonas = [];
  regs.forEach(function(r) {
    var z = r.zona || '';
    if (z && zonas.indexOf(z) < 0) zonas.push(z);
  });
  zonas.sort();

  var html = '<h2>Descargar Shapefile Comparativas VP</h2>';
  html += '<p style="color:#666;margin-bottom:12px">Puntos de fotos comparativas (W1/W2) con coordenadas GPS</p>';
  html += '<div class="form-group"><label>Zona</label><select id="shp-zona">';
  html += '<option value="">Todas las zonas</option>';
  zonas.forEach(function(z) { html += '<option value="' + z + '">' + z + '</option>'; });
  html += '</select></div>';

  // Mostrar resumen de puntos disponibles
  var totalPuntos = 0;
  regs.forEach(function(r) {
    r.datos.fotosComp.forEach(function(fc) { if (fc.lat && fc.lon) totalPuntos++; });
  });
  html += '<p style="font-size:13px;color:#888">' + totalPuntos + ' puntos con GPS disponibles en ' + regs.length + ' visitas</p>';

  html += '<div class="modal-actions">';
  html += '<button class="btn btn-primary" onclick="generarShapefile()">📍 Descargar Shapefile</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button>';
  html += '</div>';
  abrirModal(html);
}

function generarShapefile() {
  var zonaFiltro = document.getElementById('shp-zona').value;
  var regs = misRegistros().filter(function(r) { return r.tipo === 'VP' && r.datos.fotosComp && r.datos.fotosComp.length > 0; });
  if (zonaFiltro) regs = regs.filter(function(r) { return r.zona === zonaFiltro; });

  // Recopilar puntos con GPS
  var puntos = [];
  regs.forEach(function(r) {
    r.datos.fotosComp.forEach(function(fc) {
      if (fc.lat && fc.lon) {
        puntos.push({
          nombre: r.unidad + '_' + (fc.waypoint || 'W1'),
          lat: parseFloat(fc.lat),
          lon: parseFloat(fc.lon),
          fecha: r.fecha,
          unidad: r.unidad,
          zona: r.zona || '',
          waypoint: fc.waypoint || 'W1',
          foto: fc.numero || '',
          operador: r.operador_nombre || ''
        });
      }
    });
  });

  if (puntos.length === 0) {
    showToast('No hay puntos comparativos con GPS', 'error');
    return;
  }

  // Generar shapefile binario (tipo Point)
  var shpData = generarSHPPoint(puntos);
  var shxData = generarSHX(puntos);
  var dbfData = generarDBF(puntos);
  var prjData = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

  var nombreBase = 'VP_Comparativas' + (zonaFiltro ? '_' + zonaFiltro : '');

  var zip = new JSZip();
  zip.file(nombreBase + '.shp', shpData);
  zip.file(nombreBase + '.shx', shxData);
  zip.file(nombreBase + '.dbf', dbfData);
  zip.file(nombreBase + '.prj', prjData);

  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombreBase + '.zip';
    a.click();
    showToast(puntos.length + ' puntos exportados a Shapefile', 'success');
  });

  cerrarModal();
}

function generarSHPPoint(puntos) {
  // Calcular bounding box
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  puntos.forEach(function(p) {
    if (p.lon < xmin) xmin = p.lon;
    if (p.lat < ymin) ymin = p.lat;
    if (p.lon > xmax) xmax = p.lon;
    if (p.lat > ymax) ymax = p.lat;
  });

  // Header: 100 bytes
  // Cada record: 8 bytes header + 20 bytes contenido (tipo 4 bytes + x 8 bytes + y 8 bytes) = 28 bytes
  var fileLength = (100 + puntos.length * 28) / 2; // en words de 16 bits
  var buf = new ArrayBuffer(100 + puntos.length * 28);
  var view = new DataView(buf);

  // File header (Big-Endian para file code y length)
  view.setInt32(0, 9994); // File code
  view.setInt32(24, fileLength); // File length en 16-bit words
  // Little-endian a partir de aquí
  view.setInt32(28, 1000, true); // Version
  view.setInt32(32, 1, true); // Shape type: 1 = Point
  view.setFloat64(36, xmin, true);
  view.setFloat64(44, ymin, true);
  view.setFloat64(52, xmax, true);
  view.setFloat64(60, ymax, true);

  // Records
  var offset = 100;
  puntos.forEach(function(p, i) {
    // Record header (Big-Endian)
    view.setInt32(offset, i + 1); // Record number (1-based)
    view.setInt32(offset + 4, 10); // Content length: 20 bytes / 2 = 10 words
    // Record content (Little-Endian)
    view.setInt32(offset + 8, 1, true); // Shape type: Point
    view.setFloat64(offset + 12, p.lon, true); // X
    view.setFloat64(offset + 20, p.lat, true); // Y
    offset += 28;
  });

  return buf;
}

function generarSHX(puntos) {
  var fileLength = (100 + puntos.length * 8) / 2;
  var buf = new ArrayBuffer(100 + puntos.length * 8);
  var view = new DataView(buf);

  // Mismo header que SHP
  view.setInt32(0, 9994);
  view.setInt32(24, fileLength);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 1, true); // Point

  var offset = 100;
  var shpOffset = 50; // 100 bytes header / 2
  puntos.forEach(function(p, i) {
    view.setInt32(offset, shpOffset); // Offset en words
    view.setInt32(offset + 4, 10); // Content length en words
    offset += 8;
    shpOffset += 14; // (8 header + 20 content) / 2
  });

  return buf;
}

function generarDBF(puntos) {
  // Campos: NOMBRE(C,50), FECHA(C,10), UNIDAD(C,30), ZONA(C,30), WAYPOINT(C,3), FOTO(C,40), OPERADOR(C,40)
  var campos = [
    {name: 'NOMBRE', type: 'C', size: 50},
    {name: 'FECHA', type: 'C', size: 10},
    {name: 'UNIDAD', type: 'C', size: 30},
    {name: 'ZONA', type: 'C', size: 30},
    {name: 'WAYPOINT', type: 'C', size: 3},
    {name: 'FOTO', type: 'C', size: 40},
    {name: 'OPERADOR', type: 'C', size: 40}
  ];

  var recordSize = 1; // delete flag byte
  campos.forEach(function(c) { recordSize += c.size; });

  var headerSize = 32 + campos.length * 32 + 1; // header + field descriptors + terminator
  var totalSize = headerSize + puntos.length * recordSize;
  var buf = new ArrayBuffer(totalSize);
  var view = new DataView(buf);
  var uint8 = new Uint8Array(buf);

  // Header
  view.setUint8(0, 3); // Version
  var now = new Date();
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setInt32(4, puntos.length, true); // Num records
  view.setInt16(8, headerSize, true); // Header size
  view.setInt16(10, recordSize, true); // Record size

  // Field descriptors
  var fOffset = 32;
  campos.forEach(function(c) {
    writeString(uint8, fOffset, c.name, 11);
    view.setUint8(fOffset + 11, c.type.charCodeAt(0));
    view.setUint8(fOffset + 16, c.size);
    fOffset += 32;
  });
  view.setUint8(fOffset, 0x0D); // Terminator

  // Records
  var rOffset = headerSize;
  puntos.forEach(function(p) {
    view.setUint8(rOffset, 0x20); // Not deleted
    var pos = rOffset + 1;
    var valores = [p.nombre, p.fecha, p.unidad, p.zona, p.waypoint, p.foto, p.operador];
    campos.forEach(function(c, i) {
      writeString(uint8, pos, valores[i] || '', c.size);
      pos += c.size;
    });
    rOffset += recordSize;
  });

  return buf;
}

function writeString(uint8, offset, str, maxLen) {
  for (var i = 0; i < maxLen; i++) {
    uint8[offset + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0x20;
  }
}

function descargarArchivo(contenido, nombre, mime) {
  var blob = new Blob([contenido], {type: mime});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
}
// ============================================================
// ADMIN - Gestión de usuarios (local y servidor)
// ============================================================

// --- Configuración de marca de agua por defecto ---
var WATERMARK_DEFAULTS = {
  tamanoTexto: 'mediano',      // pequeno, mediano, grande
  mostrarCodigo: true,         // código + nº foto (siempre visible)
  formatoFecha: 'fecha',       // 'fecha' (DD/MM/YYYY) o 'fechahora' (DD/MM/YYYY HH:MM)
  tipoCoordenadas: 'utm',      // 'utm' o 'geograficas'
  mostrarOrientacion: true,    // orientación (N, NE, etc.)
  mostrarMunicipio: false,     // municipio, provincia, CP
  mostrarBrujula: true,        // rosa de los vientos
  tipoMiniMapa: 'topografico', // 'topografico', 'ortofoto', 'ninguno'
  escalaMiniMapa: 14           // zoom level (8-18)
};

function obtenerConfigWatermark() {
  try {
    var stored = JSON.parse(localStorage.getItem('rapca_watermark_config') || 'null');
    if (stored) {
      // Merge con defaults para campos nuevos
      var config = {};
      for (var k in WATERMARK_DEFAULTS) config[k] = WATERMARK_DEFAULTS[k];
      for (var k2 in stored) config[k2] = stored[k2];
      return config;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(WATERMARK_DEFAULTS));
}

function guardarConfigWatermark(config) {
  localStorage.setItem('rapca_watermark_config', JSON.stringify(config));
}

// --- Panel de configuración de marca de agua ---

function renderWatermarkConfig() {
  var div = document.getElementById('admin-watermark-config');
  if (!div) return;
  var cfg = obtenerConfigWatermark();

  div.innerHTML =
    '<div class="card" style="padding:12px">' +
    // Tamaño texto
    '<div class="form-group"><label>Tamaño del texto</label>' +
    '<select id="wm-tamano" onchange="actualizarWatermarkConfig()">' +
    '<option value="pequeno"' + (cfg.tamanoTexto === 'pequeno' ? ' selected' : '') + '>Pequeño</option>' +
    '<option value="mediano"' + (cfg.tamanoTexto === 'mediano' ? ' selected' : '') + '>Mediano</option>' +
    '<option value="grande"' + (cfg.tamanoTexto === 'grande' ? ' selected' : '') + '>Grande</option>' +
    '</select></div>' +
    // Formato fecha
    '<div class="form-group"><label>Formato de fecha</label>' +
    '<select id="wm-fecha" onchange="actualizarWatermarkConfig()">' +
    '<option value="fecha"' + (cfg.formatoFecha === 'fecha' ? ' selected' : '') + '>Solo fecha (DD/MM/AAAA)</option>' +
    '<option value="fechahora"' + (cfg.formatoFecha === 'fechahora' ? ' selected' : '') + '>Fecha + hora Madrid (DD/MM/AAAA HH:MM)</option>' +
    '</select></div>' +
    // Tipo coordenadas
    '<div class="form-group"><label>Tipo de coordenadas</label>' +
    '<select id="wm-coords" onchange="actualizarWatermarkConfig()">' +
    '<option value="utm"' + (cfg.tipoCoordenadas === 'utm' ? ' selected' : '') + '>UTM (30N ETRS89)</option>' +
    '<option value="geograficas"' + (cfg.tipoCoordenadas === 'geograficas' ? ' selected' : '') + '>Geográficas (lat/lon)</option>' +
    '</select></div>' +
    // Orientación
    '<div class="form-group" style="display:flex;align-items:center;gap:10px">' +
    '<label style="flex:1;margin:0">Mostrar orientación (N, NE, etc.)</label>' +
    '<input type="checkbox" id="wm-orientacion"' + (cfg.mostrarOrientacion ? ' checked' : '') + ' onchange="actualizarWatermarkConfig()" style="width:22px;height:22px">' +
    '</div>' +
    // Municipio/Provincia/CP
    '<div class="form-group" style="display:flex;align-items:center;gap:10px">' +
    '<label style="flex:1;margin:0">Mostrar municipio, provincia y CP</label>' +
    '<input type="checkbox" id="wm-municipio"' + (cfg.mostrarMunicipio ? ' checked' : '') + ' onchange="actualizarWatermarkConfig()" style="width:22px;height:22px">' +
    '</div>' +
    // Brújula
    '<div class="form-group" style="display:flex;align-items:center;gap:10px">' +
    '<label style="flex:1;margin:0">Brújula (rosa de los vientos)</label>' +
    '<input type="checkbox" id="wm-brujula"' + (cfg.mostrarBrujula ? ' checked' : '') + ' onchange="actualizarWatermarkConfig()" style="width:22px;height:22px">' +
    '</div>' +
    // Mini-mapa tipo
    '<div class="form-group"><label>Mini-mapa de localización</label>' +
    '<select id="wm-minimapa" onchange="actualizarWatermarkConfig()">' +
    '<option value="topografico"' + (cfg.tipoMiniMapa === 'topografico' ? ' selected' : '') + '>Topográfico</option>' +
    '<option value="ortofoto"' + (cfg.tipoMiniMapa === 'ortofoto' ? ' selected' : '') + '>Ortofoto (PNOA)</option>' +
    '<option value="ninguno"' + (cfg.tipoMiniMapa === 'ninguno' ? ' selected' : '') + '>Sin mini-mapa</option>' +
    '</select></div>' +
    // Escala mini-mapa
    '<div class="form-group"><label>Escala mini-mapa (zoom: ' + cfg.escalaMiniMapa + ')</label>' +
    '<input type="range" id="wm-escala" min="8" max="18" value="' + cfg.escalaMiniMapa + '" onchange="actualizarWatermarkConfig()" oninput="this.previousElementSibling.textContent=\'Escala mini-mapa (zoom: \'+this.value+\')\';" style="width:100%">' +
    '<div style="display:flex;justify-content:space-between;font-size:11px;color:#888"><span>Alejado</span><span>Cercano</span></div>' +
    '</div>' +
    '<button class="btn btn-sm btn-outline" onclick="resetearWatermarkConfig()" style="margin-top:8px">Restaurar valores por defecto</button>' +
    '</div>';
}

function actualizarWatermarkConfig() {
  var config = {
    tamanoTexto: document.getElementById('wm-tamano').value,
    mostrarCodigo: true,
    formatoFecha: document.getElementById('wm-fecha').value,
    tipoCoordenadas: document.getElementById('wm-coords').value,
    mostrarOrientacion: document.getElementById('wm-orientacion').checked,
    mostrarMunicipio: document.getElementById('wm-municipio').checked,
    mostrarBrujula: document.getElementById('wm-brujula').checked,
    tipoMiniMapa: document.getElementById('wm-minimapa').value,
    escalaMiniMapa: parseInt(document.getElementById('wm-escala').value)
  };
  guardarConfigWatermark(config);
  showToast('Configuración guardada', 'success');
}

function resetearWatermarkConfig() {
  localStorage.removeItem('rapca_watermark_config');
  renderWatermarkConfig();
  showToast('Configuración restaurada a valores por defecto', 'info');
}

// --- Renderizado del panel de administración ---

function renderAdmin() {
  if (!sesion || sesion.rol !== 'admin') { irPagina('menu'); return; }
  // safeParse: un valor corrupto en localStorage dejaba el panel inutilizable
  var usuarios = safeParse('rapca_usuarios_local', []);
  var lista = document.getElementById('admin-users-list');
  lista.innerHTML = usuarios.map(function(u, i) {
    return '<div class="card admin-user-card">' +
      '<div class="user-info"><h3>' + escapeHtml(u.nombre) + ' <span class="badge" style="background:' + (u.rol === 'admin' ? '#333' : 'var(--c-secondary)') + '">' + escapeHtml(u.rol) + '</span></h3>' +
      '<small>' + escapeHtml(u.email) + ' · ' + (u.activo ? 'Activo' : 'Inactivo') + '</small></div>' +
      '<div class="admin-user-actions">' +
      '<button class="btn btn-sm btn-outline" onclick="toggleUsuario(' + i + ')">' + (u.activo ? '⏸' : '▶') + '</button>' +
      '<button class="btn btn-sm btn-outline" onclick="cambiarPassUsuario(' + i + ')">🔑</button>' +
      '<button class="btn btn-sm btn-danger" onclick="eliminarUsuario(' + i + ')">🗑️</button>' +
      '</div></div>';
  }).join('') || '<div style="color:#888;padding:10px">No hay usuarios locales</div>';

  // Cargar usuarios del servidor
  cargarUsuariosServidor();

  // Renderizar config de marca de agua
  renderWatermarkConfig();
}

// --- Cargar usuarios del servidor ---

async function cargarUsuariosServidor() {
  if (!sesion || !sesion.token || sesion.token.startsWith('local_')) {
    await reautenticar();
  }
  if (!sesion || !sesion.token || sesion.token.startsWith('local_')) return;

  try {
    var resp = await fetch(API_BASE + 'auth.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify({accion: 'listar_usuarios'})
    });
    if (resp.status === 401) {
      var reauth = await reautenticar();
      if (!reauth) return;
      resp = await fetch(API_BASE + 'auth.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
        body: JSON.stringify({accion: 'listar_usuarios'})
      });
    }
    var data = await resp.json();
    if (data.ok && data.usuarios) {
      var lista = document.getElementById('admin-users-list');
      window._serverUsers = data.usuarios;
      if (data.usuarios.length > 0) {
        var html = '<h3 style="margin:10px 0 5px;color:var(--c-primary)">Usuarios en servidor (' + data.usuarios.length + ')</h3>';
        data.usuarios.forEach(function(u, idx) {
          html += '<div class="card admin-user-card">' +
            '<div class="user-info"><h3>' + escapeHtml(u.nombre) + ' <span class="badge" style="background:' + (u.rol === 'admin' ? '#333' : 'var(--c-secondary)') + '">' + escapeHtml(u.rol) + '</span></h3>' +
            '<small>' + escapeHtml(u.email) + ' · ' + (u.activo ? 'Activo' : 'Inactivo') + ' · Servidor</small></div>' +
            '<div class="admin-user-actions">' +
            '<button class="btn btn-sm btn-outline" onclick="editarUsuarioServidor(' + idx + ')">✏️</button>' +
            '<button class="btn btn-sm btn-outline" onclick="toggleUsuarioServidor(' + u.id + ')">' + (u.activo ? '⏸' : '▶') + '</button>' +
            '<button class="btn btn-sm btn-danger" onclick="eliminarUsuarioServidor(' + u.id + ', \'' + escapeHtml(String(u.email).replace(/\\/g, '\\\\').replace(/'/g, "\\'")) + '\')">🗑️</button>' +
            '</div></div>';
        });
        lista.innerHTML = html;
      }
    }
  } catch(e) {
    console.warn('No se pudieron cargar usuarios del servidor:', e.message);
  }
}

// --- Modal para crear usuario ---

function abrirModalCrearUsuario() {
  var html = '<h2>Crear Usuario</h2>';
  html += '<div class="form-group"><label>Nombre</label><input type="text" id="admin-new-nombre"></div>';
  html += '<div class="form-group"><label>Email</label><input type="email" id="admin-new-email"></div>';
  html += '<div class="form-group"><label>Contraseña (mín. 8 caracteres)</label><input type="password" id="admin-new-pass"></div>';
  html += '<div class="form-group"><label>Rol</label><select id="admin-new-rol"><option value="operador">Operador</option><option value="admin">Admin</option></select></div>';
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="crearUsuario()">Crear</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

// --- Crear usuario (local + servidor) ---

async function crearUsuario() {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var nombre = document.getElementById('admin-new-nombre').value.trim();
  var email = document.getElementById('admin-new-email').value.trim();
  var pass = document.getElementById('admin-new-pass').value;
  var rol = document.getElementById('admin-new-rol').value;
  if (!nombre || !email || pass.length < 8) { showToast('Datos inválidos (contraseña mín 8 caracteres)', 'error'); return; }
  guardarUsuarioLocal(email, pass, nombre, rol);

  // Asegurar token de servidor válido
  var tokenOk = await asegurarTokenServidor();

  if (tokenOk) {
    try {
      var resp = await fetch(API_BASE + 'auth.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
        body: JSON.stringify({accion: 'crear_usuario', email: email, password: pass, nombre: nombre, rol: rol})
      });
      var data = await resp.json();
      if (data.ok) {
        showToast('Usuario creado correctamente', 'success');
      } else if (data.error === 'No autorizado') {
        showToast('Token expirado. Cierra sesión y vuelve a entrar.', 'error');
      } else {
        showToast('Servidor: ' + (data.error || 'error'), 'info');
      }
    } catch(e) {
      showToast('Usuario guardado local (sin conexión)', 'info');
    }
  } else {
    showToast('Usuario guardado solo en local. Cierra sesión y entra online para crear en servidor.', 'info');
  }

  cerrarModal();
  renderAdmin();
}

// --- Asegurar token de servidor válido (re-autenticación) ---

// Obtener un token de servidor válido, re-autenticando si es necesario
async function asegurarTokenServidor() {
  // Si ya tenemos token de servidor, verificar que funciona
  if (sesion && sesion.token && !sesion.token.startsWith('local_')) {
    try {
      var resp = await fetch(API_BASE + 'auth.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
        body: JSON.stringify({accion: 'verificar'})
      });
      var data = await resp.json();
      if (data.ok) return true;
    } catch(e) {}
  }

  // Intentar re-autenticación automática
  var reauth = await reautenticar();
  if (reauth) return true;

  // Último recurso: pedir contraseña al admin
  return new Promise(function(resolve) {
    var html = '<h2>Autenticación requerida</h2>';
    html += '<p style="color:#666;margin-bottom:15px">Para crear usuarios en el servidor, necesitas autenticarte con tu contraseña de admin.</p>';
    html += '<div class="form-group"><label>Email</label><input type="email" id="reauth-email" value="' + (sesion ? sesion.email : '') + '" readonly></div>';
    html += '<div class="form-group"><label>Contraseña</label><input type="password" id="reauth-pass" placeholder="Contraseña del servidor"></div>';
    html += '<div class="modal-actions"><button class="btn btn-primary" id="reauth-btn">Autenticar</button><button class="btn btn-outline" id="reauth-cancel">Cancelar</button></div>';
    abrirModal(html);

    document.getElementById('reauth-cancel').onclick = function() {
      cerrarModal();
      resolve(false);
    };

    document.getElementById('reauth-btn').onclick = async function() {
      var passInput = document.getElementById('reauth-pass').value;
      if (!passInput) { showToast('Introduce la contraseña', 'error'); return; }
      try {
        var resp = await fetch(API_BASE + 'auth.php', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({accion: 'login', email: sesion.email, password: passInput})
        });
        var data = await resp.json();
        if (data.ok) {
          sesion = {token: data.token, email: data.email, nombre: data.nombre, rol: data.rol, id: data.id};
          localStorage.setItem('rapca_sesion', JSON.stringify(sesion));
          cerrarModal();
          showToast('Autenticado correctamente', 'success');
          resolve(true);
        } else {
          showToast('Error: ' + (data.error || 'Contraseña incorrecta'), 'error');
          resolve(false);
        }
      } catch(e) {
        showToast('Sin conexión al servidor', 'error');
        cerrarModal();
        resolve(false);
      }
    };
  });
}

// --- Gestión de usuarios locales ---

function toggleUsuario(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var usuarios = safeParse('rapca_usuarios_local', []);
  if (!usuarios[idx]) { showToast('Usuario no encontrado', 'error'); return; }
  usuarios[idx].activo = !usuarios[idx].activo;
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
  renderAdmin();
}

function cambiarPassUsuario(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var usuarios = safeParse('rapca_usuarios_local', []);
  if (!usuarios[idx]) { showToast('Usuario no encontrado', 'error'); return; }
  var pass = prompt('Nueva contraseña (mín 8 caracteres):');
  if (!pass || pass.length < 8) { showToast('Contraseña inválida', 'error'); return; }
  usuarios[idx].passHash = simpleHash(pass);
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
  showToast('Contraseña actualizada', 'success');
}

function eliminarUsuario(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var usuarios = safeParse('rapca_usuarios_local', []);
  if (!usuarios[idx]) { showToast('Usuario no encontrado', 'error'); return; }
  if (!confirm('¿Eliminar usuario?')) return;
  usuarios.splice(idx, 1);
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
  renderAdmin();
  showToast('Usuario eliminado', 'info');
}

// --- Gestión de usuarios del servidor ---

function editarUsuarioServidor(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var u = window._serverUsers[idx];
  if (!u) return;
  var html = '<h2>Editar Usuario</h2>';
  html += '<div class="form-group"><label>Nombre</label><input type="text" id="edit-user-nombre" value="' + escapeHtml(u.nombre || '') + '"></div>';
  html += '<div class="form-group"><label>Email</label><input type="email" id="edit-user-email" value="' + escapeHtml(u.email || '') + '"></div>';
  html += '<div class="form-group"><label>Nueva contraseña (dejar vacío para no cambiar)</label><input type="password" id="edit-user-pass" placeholder="Mín. 8 caracteres"></div>';
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="guardarEdicionUsuario(' + u.id + ')">Guardar</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

async function guardarEdicionUsuario(userId) {
  var nombre = document.getElementById('edit-user-nombre').value.trim();
  var email = document.getElementById('edit-user-email').value.trim();
  var pass = document.getElementById('edit-user-pass').value;

  if (!nombre && !email && !pass) { showToast('No hay cambios', 'info'); return; }
  if (pass && pass.length < 8) { showToast('Contraseña mínimo 8 caracteres', 'error'); return; }
  if (email && !email.includes('@')) { showToast('Email no válido', 'error'); return; }

  var tokenOk = await asegurarTokenServidor();
  if (!tokenOk) { showToast('No se pudo autenticar', 'error'); return; }

  var body = {accion: 'editar_usuario', id: userId};
  if (nombre) body.nombre = nombre;
  if (email) body.email = email;
  if (pass) body.password = pass;

  try {
    var resp = await fetch(API_BASE + 'auth.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (data.ok) {
      showToast('Usuario actualizado', 'success');
      cerrarModal();
      renderAdmin();
    } else {
      showToast(data.error || 'Error al actualizar', 'error');
    }
  } catch(e) {
    showToast('Error de conexión', 'error');
  }
}

async function toggleUsuarioServidor(userId) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var tokenOk = await asegurarTokenServidor();
  if (!tokenOk) { showToast('No se pudo autenticar', 'error'); return; }

  try {
    var resp = await fetch(API_BASE + 'auth.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify({accion: 'toggle_usuario', id: userId})
    });
    var data = await resp.json();
    if (data.ok) {
      showToast('Estado actualizado', 'success');
      renderAdmin();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch(e) {
    showToast('Error de conexión', 'error');
  }
}

async function eliminarUsuarioServidor(userId, email) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  if (!confirm('¿Eliminar usuario ' + email + ' del servidor?')) return;
  var tokenOk = await asegurarTokenServidor();
  if (!tokenOk) { showToast('No se pudo autenticar', 'error'); return; }

  try {
    var resp = await fetch(API_BASE + 'auth.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify({accion: 'eliminar_usuario', id: userId})
    });
    var data = await resp.json();
    if (data.ok) {
      showToast('Usuario eliminado del servidor', 'success');
      renderAdmin();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch(e) {
    showToast('Error de conexión', 'error');
  }
}
// ============================================================
// GABINETE / OFICINA - Funciones de analisis y exportacion
// ============================================================

// Devuelve las muestras de un registro EI: sus transectos con datos
// (registros nuevos con datos.transectos) o el propio nivel superior
// (registros antiguos, donde todo era un único transecto)
function _muestrasEI(d) {
  if (!d) return [];
  if (d.transectos) {
    return ['T1', 'T2', 'T3'].map(function(t) { return d.transectos[t]; }).filter(Boolean);
  }
  return [d];
}

// ----------------------------------------------------------
// 1. Dashboard de completitud por unidad
// ----------------------------------------------------------
function renderDashboardCompletitud() {
  var regs = misRegistros();
  var unidades = {};
  regs.forEach(function(r) {
    if (!unidades[r.unidad]) unidades[r.unidad] = {zona: r.zona || '', VP: 0, EL: 0, EI: 0};
    unidades[r.unidad][r.tipo]++;
  });

  var keys = Object.keys(unidades);
  var totalVP = keys.filter(function(k) { return unidades[k].VP > 0; }).length;
  var totalEL = keys.filter(function(k) { return unidades[k].EL > 0; }).length;
  var totalEI = keys.filter(function(k) { return unidades[k].EI > 0; }).length;
  var completas = keys.filter(function(k) { return unidades[k].VP > 0 && unidades[k].EL > 0 && unidades[k].EI > 0; }).length;
  var pctCompletas = keys.length > 0 ? Math.round((completas / keys.length) * 100) : 0;

  var html = '<h2>Completitud por Unidad</h2>';

  // Summary cards
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
  html += '<div class="card" style="flex:1;min-width:100px;text-align:center;padding:12px">'
        + '<strong style="font-size:24px">' + keys.length + '</strong><br><small>Unidades</small></div>';
  html += '<div class="card" style="flex:1;min-width:100px;text-align:center;padding:12px;border-left:3px solid #88d8b0">'
        + '<strong style="font-size:24px">' + totalVP + '</strong><br><small>Con VP</small></div>';
  html += '<div class="card" style="flex:1;min-width:100px;text-align:center;padding:12px;border-left:3px solid #2ecc71">'
        + '<strong style="font-size:24px">' + totalEL + '</strong><br><small>Con EL</small></div>';
  html += '<div class="card" style="flex:1;min-width:100px;text-align:center;padding:12px;border-left:3px solid #fd9853">'
        + '<strong style="font-size:24px">' + totalEI + '</strong><br><small>Con EI</small></div>';
  html += '</div>';

  // Coverage bar
  html += '<div style="margin-bottom:16px;background:#eee;border-radius:6px;overflow:hidden;height:24px;position:relative">';
  html += '<div style="width:' + pctCompletas + '%;height:100%;background:#27ae60;transition:width .3s"></div>';
  html += '<span style="position:absolute;top:0;left:0;right:0;text-align:center;line-height:24px;font-size:12px;font-weight:600;color:#333">'
        + completas + '/' + keys.length + ' completas (' + pctCompletas + '%)</span>';
  html += '</div>';

  // Table
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="background:#f5f5f0">'
        + '<th style="padding:8px;text-align:left">Unidad</th>'
        + '<th style="padding:8px">Zona</th>'
        + '<th style="padding:8px">VP</th>'
        + '<th style="padding:8px">EL</th>'
        + '<th style="padding:8px">EI</th>'
        + '</tr></thead><tbody>';

  keys.sort().forEach(function(u) {
    var d = unidades[u];
    html += '<tr style="border-bottom:1px solid #eee">';
    html += '<td style="padding:8px;font-weight:600">' + escapeHtml(u) + '</td>';
    html += '<td style="padding:8px;text-align:center">' + escapeHtml(d.zona) + '</td>';
    html += '<td style="padding:8px;text-align:center">'
          + (d.VP > 0 ? '<span style="color:#27ae60">\u2713 ' + d.VP + '</span>' : '<span style="color:#e74c3c">\u2717</span>') + '</td>';
    html += '<td style="padding:8px;text-align:center">'
          + (d.EL > 0 ? '<span style="color:#27ae60">\u2713 ' + d.EL + '</span>' : '<span style="color:#e74c3c">\u2717</span>') + '</td>';
    html += '<td style="padding:8px;text-align:center">'
          + (d.EI > 0 ? '<span style="color:#27ae60">\u2713 ' + d.EI + '</span>' : '<span style="color:#e74c3c">\u2717</span>') + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div class="modal-actions" style="margin-top:16px"><button class="btn btn-outline" onclick="cerrarModal()">Cerrar</button></div>';

  abrirModal(html);
}

// ----------------------------------------------------------
// 2. Estadisticas por zona
// ----------------------------------------------------------
function renderEstadisticasZona() {
  var regs = misRegistros();
  var zonas = [];
  regs.forEach(function(r) {
    var z = r.zona || '';
    if (z && zonas.indexOf(z) < 0) zonas.push(z);
  });
  zonas.sort();

  if (zonas.length === 0) {
    showToast('No hay registros con zona definida', 'error');
    return;
  }

  var html = '<h2>Estadisticas por Zona</h2>';
  html += '<div class="form-group"><label>Seleccionar zona</label><select id="gabinete-zona-select" onchange="mostrarEstadisticasZona()">';
  html += '<option value="">-- Seleccione --</option>';
  zonas.forEach(function(z) {
    html += '<option value="' + escapeHtml(z) + '">' + escapeHtml(z) + '</option>';
  });
  html += '</select></div>';
  html += '<div id="gabinete-zona-resultado"></div>';
  html += '<div class="modal-actions" style="margin-top:16px"><button class="btn btn-outline" onclick="cerrarModal()">Cerrar</button></div>';

  abrirModal(html);
}

function mostrarEstadisticasZona() {
  var zona = document.getElementById('gabinete-zona-select').value;
  var contenedor = document.getElementById('gabinete-zona-resultado');
  if (!zona) { contenedor.innerHTML = ''; return; }

  var regs = misRegistros().filter(function(r) { return r.zona === zona; });
  var vp = regs.filter(function(r) { return r.tipo === 'VP'; });
  var el = regs.filter(function(r) { return r.tipo === 'EL'; });
  var ei = regs.filter(function(r) { return r.tipo === 'EI'; });

  var unidadesSet = {};
  regs.forEach(function(r) { unidadesSet[r.unidad] = true; });
  var numUnidades = Object.keys(unidadesSet).length;

  // Pastoreo averages (across VP and EL)
  var pastoreoStats = calcularMediaPastoreo(vp.concat(el));

  // EI specific stats
  var herbStats = { sum: 0, count: 0 };
  var matVolSum = 0, matVolCount = 0;
  var plantasMediaSum = 0, plantasMediaCount = 0;
  var palatablesMediaSum = 0, palatablesMediaCount = 0;

  ei.forEach(function(r) {
    // Agregar sobre TODOS los transectos con datos (antes solo se le\u00eda el
    // nivel superior = T1 y se ignoraban T2/T3 en registros nuevos)
    _muestrasEI(r.datos).forEach(function(d) {
      // Herbaceas
      if (d.herbaceas && Array.isArray(d.herbaceas)) {
        d.herbaceas.forEach(function(v) {
          if (v !== null && v !== undefined && v !== '') {
            herbStats.sum += parseFloat(v) || 0;
            herbStats.count++;
          }
        });
      }
      // Matorral volume
      if (d.matorral && d.matorral.volumen) {
        var vol = parseFloat(d.matorral.volumen);
        if (!isNaN(vol)) { matVolSum += vol; matVolCount++; }
      }
      // Plantas media
      if (d.plantasMedia && d.plantasMedia !== '\u2014') {
        var pm = parseFloat(d.plantasMedia);
        if (!isNaN(pm)) { plantasMediaSum += pm; plantasMediaCount++; }
      }
      // Palatables media
      if (d.palatablesMedia && d.palatablesMedia !== '\u2014') {
        var pam = parseFloat(d.palatablesMedia);
        if (!isNaN(pam)) { palatablesMediaSum += pam; palatablesMediaCount++; }
      }
    });
  });

  var html = '<div style="margin-top:12px">';

  // Record counts
  html += '<h3 style="margin-bottom:8px">Zona: ' + escapeHtml(zona) + '</h3>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">';
  html += _statCard(numUnidades, 'Unidades', '#3498db');
  html += _statCard(vp.length, 'VP', '#88d8b0');
  html += _statCard(el.length, 'EL', '#2ecc71');
  html += _statCard(ei.length, 'EI', '#fd9853');
  html += _statCard(regs.length, 'Total reg.', '#8e44ad');
  html += '</div>';

  // Pastoreo stats
  html += '<h4 style="margin-bottom:6px">Pastoreo (VP + EL)</h4>';
  if (pastoreoStats.count > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">';
    html += '<thead><tr style="background:#f5f5f0"><th style="padding:6px;text-align:left">Punto</th><th style="padding:6px">Moda</th><th style="padding:6px">Registros</th></tr></thead><tbody>';
    for (var p = 0; p < 3; p++) {
      var ps = pastoreoStats.puntos[p];
      html += '<tr style="border-bottom:1px solid #eee">';
      html += '<td style="padding:6px">Punto ' + (p + 1) + '</td>';
      html += '<td style="padding:6px;text-align:center;font-weight:600">' + escapeHtml(ps.moda || '-') + '</td>';
      html += '<td style="padding:6px;text-align:center">' + ps.total + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  } else {
    html += '<p style="color:#999;font-size:13px">Sin datos de pastoreo</p>';
  }

  // EI stats
  html += '<h4 style="margin-bottom:6px">Evaluacion Invernal (EI)</h4>';
  if (ei.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">';
    html += '<thead><tr style="background:#f5f5f0"><th style="padding:6px;text-align:left">Indicador</th><th style="padding:6px">Media</th><th style="padding:6px">N</th></tr></thead><tbody>';
    html += _statsRow('Herbaceas (altura cm)', herbStats.count > 0 ? (herbStats.sum / herbStats.count).toFixed(1) : '-', herbStats.count);
    html += _statsRow('Volumen matorral (m3/ha)', matVolCount > 0 ? (matVolSum / matVolCount).toFixed(2) : '-', matVolCount);
    html += _statsRow('Media plantas', plantasMediaCount > 0 ? (plantasMediaSum / plantasMediaCount).toFixed(2) : '-', plantasMediaCount);
    html += _statsRow('Media palatables', palatablesMediaCount > 0 ? (palatablesMediaSum / palatablesMediaCount).toFixed(2) : '-', palatablesMediaCount);
    html += '</tbody></table>';
  } else {
    html += '<p style="color:#999;font-size:13px">Sin registros EI en esta zona</p>';
  }

  html += '</div>';
  contenedor.innerHTML = html;
}

function _statCard(value, label, color) {
  return '<div class="card" style="flex:1;min-width:80px;text-align:center;padding:10px;border-left:3px solid ' + color + '">'
       + '<strong style="font-size:22px">' + value + '</strong><br><small>' + escapeHtml(label) + '</small></div>';
}

function _statsRow(label, value, n) {
  return '<tr style="border-bottom:1px solid #eee">'
       + '<td style="padding:6px">' + escapeHtml(label) + '</td>'
       + '<td style="padding:6px;text-align:center;font-weight:600">' + escapeHtml(String(value)) + '</td>'
       + '<td style="padding:6px;text-align:center">' + n + '</td></tr>';
}

function calcularMediaPastoreo(registros) {
  var puntos = [{}, {}, {}]; // frequency maps per point
  var count = 0;

  registros.forEach(function(r) {
    if (!r.datos || !r.datos.pastoreo || !Array.isArray(r.datos.pastoreo)) return;
    count++;
    r.datos.pastoreo.forEach(function(val, idx) {
      if (idx < 3 && val && val !== '') {
        puntos[idx][val] = (puntos[idx][val] || 0) + 1;
      }
    });
  });

  var resultado = { count: count, puntos: [] };
  for (var i = 0; i < 3; i++) {
    var moda = '';
    var maxFreq = 0;
    var total = 0;
    Object.keys(puntos[i]).forEach(function(k) {
      total += puntos[i][k];
      if (puntos[i][k] > maxFreq) { maxFreq = puntos[i][k]; moda = k; }
    });
    resultado.puntos.push({ moda: moda, total: total });
  }
  return resultado;
}

// ----------------------------------------------------------
// 3. Informe resumen por zona
// ----------------------------------------------------------
function generarInformeZona() {
  var regs = misRegistros();
  var zonas = [];
  regs.forEach(function(r) {
    var z = r.zona || '';
    if (z && zonas.indexOf(z) < 0) zonas.push(z);
  });
  zonas.sort();

  if (zonas.length === 0) {
    showToast('No hay registros con zona definida', 'error');
    return;
  }

  var html = '<h2>Generar Informe de Zona</h2>';
  html += '<div class="form-group"><label>Seleccionar zona</label><select id="gabinete-informe-zona">';
  zonas.forEach(function(z) {
    html += '<option value="' + escapeHtml(z) + '">' + escapeHtml(z) + '</option>';
  });
  html += '</select></div>';
  html += '<div class="modal-actions">';
  html += '<button class="btn btn-primary" onclick="descargarInformeZona()">Generar e imprimir</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button>';
  html += '</div>';

  abrirModal(html);
}

function descargarInformeZona() {
  var zona = document.getElementById('gabinete-informe-zona').value;
  if (!zona) { showToast('Seleccione una zona', 'error'); return; }

  var regs = misRegistros().filter(function(r) { return r.zona === zona; });
  var vp = regs.filter(function(r) { return r.tipo === 'VP'; });
  var el = regs.filter(function(r) { return r.tipo === 'EL'; });
  var ei = regs.filter(function(r) { return r.tipo === 'EI'; });

  var unidadesSet = {};
  regs.forEach(function(r) {
    if (!unidadesSet[r.unidad]) unidadesSet[r.unidad] = { VP: 0, EL: 0, EI: 0 };
    unidadesSet[r.unidad][r.tipo]++;
  });
  var unidades = Object.keys(unidadesSet).sort();

  var fechaInforme = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  // Pastoreo stats
  var pastoreoStats = calcularMediaPastoreo(vp.concat(el));

  // EI stats
  var herbSum = 0, herbCount = 0, matVolSum = 0, matVolCount = 0;
  ei.forEach(function(r) {
    // Agregar sobre todos los transectos con datos, no solo T1
    _muestrasEI(r.datos).forEach(function(d) {
      if (d.herbaceas && Array.isArray(d.herbaceas)) {
        d.herbaceas.forEach(function(v) {
          if (v !== null && v !== undefined && v !== '') { herbSum += parseFloat(v) || 0; herbCount++; }
        });
      }
      if (d.matorral && d.matorral.volumen) {
        var vol = parseFloat(d.matorral.volumen);
        if (!isNaN(vol)) { matVolSum += vol; matVolCount++; }
      }
    });
  });

  // Build printable HTML
  var doc = '<!DOCTYPE html><html><head><meta charset="utf-8">';
  doc += '<title>Informe RAPCA - ' + escapeHtml(zona) + '</title>';
  doc += '<style>';
  doc += 'body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;padding:20px;color:#333;font-size:14px}';
  doc += 'h1{color:#2c3e50;border-bottom:2px solid #27ae60;padding-bottom:8px}';
  doc += 'h2{color:#27ae60;margin-top:24px}';
  doc += 'table{width:100%;border-collapse:collapse;margin:12px 0}';
  doc += 'th,td{border:1px solid #ddd;padding:8px;text-align:left}';
  doc += 'th{background:#f5f5f0;font-weight:600}';
  doc += '.ok{color:#27ae60;font-weight:600} .no{color:#e74c3c}';
  doc += '.resumen{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}';
  doc += '.resumen-item{background:#f9f9f4;padding:12px 16px;border-radius:6px;flex:1;min-width:120px;text-align:center}';
  doc += '.resumen-item strong{font-size:22px;display:block}';
  doc += '@media print{body{margin:0;padding:10px}}';
  doc += '</style></head><body>';

  doc += '<h1>Informe RAPCA Campo - Zona ' + escapeHtml(zona) + '</h1>';
  doc += '<p style="color:#666">Fecha del informe: ' + escapeHtml(fechaInforme) + '</p>';

  // Summary
  doc += '<h2>Resumen General</h2>';
  doc += '<div class="resumen">';
  doc += '<div class="resumen-item"><strong>' + unidades.length + '</strong>Unidades</div>';
  doc += '<div class="resumen-item"><strong>' + vp.length + '</strong>Visitas Previas</div>';
  doc += '<div class="resumen-item"><strong>' + el.length + '</strong>Evaluaciones Ligeras</div>';
  doc += '<div class="resumen-item"><strong>' + ei.length + '</strong>Evaluaciones Invernales</div>';
  doc += '<div class="resumen-item"><strong>' + regs.length + '</strong>Total registros</div>';
  doc += '</div>';

  // Unit table
  doc += '<h2>Detalle por Unidad</h2>';
  doc += '<table><thead><tr><th>Unidad</th><th>VP</th><th>EL</th><th>EI</th><th>Estado</th></tr></thead><tbody>';
  unidades.forEach(function(u) {
    var d = unidadesSet[u];
    var completa = d.VP > 0 && d.EL > 0 && d.EI > 0;
    doc += '<tr>';
    doc += '<td>' + escapeHtml(u) + '</td>';
    doc += '<td class="' + (d.VP > 0 ? 'ok' : 'no') + '">' + d.VP + '</td>';
    doc += '<td class="' + (d.EL > 0 ? 'ok' : 'no') + '">' + d.EL + '</td>';
    doc += '<td class="' + (d.EI > 0 ? 'ok' : 'no') + '">' + d.EI + '</td>';
    doc += '<td>' + (completa ? '<span class="ok">Completa</span>' : '<span class="no">Incompleta</span>') + '</td>';
    doc += '</tr>';
  });
  doc += '</tbody></table>';

  // Pastoreo
  doc += '<h2>Pastoreo (VP + EL)</h2>';
  if (pastoreoStats.count > 0) {
    doc += '<table><thead><tr><th>Punto</th><th>Valor mas frecuente</th><th>N registros</th></tr></thead><tbody>';
    for (var p = 0; p < 3; p++) {
      var ps = pastoreoStats.puntos[p];
      doc += '<tr><td>Punto ' + (p + 1) + '</td><td>' + escapeHtml(ps.moda || '-') + '</td><td>' + ps.total + '</td></tr>';
    }
    doc += '</tbody></table>';
  } else {
    doc += '<p>Sin datos de pastoreo registrados.</p>';
  }

  // EI indicators
  doc += '<h2>Indicadores EI</h2>';
  if (ei.length > 0) {
    doc += '<table><thead><tr><th>Indicador</th><th>Media</th><th>N muestras</th></tr></thead><tbody>';
    doc += '<tr><td>Herbaceas (altura cm)</td><td>' + (herbCount > 0 ? (herbSum / herbCount).toFixed(1) : '-') + '</td><td>' + herbCount + '</td></tr>';
    doc += '<tr><td>Volumen matorral (m3/ha)</td><td>' + (matVolCount > 0 ? (matVolSum / matVolCount).toFixed(2) : '-') + '</td><td>' + matVolCount + '</td></tr>';
    doc += '</tbody></table>';
  } else {
    doc += '<p>Sin registros de Evaluacion Invernal.</p>';
  }

  // Observations
  var observaciones = [];
  regs.forEach(function(r) {
    if (r.datos && r.datos.observaciones && r.datos.observaciones.trim()) {
      observaciones.push({
        tipo: r.tipo,
        unidad: r.unidad,
        fecha: r.fecha,
        texto: r.datos.observaciones.trim()
      });
    }
  });
  if (observaciones.length > 0) {
    doc += '<h2>Observaciones</h2>';
    doc += '<table><thead><tr><th>Tipo</th><th>Unidad</th><th>Fecha</th><th>Observacion</th></tr></thead><tbody>';
    observaciones.forEach(function(o) {
      doc += '<tr><td>' + escapeHtml(o.tipo) + '</td><td>' + escapeHtml(o.unidad) + '</td><td>' + escapeHtml(o.fecha) + '</td><td>' + escapeHtml(o.texto) + '</td></tr>';
    });
    doc += '</tbody></table>';
  }

  doc += '<hr style="margin-top:32px"><p style="color:#999;font-size:11px">Generado por RAPCA Campo PWA</p>';
  doc += '</body></html>';

  // Open in new window for printing
  var w = window.open('', '_blank');
  if (w) {
    w.document.write(doc);
    w.document.close();
    setTimeout(function() { w.print(); }, 400);
  } else {
    // Fallback: download as HTML
    descargarArchivo(doc, 'informe_' + zona.replace(/\s+/g, '_') + '.html', 'text/html');
  }
  cerrarModal();
}

// ----------------------------------------------------------
// 4. Exportacion a CSV
// ----------------------------------------------------------
function exportarCSV() {
  var regs = misRegistros();

  if (regs.length === 0) {
    showToast('No hay registros para exportar', 'error');
    return;
  }

  // Collect available zonas for optional filtering
  var zonas = [];
  regs.forEach(function(r) {
    var z = r.zona || '';
    if (z && zonas.indexOf(z) < 0) zonas.push(z);
  });
  zonas.sort();

  var html = '<h2>Exportar registros a CSV</h2>';
  html += '<div class="form-group"><label>Filtrar por zona (opcional)</label><select id="gabinete-csv-zona">';
  html += '<option value="">Todas las zonas</option>';
  zonas.forEach(function(z) {
    html += '<option value="' + escapeHtml(z) + '">' + escapeHtml(z) + '</option>';
  });
  html += '</select></div>';

  html += '<div class="form-group"><label>Filtrar por tipo (opcional)</label><select id="gabinete-csv-tipo">';
  html += '<option value="">Todos</option>';
  html += '<option value="VP">VP</option>';
  html += '<option value="EL">EL</option>';
  html += '<option value="EI">EI</option>';
  html += '</select></div>';

  html += '<div class="modal-actions">';
  html += '<button class="btn btn-primary" onclick="ejecutarExportCSV()">Descargar CSV</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button>';
  html += '</div>';

  abrirModal(html);
}

function _csvEscape(val) {
  if (val === null || val === undefined) return '';
  var s = String(val);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function ejecutarExportCSV() {
  var zona = document.getElementById('gabinete-csv-zona').value;
  var tipo = document.getElementById('gabinete-csv-tipo').value;
  var regs = misRegistros();

  if (zona) regs = regs.filter(function(r) { return r.zona === zona; });
  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });

  if (regs.length === 0) {
    showToast('No hay registros con los filtros seleccionados', 'error');
    return;
  }

  // CSV header
  var headers = [
    'ID', 'Tipo', 'Fecha', 'Zona', 'Unidad', 'Transecto',
    'Operador', 'Email', 'Latitud', 'Longitud', 'Enviado',
    'Pastoreo_P1', 'Pastoreo_P2', 'Pastoreo_P3',
    'Observacion_Pastoreo',
    'Fotos', 'N_Fotos_Comp',
    'Observaciones',
    'Plantas_Media', 'Palatables_Media',
    'Herbaceas_Media', 'Matorral_Volumen'
  ];

  var lines = [headers.map(_csvEscape).join(',')];

  function filaCSV(r, d, transectoLabel) {
    var pastoreo = d.pastoreo || [];
    var obsPast = '';
    if (d.observacionPastoreo) {
      if (typeof d.observacionPastoreo === 'string') {
        obsPast = d.observacionPastoreo;
      } else if (typeof d.observacionPastoreo === 'object') {
        var parts = [];
        Object.keys(d.observacionPastoreo).forEach(function(k) {
          if (d.observacionPastoreo[k]) parts.push(k + ': ' + d.observacionPastoreo[k]);
        });
        obsPast = parts.join('; ');
      }
    }

    var nFotosComp = (d.fotosComp && Array.isArray(d.fotosComp)) ? d.fotosComp.length : 0;

    return [
      r.id,
      r.tipo,
      r.fecha,
      r.zona || '',
      r.unidad || '',
      transectoLabel,
      r.operador_nombre || '',
      r.operador_email || '',
      r.lat != null ? r.lat : '',
      r.lon != null ? r.lon : '',
      r.enviado ? 'Si' : 'No',
      pastoreo[0] || '',
      pastoreo[1] || '',
      pastoreo[2] || '',
      obsPast,
      d.fotos || '',
      nFotosComp,
      d.observaciones || '',
      d.plantasMedia || '',
      d.palatablesMedia || '',
      d.herbaceasMedia || '',
      (d.matorral && d.matorral.volumen) ? d.matorral.volumen : ''
    ];
  }

  regs.forEach(function(r) {
    var d = r.datos || {};
    // Registros EI con transectos: una fila por transecto con datos
    // (antes el CSV solo exportaba el nivel superior = T1 y se perdían T2/T3)
    if (d.transectos) {
      ['T1', 'T2', 'T3'].forEach(function(t) {
        var dt = d.transectos[t];
        if (dt) lines.push(filaCSV(r, dt, t).map(_csvEscape).join(','));
      });
    } else {
      lines.push(filaCSV(r, d, r.transecto || '').map(_csvEscape).join(','));
    }
  });

  var csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel UTF-8
  var nombre = 'rapca_registros';
  if (zona) nombre += '_' + zona.replace(/\s+/g, '_');
  if (tipo) nombre += '_' + tipo;
  nombre += '_' + new Date().toISOString().slice(0, 10) + '.csv';

  descargarArchivo(csv, nombre, 'text/csv;charset=utf-8');
  showToast('CSV exportado: ' + regs.length + ' registros', 'success');
  cerrarModal();
}
// ============================================================
// RAPCA Campo — precarga.js — Precarga offline de fotos
// ============================================================

// ============================================================
// PRECARGA OFFLINE DE FOTOS
// ============================================================

var precargaFotosListadas = [];
var precargaDescargando = false;

function irPrecarga() {
  if (sesion && sesion.rol === 'admin') {
    showToast('Función disponible solo para operadores', 'info');
    irPagina('menu');
    return;
  }
  if (!navigator.onLine) {
    showToast('Necesitas conexión para precargar fotos', 'error');
    return;
  }
  actualizarEstadoPrecarga();
  cargarZonasPrecarga();
}

function actualizarEstadoPrecarga() {
  if (!db) return;
  obtenerTodosDB('fotos_precargadas').then(function(fotos) {
    var estado = document.getElementById('precarga-estado');
    var count = document.getElementById('precarga-count');
    if (fotos.length > 0) {
      count.textContent = fotos.length;
      estado.style.display = 'block';
      mostrarGaleriaPrecarga(fotos);
    } else {
      estado.style.display = 'none';
      document.getElementById('precarga-galeria').style.display = 'none';
    }
  }).catch(function(e) {
    console.warn('Error al obtener fotos precargadas:', e);
  });
}

function cargarZonasPrecarga() {
  var select = document.getElementById('precarga-zona');
  // Obtener zonas desde los registros locales
  var zonasMap = {};
  misRegistros().forEach(function(r) {
    var zona = r.zona || (r.unidad ? r.unidad.substring(0, 5) : '');
    if (!zona) return;
    if (!zonasMap[zona]) zonasMap[zona] = {};
    if (r.unidad) {
      if (!zonasMap[zona][r.unidad]) zonasMap[zona][r.unidad] = 0;
      zonasMap[zona][r.unidad]++;
    }
  });

  // También intentar desde servidor
  fetch(API_BASE + 'fotos.php?accion=zonas', {
    headers: {'Authorization': 'Bearer ' + (sesion ? sesion.token : '')}
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.ok && data.zonas) {
      Object.keys(data.zonas).forEach(function(zona) {
        if (!zonasMap[zona]) zonasMap[zona] = {};
        data.zonas[zona].forEach(function(u) {
          if (!zonasMap[zona][u.unidad]) zonasMap[zona][u.unidad] = 0;
          zonasMap[zona][u.unidad] += u.registros;
        });
      });
    }
    renderZonasPrecarga(select, zonasMap);
  }).catch(function() {
    renderZonasPrecarga(select, zonasMap);
  });
}

function renderZonasPrecarga(select, zonasMap) {
  select.innerHTML = '<option value="">-- Selecciona zona --</option>';
  Object.keys(zonasMap).sort().forEach(function(zona) {
    var nUnidades = Object.keys(zonasMap[zona]).length;
    var opt = document.createElement('option');
    opt.value = zona;
    opt.textContent = zona + ' (' + nUnidades + ' unidades)';
    opt.dataset.unidades = JSON.stringify(zonasMap[zona]);
    select.appendChild(opt);
  });
}

function precargaSeleccionarZona(zona) {
  var divUnidades = document.getElementById('precarga-unidades');
  var divInfo = document.getElementById('precarga-fotos-info');
  divInfo.style.display = 'none';
  precargaFotosListadas = [];

  if (!zona) {
    divUnidades.style.display = 'none';
    return;
  }

  var select = document.getElementById('precarga-zona');
  var opt = select.options[select.selectedIndex];
  var unidades = JSON.parse(opt.dataset.unidades || '{}');

  var lista = document.getElementById('precarga-unidades-lista');
  lista.innerHTML = '';

  Object.keys(unidades).sort().forEach(function(unidad) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.style.cssText = 'background:#607d8b;color:#fff;border-radius:12px;padding:6px 14px';
    btn.textContent = unidad + ' (' + unidades[unidad] + ' reg.)';
    btn.dataset.unidad = unidad;
    btn.dataset.selected = 'false';
    btn.onclick = function() {
      if (this.dataset.selected === 'true') {
        this.dataset.selected = 'false';
        this.style.background = '#607d8b';
      } else {
        this.dataset.selected = 'true';
        this.style.background = '#2196f3';
      }
      precargaListarFotos(zona);
    };
    lista.appendChild(btn);
  });

  // Botón seleccionar toda la zona
  var btnTodo = document.createElement('button');
  btnTodo.className = 'btn btn-sm';
  btnTodo.style.cssText = 'background:#ff9800;color:#fff;border-radius:12px;padding:6px 14px;font-weight:600';
  btnTodo.textContent = 'Toda la zona';
  btnTodo.onclick = function() {
    var btns = lista.querySelectorAll('button[data-unidad]');
    btns.forEach(function(b) { b.dataset.selected = 'true'; b.style.background = '#2196f3'; });
    precargaListarFotos(zona);
  };
  lista.insertBefore(btnTodo, lista.firstChild);

  divUnidades.style.display = 'block';
}

function precargaListarFotos(zona) {
  var btns = document.getElementById('precarga-unidades-lista').querySelectorAll('button[data-unidad]');
  var unidadesSeleccionadas = [];
  btns.forEach(function(b) {
    if (b.dataset.selected === 'true') unidadesSeleccionadas.push(b.dataset.unidad);
  });

  if (unidadesSeleccionadas.length === 0) {
    document.getElementById('precarga-fotos-info').style.display = 'none';
    precargaFotosListadas = [];
    return;
  }

  // Buscar fotos en registros locales
  var fotosEncontradas = [];
  var codigosVistos = {};

  misRegistros().forEach(function(r) {
    if (unidadesSeleccionadas.indexOf(r.unidad) === -1) return;
    if (!r.datos) return;

    // Fotos comparativas
    if (r.datos.fotosComp) {
      r.datos.fotosComp.forEach(function(fc) {
        var cod = fc.numero || '';
        if (!cod || codigosVistos[cod]) return;
        codigosVistos[cod] = true;
        fotosEncontradas.push({
          codigo: cod,
          tipo: r.tipo,
          fecha: r.fecha,
          unidad: r.unidad,
          waypoint: fc.waypoint || '',
          lat: fc.lat || null,
          lon: fc.lon || null
        });
      });
    }

    // Fotos generales
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').forEach(function(cod) {
        cod = cod.trim();
        if (!cod || codigosVistos[cod]) return;
        codigosVistos[cod] = true;
        fotosEncontradas.push({
          codigo: cod,
          tipo: r.tipo,
          fecha: r.fecha,
          unidad: r.unidad,
          waypoint: 'G',
          lat: null,
          lon: null
        });
      });
    }
  });

  // También intentar listar desde el servidor
  var promises = unidadesSeleccionadas.map(function(unidad) {
    return fetch(API_BASE + 'fotos.php?accion=listar&unidad=' + encodeURIComponent(unidad), {
      headers: {'Authorization': 'Bearer ' + (sesion ? sesion.token : '')}
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.ok && data.fotos) {
        data.fotos.forEach(function(f) {
          if (codigosVistos[f.codigo]) return;
          codigosVistos[f.codigo] = true;
          fotosEncontradas.push(f);
        });
      }
    }).catch(function() {});
  });

  Promise.all(promises).then(function() {
    precargaFotosListadas = fotosEncontradas;
    var nComp = fotosEncontradas.filter(function(f) { return f.waypoint === 'W1' || f.waypoint === 'W2'; }).length;
    var nGen = fotosEncontradas.length - nComp;

    var resumen = document.getElementById('precarga-fotos-resumen');
    resumen.innerHTML = '<strong>' + fotosEncontradas.length + ' fotos</strong> encontradas (' + nComp + ' comparativas, ' + nGen + ' generales)';

    document.getElementById('precarga-fotos-info').style.display = fotosEncontradas.length > 0 ? 'block' : 'none';

    // Marcar las que ya están precargadas
    if (db) {
      obtenerTodosDB('fotos_precargadas').then(function(existentes) {
        var existentesMap = {};
        existentes.forEach(function(e) { existentesMap[e.codigo] = true; });
        var nuevas = fotosEncontradas.filter(function(f) { return !existentesMap[f.codigo]; });
        if (nuevas.length < fotosEncontradas.length) {
          resumen.innerHTML += '<br><small>' + (fotosEncontradas.length - nuevas.length) + ' ya precargadas, ' + nuevas.length + ' nuevas</small>';
        }
      }).catch(function(e) {
        console.warn('Error verificando fotos precargadas:', e);
      });
    }
  }).catch(function(e) {
    console.warn('Error listando fotos para precarga:', e);
    showToast('Error al listar fotos del servidor', 'error');
  });
}

function precargaDescargarTodo() {
  precargaDescargar(precargaFotosListadas);
}

function precargaDescargarComp() {
  var comp = precargaFotosListadas.filter(function(f) { return f.waypoint === 'W1' || f.waypoint === 'W2'; });
  precargaDescargar(comp);
}

async function precargaDescargar(listaFotos) {
  if (precargaDescargando) { showToast('Ya hay una descarga en curso', 'info'); return; }
  if (listaFotos.length === 0) { showToast('No hay fotos para descargar', 'info'); return; }
  if (!db) { showToast('Base de datos no disponible', 'error'); return; }

  // Filtrar las que ya tenemos
  var existentes = await obtenerTodosDB('fotos_precargadas');
  var existentesMap = {};
  existentes.forEach(function(e) { existentesMap[e.codigo] = true; });
  var nuevas = listaFotos.filter(function(f) { return !existentesMap[f.codigo]; });

  if (nuevas.length === 0) {
    showToast('Todas las fotos ya están precargadas', 'success');
    return;
  }

  precargaDescargando = true;
  var progreso = document.getElementById('precarga-progreso');
  var barra = document.getElementById('precarga-barra');
  var texto = document.getElementById('precarga-progreso-texto');
  progreso.style.display = 'block';

  var descargadas = 0;
  var errores = 0;
  var total = nuevas.length;

  // Descargar en lotes de 5
  for (var i = 0; i < nuevas.length; i += 5) {
    var lote = nuevas.slice(i, i + 5);

    try {
      var resp = await fetch(API_BASE + 'fotos.php?accion=descargar_lote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (sesion ? sesion.token : '')
        },
        body: JSON.stringify({fotos: lote})
      });

      var data = await resp.json();

      if (data.ok && data.fotos) {
        for (var j = 0; j < data.fotos.length; j++) {
          var foto = data.fotos[j];
          await guardarEnDB('fotos_precargadas', {
            codigo: foto.codigo,
            data: foto.data,
            tipo: foto.tipo,
            unidad: foto.unidad,
            zona: foto.unidad ? foto.unidad.substring(0, 5) : '',
            waypoint: foto.waypoint,
            fecha: foto.fecha,
            lat: foto.lat,
            lon: foto.lon,
            descargado: Date.now()
          });
          descargadas++;
        }
        // Fotos del lote que no se descargaron
        errores += lote.length - data.fotos.length;
      } else {
        errores += lote.length;
      }
    } catch(e) {
      console.warn('Error descargando lote:', e);
      errores += lote.length;
    }

    var pct = Math.round(((descargadas + errores) / total) * 100);
    barra.style.width = pct + '%';
    texto.textContent = descargadas + '/' + total + ' descargadas' + (errores > 0 ? ' (' + errores + ' errores)' : '');
  }

  precargaDescargando = false;
  texto.textContent = 'Completado: ' + descargadas + ' fotos descargadas' + (errores > 0 ? ', ' + errores + ' errores' : '');
  showToast(descargadas + ' fotos precargadas para uso offline', 'success');

  actualizarEstadoPrecarga();
}

function limpiarPrecarga() {
  if (!confirm('¿Borrar todas las fotos precargadas?')) return;
  if (!db) return;
  var tx = db.transaction('fotos_precargadas', 'readwrite');
  tx.objectStore('fotos_precargadas').clear();
  tx.oncomplete = function() {
    showToast('Fotos precargadas eliminadas', 'info');
    actualizarEstadoPrecarga();
  };
}

function mostrarGaleriaPrecarga(fotos) {
  var galeria = document.getElementById('precarga-galeria');
  var grid = document.getElementById('precarga-galeria-grid');
  if (!fotos || fotos.length === 0) { galeria.style.display = 'none'; return; }

  galeria.style.display = 'block';
  grid.innerHTML = '';

  // Agrupar por unidad
  var porUnidad = {};
  fotos.forEach(function(f) {
    if (!porUnidad[f.unidad]) porUnidad[f.unidad] = [];
    porUnidad[f.unidad].push(f);
  });

  Object.keys(porUnidad).sort().forEach(function(unidad) {
    var header = document.createElement('div');
    header.style.cssText = 'grid-column:1/-1;font-weight:600;font-size:14px;margin-top:8px;color:#607d8b';
    header.textContent = unidad + ' (' + porUnidad[unidad].length + ')';
    grid.appendChild(header);

    porUnidad[unidad].forEach(function(f) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;border-radius:6px;overflow:hidden;aspect-ratio:3/4;cursor:pointer';
      var img = document.createElement('img');
      img.src = f.data;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      img.onclick = function() { abrirLightboxFoto(f.data, f.codigo + ' (' + f.fecha + ')'); };
      wrap.appendChild(img);

      var badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:2px 4px;text-align:center';
      badge.textContent = (f.waypoint || 'G') + ' · ' + (f.fecha || '');
      wrap.appendChild(badge);

      grid.appendChild(wrap);
    });
  });
}

// ============================================================
// RAPCA Campo — dashboard.js — Dashboard con Chart.js
// ============================================================

var dashChartBar = null;
var dashChartDoughnut = null;

function renderDashboard() {
  var content = document.getElementById('dashboard-content');
  var regs = misRegistros();
  var infras = infraestructuras || [];

  var vpCount = regs.filter(function(r) { return r.tipo === 'VP'; }).length;
  var elCount = regs.filter(function(r) { return r.tipo === 'EL'; }).length;
  var eiCount = regs.filter(function(r) { return r.tipo === 'EI'; }).length;
  var unidades = [];
  regs.forEach(function(r) { if (unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  var pendientes = regs.filter(function(r) { return !r.enviado; }).length;

  // Obtener zonas, provincias, municipios, PNs, operadores para filtros
  var zonas = [], provincias = [], municipios = [], pns = [], operadores = [];
  infras.forEach(function(inf) {
    if (inf.provincia && provincias.indexOf(inf.provincia) < 0) provincias.push(inf.provincia);
    if (inf.municipio && municipios.indexOf(inf.municipio) < 0) municipios.push(inf.municipio);
    if (inf.pn && pns.indexOf(inf.pn) < 0) pns.push(inf.pn);
  });
  // Zonas y operadores desde los registros (el filtro compara r.zona / r.operador_nombre)
  regs.forEach(function(r) {
    if (r.zona && zonas.indexOf(r.zona) < 0) zonas.push(r.zona);
    if (r.operador_nombre && operadores.indexOf(r.operador_nombre) < 0) operadores.push(r.operador_nombre);
  });
  zonas.sort();

  var html = '';

  // Métricas
  html += '<div class="dash-metrics">';
  html += '<div class="dash-metric"><div class="num">' + regs.length + '</div><div class="lbl">Total</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-vp)"><div class="num" style="color:var(--c-vp)">' + vpCount + '</div><div class="lbl">VP</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-el)"><div class="num" style="color:var(--c-el)">' + elCount + '</div><div class="lbl">EL</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-ei)"><div class="num" style="color:var(--c-ei)">' + eiCount + '</div><div class="lbl">EI</div></div>';
  html += '<div class="dash-metric"><div class="num">' + unidades.length + '</div><div class="lbl">Unidades</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-tl)"><div class="num" style="color:var(--c-tl)">' + pendientes + '</div><div class="lbl">Pendientes</div></div>';
  html += '</div>';

  // Filtros
  html += '<div class="dash-filters">';
  html += '<select id="dash-f-zona" onchange="filtrarDashboard()"><option value="">Zona</option>' + zonas.map(function(z) { return '<option value="' + escapeHtml(z) + '">' + escapeHtml(z) + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-provincia" onchange="filtrarDashboard()"><option value="">Provincia</option>' + provincias.map(function(p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-municipio" onchange="filtrarDashboard()"><option value="">Municipio</option>' + municipios.map(function(m) { return '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-pn" onchange="filtrarDashboard()"><option value="">PN</option>' + pns.map(function(p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-operador" onchange="filtrarDashboard()"><option value="">Operador</option>' + operadores.map(function(o) { return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'; }).join('') + '</select>';
  html += '</div>';

  // Charts
  html += '<div class="dash-chart"><h3>Actividad últimos 30 días</h3><canvas id="dash-chart-bar" height="200"></canvas></div>';
  html += '<div class="dash-chart"><h3>Distribución por tipo</h3><canvas id="dash-chart-doughnut" height="200"></canvas></div>';

  // Alertas
  html += '<div class="dash-alerts">';
  if (pendientes > 0) html += '<div class="dash-alert">⚠️ ' + pendientes + ' registros pendientes de sincronizar</div>';
  // Unidades sin EI
  var sinEI = [];
  unidades.forEach(function(u) {
    var tieneEI = regs.some(function(r) { return r.unidad === u && r.tipo === 'EI'; });
    if (!tieneEI) sinEI.push(u);
  });
  if (sinEI.length > 0) html += '<div class="dash-alert">📋 ' + sinEI.length + ' unidades sin Evaluación Intensa: ' + escapeHtml(sinEI.slice(0, 5).join(', ')) + (sinEI.length > 5 ? '...' : '') + '</div>';
  html += '</div>';

  content.innerHTML = html;

  // Renderizar gráficos
  renderDashCharts(regs);
}

function renderDashCharts(regs) {
  // Gráfico de barras apiladas — últimos 30 días
  var hoy = new Date();
  var labels = [];
  var vpData = [], elData = [], eiData = [];
  for (var d = 29; d >= 0; d--) {
    var fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - d);
    // Fecha en local (no UTC) para que coincida con r.fecha del <input type="date">
    var fechaStr = fecha.getFullYear() + '-' + ('0' + (fecha.getMonth() + 1)).slice(-2) + '-' + ('0' + fecha.getDate()).slice(-2);
    labels.push(fecha.getDate() + '/' + (fecha.getMonth() + 1));
    vpData.push(regs.filter(function(r) { return r.fecha === fechaStr && r.tipo === 'VP'; }).length);
    elData.push(regs.filter(function(r) { return r.fecha === fechaStr && r.tipo === 'EL'; }).length);
    eiData.push(regs.filter(function(r) { return r.fecha === fechaStr && r.tipo === 'EI'; }).length);
  }

  var ctxBar = document.getElementById('dash-chart-bar');
  if (ctxBar) {
    if (dashChartBar) dashChartBar.destroy();
    dashChartBar = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {label: 'VP', data: vpData, backgroundColor: '#88d8b0'},
          {label: 'EL', data: elData, backgroundColor: '#2ecc71'},
          {label: 'EI', data: eiData, backgroundColor: '#fd9853'}
        ]
      },
      options: {
        responsive: true,
        scales: {x: {stacked: true}, y: {stacked: true, beginAtZero: true}},
        plugins: {legend: {position: 'bottom'}}
      }
    });
  }

  // Doughnut
  var vpCount = regs.filter(function(r) { return r.tipo === 'VP'; }).length;
  var elCount = regs.filter(function(r) { return r.tipo === 'EL'; }).length;
  var eiCount = regs.filter(function(r) { return r.tipo === 'EI'; }).length;

  var ctxDoughnut = document.getElementById('dash-chart-doughnut');
  if (ctxDoughnut) {
    if (dashChartDoughnut) dashChartDoughnut.destroy();
    dashChartDoughnut = new Chart(ctxDoughnut, {
      type: 'doughnut',
      data: {
        labels: ['VP', 'EL', 'EI'],
        datasets: [{data: [vpCount, elCount, eiCount], backgroundColor: ['#88d8b0', '#2ecc71', '#fd9853']}]
      },
      options: {responsive: true, plugins: {legend: {position: 'bottom'}}}
    });
  }
}

function filtrarDashboard() {
  // Re-render con filtros aplicados
  var regs = misRegistros();
  var zona = document.getElementById('dash-f-zona').value;
  var provincia = document.getElementById('dash-f-provincia').value;
  var municipio = document.getElementById('dash-f-municipio').value;
  var pn = document.getElementById('dash-f-pn').value;
  var operador = document.getElementById('dash-f-operador').value;

  // Filtrar registros por infraestructura (zona/provincia/municipio/pn)
  if (provincia || municipio || pn) {
    var infIds = infraestructuras.filter(function(inf) {
      if (provincia && inf.provincia !== provincia) return false;
      if (municipio && inf.municipio !== municipio) return false;
      if (pn && inf.pn !== pn) return false;
      return true;
    }).map(function(inf) { return inf.idUnidad; });
    regs = regs.filter(function(r) { return infIds.indexOf(r.unidad) >= 0; });
  }
  if (zona) regs = regs.filter(function(r) { return r.zona === zona; });
  if (operador) regs = regs.filter(function(r) { return r.operador_nombre === operador; });

  // Actualizar métricas
  var vpCount = regs.filter(function(r) { return r.tipo === 'VP'; }).length;
  var elCount = regs.filter(function(r) { return r.tipo === 'EL'; }).length;
  var eiCount = regs.filter(function(r) { return r.tipo === 'EI'; }).length;
  var unidades = [];
  regs.forEach(function(r) { if (unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  var pendientes = regs.filter(function(r) { return !r.enviado; }).length;

  var metrics = document.querySelectorAll('.dash-metric .num');
  if (metrics.length >= 6) {
    metrics[0].textContent = regs.length;
    metrics[1].textContent = vpCount;
    metrics[2].textContent = elCount;
    metrics[3].textContent = eiCount;
    metrics[4].textContent = unidades.length;
    metrics[5].textContent = pendientes;
  }

  renderDashCharts(regs);
}
// ============================================================
// RAPCA Campo — timeline.js — Historial cronológico
// ============================================================

function renderTimeline() {
  var content = document.getElementById('timeline-content');
  var regs = misRegistros();

  // Filtros
  var html = '<div class="tl-filters">';
  html += '<select id="tl-f-tipo" onchange="filtrarTimeline()"><option value="">Todos</option><option value="VP">VP</option><option value="EL">EL</option><option value="EI">EI</option></select>';

  var operadores = [];
  regs.forEach(function(r) { if (r.operador_nombre && operadores.indexOf(r.operador_nombre) < 0) operadores.push(r.operador_nombre); });
  html += '<select id="tl-f-operador" onchange="filtrarTimeline()"><option value="">Operador</option>' + operadores.map(function(o) { return '<option>' + escapeHtml(o) + '</option>'; }).join('') + '</select>';

  var zonas = [];
  regs.forEach(function(r) { if (r.zona && zonas.indexOf(r.zona) < 0) zonas.push(r.zona); });
  zonas.sort();
  html += '<select id="tl-f-zona" onchange="filtrarTimeline()"><option value="">Zona</option>' + zonas.map(function(z) { return '<option>' + escapeHtml(z) + '</option>'; }).join('') + '</select>';

  var unidades = [];
  regs.forEach(function(r) { if (r.unidad && unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  unidades.sort();
  html += '<select id="tl-f-unidad" onchange="filtrarTimeline()"><option value="">Unidad</option>' + unidades.map(function(u) { return '<option>' + escapeHtml(u) + '</option>'; }).join('') + '</select>';

  html += '<input type="date" id="tl-f-desde" onchange="filtrarTimeline()" title="Desde">';
  html += '<input type="date" id="tl-f-hasta" onchange="filtrarTimeline()" title="Hasta">';
  html += '</div>';

  html += '<div id="tl-lista"></div>';
  content.innerHTML = html;
  filtrarTimeline();
}

function filtrarTimeline() {
  var regs = misRegistros();
  var tipo = document.getElementById('tl-f-tipo').value;
  var operador = document.getElementById('tl-f-operador').value;
  var zona = document.getElementById('tl-f-zona').value;
  var unidad = document.getElementById('tl-f-unidad').value;
  var desde = document.getElementById('tl-f-desde').value;
  var hasta = document.getElementById('tl-f-hasta').value;

  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (operador) regs = regs.filter(function(r) { return r.operador_nombre === operador; });
  if (zona) regs = regs.filter(function(r) { return r.zona === zona; });
  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (desde) regs = regs.filter(function(r) { return r.fecha >= desde; });
  if (hasta) regs = regs.filter(function(r) { return r.fecha <= hasta; });

  // Copiar antes de ordenar: para admin, misRegistros() devuelve el array
  // global y ordenarlo en sitio alteraba el orden persistido de los registros
  regs = regs.slice().sort(function(a, b) { return b.id - a.id; });

  var lista = document.getElementById('tl-lista');
  if (regs.length === 0) {
    lista.innerHTML = '<div style="text-align:center;color:#888;padding:30px">Sin registros</div>';
    return;
  }

  lista.innerHTML = regs.map(function(r) {
    var badgeClass = 'badge-' + r.tipo.toLowerCase();
    var h = '<div class="tl-card" data-tipo="' + escapeHtml(r.tipo) + '"><div class="tl-content">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
    h += '<span class="badge ' + badgeClass + '">' + escapeHtml(r.tipo) + '</span>';
    h += '<strong>' + escapeHtml(r.unidad) + '</strong>';
    if (r.transecto) h += '<span style="font-size:12px;color:#888">' + escapeHtml(r.transecto) + '</span>';
    h += '</div>';
    h += '<div style="font-size:12px;color:#888">' + escapeHtml(r.fecha) + ' · ' + escapeHtml(r.operador_nombre || '') + '</div>';
    if (r.datos && r.datos.observaciones) h += '<div style="font-size:13px;margin-top:4px">' + escapeHtml(r.datos.observaciones.substring(0, 100)) + '</div>';

    // Thumbnails de fotos (generales + comparativas)
    var todosCodigosFotos = [];
    if (r.datos && r.datos.fotos) {
      r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(cod) {
        todosCodigosFotos.push(cod);
      });
    }
    if (r.datos && r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        if (fc.numero) todosCodigosFotos.push(fc.numero);
      });
    }
    if (todosCodigosFotos.length > 0) {
      h += '<div class="tl-thumbs" id="tl-thumbs-' + r.id + '">';
      todosCodigosFotos.forEach(function(cod) {
        h += '<img data-codigo="' + escapeHtml(cod) + '" data-tipo="' + escapeHtml(r.tipo) + '" data-unidad="' + escapeHtml(r.unidad) + '" src="" alt="' + escapeHtml(cod) + '" onclick="if(this.src)abrirLightboxFoto(this.src,\'' + escapeHtml(cod) + '\')">';
      });
      h += '</div>';
    }

    // Acciones
    h += '<div class="tl-actions">';
    h += '<button class="btn btn-sm btn-outline" onclick="editarRegistro(' + r.id + ')">✏️ Editar</button>';
    h += '<button class="btn btn-sm btn-outline" onclick="tlEliminarRegistro(' + r.id + ')" style="color:#e74c3c;border-color:#e74c3c">🗑️ Eliminar</button>';
    h += '</div>';

    h += '</div></div>';
    return h;
  }).join('');

  // Cargar thumbnails desde IndexedDB
  cargarThumbsTimeline(regs);
}

function tlEliminarRegistro(id) {
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r) { showToast('No tienes acceso a este registro', 'error'); return; }
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar registro</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px"><strong>' + escapeHtml(r.tipo) + '</strong> — ' + escapeHtml(r.unidad) + '</p>';
  html += '<p style="font-size:12px;color:#888;margin:0 0 16px">' + escapeHtml(r.fecha) + ' · ' + escapeHtml(r.operador_nombre || '') + '</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="tlConfirmarEliminar(' + id + ')" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar definitivamente</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function tlConfirmarEliminar(id) {
  cerrarModal();

  // Recopilar fotos del registro para eliminarlas también
  var r = registros.find(function(r) { return r.id == id; });
  if (r && r.datos) {
    var codigosFotos = [];
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(Boolean).forEach(function(cod) {
        codigosFotos.push(cod);
      });
    }
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        if (fc.numero) codigosFotos.push(fc.numero);
      });
    }
    // Eliminar fotos del servidor/Cloudinary
    if (codigosFotos.length > 0) {
      eliminarFotosDeCodigos(codigosFotos);
    }
  }

  // Eliminar registro del servidor
  eliminarRegistroServidor(id);

  registros = registros.filter(function(r) { return r.id != id; });
  guardarRegistros();
  filtrarTimeline();
  showToast('Registro eliminado', 'success');
}

function cargarThumbsTimeline(regs) {
  if (!db) return;
  regs.forEach(function(r) {
    var container = document.getElementById('tl-thumbs-' + r.id);
    if (!container) return;
    var imgs = container.querySelectorAll('img[data-codigo]');
    for (var i = 0; i < imgs.length; i++) {
      (function(img) {
        var cod = img.dataset.codigo;
        var tipo = img.dataset.tipo || r.tipo;
        var unidad = img.dataset.unidad || r.unidad;
        buscarFotoData(cod, tipo, unidad).then(function(data) {
          if (data) {
            img.src = data;
          } else {
            // Fallback: intentar directamente desde servidor
            var serverUrl = API_BASE + 'uploads/rapca/' + tipo + '/' + unidad + '/' + cod + '.jpg';
            img.onerror = function() {
              img.onerror = null;
              img.src = 'https://res.cloudinary.com/drnqs1jwl/image/upload/w_120,q_60/rapca/' + tipo + '/' + unidad + '/' + cod;
              img.onerror = function() { img.style.display = 'none'; };
            };
            img.src = serverUrl;
          }
        }).catch(function() {
          img.style.display = 'none';
        });
      })(imgs[i]);
    }
  });
}
// ============================================================
// RAPCA Campo — comparador.js — Comparación de fotos
// ============================================================

var compSliderDragging = false;
var compMouseUpHandler = null;
var compTouchEndHandler = null;

function renderComparador() {
  var content = document.getElementById('comparador-content');
  var regs = misRegistros();

  // Unidades únicas (ordenadas)
  var unidades = [];
  regs.forEach(function(r) { if (r.unidad && unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  unidades.sort();

  var html = '<div class="comp-controls">';
  html += '<div class="form-group"><label>Unidad</label><select id="comp-unidad" onchange="compCargarOpciones()"><option value="">Seleccionar unidad</option>';
  unidades.forEach(function(u) { html += '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>'; });
  html += '</select></div>';

  html += '<div class="form-group"><label>Punto de foto</label><select id="comp-waypoint" onchange="compCargarFechas()"><option value="">—</option></select></div>';

  html += '<div class="form-row">';
  html += '<div class="form-group"><label>Fecha 1 (Antes)</label><select id="comp-fecha1" onchange="compCargarFotos()"><option value="">—</option></select></div>';
  html += '<div class="form-group"><label>Fecha 2 (Después)</label><select id="comp-fecha2" onchange="compCargarFotos()"><option value="">—</option></select></div>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px">';
  html += '<button class="btn btn-sm btn-primary" id="comp-btn-slider" onclick="compModoSlider()" style="flex:1">Slider</button>';
  html += '<button class="btn btn-sm btn-outline" id="comp-btn-side" onclick="compModoSide()" style="flex:1">Side by Side</button>';
  html += '</div>';
  html += '</div>';
  html += '<div id="comp-display"></div>';

  content.innerHTML = html;
}

// Obtener todas las fotos disponibles de una unidad agrupadas por waypoint
function compObtenerFotosUnidad(unidad) {
  var regs = misRegistros().filter(function(r) { return r.unidad === unidad; });
  // Estructura: { waypoint: [ {codigo, fecha, tipo} ] }
  var porWaypoint = {};

  regs.forEach(function(r) {
    if (!r.datos) return;

    // Fotos generales (G)
    if (r.datos.fotos) {
      var codigos = r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
      codigos.forEach(function(cod) {
        if (!porWaypoint['General']) porWaypoint['General'] = [];
        porWaypoint['General'].push({codigo: cod, fecha: r.fecha, tipo: r.tipo});
      });
    }

    // Fotos comparativas W1/W2
    if (r.datos.fotosComp && r.datos.fotosComp.length > 0) {
      r.datos.fotosComp.forEach(function(fc) {
        var wp = fc.waypoint || 'W';
        if (!porWaypoint[wp]) porWaypoint[wp] = [];
        porWaypoint[wp].push({codigo: fc.numero, fecha: r.fecha, tipo: r.tipo});
      });
    }
  });

  return porWaypoint;
}

function compCargarOpciones() {
  var unidad = document.getElementById('comp-unidad').value;
  var wpSelect = document.getElementById('comp-waypoint');
  var s1 = document.getElementById('comp-fecha1');
  var s2 = document.getElementById('comp-fecha2');
  document.getElementById('comp-display').innerHTML = '';

  wpSelect.innerHTML = '<option value="">—</option>';
  s1.innerHTML = '<option value="">—</option>';
  s2.innerHTML = '<option value="">—</option>';

  if (!unidad) return;

  var porWP = compObtenerFotosUnidad(unidad);
  var waypoints = Object.keys(porWP);

  // Priorizar W1, W2 sobre General
  var orden = ['W1', 'W2', 'General'];
  waypoints.sort(function(a, b) {
    var ia = orden.indexOf(a), ib = orden.indexOf(b);
    if (ia < 0) ia = 99;
    if (ib < 0) ib = 99;
    return ia - ib;
  });

  waypoints.forEach(function(wp) {
    var n = porWP[wp].length;
    var label = wp === 'W1' ? 'Waypoint 1 (' + n + ' fotos)' :
                wp === 'W2' ? 'Waypoint 2 (' + n + ' fotos)' :
                'General (' + n + ' fotos)';
    wpSelect.innerHTML += '<option value="' + wp + '">' + label + '</option>';
  });

  // Autoseleccionar W1 si existe
  if (porWP['W1']) {
    wpSelect.value = 'W1';
    compCargarFechas();
  }
}

function compCargarFechas() {
  var unidad = document.getElementById('comp-unidad').value;
  var wp = document.getElementById('comp-waypoint').value;
  var s1 = document.getElementById('comp-fecha1');
  var s2 = document.getElementById('comp-fecha2');
  document.getElementById('comp-display').innerHTML = '';

  s1.innerHTML = '<option value="">—</option>';
  s2.innerHTML = '<option value="">—</option>';

  if (!unidad || !wp) return;

  var porWP = compObtenerFotosUnidad(unidad);
  var fotos = porWP[wp] || [];

  // Fechas únicas ordenadas
  var fechas = [];
  fotos.forEach(function(f) { if (fechas.indexOf(f.fecha) < 0) fechas.push(f.fecha); });
  fechas.sort();

  if (fechas.length < 2) {
    document.getElementById('comp-display').innerHTML = '<p style="text-align:center;color:#888;padding:20px">Se necesitan al menos 2 visitas con fotos en este punto para comparar</p>';
    return;
  }

  fechas.forEach(function(f) {
    // Contar fotos de esa fecha
    var n = fotos.filter(function(fo) { return fo.fecha === f; }).length;
    var label = f + ' (' + n + ' foto' + (n > 1 ? 's' : '') + ')';
    s1.innerHTML += '<option value="' + f + '">' + label + '</option>';
    s2.innerHTML += '<option value="' + f + '">' + label + '</option>';
  });

  // Autoseleccionar primera y última fecha
  s1.value = fechas[0];
  s2.value = fechas[fechas.length - 1];
  compCargarFotos();
}

function compCargarFotos() {
  var unidad = document.getElementById('comp-unidad').value;
  var f1 = document.getElementById('comp-fecha1').value;
  var f2 = document.getElementById('comp-fecha2').value;
  if (!unidad || !f1 || !f2) return;
  compModoSlider();
}

// Buscar el código y tipo de foto para una unidad/waypoint/fecha
function compBuscarFoto(unidad, wp, fecha) {
  var porWP = compObtenerFotosUnidad(unidad);
  var fotos = porWP[wp] || [];
  var match = fotos.filter(function(f) { return f.fecha === fecha; });
  return match.length > 0 ? {codigo: match[0].codigo, tipo: match[0].tipo} : null;
}

// Limpiar event listeners anteriores del slider
function compLimpiarListeners() {
  if (compMouseUpHandler) {
    document.removeEventListener('mouseup', compMouseUpHandler);
    compMouseUpHandler = null;
  }
  if (compTouchEndHandler) {
    document.removeEventListener('touchend', compTouchEndHandler);
    compTouchEndHandler = null;
  }
  compSliderDragging = false;
}

function compModoSlider() {
  document.getElementById('comp-btn-slider').className = 'btn btn-sm btn-primary';
  document.getElementById('comp-btn-side').className = 'btn btn-sm btn-outline';

  var unidad = document.getElementById('comp-unidad').value;
  var wp = document.getElementById('comp-waypoint').value;
  var f1 = document.getElementById('comp-fecha1').value;
  var f2 = document.getElementById('comp-fecha2').value;
  if (!unidad || !wp || !f1 || !f2) {
    document.getElementById('comp-display').innerHTML = '<p style="text-align:center;color:#888">Selecciona unidad, punto y dos fechas</p>';
    return;
  }

  var foto1 = compBuscarFoto(unidad, wp, f1);
  var foto2 = compBuscarFoto(unidad, wp, f2);

  if (!foto1 && !foto2) {
    document.getElementById('comp-display').innerHTML = '<p style="text-align:center;color:#888">No se encontraron fotos para las fechas seleccionadas</p>';
    return;
  }

  var display = document.getElementById('comp-display');
  display.innerHTML = '<div class="comp-slider-wrap" id="comp-slider-wrap">' +
    '<div id="comp-loading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;color:#fff;font-size:14px;background:rgba(0,0,0,0.6);padding:8px 16px;border-radius:8px">Cargando fotos...</div>' +
    '<img id="comp-img-before" src="" alt="Antes" style="z-index:1">' +
    '<img id="comp-img-after" class="comp-after" src="" alt="Después" style="z-index:2">' +
    '<div class="comp-slider-line" id="comp-slider-line"></div>' +
    '<div class="comp-slider-handle" id="comp-slider-handle">⇔</div>' +
    '<div class="comp-label comp-label-left">' + escapeHtml(f1) + '</div>' +
    '<div class="comp-label comp-label-right">' + escapeHtml(f2) + '</div>' +
    '</div>';

  // Cargar fotos desde todas las fuentes disponibles (local, precarga, Cloudinary)
  var promesas = [];

  if (foto1) {
    promesas.push(buscarFotoData(foto1.codigo, foto1.tipo, unidad).then(function(data) {
      var el = document.getElementById('comp-img-before');
      if (el && data) el.src = data;
      else if (el) display.insertAdjacentHTML('beforeend', '<p style="color:#e74c3c;font-size:12px;margin-top:4px">Foto "antes" no disponible</p>');
    }));
  }
  if (foto2) {
    promesas.push(buscarFotoData(foto2.codigo, foto2.tipo, unidad).then(function(data) {
      var el = document.getElementById('comp-img-after');
      if (el && data) el.src = data;
      else if (el) display.insertAdjacentHTML('beforeend', '<p style="color:#e74c3c;font-size:12px;margin-top:4px">Foto "después" no disponible</p>');
    }));
  }

  Promise.all(promesas).then(function() {
    var loading = document.getElementById('comp-loading');
    if (loading) loading.remove();
  });

  // Limpiar listeners anteriores y configurar slider
  compLimpiarListeners();

  var wrap = document.getElementById('comp-slider-wrap');
  var handle = document.getElementById('comp-slider-handle');
  var line = document.getElementById('comp-slider-line');
  var afterImg = document.getElementById('comp-img-after');

  function updateSlider(x) {
    var rect = wrap.getBoundingClientRect();
    var pct = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    handle.style.left = pct + '%';
    line.style.left = pct + '%';
    afterImg.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
  }

  handle.addEventListener('mousedown', function(e) { e.preventDefault(); compSliderDragging = true; });
  handle.addEventListener('touchstart', function(e) { e.preventDefault(); compSliderDragging = true; }, {passive: false});

  wrap.addEventListener('mousemove', function(e) { if (compSliderDragging) updateSlider(e.clientX); });
  wrap.addEventListener('touchmove', function(e) { if (compSliderDragging) { e.preventDefault(); updateSlider(e.touches[0].clientX); } }, {passive: false});

  compMouseUpHandler = function() { compSliderDragging = false; };
  compTouchEndHandler = function() { compSliderDragging = false; };
  document.addEventListener('mouseup', compMouseUpHandler);
  document.addEventListener('touchend', compTouchEndHandler);

  wrap.addEventListener('click', function(e) { updateSlider(e.clientX); });
}

function compModoSide() {
  document.getElementById('comp-btn-slider').className = 'btn btn-sm btn-outline';
  document.getElementById('comp-btn-side').className = 'btn btn-sm btn-primary';

  var unidad = document.getElementById('comp-unidad').value;
  var wp = document.getElementById('comp-waypoint').value;
  var f1 = document.getElementById('comp-fecha1').value;
  var f2 = document.getElementById('comp-fecha2').value;
  if (!unidad || !wp || !f1 || !f2) return;

  compLimpiarListeners();

  var foto1 = compBuscarFoto(unidad, wp, f1);
  var foto2 = compBuscarFoto(unidad, wp, f2);

  var display = document.getElementById('comp-display');
  display.innerHTML = '<div class="comp-side">' +
    '<div><img id="comp-side-1" src="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px"><div style="text-align:center;font-size:12px;color:#888;margin-top:4px">' + escapeHtml(f1) + '</div></div>' +
    '<div><img id="comp-side-2" src="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px"><div style="text-align:center;font-size:12px;color:#888;margin-top:4px">' + escapeHtml(f2) + '</div></div>' +
    '</div>';

  if (foto1) buscarFotoData(foto1.codigo, foto1.tipo, unidad).then(function(data) {
    var el = document.getElementById('comp-side-1');
    if (el && data) el.src = data;
  });
  if (foto2) buscarFotoData(foto2.codigo, foto2.tipo, unidad).then(function(data) {
    var el = document.getElementById('comp-side-2');
    if (el && data) el.src = data;
  });
}
// ============================================================
// RAPCA Campo — galeria.js — Galería de fotos
// ============================================================

var galTab = 'todas';
var galSeleccionadas = [];

// Cargar foto desde servidor (fallback cuando no está en IndexedDB local)
function cargarFotoServidor(img, foto) {
  // Construir URL del servidor: /uploads/rapca/{tipo}/{unidad}/{codigo}.jpg
  var serverUrl = API_BASE + 'uploads/rapca/' + foto.tipo + '/' + foto.unidad + '/' + foto.codigo + '.jpg';
  img.onerror = function() {
    // Segundo intento: Cloudinary directo
    img.onerror = function() { img.alt = foto.codigo; };
    img.src = 'https://res.cloudinary.com/drnqs1jwl/image/upload/rapca/' + foto.tipo + '/' + foto.unidad + '/' + foto.codigo;
  };
  img.src = serverUrl;
}

function renderGaleria() {
  var content = document.getElementById('galeria-content');

  var html = '<div class="gal-tabs">';
  html += '<button class="gal-tab' + (galTab === 'todas' ? ' active' : '') + '" onclick="galCambiarTab(\'todas\')">Todas</button>';
  html += '<button class="gal-tab' + (galTab === 'comparativas' ? ' active' : '') + '" onclick="galCambiarTab(\'comparativas\')">Comparativas</button>';
  html += '<button class="gal-tab' + (galTab === 'precache' ? ' active' : '') + '" onclick="galCambiarTab(\'precache\')">Pre-caché</button>';
  html += '</div>';

  // Filtros
  var regs = misRegistros();
  var unidades = [];
  regs.forEach(function(r) { if (unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });

  html += '<div class="gal-filters">';
  html += '<select id="gal-f-unidad" onchange="filtrarGaleria()"><option value="">Unidad</option>' + unidades.map(function(u) { return '<option>' + escapeHtml(u) + '</option>'; }).join('') + '</select>';
  html += '<select id="gal-f-tipo" onchange="filtrarGaleria()"><option value="">Tipo</option><option>VP</option><option>EL</option><option>EI</option></select>';
  html += '<input type="date" id="gal-f-fecha" onchange="filtrarGaleria()">';
  html += '</div>';

  // Barra de selección (siempre visible)
  html += '<div class="gal-select-bar">';
  html += '<span class="gal-sel-count" id="gal-sel-count">0</span>';
  html += '<span style="color:#666">seleccionadas</span>';
  html += '<span style="flex:1"></span>';
  html += '<button onclick="galSeleccionarTodas()">☑ Todas</button>';
  html += '<button onclick="galDeseleccionar()">☐ Ninguna</button>';
  html += '</div>';

  // Pista visual
  html += '<div style="text-align:center;margin-bottom:8px;font-size:12px;color:#999">Toca el ☑ de cada foto para seleccionarla</div>';

  // Acciones (descargar siempre, resto al seleccionar)
  html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
  html += '<button class="btn btn-sm btn-primary" onclick="galDescargarTodas()">📥 Descargar todas</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galEliminarTodas()" style="color:#e74c3c;border-color:#e74c3c">🗑️ Eliminar todas</button>';
  html += '</div>';

  // Acciones multi-selección
  html += '<div id="gal-multi-actions" style="display:none;margin-bottom:10px;gap:6px;flex-wrap:wrap">';
  html += '<button class="btn btn-sm btn-primary" onclick="galDescargarSel()">📥 Descargar selección</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galCompararSel()">🔀 Comparar</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galEliminarSel()" style="color:#e74c3c;border-color:#e74c3c">🗑️ Eliminar selección</button>';
  html += '</div>';

  html += '<div class="gal-grid" id="gal-grid"></div>';

  content.innerHTML = html;
  filtrarGaleria();
}

function galCambiarTab(tab) {
  galTab = tab;
  renderGaleria();
}

function filtrarGaleria() {
  var grid = document.getElementById('gal-grid');
  var regs = misRegistros();
  var unidad = document.getElementById('gal-f-unidad').value;
  var tipo = document.getElementById('gal-f-tipo').value;
  var fecha = document.getElementById('gal-f-fecha').value;

  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (fecha) regs = regs.filter(function(r) { return r.fecha === fecha; });

  // Recopilar fotos
  var fotos = [];
  regs.forEach(function(r) {
    if (!r.datos) return;
    if (galTab === 'comparativas') {
      if (r.datos.fotosComp) {
        r.datos.fotosComp.forEach(function(fc) {
          fotos.push({codigo: fc.numero, unidad: r.unidad, tipo: r.tipo, fecha: r.fecha, waypoint: fc.waypoint});
        });
      }
    } else {
      if (r.datos.fotos) {
        r.datos.fotos.split(',').forEach(function(f) {
          var cod = f.trim();
          if (cod) fotos.push({codigo: cod, unidad: r.unidad, tipo: r.tipo, fecha: r.fecha});
        });
      }
      if (r.datos.fotosComp) {
        r.datos.fotosComp.forEach(function(fc) {
          fotos.push({codigo: fc.numero, unidad: r.unidad, tipo: r.tipo, fecha: r.fecha, waypoint: fc.waypoint});
        });
      }
    }
  });

  if (fotos.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;padding:30px">Sin fotos</div>';
    return;
  }

  // Agrupar por unidad
  var grupos = {};
  fotos.forEach(function(f) {
    if (!grupos[f.unidad]) grupos[f.unidad] = [];
    grupos[f.unidad].push(f);
  });

  var html = '';
  Object.keys(grupos).sort().forEach(function(unidad) {
    html += '<div class="gal-group-title">' + escapeHtml(unidad) + ' (' + grupos[unidad].length + ')</div>';
    grupos[unidad].forEach(function(f, i) {
      var selected = galSeleccionadas.indexOf(f.codigo) >= 0;
      html += '<div class="gal-item' + (selected ? ' selected' : '') + '" data-codigo="' + escapeHtml(f.codigo) + '">';
      html += '<img id="gal-img-' + f.codigo.replace(/[^a-zA-Z0-9]/g, '_') + '" src="" alt="' + escapeHtml(f.codigo) + '" onclick="galAbrirFoto(\'' + escapeJsAttr(f.codigo) + '\')">';
      html += '<div class="gal-check" onclick="event.stopPropagation();galToggleSel(\'' + escapeJsAttr(f.codigo) + '\',this.parentNode)">✓</div>';
      html += '</div>';
    });
  });

  grid.innerHTML = html;

  // Cargar thumbnails desde todas las fuentes (local, precarga, Cloudinary)
  fotos.forEach(function(f) {
    var imgId = 'gal-img-' + f.codigo.replace(/[^a-zA-Z0-9]/g, '_');
    buscarFotoData(f.codigo, f.tipo, f.unidad).then(function(data) {
      var img = document.getElementById(imgId);
      if (!img) return;
      if (data) {
        img.src = data;
      } else {
        // Último fallback con tag img directo
        cargarFotoServidor(img, f);
      }
    }).catch(function() {
      var img = document.getElementById(imgId);
      if (img) cargarFotoServidor(img, f);
    });
  });
  galActualizarUI();
}

function galAbrirFoto(codigo) {
  var imgId = 'gal-img-' + codigo.replace(/[^a-zA-Z0-9]/g, '_');
  var img = document.getElementById(imgId);
  if (img && img.src) abrirLightboxFoto(img.src, codigo);
}

function galToggleSel(codigo, el) {
  vibrar();
  var idx = galSeleccionadas.indexOf(codigo);
  if (idx >= 0) {
    galSeleccionadas.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    galSeleccionadas.push(codigo);
    el.classList.add('selected');
  }
  galActualizarUI();
}

function galSeleccionarTodas() {
  vibrar();
  galSeleccionadas = [];
  var items = document.querySelectorAll('.gal-item');
  for (var i = 0; i < items.length; i++) {
    var codigo = items[i].getAttribute('data-codigo');
    if (codigo) {
      galSeleccionadas.push(codigo);
      items[i].classList.add('selected');
    }
  }
  galActualizarUI();
}

function galDeseleccionar() {
  vibrar();
  galSeleccionadas = [];
  var items = document.querySelectorAll('.gal-item.selected');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
  galActualizarUI();
}

function galActualizarUI() {
  var n = galSeleccionadas.length;
  var counter = document.getElementById('gal-sel-count');
  if (counter) counter.textContent = n;
  var actions = document.getElementById('gal-multi-actions');
  if (actions) actions.style.display = n > 0 ? 'flex' : 'none';
}

async function galDescargarSel() {
  if (galSeleccionadas.length === 0) return;
  if (galSeleccionadas.length === 1) {
    // Intentar descargar desde la imagen visible (funciona con server URLs)
    var imgEl = document.getElementById('gal-img-' + galSeleccionadas[0].replace(/[^a-zA-Z0-9]/g, '_'));
    if (imgEl && imgEl.src) {
      var a = document.createElement('a');
      a.href = imgEl.src;
      a.download = galSeleccionadas[0] + '.jpg';
      a.click();
    }
    return;
  }
  // ZIP
  var zip = new JSZip();
  var noEncontradas = 0;
  for (var i = 0; i < galSeleccionadas.length; i++) {
    var cod = galSeleccionadas[i];
    var info = (typeof fotoInfoDesdeCodigo === 'function' && fotoInfoDesdeCodigo(cod)) || {};
    // Buscar en todas las fuentes, no solo el store local (ZIP incompleto)
    var data = await buscarFotoData(cod, info.tipo, info.unidad).catch(function() { return null; });
    if (data && data.indexOf('data:') === 0) {
      zip.file(cod + '.jpg', data.split(',')[1], {base64: true});
    } else {
      noEncontradas++;
    }
  }
  if (noEncontradas === galSeleccionadas.length) { showToast('No se pudo recuperar ninguna foto', 'error'); return; }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapca_fotos_seleccionadas.zip';
    a.click();
  });
  showToast(noEncontradas > 0 ? 'Descargando ZIP (' + noEncontradas + ' fotos no disponibles)...' : 'Descargando ZIP...', 'info');
}

function galCompararSel() {
  if (galSeleccionadas.length !== 2) { showToast('Selecciona exactamente 2 fotos', 'error'); return; }
  // Abrir comparador inline
  var display = document.getElementById('gal-grid');
  display.innerHTML = '<div class="comp-slider-wrap" id="gal-comp-wrap" style="max-width:100%">' +
    '<img id="gal-comp-before" src="" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover">' +
    '<img id="gal-comp-after" src="" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;clip-path:inset(0 0 0 50%)">' +
    '<div class="comp-slider-line" style="left:50%"></div>' +
    '<div class="comp-slider-handle" style="left:50%">⇔</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-sm btn-outline" onclick="filtrarGaleria()">← Volver</button></div>';

  obtenerDeDB('fotos', galSeleccionadas[0]).then(function(f) { if (f) document.getElementById('gal-comp-before').src = f.data; });
  obtenerDeDB('fotos', galSeleccionadas[1]).then(function(f) { if (f) document.getElementById('gal-comp-after').src = f.data; });

  // Slider
  var wrap = document.getElementById('gal-comp-wrap');
  var dragging = false;

  function updateSlider(x) {
    var rect = wrap.getBoundingClientRect();
    var pct = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    wrap.querySelector('.comp-slider-handle').style.left = pct + '%';
    wrap.querySelector('.comp-slider-line').style.left = pct + '%';
    document.getElementById('gal-comp-after').style.clipPath = 'inset(0 0 0 ' + pct + '%)';
  }

  wrap.querySelector('.comp-slider-handle').addEventListener('touchstart', function() { dragging = true; });
  wrap.querySelector('.comp-slider-handle').addEventListener('mousedown', function() { dragging = true; });
  wrap.addEventListener('touchmove', function(e) { if (dragging) updateSlider(e.touches[0].clientX); });
  wrap.addEventListener('mousemove', function(e) { if (dragging) updateSlider(e.clientX); });
  wrap.addEventListener('click', function(e) { updateSlider(e.clientX); });

  // Listeners de fin de arrastre a nivel document: limpiar el anterior para no acumular
  if (window._galCompEndDrag) {
    document.removeEventListener('touchend', window._galCompEndDrag);
    document.removeEventListener('mouseup', window._galCompEndDrag);
  }
  window._galCompEndDrag = function() { dragging = false; };
  document.addEventListener('touchend', window._galCompEndDrag);
  document.addEventListener('mouseup', window._galCompEndDrag);

  galSeleccionadas = [];
}

// ============================================================
// ELIMINAR FOTOS
// ============================================================
function galEliminarSel() {
  if (galSeleccionadas.length === 0) return;
  var n = galSeleccionadas.length;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar ' + n + ' foto' + (n > 1 ? 's' : '') + '</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 16px">Se eliminarán de los registros y del dispositivo. Esta acción no se puede deshacer.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="galConfirmarEliminar()" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar definitivamente</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function galEliminarTodas() {
  // Seleccionar todas las fotos visibles y pedir confirmación
  galSeleccionarTodas();
  if (galSeleccionadas.length === 0) { showToast('No hay fotos para eliminar', 'error'); return; }
  var n = galSeleccionadas.length;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar TODAS las fotos</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px">Se eliminarán <strong>' + n + '</strong> foto' + (n > 1 ? 's' : '') + ' visibles.</p>';
  html += '<p style="font-size:13px;color:#e74c3c;margin:0 0 16px">⚠️ Esta acción no se puede deshacer.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="galConfirmarEliminar()" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar ' + n + ' fotos</button>';
  html += '<button class="btn btn-outline" onclick="galCancelarEliminarTodas()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function galCancelarEliminarTodas() {
  cerrarModal();
  galDeseleccionar();
}

function galConfirmarEliminar() {
  cerrarModal();
  var codigos = galSeleccionadas.slice();
  eliminarFotosDeCodigos(codigos);
  galSeleccionadas = [];
  showToast(codigos.length + ' foto(s) eliminada(s)', 'success');
  filtrarGaleria();
  var actions = document.getElementById('gal-multi-actions');
  if (actions) actions.style.display = 'none';
}

function eliminarFotoLB() {
  var foto = lightboxFotos[lightboxIdx];
  if (!foto || !foto.info) return;
  var codigo = foto.info;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar foto</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px">' + escapeHtml(codigo) + '</p>';
  html += '<p style="font-size:13px;color:#888;margin:0 0 16px">Se eliminará del registro y del dispositivo.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="galConfirmarEliminarLB(\'' + escapeHtml(codigo) + '\')" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function galConfirmarEliminarLB(codigo) {
  cerrarModal();
  eliminarFotosDeCodigos([codigo]);
  showToast('Foto eliminada', 'success');
  cerrarLightbox();
  // Refrescar galería si está visible
  var galGrid = document.getElementById('gal-grid');
  if (galGrid) filtrarGaleria();
}

function eliminarFotosDeCodigos(codigos) {
  // Recopilar info de tipo/unidad para cada código antes de borrar
  var fotosInfo = [];
  registros.forEach(function(r) {
    if (!r.datos) return;
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(Boolean).forEach(function(cod) {
        if (codigos.indexOf(cod) >= 0) {
          fotosInfo.push({codigo: cod, tipo: r.tipo, unidad: r.unidad});
        }
      });
    }
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        if (codigos.indexOf(fc.numero) >= 0) {
          fotosInfo.push({codigo: fc.numero, tipo: r.tipo, unidad: r.unidad});
        }
      });
    }
  });

  // 1. Eliminar de los registros locales
  registros.forEach(function(r) {
    if (!r.datos) return;
    // Fotos generales (string separado por comas)
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      var lista = r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
      var nuevaLista = lista.filter(function(f) { return codigos.indexOf(f) < 0; });
      if (nuevaLista.length !== lista.length) {
        r.datos.fotos = nuevaLista.join(', ');
        r.enviado = false; // Marcar para re-sincronizar
      }
    }
    // Fotos comparativas (array de objetos)
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      var antes = r.datos.fotosComp.length;
      r.datos.fotosComp = r.datos.fotosComp.filter(function(fc) {
        return codigos.indexOf(fc.numero) < 0;
      });
      if (r.datos.fotosComp.length !== antes) {
        r.enviado = false; // Marcar para re-sincronizar
      }
    }
  });
  guardarRegistros();

  // 2. Eliminar de IndexedDB (thumbnails y subidas pendientes)
  codigos.forEach(function(codigo) {
    if (typeof eliminarDeDB === 'function') {
      eliminarDeDB('fotos', codigo);
      eliminarDeDB('subidas_pendientes', codigo);
      eliminarDeDB('waypoints_comp', codigo);
      eliminarDeDB('fotos_precargadas', codigo);
    }
  });

  // 3. Limpiar de fotosPagina actual (por si el formulario está abierto)
  ['G', 'W1', 'W2'].forEach(function(key) {
    if (fotosPagina[key]) {
      if (key === 'G') {
        fotosPagina[key] = fotosPagina[key].filter(function(f) {
          var cod = typeof f === 'string' ? f : f.codigo;
          return codigos.indexOf(cod) < 0;
        });
      } else {
        fotosPagina[key] = fotosPagina[key].filter(function(f) {
          return codigos.indexOf(f.codigo) < 0;
        });
      }
    }
  });

  // 4. Eliminar del servidor y Cloudinary
  if (fotosInfo.length > 0 && sesion && sesion.token) {
    // Deduplicar
    var vistos = {};
    var unicos = [];
    fotosInfo.forEach(function(f) {
      if (!vistos[f.codigo]) {
        vistos[f.codigo] = true;
        unicos.push(f);
      }
    });
    fetch(API_BASE + 'fotos.php?accion=eliminar', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify({codigos: unicos})
    }).then(function(resp) { return resp.json(); }).then(function(data) {
      if (data.ok) {
        console.log('Fotos eliminadas del servidor:', data.eliminadas);
        if (data.errores && data.errores.length > 0) console.warn('Errores al eliminar en nube:', data.errores);
      }
    }).catch(function(e) {
      console.warn('No se pudo eliminar fotos del servidor:', e.message);
    });
  }

  // 5. Re-sincronizar registros modificados al servidor
  if (sesion && sesion.token && !sesion.token.startsWith('local_')) {
    setTimeout(function() { sincronizar(); }, 500);
  }
}

async function galDescargarTodas() {
  var regs = misRegistros();
  var unidad = document.getElementById('gal-f-unidad').value;
  var tipo = document.getElementById('gal-f-tipo').value;
  var fecha = document.getElementById('gal-f-fecha').value;
  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (fecha) regs = regs.filter(function(r) { return r.fecha === fecha; });

  var items = [], vistos = {};
  regs.forEach(function(r) {
    if (!r.datos) return;
    if (r.datos.fotos) {
      r.datos.fotos.split(',').forEach(function(f) {
        var cod = f.trim();
        if (cod && !vistos[cod]) { vistos[cod] = true; items.push({codigo: cod, tipo: r.tipo, unidad: r.unidad}); }
      });
    }
    if (r.datos.fotosComp) {
      r.datos.fotosComp.forEach(function(fc) {
        if (fc.numero && !vistos[fc.numero]) { vistos[fc.numero] = true; items.push({codigo: fc.numero, tipo: r.tipo, unidad: r.unidad}); }
      });
    }
  });

  if (items.length === 0) { showToast('No hay fotos para descargar', 'error'); return; }

  showToast('Preparando ' + items.length + ' fotos...', 'info');
  var zip = new JSZip();
  var noEncontradas = 0;
  for (var i = 0; i < items.length; i++) {
    // Buscar en todas las fuentes (local, precarga, pendientes, Cloudinary),
    // igual que los thumbnails: antes solo se miraba el store local y el ZIP
    // salía incompleto sin aviso
    var data = await buscarFotoData(items[i].codigo, items[i].tipo, items[i].unidad).catch(function() { return null; });
    if (data && data.indexOf('data:') === 0) {
      zip.file(items[i].codigo + '.jpg', data.split(',')[1], {base64: true});
    } else {
      noEncontradas++;
    }
  }
  if (noEncontradas === items.length) { showToast('No se pudo recuperar ninguna foto', 'error'); return; }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapca_galeria_fotos.zip';
    a.click();
    if (noEncontradas > 0) {
      showToast('Descarga completada: ' + (items.length - noEncontradas) + ' fotos (' + noEncontradas + ' no disponibles)', 'info');
    } else {
      showToast('Descarga completada', 'success');
    }
  });
}

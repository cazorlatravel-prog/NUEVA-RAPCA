// ============================================================
// RAPCA Campo — app.js — Aplicación principal
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
var ganaderos = [];
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
    var req = indexedDB.open('RAPCA_Fotos', 3);
    req.onupgradeneeded = function(e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', {keyPath:'codigo'});
      if (!d.objectStoreNames.contains('subidas_pendientes')) d.createObjectStore('subidas_pendientes', {keyPath:'codigo'});
      if (!d.objectStoreNames.contains('capas_kml')) d.createObjectStore('capas_kml', {keyPath:'nombre'});
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
    var tx = db.transaction(store, 'readonly');
    var req = tx.objectStore(store).get(key);
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = reject;
  });
}

function obtenerTodosDB(store) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(store, 'readonly');
    var req = tx.objectStore(store).getAll();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = reject;
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

// --- Utilidades ---
function showToast(msg, tipo) {
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast toast-' + (tipo || 'info');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
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
  var a = 6378137, f = 1/298.257223563;
  var e = Math.sqrt(2*f - f*f);
  var latR = lat * Math.PI / 180, lonR = lon * Math.PI / 180;
  var lonO = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  var N = a / Math.sqrt(1 - e*e * Math.sin(latR)*Math.sin(latR));
  var T = Math.tan(latR) * Math.tan(latR);
  var C = (e*e / (1 - e*e)) * Math.cos(latR) * Math.cos(latR);
  var A = Math.cos(latR) * (lonR - lonO);
  var M = a * ((1 - e*e/4 - 3*e*e*e*e/64) * latR - (3*e*e/8 + 3*e*e*e*e/32) * Math.sin(2*latR) + (15*e*e*e*e/256) * Math.sin(4*latR));
  var k0 = 0.9996;
  var x = k0 * N * (A + (1-T+C)*A*A*A/6 + (5-18*T+T*T)*A*A*A*A*A/120) + 500000;
  var y = k0 * (M + N * Math.tan(latR) * (A*A/2 + (5-T+9*C+4*C*C)*A*A*A*A/24 + (61-58*T+T*T)*A*A*A*A*A*A/720));
  if (lat < 0) y += 10000000;
  var letter = 'CDEFGHJKLMNPQRSTUVWX'.charAt(Math.floor((lat + 80) / 8));
  return zone + letter + ' ' + Math.round(x) + ' ' + Math.round(y);
}

// --- Service Worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function(reg) {
    console.log('SW registrado');
  }).catch(function(e) { console.error('SW error:', e); });
}

// --- PWA Install ---
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  var banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'flex';
});

function instalarApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function(r) {
    if (r.outcome === 'accepted') showToast('App instalada', 'success');
    deferredPrompt = null;
    document.getElementById('install-banner').style.display = 'none';
  });
}

// --- Online/Offline ---
function actualizarEstado() {
  var online = navigator.onLine;
  var dot = document.getElementById('status-dot');
  var txt = document.getElementById('status-text');
  dot.className = 'status-dot ' + (online ? 'online' : 'offline');
  txt.textContent = online ? 'En línea' : 'Sin conexión';
  if (online) sincronizarAuto();
}

window.addEventListener('online', actualizarEstado);
window.addEventListener('offline', actualizarEstado);

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
  }
}

// --- Navegación SPA ---
function irPagina(id) {
  vibrar();
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');
  var target = document.getElementById(id + '-page');
  if (target) target.classList.add('active');

  // Callbacks de página
  if (id === 'vp') initFormVP();
  if (id === 'el') initFormEL();
  if (id === 'ei') initFormEI();
  if (id === 'mapa') initMapa();
  if (id === 'panel') renderPanel();
  if (id === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (id === 'timeline' && typeof renderTimeline === 'function') renderTimeline();
  if (id === 'comparador' && typeof renderComparador === 'function') renderComparador();
  if (id === 'galeria' && typeof renderGaleria === 'function') renderGaleria();
  if (id === 'ganaderos') renderGanaderos();
  if (id === 'infraestructuras') renderInfras();
  if (id === 'admin') renderAdmin();
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
// AUTENTICACIÓN
// ============================================================
var loginIntentos = {};

function iniciarSesion() {
  var email = document.getElementById('login-email').value.trim();
  var pass = document.getElementById('login-pass').value;
  var errDiv = document.getElementById('login-error');

  if (!email || !pass) { errDiv.textContent = 'Introduce email y contraseña'; errDiv.style.display = 'block'; return; }

  // Rate limiting local
  var ahora = Date.now();
  var key = 'login_' + email;
  if (!loginIntentos[key]) loginIntentos[key] = [];
  loginIntentos[key] = loginIntentos[key].filter(function(t) { return ahora - t < 900000; });
  if (loginIntentos[key].length >= 5) {
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
      // Servidor respondió pero credenciales incorrectas — mostrar error
      // Intentar fallback local solo si el servidor rechaza explícitamente
      var localOk = loginLocal(email, pass, errDiv);
      if (!localOk) {
        errDiv.textContent = data.error || 'Credenciales incorrectas';
        errDiv.style.display = 'block';
      }
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

function loginExito() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('menu-user-name').textContent = sesion.nombre + ' (' + sesion.rol + ')';
  document.getElementById('status-user').textContent = sesion.email;
  if (sesion.rol === 'admin') document.getElementById('menu-admin').style.display = 'grid';
  showToast('Bienvenido, ' + sesion.nombre, 'success');
  cargarDatos();
  // Descargar registros del servidor (admin ve todos, operador los suyos)
  if (sesion.token && !sesion.token.startsWith('local_') && navigator.onLine) {
    cargarRegistrosServidor().then(function() {
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
  document.getElementById('login-overlay').style.display = 'flex';
  showToast('Sesión cerrada', 'info');
}

function verificarSesion() {
  var s = localStorage.getItem('rapca_sesion');
  if (s) {
    sesion = JSON.parse(s);
    loginExito();
  }
}

// ============================================================
// DATOS — Cargar / Guardar
// ============================================================
function cargarDatos() {
  registros = safeParse('rapca_registros', []);
  infraestructuras = safeParse('rapca_infraestructuras', []);
  ganaderos = safeParse('rapca_ganaderos', []);
  actualizarEstado();
  actualizarContadorFotos();
}

function guardarRegistros() { safeStore('rapca_registros', registros); }
function guardarInfras() { safeStore('rapca_infraestructuras', infraestructuras); }
function guardarGanaderosLS() { safeStore('rapca_ganaderos', ganaderos); }

function misRegistros() {
  if (!sesion) return [];
  if (sesion.rol === 'admin') return registros;
  return registros.filter(function(r) { return r.operador_email === sesion.email; });
}

// ============================================================
// AUTO-GUARDADO BORRADORES
// ============================================================
function guardarBorrador(tipo) {
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var data = {};
  var fecha = document.getElementById(prefix + '-fecha');
  var unidad = document.getElementById(prefix + '-unidad');
  if (fecha) data.fecha = fecha.value;
  if (unidad) data.unidad = unidad.value;
  var obs = document.getElementById(prefix + '-observaciones');
  if (obs) data.observaciones = obs.value;
  localStorage.setItem('rapca_borrador_' + tipo.toLowerCase(), JSON.stringify(data));
}

function cargarBorrador(tipo) {
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var data = JSON.parse(localStorage.getItem('rapca_borrador_' + tipo.toLowerCase()) || 'null');
  if (!data) return;
  var fecha = document.getElementById(prefix + '-fecha');
  var unidad = document.getElementById(prefix + '-unidad');
  if (fecha && data.fecha) fecha.value = data.fecha;
  if (unidad && data.unidad) { unidad.value = data.unidad; autoZona(prefix); }
  var obs = document.getElementById(prefix + '-observaciones');
  if (obs && data.observaciones) obs.value = data.observaciones;
}

function limpiarBorrador(tipo) { localStorage.removeItem('rapca_borrador_' + tipo.toLowerCase()); }

window.addEventListener('beforeunload', function() {
  var activePage = document.querySelector('.page.active');
  if (activePage) {
    if (activePage.id === 'vp-page') guardarBorrador('VP');
    if (activePage.id === 'el-page') guardarBorrador('EL');
    if (activePage.id === 'ei-page') guardarBorrador('EI');
  }
});

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    var activePage = document.querySelector('.page.active');
    if (activePage) {
      if (activePage.id === 'vp-page') guardarBorrador('VP');
      if (activePage.id === 'el-page') guardarBorrador('EL');
      if (activePage.id === 'ei-page') guardarBorrador('EI');
    }
  }
});

// ============================================================
// FORMULARIOS VP / EL — Pastoreo + Observación
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
    html += '</div></div>';
  }
  document.getElementById(containerId).innerHTML = html;
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
  if (!document.getElementById('vp-fecha').value) document.getElementById('vp-fecha').value = hoy();
  generarPastoreo('vp-pastoreo-container', 'vp');
  generarObservacion('vp-obs-container', 'vp');
  fotosPagina = {};
  document.getElementById('vp-fotos-preview').innerHTML = '';
  cargarBorrador('VP');
  if (editandoRegistro && editandoRegistro.tipo === 'VP') cargarRegistroEnForm(editandoRegistro, 'vp');
}

function initFormEL() {
  if (!document.getElementById('el-fecha').value) document.getElementById('el-fecha').value = hoy();
  generarPastoreo('el-pastoreo-container', 'el');
  generarObservacion('el-obs-container', 'el');
  fotosPagina = {};
  document.getElementById('el-fotos-preview').innerHTML = '';
  cargarBorrador('EL');
  if (editandoRegistro && editandoRegistro.tipo === 'EL') cargarRegistroEnForm(editandoRegistro, 'el');
}

function initFormEI() {
  if (!document.getElementById('ev-fecha').value) document.getElementById('ev-fecha').value = hoy();
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
  cargarBorrador('EI');
  if (editandoRegistro && editandoRegistro.tipo === 'EI') {
    cargarRegistroEnForm(editandoRegistro, 'ev');
    // Restaurar datos de plantas, palatables, herbáceas y matorral
    if (editandoRegistro.datos) {
      restaurarDatosEI(editandoRegistro.datos);
      transectosDatos[transectoActual] = editandoRegistro.datos;
    }
  }
}

// ============================================================
// EI — Plantas, Palatables, Herbáceas, Matorral
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
    html += '<span class="planta-media" id="ev-planta' + p + '-media">—</span></div></div>';
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
    html += '<span class="planta-media" id="ev-pal' + p + '-media">—</span></div></div>';
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
    if (h === 7) html += '<span class="herb-media" id="ev-herbaceas-media-inline">—</span>';
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
  var media = count > 0 ? (sum / count).toFixed(2) : '—';
  document.getElementById('ev-planta' + p + '-media').textContent = media;
  calcMediaGeneralPlantas();
}

function calcMediaGeneralPlantas() {
  var sum = 0, count = 0;
  for (var p = 1; p <= 10; p++) {
    var m = document.getElementById('ev-planta' + p + '-media').textContent;
    if (m !== '—') { sum += parseFloat(m); count++; }
  }
  document.getElementById('ev-plantas-media').textContent = count > 0 ? (sum / count).toFixed(2) : '—';
}

function calcMediaPalatable(p) {
  var sum = 0, count = 0;
  for (var n = 1; n <= 15; n++) {
    var v = document.getElementById('ev-pal' + p + '-n' + n).value;
    if (v !== '') { sum += parseInt(v); count++; }
  }
  var media = count > 0 ? (sum / count).toFixed(2) : '—';
  document.getElementById('ev-pal' + p + '-media').textContent = media;
  calcMediaGeneralPalatables();
}

function calcMediaGeneralPalatables() {
  var sum = 0, count = 0;
  for (var p = 1; p <= 3; p++) {
    var m = document.getElementById('ev-pal' + p + '-media').textContent;
    if (m !== '—') { sum += parseFloat(m); count++; }
  }
  document.getElementById('ev-palatables-media').textContent = count > 0 ? (sum / count).toFixed(2) : '—';
}

function calcMediaHerbaceas() {
  var sum = 0, count = 0;
  for (var h = 1; h <= 7; h++) {
    var v = document.getElementById('ev-herb' + h).value;
    if (v !== '') { sum += parseInt(v); count++; }
  }
  var media = count > 0 ? (sum / count).toFixed(2) : '—';
  document.getElementById('ev-herbaceas-media').textContent = media;
  var inline = document.getElementById('ev-herbaceas-media-inline');
  if (inline) inline.textContent = media;
}

function actualizarResumenMatorral() {
  var c1 = parseFloat(document.getElementById('ev-mat1cob').value) || 0;
  var c2 = parseFloat(document.getElementById('ev-mat2cob').value) || 0;
  var a1 = parseFloat(document.getElementById('ev-mat1alt').value) || 0;
  var a2 = parseFloat(document.getElementById('ev-mat2alt').value) || 0;
  var mediaCob = (c1 + c2) / 2;
  var mediaAlt = (a1 + a2) / 2;
  var volumen = (mediaCob / 100) * (mediaAlt / 100) * 10000;
  document.getElementById('ev-mat-cob-media').textContent = mediaCob.toFixed(1);
  document.getElementById('ev-mat-alt-media').textContent = mediaAlt.toFixed(1);
  document.getElementById('ev-mat-volumen').textContent = volumen.toFixed(2) + ' m³/ha';
  document.getElementById('ev-mat-resultado').style.display = 'block';
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

// --- Transecto tabs ---
function cambiarTransecto(t) {
  vibrar();
  // Guardar datos del transecto actual antes de cambiar
  if (transectoActual !== t) {
    transectosDatos[transectoActual] = recogerDatosEI();
  }
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
  // Limpiar plantas
  for (var p = 1; p <= 10; p++) {
    document.getElementById('ev-planta' + p + '-nombre').value = '';
    for (var n = 1; n <= 10; n++) document.getElementById('ev-planta' + p + '-n' + n).value = '';
    document.getElementById('ev-planta' + p + '-media').textContent = '—';
  }
  document.getElementById('ev-plantas-media').textContent = '—';
  // Limpiar palatables
  for (var p = 1; p <= 3; p++) {
    document.getElementById('ev-pal' + p + '-nombre').value = '';
    for (var n = 1; n <= 15; n++) document.getElementById('ev-pal' + p + '-n' + n).value = '';
    document.getElementById('ev-pal' + p + '-media').textContent = '—';
  }
  document.getElementById('ev-palatables-media').textContent = '—';
  // Limpiar herbáceas
  for (var h = 1; h <= 7; h++) document.getElementById('ev-herb' + h).value = '';
  document.getElementById('ev-herbaceas-media').textContent = '—';
  // Limpiar matorral
  for (var m = 1; m <= 2; m++) {
    document.getElementById('ev-mat' + m + 'cob').value = '';
    document.getElementById('ev-mat' + m + 'alt').value = '';
    document.getElementById('ev-mat' + m + 'esp').value = '';
  }
  document.getElementById('ev-mat-resultado').style.display = 'none';
}

// ============================================================
// GUARDAR REGISTROS VP / EL / EI
// ============================================================
function guardarVP() {
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
  vibrar(50);
  showToast('Visita Previa guardada', 'success');
  irPagina('menu');
}

function guardarEL() {
  var fecha = document.getElementById('el-fecha').value;
  var unidad = document.getElementById('el-unidad').value.trim();
  var zona = document.getElementById('el-zona').value;
  if (!fecha || !unidad) { showToast('Fecha y Unidad son obligatorios', 'error'); return; }

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
  vibrar(50);
  showToast('Evaluación Ligera guardada', 'success');
  irPagina('menu');
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
  // Restaurar plantas
  if (datos.plantas) {
    for (var p = 0; p < datos.plantas.length && p < 10; p++) {
      document.getElementById('ev-planta' + (p+1) + '-nombre').value = datos.plantas[p].nombre || '';
      for (var n = 0; n < datos.plantas[p].notas.length && n < 10; n++) {
        document.getElementById('ev-planta' + (p+1) + '-n' + (n+1)).value = datos.plantas[p].notas[n] !== null ? datos.plantas[p].notas[n] : '';
      }
      document.getElementById('ev-planta' + (p+1) + '-media').textContent = datos.plantas[p].media || '—';
    }
  }
  if (datos.palatables) {
    for (var p = 0; p < datos.palatables.length && p < 3; p++) {
      document.getElementById('ev-pal' + (p+1) + '-nombre').value = datos.palatables[p].nombre || '';
      for (var n = 0; n < datos.palatables[p].notas.length && n < 15; n++) {
        document.getElementById('ev-pal' + (p+1) + '-n' + (n+1)).value = datos.palatables[p].notas[n] !== null ? datos.palatables[p].notas[n] : '';
      }
      document.getElementById('ev-pal' + (p+1) + '-media').textContent = datos.palatables[p].media || '—';
    }
  }
  if (datos.herbaceas) {
    for (var h = 0; h < datos.herbaceas.length && h < 7; h++) {
      document.getElementById('ev-herb' + (h+1)).value = datos.herbaceas[h] !== null ? datos.herbaceas[h] : '';
    }
  }
  if (datos.matorral) {
    document.getElementById('ev-mat1cob').value = datos.matorral.punto1.cobertura || '';
    document.getElementById('ev-mat1alt').value = datos.matorral.punto1.altura || '';
    document.getElementById('ev-mat1esp').value = datos.matorral.punto1.especie || '';
    document.getElementById('ev-mat2cob').value = datos.matorral.punto2.cobertura || '';
    document.getElementById('ev-mat2alt').value = datos.matorral.punto2.altura || '';
    document.getElementById('ev-mat2esp').value = datos.matorral.punto2.especie || '';
    actualizarResumenMatorral();
  }
}

function guardarEI() {
  var fecha = document.getElementById('ev-fecha').value;
  var unidad = document.getElementById('ev-unidad').value.trim();
  var zona = document.getElementById('ev-zona').value;
  if (!fecha || !unidad) { showToast('Fecha y Unidad son obligatorios', 'error'); return; }

  // Guardar datos del transecto actual
  transectosDatos[transectoActual] = recogerDatosEI();

  var reg = {
    id: editandoRegistro ? editandoRegistro.id : Date.now(),
    tipo: 'EI',
    fecha: fecha,
    zona: zona,
    unidad: unidad,
    transecto: transectoActual,
    datos: transectosDatos[transectoActual],
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
  vibrar(50);
  showToast('Transecto ' + transectoActual + ' guardado', 'success');

  // Si es T3, resetear completamente
  if (transectoActual === 'T3') {
    transectosDatos = {T1: null, T2: null, T3: null};
    transectoActual = 'T1';
    document.getElementById('ev-unidad').value = '';
    document.getElementById('ev-zona').value = '';
    limpiarFormEI();
    actualizarTransectoTabs();
    limpiarBorrador('EI');
    showToast('Unidad completada. Formulario reseteado.', 'info');
  } else {
    // Avanzar al siguiente transecto
    var next = transectoActual === 'T1' ? 'T2' : 'T3';
    cambiarTransecto(next);
  }
}

// ============================================================
// CÁMARA Y FOTOS
// ============================================================
function abrirCamara(tipo, subtipo) {
  camaraTipo = tipo;
  camaraSubtipo = subtipo;
  vibrar();

  // Generar código de foto
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || 'SIN_ID';
  var contKey = unidad + '_' + tipo + '_' + subtipo;
  var contadores = JSON.parse(localStorage.getItem('rapca_contadores_' + tipo) || '{}');
  contadores[contKey] = (contadores[contKey] || 0) + 1;
  localStorage.setItem('rapca_contadores_' + tipo, JSON.stringify(contadores));

  if (subtipo === 'G') {
    fotoCodigo = unidad + '_' + tipo + '_' + contadores[contKey];
  } else {
    fotoCodigo = unidad + '_' + tipo + '_' + subtipo + '_' + contadores[contKey];
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
  }).catch(function(err) {
    showToast('Error al acceder a la cámara: ' + err.message, 'error');
    // Decrementar contador
    contadores[contKey]--;
    localStorage.setItem('rapca_contadores_' + tipo, JSON.stringify(contadores));
  });
}

function cerrarCamara() {
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
    camaraStream = null;
  }
  document.getElementById('camera-modal').classList.remove('open');
  if (miniMapaCamera) { miniMapaCamera.remove(); miniMapaCamera = null; }

  // Decrementar contador si se cancela
  var prefix = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || 'SIN_ID';
  var contKey = unidad + '_' + camaraTipo + '_' + camaraSubtipo;
  var contadores = JSON.parse(localStorage.getItem('rapca_contadores_' + camaraTipo) || '{}');
  if (contadores[contKey] > 0) contadores[contKey]--;
  localStorage.setItem('rapca_contadores_' + camaraTipo, JSON.stringify(contadores));
}

function switchCamara() {
  camaraFacing = camaraFacing === 'environment' ? 'user' : 'environment';
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
  }
  var constraints = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    camaraStream = stream;
    document.getElementById('camera-video').srcObject = stream;
  });
}

function iniciarOverlayCamara() {
  // Brújula
  var handler = function(e) {
    compassHeading = e.alpha ? Math.round(e.alpha) : 0;
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    var dir = dirs[Math.round(compassHeading / 45) % 8];
    document.getElementById('cam-compass').textContent = dir + ' ' + compassHeading + '°';
  };
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
  }

  // GPS para overlay
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
      var utm = latLonToUTM(gpsPos.lat, gpsPos.lon);
      document.getElementById('cam-coords').textContent = utm;

      // Mini mapa
      try {
        var mapDiv = document.getElementById('camera-minimap');
        if (miniMapaCamera) miniMapaCamera.remove();
        miniMapaCamera = L.map(mapDiv, {zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false}).setView([gpsPos.lat, gpsPos.lon], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMapaCamera);
        L.circleMarker([gpsPos.lat, gpsPos.lon], {radius: 5, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 1}).addTo(miniMapaCamera);
      } catch(e) {}
    }, function() {}, {enableHighAccuracy: true});
  }
}

function capturarFoto() {
  vibrar(30);
  var video = document.getElementById('camera-video');
  var canvas = document.getElementById('preview-canvas');
  var W = 3060, H = 4080;
  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');

  // Dibujar foto del video
  var vw = video.videoWidth, vh = video.videoHeight;
  var scale = Math.max(W / vw, H / vh);
  var sw = W / scale, sh = H / scale;
  var sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);

  // Overlay brújula (esquina superior izquierda)
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(20, 20, 180, 50);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px sans-serif';
  var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  var dir = dirs[Math.round(compassHeading / 45) % 8];
  ctx.fillText(dir + ' ' + compassHeading + '°', 35, 55);

  // Info panel (esquina inferior derecha)
  ctx.fillStyle = 'rgba(26,61,46,0.85)';
  ctx.fillRect(W - 520, H - 200, 500, 180);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  var utm = gpsPos ? latLonToUTM(gpsPos.lat, gpsPos.lon) : 'Sin GPS';
  ctx.fillText('UTM: ' + utm, W - 500, H - 155);
  ctx.font = '20px sans-serif';
  ctx.fillText('RAPCA EMA', W - 500, H - 120);
  ctx.fillText(hoy() + ' ' + new Date().toLocaleTimeString('es-ES'), W - 500, H - 90);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(fotoCodigo, W - 500, H - 55);

  // Mini mapa overlay (esquina inferior izquierda) - simplificado con texto
  if (gpsPos) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, H - 120, 300, 100);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText('Lat: ' + gpsPos.lat.toFixed(6), 35, H - 85);
    ctx.fillText('Lon: ' + gpsPos.lon.toFixed(6), 35, H - 55);
  }

  fotoCapturada = canvas;
  anotaciones = [];

  // Cerrar cámara, mostrar preview
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
    camaraStream = null;
  }
  document.getElementById('camera-modal').classList.remove('open');
  document.getElementById('preview-modal').classList.add('open');
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

function aceptarFoto() {
  vibrar(30);

  // Renderizar anotaciones sobre el canvas antes de exportar
  renderizarAnotaciones();

  var canvas = document.getElementById('preview-canvas');

  // Guardar thumbnail en IndexedDB
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 400;
  thumbCanvas.height = 533;
  var tCtx = thumbCanvas.getContext('2d');
  tCtx.drawImage(canvas, 0, 0, 400, 533);
  var thumbData = thumbCanvas.toDataURL('image/jpeg', 0.5);

  guardarEnDB('fotos', {codigo: fotoCodigo, data: thumbData, fecha: Date.now()}).then(function() {
    // Guardar en cola de subida
    var uploadData = canvas.toDataURL('image/jpeg', 0.85);
    return guardarEnDB('subidas_pendientes', {codigo: fotoCodigo, data: uploadData, tipo: camaraTipo, fecha: Date.now()});
  }).then(function() {
    // Auto-descarga full-res
    var link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.download = fotoCodigo + '.jpg';
    link.click();

    // Añadir preview a la página
    if (!fotosPagina[camaraSubtipo]) fotosPagina[camaraSubtipo] = [];
    if (camaraSubtipo === 'W1' || camaraSubtipo === 'W2') {
      fotosPagina[camaraSubtipo].push({codigo: fotoCodigo, lat: gpsPos ? gpsPos.lat : null, lon: gpsPos ? gpsPos.lon : null});
    } else {
      fotosPagina[camaraSubtipo].push(fotoCodigo);
    }

    var prefix = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
    var previewGrid = document.getElementById(prefix + '-fotos-preview');
    var img = document.createElement('img');
    img.src = thumbData;
    img.title = fotoCodigo;
    img.onclick = function() { abrirLightboxFoto(this.src, fotoCodigo); };
    previewGrid.appendChild(img);

    actualizarContadorFotos();
    showToast('Foto ' + fotoCodigo + ' guardada', 'success');
  });

  // Limpiar anotaciones y cerrar
  limpiarAnotaciones();
  document.getElementById('preview-modal').classList.remove('open');
}

function actualizarContadorFotos() {
  if (!db) return;
  obtenerTodosDB('subidas_pendientes').then(function(items) {
    document.getElementById('menu-pending-fotos').textContent = items.length;
  });
}

// ============================================================
// SUBIDA DE FOTOS
// ============================================================

// Re-autenticar pidiendo contraseña al usuario si el token expiró
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
  }

  progFill.style.width = '100%';
  progText.textContent = 'Completado: ' + subidas + ' subidas, ' + fallos + ' fallos';
  setTimeout(function() { progDiv.classList.remove('show'); }, 4000);
  actualizarContadorFotos();

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

// Subida directa a Cloudinary (unsigned upload con upload preset)
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

// ============================================================
// MAPA (Leaflet)
// ============================================================
function initMapa() {
  if (mapa) { mapa.invalidateSize(); actualizarMarcadores(); return; }
  var mapDiv = document.getElementById('map-container');
  mapa = L.map(mapDiv, {zoomControl: false}).setView([37.78, -3.79], 10);

  // Basemaps
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OSM', maxZoom: 19});
  var pnoa = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {attribution: '© IGN PNOA', maxZoom: 19});
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {attribution: '© OpenTopoMap', maxZoom: 17});
  osm.addTo(mapa);

  // Capa de fotos comparativas (W1/W2)
  capaFotosComp = L.layerGroup();

  L.control.layers({'OpenStreetMap': osm, 'PNOA Ortofoto': pnoa, 'Topográfico': topo}, {'Fotos comparativas W1/W2': capaFotosComp}, {position: 'topright'}).addTo(mapa);
  L.control.zoom({position: 'topright'}).addTo(mapa);

  // MarkerCluster
  mapaMarkers = L.markerClusterGroup();
  mapa.addLayer(mapaMarkers);
  mapa.addLayer(capaFotosComp);

  actualizarMarcadores();
  cargarCapasKML();

  // GPS tracking
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    }, function() {}, {enableHighAccuracy: true});
  }
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
    marker.bindPopup('<strong>' + escapeHtml(r.tipo) + '</strong><br>' + escapeHtml(r.unidad) + '<br>' + escapeHtml(r.fecha) + '<br><small>' + escapeHtml(r.operador_nombre || '') + '</small>');
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
        wMarker.bindPopup('<strong>' + foto.waypoint + '</strong><br>' +
          '<small>' + foto.numero + '</small><br>' +
          r.tipo + ' - ' + r.unidad + '<br>' +
          r.fecha);
        capaFotosComp.addLayer(wMarker);
      }
    }
  }

  // Poblar tabla de atributos
  attrData = regs.map(function(r) { return {tipo: r.tipo, unidad: r.unidad, zona: r.zona, fecha: r.fecha, operador: r.operador_nombre, lat: r.lat, lon: r.lon}; });
}

function miPosicion() {
  if (!navigator.geolocation) { showToast('GPS no disponible', 'error'); return; }
  navigator.geolocation.getCurrentPosition(function(pos) {
    gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    if (mapa) {
      mapa.setView([gpsPos.lat, gpsPos.lon], 16);
      L.circleMarker([gpsPos.lat, gpsPos.lon], {radius: 10, fillColor: '#3498db', color: '#fff', weight: 3, fillOpacity: 1}).addTo(mapa).bindPopup('Mi posición').openPopup();
    }
  }, function() { showToast('No se pudo obtener posición', 'error'); }, {enableHighAccuracy: true});
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
    document.getElementById('gps-lat').textContent = pos.coords.latitude.toFixed(6);
    document.getElementById('gps-lon').textContent = pos.coords.longitude.toFixed(6);
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
  var regs = misRegistros();
  var found = regs.find(function(r) { return r.unidad.toLowerCase().indexOf(val.toLowerCase()) >= 0; });
  if (found && found.lat && found.lon) mapa.setView([found.lat, found.lon], 16);
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
  L.marker([gpsPos.lat, gpsPos.lon]).addTo(mapa).bindPopup('<strong>' + name + '</strong><br>' + latLonToUTM(gpsPos.lat, gpsPos.lon)).openPopup();
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
  div.innerHTML = '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)"><span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis">' + url.substring(0, 40) + '...</span>';
  list.appendChild(div);
  document.getElementById('wms-url').value = '';
  showToast('Capa WMS añadida', 'success');
}

function toggleWMSLayer(idx, visible) {
  if (visible) mapa.addLayer(wmsCapas[idx].layer);
  else mapa.removeLayer(wmsCapas[idx].layer);
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
    return '<tr>' + cols.map(function(c) { return '<td>' + (row[c] || '') + '</td>'; }).join('') + '</tr>';
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
  if (descEl) attrs['description'] = descEl.textContent.trim();
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
  var html = '<div style="max-height:200px;overflow-y:auto;font-size:12px">';
  if (popupField && attrs[popupField]) {
    html += '<b style="font-size:13px">' + attrs[popupField] + '</b><hr style="margin:4px 0">';
  }
  keys.forEach(function(k) {
    if (k !== popupField) html += '<b>' + k + ':</b> ' + attrs[k] + '<br>';
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
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + capa.nombre + '</span>' +
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
            capa.attrFields.map(function(f) { return '<option value="' + f + '"' + (f === capa.popupField ? ' selected' : '') + '>' + f + '</option>'; }).join('') +
          '</select></label>' +
        '</div>' : '') +
    '';
    list.appendChild(div);
  });
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
    kml += '<Placemark><name>' + r.tipo + ' - ' + r.unidad + '</name><description>' + r.fecha + '</description><Point><coordinates>' + r.lon + ',' + r.lat + ',0</coordinates></Point></Placemark>';
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
      var wpts = doc.querySelectorAll('wpt');
      var count = 0;
      wpts.forEach(function(wpt) {
        var lat = parseFloat(wpt.getAttribute('lat'));
        var lon = parseFloat(wpt.getAttribute('lon'));
        var name = wpt.querySelector('name');
        if (!isNaN(lat) && !isNaN(lon)) {
          L.marker([lat, lon]).addTo(mapa).bindPopup(name ? name.textContent : 'Waypoint');
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
      if (latlngs.length > 1) L.polyline(latlngs, {color: '#e74c3c', weight: 3}).addTo(mapa);
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
    gpx += '<wpt lat="' + r.lat + '" lon="' + r.lon + '"><name>' + r.tipo + ' - ' + r.unidad + '</name><desc>' + r.fecha + '</desc></wpt>';
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
  var ops = [];
  registros.forEach(function(r) { if (r.operador_nombre && ops.indexOf(r.operador_nombre) < 0) ops.push(r.operador_nombre); });
  var sel = prompt('Filtrar por operador (' + ops.join(', ') + '):');
  if (!sel) { actualizarMarcadores(); return; }
  mapaMarkers.clearLayers();
  var regs = registros.filter(function(r) { return r.operador_nombre === sel && r.lat && r.lon; });
  var colores = {VP: '#88d8b0', EL: '#2ecc71', EI: '#fd9853'};
  regs.forEach(function(r) {
    var marker = L.circleMarker([r.lat, r.lon], {radius: 8, fillColor: colores[r.tipo], color: '#fff', weight: 2, fillOpacity: 0.9});
    marker.bindPopup(r.tipo + ' - ' + r.unidad);
    mapaMarkers.addLayer(marker);
  });
}

function descargarArchivo(contenido, nombre, mime) {
  var blob = new Blob([contenido], {type: mime});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
}

// ============================================================
// GANADEROS
// ============================================================
function renderGanaderos() {
  var lista = document.getElementById('ganaderos-lista');
  var campos = JSON.parse(localStorage.getItem('rapca_campos_ganadero') || '["nombre","nif","telefono","email","municipio","explotacion"]');
  if (ganaderos.length === 0) {
    lista.innerHTML = '<div class="card" style="text-align:center;color:#888;padding:30px">No hay ganaderos registrados</div>';
    return;
  }
  lista.innerHTML = ganaderos.map(function(g, i) {
    return '<div class="card ganadero-card" onclick="editarGanadero(' + i + ')">' +
      '<div class="gan-icon">🐄</div>' +
      '<div class="gan-info"><h3>' + (g.nombre || 'Sin nombre') + '</h3><small>' + (g.municipio || '') + ' · ' + (g.telefono || '') + '</small></div>' +
      '<button class="btn-icon" onclick="event.stopPropagation();eliminarGanadero(' + i + ')" style="color:#e74c3c">🗑️</button>' +
      '</div>';
  }).join('');
}

function filtrarGanaderos(val) {
  var cards = document.getElementById('ganaderos-lista').querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].style.display = cards[i].textContent.toLowerCase().indexOf(val.toLowerCase()) >= 0 ? '' : 'none';
  }
}

function nuevoGanadero() {
  var campos = JSON.parse(localStorage.getItem('rapca_campos_ganadero') || '["nombre","nif","telefono","email","municipio","explotacion"]');
  var html = '<h2>Nuevo Ganadero</h2>';
  campos.forEach(function(c) {
    html += '<div class="form-group"><label>' + c.charAt(0).toUpperCase() + c.slice(1) + '</label><input type="text" id="gan-' + c + '"></div>';
  });
  html += '<div class="form-group"><label>Nuevo campo personalizado</label><div style="display:flex;gap:6px"><input type="text" id="gan-nuevo-campo" placeholder="Nombre del campo"><button class="btn btn-sm btn-outline" onclick="agregarCampoGanadero()">＋</button></div></div>';
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="guardarGanadero()">Guardar</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function agregarCampoGanadero() {
  var campo = document.getElementById('gan-nuevo-campo').value.trim().toLowerCase();
  if (!campo) return;
  var campos = JSON.parse(localStorage.getItem('rapca_campos_ganadero') || '["nombre","nif","telefono","email","municipio","explotacion"]');
  if (campos.indexOf(campo) < 0) { campos.push(campo); localStorage.setItem('rapca_campos_ganadero', JSON.stringify(campos)); }
  nuevoGanadero();
}

function guardarGanadero(idx) {
  var campos = JSON.parse(localStorage.getItem('rapca_campos_ganadero') || '["nombre","nif","telefono","email","municipio","explotacion"]');
  var g = {};
  campos.forEach(function(c) {
    var el = document.getElementById('gan-' + c);
    if (el) g[c] = el.value;
  });
  if (idx !== undefined) { ganaderos[idx] = g; } else { ganaderos.push(g); }
  guardarGanaderosLS();
  cerrarModal();
  renderGanaderos();
  showToast('Ganadero guardado', 'success');
}

function editarGanadero(idx) {
  var g = ganaderos[idx];
  var campos = JSON.parse(localStorage.getItem('rapca_campos_ganadero') || '["nombre","nif","telefono","email","municipio","explotacion"]');
  var html = '<h2>Editar Ganadero</h2>';
  campos.forEach(function(c) {
    html += '<div class="form-group"><label>' + c.charAt(0).toUpperCase() + c.slice(1) + '</label><input type="text" id="gan-' + c + '" value="' + (g[c] || '') + '"></div>';
  });
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="guardarGanadero(' + idx + ')">Guardar</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function eliminarGanadero(idx) {
  if (!confirm('¿Eliminar ganadero?')) return;
  ganaderos.splice(idx, 1);
  guardarGanaderosLS();
  renderGanaderos();
  showToast('Ganadero eliminado', 'info');
}

// ============================================================
// INFRAESTRUCTURAS
// ============================================================
var INFRA_CAMPOS_BASE = ['provincia','idZona','idUnidad','codInfoca','nombre','superficie','pagoMaximo','municipio','pn','contrato','vegetacion','pendiente','distancia'];

function renderInfras() {
  var lista = document.getElementById('infra-lista');
  if (infraestructuras.length === 0) {
    lista.innerHTML = '<div class="card" style="text-align:center;color:#888;padding:30px">No hay infraestructuras registradas</div>';
    return;
  }
  var regs = misRegistros();
  lista.innerHTML = infraestructuras.map(function(inf, i) {
    var vpC = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'VP'; }).length;
    var elC = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'EL'; }).length;
    var eiC = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'EI'; }).length;
    return '<div class="card infra-card" onclick="editarInfra(' + i + ')">' +
      '<div class="infra-icon">🏗️</div>' +
      '<div class="infra-info"><h3>' + (inf.nombre || inf.idUnidad || 'Sin nombre') + '</h3>' +
      '<small>' + (inf.provincia || '') + ' · ' + (inf.municipio || '') + '</small>' +
      '<div class="infra-badges"><span class="badge badge-vp">VP:' + vpC + '</span><span class="badge badge-el">EL:' + elC + '</span><span class="badge badge-ei">EI:' + eiC + '</span></div></div>' +
      '<button class="btn-icon" onclick="event.stopPropagation();eliminarInfra(' + i + ')" style="color:#e74c3c">🗑️</button>' +
      '</div>';
  }).join('');
}

function filtrarInfras(val) {
  var cards = document.getElementById('infra-lista').querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].style.display = cards[i].textContent.toLowerCase().indexOf(val.toLowerCase()) >= 0 ? '' : 'none';
  }
}

function nuevaInfra() {
  var campos = INFRA_CAMPOS_BASE.concat(JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]'));
  var html = '<h2>Nueva Infraestructura</h2>';
  campos.forEach(function(c) {
    html += '<div class="form-group"><label>' + c + '</label><input type="text" id="infra-f-' + c + '"></div>';
  });
  html += '<div class="form-group"><label>Nuevo campo</label><div style="display:flex;gap:6px"><input type="text" id="infra-nuevo-campo" placeholder="Nombre"><button class="btn btn-sm btn-outline" onclick="agregarCampoInfra()">＋</button></div></div>';
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
  var campos = INFRA_CAMPOS_BASE.concat(JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]'));
  var inf = {};
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
  var campos = INFRA_CAMPOS_BASE.concat(JSON.parse(localStorage.getItem('rapca_campos_infra') || '[]'));
  var html = '<h2>Editar Infraestructura</h2>';
  campos.forEach(function(c) {
    html += '<div class="form-group"><label>' + c + '</label><input type="text" id="infra-f-' + c + '" value="' + (inf[c] || '') + '"></div>';
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

function importarExcelInfra() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = function(e) {
    var file = e.target.files[0];
    var reader = new FileReader();
    reader.onload = function(ev) {
      var workbook = XLSX.read(ev.target.result, {type: 'array'});
      var sheet = workbook.Sheets[workbook.SheetNames[0]];
      var data = XLSX.utils.sheet_to_json(sheet);
      data.forEach(function(row) { infraestructuras.push(row); });
      guardarInfras();
      renderInfras();
      showToast(data.length + ' infraestructuras importadas', 'success');
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
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
// PANEL DE REGISTROS
// ============================================================
function renderPanel() {
  var regs = misRegistros();
  var tipoFiltro = document.getElementById('panel-filtro-tipo').value;
  var opFiltro = document.getElementById('panel-filtro-operador').value;

  // Poblar operadores
  var opSelect = document.getElementById('panel-filtro-operador');
  var ops = [];
  registros.forEach(function(r) { if (r.operador_nombre && ops.indexOf(r.operador_nombre) < 0) ops.push(r.operador_nombre); });
  if (opSelect.options.length <= 1) {
    ops.forEach(function(o) { var opt = document.createElement('option'); opt.value = o; opt.textContent = o; opSelect.appendChild(opt); });
  }

  if (tipoFiltro) regs = regs.filter(function(r) { return r.tipo === tipoFiltro; });
  if (opFiltro) regs = regs.filter(function(r) { return r.operador_nombre === opFiltro; });

  regs.sort(function(a, b) { return b.id - a.id; });

  var lista = document.getElementById('panel-lista');
  if (regs.length === 0) {
    lista.innerHTML = '<div class="card" style="text-align:center;color:#888;padding:30px">No hay registros</div>';
    return;
  }
  lista.innerHTML = regs.map(function(r) {
    var badgeClass = 'badge-' + r.tipo.toLowerCase();
    return '<div class="card registro-card">' +
      '<div class="reg-header"><span class="badge ' + badgeClass + '">' + escapeHtml(r.tipo) + '</span><h3>' + escapeHtml(r.unidad) + '</h3>' +
      (r.enviado ? '<span style="color:#27ae60;font-size:12px">✓ Sync</span>' : '<span style="color:#e74c3c;font-size:12px">● Pendiente</span>') + '</div>' +
      '<div class="reg-meta">' + escapeHtml(r.fecha) + (r.transecto ? ' · ' + escapeHtml(r.transecto) : '') + ' · ' + escapeHtml(r.operador_nombre || '') + '</div>' +
      '<div class="reg-actions">' +
      '<button class="btn btn-sm btn-outline" onclick="editarRegistro(' + r.id + ')">✏️ Editar</button>' +
      '<button class="btn btn-sm btn-outline" onclick="exportarPDFRegistro(' + r.id + ')">📄 PDF</button>' +
      '<button class="btn btn-sm btn-outline" onclick="descargarFotosZIP(' + r.id + ')">📷 ZIP</button>' +
      '<button class="btn btn-sm btn-danger" onclick="eliminarRegistro(' + r.id + ')">🗑️</button>' +
      '</div></div>';
  }).join('');
}

function filtrarPanel() { renderPanel(); }

function editarRegistro(id) {
  var r = registros.find(function(r) { return r.id === id; });
  if (!r) return;
  editandoRegistro = r;
  if (r.tipo === 'VP') irPagina('vp');
  else if (r.tipo === 'EL') irPagina('el');
  else if (r.tipo === 'EI') irPagina('ei');
}

function cargarRegistroEnForm(r, prefix) {
  document.getElementById(prefix + '-fecha').value = r.fecha;
  document.getElementById(prefix + '-unidad').value = r.unidad;
  document.getElementById(prefix + '-zona').value = r.zona;
  if (r.datos.observaciones) document.getElementById(prefix + '-observaciones').value = r.datos.observaciones;
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
}

function eliminarRegistro(id) {
  if (!confirm('¿Eliminar registro?')) return;
  registros = registros.filter(function(r) { return r.id !== id; });
  guardarRegistros();
  renderPanel();
  showToast('Registro eliminado', 'info');
}

function borrarTodosRegistros() {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  if (!confirm('¿BORRAR TODOS los registros? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Estás seguro? Se borrarán ' + registros.length + ' registros.')) return;
  registros = [];
  guardarRegistros();
  renderPanel();
  showToast('Todos los registros borrados', 'info');
}

// ============================================================
// EXPORTAR PDF
// ============================================================
async function exportarPDFRegistro(id) {
  var r = registros.find(function(r) { return r.id === id; });
  if (!r) return;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RAPCA ' + r.tipo + ' - ' + r.unidad + '</title>';
  html += '<style>body{font-family:sans-serif;padding:20px;max-width:800px;margin:0 auto}h1{color:#1a3d2e}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f0}.badge{padding:3px 8px;border-radius:12px;color:#fff;font-weight:700}.fotos{display:flex;flex-wrap:wrap;gap:10px}.fotos img{width:200px;border-radius:6px}</style></head><body>';
  html += '<h1>RAPCA EMA — ' + r.tipo + '</h1>';
  html += '<table><tr><th>Fecha</th><td>' + r.fecha + '</td><th>Unidad</th><td>' + r.unidad + '</td></tr>';
  html += '<tr><th>Zona</th><td>' + r.zona + '</td><th>Transecto</th><td>' + (r.transecto || '—') + '</td></tr>';
  html += '<tr><th>Operador</th><td>' + (r.operador_nombre || '') + '</td><th>Coordenadas</th><td>' + (r.lat ? r.lat.toFixed(6) + ', ' + r.lon.toFixed(6) : '—') + '</td></tr></table>';

  if (r.datos.pastoreo) {
    html += '<h3>Grados de Pastoreo</h3><table><tr>';
    r.datos.pastoreo.forEach(function(p, i) { html += '<th>Punto ' + (i+1) + '</th>'; });
    html += '</tr><tr>';
    r.datos.pastoreo.forEach(function(p) { html += '<td>' + (p || '—') + '</td>'; });
    html += '</tr></table>';
  }

  if (r.datos.observacionPastoreo) {
    html += '<h3>Observación Pastoreo</h3><table><tr><th>Señal Paso</th><th>Veredas</th><th>Cagarrutas</th></tr><tr>';
    html += '<td>' + (r.datos.observacionPastoreo.senal || '—') + '</td>';
    html += '<td>' + (r.datos.observacionPastoreo.veredas || '—') + '</td>';
    html += '<td>' + (r.datos.observacionPastoreo.cagarrutas || '—') + '</td></tr></table>';
  }

  if (r.datos.plantas) {
    html += '<h3>Plantas</h3><table><tr><th>Especie</th><th>Notas</th><th>Media</th></tr>';
    r.datos.plantas.forEach(function(p) {
      html += '<tr><td style="font-style:italic">' + (p.nombre || '—') + '</td><td>' + (p.notas || []).join(', ') + '</td><td><strong>' + (p.media || '—') + '</strong></td></tr>';
    });
    html += '</table><p><strong>Media general: ' + (r.datos.plantasMedia || '—') + '</strong></p>';
  }

  if (r.datos.palatables) {
    html += '<h3>Palatables</h3><table><tr><th>Especie</th><th>Notas</th><th>Media</th></tr>';
    r.datos.palatables.forEach(function(p) {
      html += '<tr><td style="font-style:italic">' + (p.nombre || '—') + '</td><td>' + (p.notas || []).join(', ') + '</td><td><strong>' + (p.media || '—') + '</strong></td></tr>';
    });
    html += '</table><p><strong>Media general: ' + (r.datos.palatablesMedia || '—') + '</strong></p>';
  }

  if (r.datos.herbaceas) {
    html += '<h3>Herbáceas</h3><table><tr>';
    for (var h = 1; h <= 7; h++) html += '<th>H' + h + '</th>';
    html += '<th>Media</th></tr><tr>';
    r.datos.herbaceas.forEach(function(v) { html += '<td>' + (v !== null ? v : '—') + '</td>'; });
    html += '<td><strong>' + (r.datos.herbaceasMedia || '—') + '</strong></td></tr></table>';
  }

  if (r.datos.matorral) {
    html += '<h3>Matorralización</h3><table><tr><th></th><th>Cobertura (%)</th><th>Altura (cm)</th><th>Especie</th></tr>';
    html += '<tr><td>Punto 1</td><td>' + (r.datos.matorral.punto1.cobertura || 0) + '</td><td>' + (r.datos.matorral.punto1.altura || 0) + '</td><td style="font-style:italic">' + (r.datos.matorral.punto1.especie || '—') + '</td></tr>';
    html += '<tr><td>Punto 2</td><td>' + (r.datos.matorral.punto2.cobertura || 0) + '</td><td>' + (r.datos.matorral.punto2.altura || 0) + '</td><td style="font-style:italic">' + (r.datos.matorral.punto2.especie || '—') + '</td></tr>';
    html += '</table><p><strong>Volumen: ' + (r.datos.matorral.volumen || '—') + ' m³/ha</strong> (Cob media: ' + (r.datos.matorral.mediaCob || '—') + '%, Alt media: ' + (r.datos.matorral.mediaAlt || '—') + ' cm)</p>';
  }

  if (r.datos.observaciones) html += '<h3>Observaciones</h3><p>' + r.datos.observaciones + '</p>';

  // Fotos thumbnails desde IndexedDB
  if (r.datos.fotos) {
    html += '<h3>Fotos</h3><div class="fotos">';
    var codigos = r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    for (var i = 0; i < codigos.length; i++) {
      try {
        var foto = await obtenerDeDB('fotos', codigos[i]);
        if (foto) html += '<img src="' + foto.data + '" title="' + codigos[i] + '">';
      } catch(e) {}
    }
    html += '</div>';
  }

  html += '<hr><p style="color:#888;font-size:11px">Generado por RAPCA Campo · ' + new Date().toLocaleString('es-ES') + '</p></body></html>';

  var win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.print();
}

function exportarTodosPDF() {
  var regs = misRegistros();
  if (regs.length === 0) { showToast('No hay registros', 'error'); return; }
  regs.forEach(function(r, i) {
    setTimeout(function() { exportarPDFRegistro(r.id); }, i * 500);
  });
}

async function descargarFotosZIP(id) {
  var r = registros.find(function(r) { return r.id === id; });
  if (!r || !r.datos.fotos) { showToast('No hay fotos', 'error'); return; }
  var zip = new JSZip();
  var codigos = r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
  for (var i = 0; i < codigos.length; i++) {
    try {
      var foto = await obtenerDeDB('fotos', codigos[i]);
      if (foto) {
        var base64 = foto.data.split(',')[1];
        zip.file(codigos[i] + '.jpg', base64, {base64: true});
      }
    } catch(e) {}
  }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.unidad + '_fotos.zip';
    a.click();
  });
}

async function descargarTodasFotosZIP() {
  var zip = new JSZip();
  var all = await obtenerTodosDB('fotos');
  all.forEach(function(foto) {
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
// SINCRONIZACIÓN
// ============================================================
async function sincronizar() {
  if (sincronizando) return;
  sincronizando = true;
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

  var exitos = 0;
  var yaReautenticado = false;
  for (var i = 0; i < pendientes.length; i++) {
    var r = pendientes[i];
    // Intentar Google Forms
    try {
      if (GOOGLE_FORM_URL) {
        var formData = new FormData();
        formData.append('entry.tipo', r.tipo);
        formData.append('entry.fecha', r.fecha);
        formData.append('entry.zona', r.zona);
        formData.append('entry.unidad', r.unidad);
        formData.append('entry.transecto', r.transecto);
        formData.append('entry.datos', JSON.stringify(r.datos));
        await fetch(GOOGLE_FORM_URL, {method: 'POST', body: formData, mode: 'no-cors'});
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
            exitos++;
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
            break;
          }
        } else {
          console.warn('Sync HTTP error:', r.id, resp.status);
        }
      } else {
        console.warn('Sync: sin token válido para registro', r.id);
      }
    } catch(e) { console.warn('Sync error:', r.id, e.message); }

    // Stagger
    if (i < pendientes.length - 1) await new Promise(function(res) { setTimeout(res, 600); });
  }

  guardarRegistros();
  actualizarEstado();
  showToast(exitos + '/' + pendientes.length + ' registros sincronizados', exitos > 0 ? 'success' : 'error');
  // Recargar registros del servidor para tener datos actualizados
  if (exitos > 0) cargarRegistrosServidor();
  } finally { sincronizando = false; }
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

  // Buscar en infraestructuras
  infraestructuras.forEach(function(inf, i) {
    var match = Object.values(inf).some(function(v) { return v && v.toString().toLowerCase().indexOf(lv) >= 0; });
    if (match) html += '<div class="search-result" onclick="cerrarBusqueda();irPagina(\'infraestructuras\')"><strong>🏗️ ' + escapeHtml(inf.nombre || inf.idUnidad) + '</strong><small>Infraestructura · ' + escapeHtml(inf.municipio || '') + '</small></div>';
  });

  // Buscar en registros
  registros.forEach(function(r) {
    if (r.unidad.toLowerCase().indexOf(lv) >= 0 || r.zona.toLowerCase().indexOf(lv) >= 0) {
      html += '<div class="search-result" onclick="cerrarBusqueda();editarRegistro(' + r.id + ')"><strong>' + escapeHtml(r.tipo) + ' ' + escapeHtml(r.unidad) + '</strong><small>' + escapeHtml(r.fecha) + ' · ' + escapeHtml(r.operador_nombre || '') + '</small></div>';
    }
  });

  // Buscar operadores
  var ops = [];
  registros.forEach(function(r) {
    if (r.operador_nombre && r.operador_nombre.toLowerCase().indexOf(lv) >= 0 && ops.indexOf(r.operador_nombre) < 0) {
      ops.push(r.operador_nombre);
      html += '<div class="search-result" onclick="cerrarBusqueda()"><strong>👤 ' + r.operador_nombre + '</strong><small>Operador</small></div>';
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

function mostrarLightbox() {
  var lb = document.getElementById('lightbox');
  lb.classList.add('open');
  document.getElementById('lb-img').src = lightboxFotos[lightboxIdx].src;
  document.getElementById('lb-info').textContent = lightboxFotos[lightboxIdx].info || '';
}

function cerrarLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

function navLightbox(dir) {
  lightboxIdx = (lightboxIdx + dir + lightboxFotos.length) % lightboxFotos.length;
  document.getElementById('lb-img').src = lightboxFotos[lightboxIdx].src;
  document.getElementById('lb-info').textContent = lightboxFotos[lightboxIdx].info || '';
}

function descargarFotoLB() {
  var a = document.createElement('a');
  a.href = lightboxFotos[lightboxIdx].src;
  a.download = (lightboxFotos[lightboxIdx].info || 'foto') + '.jpg';
  a.click();
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
// ADMIN
// ============================================================
function renderAdmin() {
  if (!sesion || sesion.rol !== 'admin') { irPagina('menu'); return; }
  var usuarios = JSON.parse(localStorage.getItem('rapca_usuarios_local') || '[]');
  var lista = document.getElementById('admin-users-list');
  lista.innerHTML = usuarios.map(function(u, i) {
    return '<div class="card admin-user-card">' +
      '<div class="user-info"><h3>' + u.nombre + ' <span class="badge" style="background:' + (u.rol === 'admin' ? '#333' : 'var(--c-secondary)') + '">' + u.rol + '</span></h3>' +
      '<small>' + u.email + ' · ' + (u.activo ? 'Activo' : 'Inactivo') + '</small></div>' +
      '<div class="admin-user-actions">' +
      '<button class="btn btn-sm btn-outline" onclick="toggleUsuario(' + i + ')">' + (u.activo ? '⏸' : '▶') + '</button>' +
      '<button class="btn btn-sm btn-outline" onclick="cambiarPassUsuario(' + i + ')">🔑</button>' +
      '<button class="btn btn-sm btn-danger" onclick="eliminarUsuario(' + i + ')">🗑️</button>' +
      '</div></div>';
  }).join('') || '<div style="color:#888;padding:10px">No hay usuarios locales</div>';

  // Cargar usuarios del servidor
  cargarUsuariosServidor();
}

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
      if (data.usuarios.length > 0) {
        lista.innerHTML = '<h3 style="margin:10px 0 5px;color:var(--c-primary)">Usuarios en servidor (' + data.usuarios.length + ')</h3>';
        data.usuarios.forEach(function(u) {
          lista.innerHTML += '<div class="card admin-user-card">' +
            '<div class="user-info"><h3>' + u.nombre + ' <span class="badge" style="background:' + (u.rol === 'admin' ? '#333' : 'var(--c-secondary)') + '">' + u.rol + '</span></h3>' +
            '<small>' + u.email + ' · ' + (u.activo ? 'Activo' : 'Inactivo') + ' · Servidor</small></div>' +
            '</div>';
        });
      }
    }
  } catch(e) {
    console.warn('No se pudieron cargar usuarios del servidor:', e.message);
  }
}

function abrirModalCrearUsuario() {
  var html = '<h2>Crear Usuario</h2>';
  html += '<div class="form-group"><label>Nombre</label><input type="text" id="admin-new-nombre"></div>';
  html += '<div class="form-group"><label>Email</label><input type="email" id="admin-new-email"></div>';
  html += '<div class="form-group"><label>Contraseña (mín. 8 caracteres)</label><input type="password" id="admin-new-pass"></div>';
  html += '<div class="form-group"><label>Rol</label><select id="admin-new-rol"><option value="operador">Operador</option><option value="admin">Admin</option></select></div>';
  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="crearUsuario()">Crear</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

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
    html += '<div class="modal-actions"><button class="btn btn-primary" id="reauth-btn">Autenticar</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
    abrirModal(html);

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

function toggleUsuario(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var usuarios = safeParse('rapca_usuarios_local', []);
  usuarios[idx].activo = !usuarios[idx].activo;
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
  renderAdmin();
}

function cambiarPassUsuario(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var pass = prompt('Nueva contraseña (mín 8 caracteres):');
  if (!pass || pass.length < 8) { showToast('Contraseña inválida', 'error'); return; }
  var usuarios = safeParse('rapca_usuarios_local', []);
  usuarios[idx].passHash = simpleHash(pass);
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
  showToast('Contraseña actualizada', 'success');
}

function eliminarUsuario(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  if (!confirm('¿Eliminar usuario?')) return;
  var usuarios = safeParse('rapca_usuarios_local', []);
  usuarios.splice(idx, 1);
  localStorage.setItem('rapca_usuarios_local', JSON.stringify(usuarios));
  renderAdmin();
  showToast('Usuario eliminado', 'info');
}

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
        var localId = sr.registro_id || sr.id;
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
            lat: sr.lat ? parseFloat(sr.lat) : null,
            lon: sr.lon ? parseFloat(sr.lon) : null,
            operador_email: sr.email,
            operador_nombre: sr.operador_nombre || sr.email
          });
        } else {
          // Marcar como enviado si ya existe localmente
          var idx = registros.findIndex(function(r) { return r.id === localId; });
          if (idx >= 0) registros[idx].enviado = true;
        }
      });

      guardarRegistros();

      // Actualizar panel admin si existe
      var div = document.getElementById('admin-server-records');
      if (div) {
        div.innerHTML = '<p>' + data.registros.length + ' registros en servidor</p>';
        data.registros.forEach(function(r) {
          div.innerHTML += '<div class="card" style="font-size:12px"><strong>' + r.tipo + '</strong> ' + (r.unidad || '') + ' · ' + r.fecha + ' · <small>' + r.email + '</small></div>';
        });
      }
    }
  } catch(e) {
    console.warn('No se pudo cargar registros del servidor:', e.message);
  }
}

// ============================================================
// LIMPIEZA IndexedDB (fotos > 5 días)
// ============================================================
function limpiarFotosAntiguas() {
  if (!db) return;
  var limite = Date.now() - (5 * 24 * 60 * 60 * 1000);
  obtenerTodosDB('fotos').then(function(fotos) {
    fotos.forEach(function(f) {
      if (f.fecha < limite) eliminarDeDB('fotos', f.codigo);
    });
  });
}

// ============================================================
// INIT APP
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  abrirDB().then(function() {
    console.log('IndexedDB lista');
    actualizarContadorFotos();
    limpiarFotosAntiguas();
  });
  verificarSesion();
  actualizarEstado();

  // GPS inicial
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    }, function() {}, {enableHighAccuracy: true});
  }

  // Service worker messages
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function(e) {
      if (e.data && e.data.tipo === 'sync-registros') sincronizar();
    });
  }
});

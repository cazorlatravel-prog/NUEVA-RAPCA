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
  var cola = syncRetryCola.slice();
  syncRetryCola = [];

  for (var i = 0; i < cola.length; i++) {
    var item = cola[i];
    var r = item.registro;
    var intento = item.intento;

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

  // Marcar todos los pendientes como 'sincronizando'
  for (var p = 0; p < pendientes.length; p++) {
    pendientes[p].syncEstado = 'sincronizando';
  }
  actualizarIndicadorSync();

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
            r.syncEstado = 'sincronizado';
            exitos++;
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
  } finally { sincronizando = false; }
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
          // Marcar como enviado si ya existe localmente
          var idx = registros.findIndex(function(r) { return r.id === localId; });
          if (idx >= 0) {
            registros[idx].enviado = true;
            registros[idx].syncEstado = 'sincronizado';
          }
        }
      });

      guardarRegistros();
      reconstruirContadores();
      actualizarIndicadorSync();

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
async function subirFotosPendientesAuto() {
  if (!db || subiendoFotosAuto) return;
  var pendientes = await obtenerTodosDB('subidas_pendientes');
  if (pendientes.length === 0) return;
  subiendoFotosAuto = true;
  try {
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
  } finally { subiendoFotosAuto = false; }
}

// --- Sync automático al reconectar ---
window.addEventListener('online', function() {
  showToast('Conexión recuperada. Sincronizando...', 'info');
  setTimeout(function() {
    sincronizarAuto();
    subirFotosPendientesAuto();
  }, 2000);
});

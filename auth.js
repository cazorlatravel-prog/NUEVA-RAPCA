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
  // Mostrar aviso de Evaluación Intensa a medias si la hay
  if (typeof actualizarBadgeBorradorEI === 'function') actualizarBadgeBorradorEI();
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
  confirmarAccion('Cerrar sesión', '¿Seguro que quieres cerrar la sesión?', '🚪 Cerrar sesión', function() { _cerrarSesionConfirmado(); });
}

function _cerrarSesionConfirmado() {
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

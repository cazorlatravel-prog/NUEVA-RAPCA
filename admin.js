// ============================================================
// ADMIN - Gestión de usuarios (local y servidor)
// ============================================================

// --- Renderizado del panel de administración ---

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
        lista.innerHTML = '<h3 style="margin:10px 0 5px;color:var(--c-primary)">Usuarios en servidor (' + data.usuarios.length + ')</h3>';
        data.usuarios.forEach(function(u, idx) {
          lista.innerHTML += '<div class="card admin-user-card">' +
            '<div class="user-info"><h3>' + u.nombre + ' <span class="badge" style="background:' + (u.rol === 'admin' ? '#333' : 'var(--c-secondary)') + '">' + u.rol + '</span></h3>' +
            '<small>' + u.email + ' · ' + (u.activo ? 'Activo' : 'Inactivo') + ' · Servidor</small></div>' +
            '<div class="admin-user-actions">' +
            '<button class="btn btn-sm btn-outline" onclick="editarUsuarioServidor(' + idx + ')">✏️</button>' +
            '<button class="btn btn-sm btn-outline" onclick="toggleUsuarioServidor(' + u.id + ')">' + (u.activo ? '⏸' : '▶') + '</button>' +
            '<button class="btn btn-sm btn-danger" onclick="eliminarUsuarioServidor(' + u.id + ', \'' + u.email.replace(/'/g, "\\'") + '\')">🗑️</button>' +
            '</div></div>';
        });
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

// --- Gestión de usuarios locales ---

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

// --- Gestión de usuarios del servidor ---

function editarUsuarioServidor(idx) {
  if (!sesion || sesion.rol !== 'admin') { showToast('Solo administradores', 'error'); return; }
  var u = window._serverUsers[idx];
  if (!u) return;
  var html = '<h2>Editar Usuario</h2>';
  html += '<div class="form-group"><label>Nombre</label><input type="text" id="edit-user-nombre" value="' + (u.nombre || '') + '"></div>';
  html += '<div class="form-group"><label>Email</label><input type="email" id="edit-user-email" value="' + (u.email || '') + '"></div>';
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

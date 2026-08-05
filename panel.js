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
  // Matorralizacion (solo EL; en EI la restaura restaurarDatosEI por
  // transecto, y aplicar aquí la copia top-level de T1 contaminaría
  // los transectos vacíos al editar)
  if (r.tipo !== 'EI' && r.datos.matorral && typeof aplicarMatorral === 'function') {
    aplicarMatorral(prefix, r.datos.matorral);
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
  confirmarAccion('Eliminar registro',
    'Vas a eliminar la ficha <strong>' + escapeHtml(r.tipo + ' ' + r.unidad) + '</strong> (' + escapeHtml(r.fecha) + ') y sus fotos.<br>Esta acción no se puede deshacer.',
    '🗑️ Eliminar', function() { _eliminarRegistroConfirmado(id); });
}

function _eliminarRegistroConfirmado(id) {
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r) return;

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
  confirmarAccion('Reiniciar contadores',
    'Las fotos nuevas empezarán a numerarse desde 1.<br>Usa esto solo si quieres empezar de nuevo.',
    '🔢 Reiniciar', function() { _reiniciarContadoresConfirmado(); });
}

function _reiniciarContadoresConfirmado() {
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
      }
      // Matorral (EI por transecto; también EL desde ahora)
      {
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
        if (!dt || (typeof esTransectoVacio === 'function' && esTransectoVacio(dt))) return;
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
  confirmarAccion('Eliminar infraestructura', '¿Eliminar esta infraestructura?', '🗑️ Eliminar', function() { _eliminarInfraConfirmado(idx); });
}

function _eliminarInfraConfirmado(idx) {
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
      html += '<h4 style="margin:0 0 8px;color:#1a3d2e"><span class="badge" style="background:' + (r.tipo === 'VP' ? '#2e7d32' : r.tipo === 'EL' ? '#1565c0' : '#e65100') + '">' + r.tipo + '</span> ' + escapeHtml(r.fecha) + ' — ' + escapeHtml(r.unidad) + (r.transecto ? ' (' + escapeHtml(String(r.transecto).charAt(0) === 'T' ? r.transecto : 'T' + r.transecto) + ')' : '') + '</h4>';

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

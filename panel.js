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
  registros.forEach(function(r) { if (r.operador_nombre && ops.indexOf(r.operador_nombre) < 0) ops.push(r.operador_nombre); });
  var opActual = opSelect.value;
  opSelect.innerHTML = '<option value="">Todos operadores</option>';
  ops.sort();
  ops.forEach(function(o) { var opt = document.createElement('option'); opt.value = o; opt.textContent = o; opSelect.appendChild(opt); });
  opSelect.value = opActual;

  // Poblar unidades (siempre refrescar, preservando selección)
  var unidadSelect = document.getElementById('panel-filtro-unidad');
  var unidades = [];
  registros.forEach(function(r) { if (r.unidad && unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
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
        '<button class="btn btn-sm btn-outline" onclick="exportarPDFRegistro(' + r.id + ')">📄 PDF</button>' +
        '<button class="btn btn-sm btn-outline" onclick="descargarFotosZIP(' + r.id + ')">📷 Fotos</button>' +
        '<button class="btn btn-sm btn-danger" onclick="eliminarRegistro(' + r.id + ')">🗑️</button>';
    } else {
      actions =
        '<button class="btn btn-sm btn-outline" onclick="editarRegistro(' + r.id + ')">✏️ Editar</button>' +
        '<button class="btn btn-sm btn-outline" onclick="exportarPDFRegistro(' + r.id + ')">📄 PDF</button>' +
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
      '<button class="btn btn-sm btn-primary" onclick="exportarTodosPDF()">📄 Todos PDF</button>' +
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
      '<button class="btn btn-sm btn-primary" onclick="exportarTodosPDF()">📄 Todos PDF</button>' +
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
  var r = registros.find(function(r) { return r.id == id; });
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
  // Restaurar fotos en fotosPagina y preview
  restaurarFotosRegistro(r, prefix);
}

function restaurarFotosRegistro(r, prefix) {
  // Restaurar fotos generales (G)
  if (r.datos.fotos && typeof r.datos.fotos === 'string') {
    var codigos = r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
    if (codigos.length > 0) {
      fotosPagina['G'] = codigos;
    }
  }
  // Restaurar fotos comparativas (W1, W2)
  if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
    r.datos.fotosComp.forEach(function(fc) {
      var wp = fc.waypoint || 'W1';
      if (!fotosPagina[wp]) fotosPagina[wp] = [];
      fotosPagina[wp].push({codigo: fc.numero, lat: fc.lat || null, lon: fc.lon || null});
    });
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
}

function eliminarRegistro(id) {
  if (!confirm('¿Eliminar registro?')) return;
  registros = registros.filter(function(r) { return r.id != id; });
  guardarRegistros();
  renderPanel();
  showToast('Registro eliminado', 'info');
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
// EXPORTAR PDF
// ============================================================
async function exportarPDFRegistro(id) {
  var r = registros.find(function(r) { return r.id == id; });
  if (!r) return;

  showToast('Preparando informe con fotos...', 'info');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RAPCA ' + r.tipo + ' - ' + r.unidad + '</title>';
  html += '<style>body{font-family:sans-serif;padding:20px;max-width:800px;margin:0 auto}h1{color:#1a3d2e}h2{color:#1a3d2e;margin-top:24px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f0}.badge{padding:3px 8px;border-radius:12px;color:#fff;font-weight:700}img{max-width:100%}@media print{div[style*="page-break"]{page-break-before:always}img{break-inside:avoid}}</style></head><body>';
  html += '<h1>RAPCA EMA — ' + r.tipo + '</h1>';
  html += '<table><tr><th>Fecha</th><td>' + r.fecha + '</td><th>Unidad</th><td>' + r.unidad + '</td></tr>';
  html += '<tr><th>Zona</th><td>' + r.zona + '</td><th>Transecto</th><td>' + (r.transecto || '—') + '</td></tr>';
  html += '<tr><th>Operador</th><td>' + (r.operador_nombre || '') + '</td><th>Coordenadas</th><td>' + (r.lat ? formatCoordNW(r.lat, r.lon) : '—') + '</td></tr></table>';

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

  // ---- FOTOS COMPARATIVAS (prioridad alta, más grandes) ----
  if (r.datos.fotosComp && r.datos.fotosComp.length > 0) {
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
  if (r.datos.fotos) {
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
  win.document.write(html);
  win.document.close();
  win.print();
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

  var filas = regs.map(function(r) {
    var fila = {
      'Tipo': r.tipo,
      'Fecha': r.fecha,
      'Unidad': r.unidad,
      'Zona': r.zona || '',
      'Transecto': r.transecto || '',
      'Operador': r.operador_nombre || '',
      'Latitud': r.lat || '',
      'Longitud': r.lon || '',
      'Enviado': r.enviado ? 'Sí' : 'No'
    };

    if (r.datos) {
      // Pastoreo
      if (r.datos.pastoreo) {
        if (Array.isArray(r.datos.pastoreo)) {
          fila['Pastoreo'] = r.datos.pastoreo.join(', ');
        } else {
          fila['Pastoreo'] = String(r.datos.pastoreo);
        }
      }
      // Observación pastoreo
      if (r.datos.observacionPastoreo) {
        var obs = r.datos.observacionPastoreo;
        fila['Señal Paso'] = obs.senal || '';
        fila['Veredas'] = obs.veredas || '';
        fila['Cagarrutas'] = obs.cagarrutas || '';
      }
      // Fotos
      fila['Fotos'] = r.datos.fotos || '';
      // Fotos comparativas
      if (r.datos.fotosComp && r.datos.fotosComp.length > 0) {
        fila['Fotos Comparativas'] = r.datos.fotosComp.map(function(f) {
          return f.numero + ' (' + f.waypoint + ')';
        }).join(', ');
      }
      // Observaciones
      fila['Observaciones'] = r.datos.observaciones || '';

      // Datos EI específicos
      if (r.tipo === 'EI') {
        // Plantas
        if (r.datos.plantas) {
          r.datos.plantas.forEach(function(p, i) {
            if (p.nombre) {
              fila['Planta ' + (i + 1)] = p.nombre;
              fila['Planta ' + (i + 1) + ' Media'] = p.media || '';
              fila['Planta ' + (i + 1) + ' Notas'] = (p.notas || []).filter(function(n) { return n !== null; }).join(', ');
            }
          });
        }
        fila['Media Plantas'] = r.datos.plantasMedia || '';
        // Palatables
        if (r.datos.palatables) {
          r.datos.palatables.forEach(function(p, i) {
            if (p.nombre) {
              fila['Palatable ' + (i + 1)] = p.nombre;
              fila['Palatable ' + (i + 1) + ' Media'] = p.media || '';
              fila['Palatable ' + (i + 1) + ' Notas'] = (p.notas || []).filter(function(n) { return n !== null; }).join(', ');
            }
          });
        }
        fila['Media Palatables'] = r.datos.palatablesMedia || '';
        // Herbáceas
        if (r.datos.herbaceas) {
          fila['Herbáceas'] = r.datos.herbaceas.filter(function(n) { return n !== null; }).join(', ');
        }
        fila['Media Herbáceas'] = r.datos.herbaceasMedia || '';
        // Matorral
        if (r.datos.matorral) {
          var mat = r.datos.matorral;
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
  var r = registros.find(function(r) { return r.id == id; });
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

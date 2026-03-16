// ============================================================
// GABINETE / OFICINA - Funciones de analisis y exportacion
// ============================================================

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
    var d = r.datos;
    if (!d) return;
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
    var d = r.datos;
    if (!d) return;
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

  regs.forEach(function(r) {
    var d = r.datos || {};
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

    var row = [
      r.id,
      r.tipo,
      r.fecha,
      r.zona || '',
      r.unidad || '',
      r.transecto || '',
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

    lines.push(row.map(_csvEscape).join(','));
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

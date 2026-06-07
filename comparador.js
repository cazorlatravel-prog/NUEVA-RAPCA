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

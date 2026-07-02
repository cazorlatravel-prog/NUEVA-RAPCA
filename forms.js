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

  // Fotos
  if (data.fotosPagina) {
    fotosPagina = data.fotosPagina;
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
    // Editando registro existente: cargar sus datos (NO el borrador)
    limpiarBorrador('VP');
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
    // Editando registro existente: cargar sus datos (NO el borrador)
    limpiarBorrador('EL');
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
    // Editando registro existente: cargar sus datos (NO el borrador)
    limpiarBorrador('EI');
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
      var prevT = (existenteEI.datos && existenteEI.datos.transectos) || {};
      if (!transectosDatos.T1 && prevT.T1) transectosDatos.T1 = prevT.T1;
      if (!transectosDatos.T2 && prevT.T2) transectosDatos.T2 = prevT.T2;
      if (!transectosDatos.T3 && prevT.T3) transectosDatos.T3 = prevT.T3;
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
    // Avanzar al siguiente transecto
    var next = transectoActual === 'T1' ? 'T2' : 'T3';
    cambiarTransecto(next);
  }
}

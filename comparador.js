// ============================================================
// RAPCA Campo — comparador.js — Comparación de fotos
// ============================================================

var compSliderDragging = false;

function renderComparador() {
  var content = document.getElementById('comparador-content');
  var regs = misRegistros();

  // Unidades únicas
  var unidades = [];
  regs.forEach(function(r) { if (unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });

  var html = '<div class="comp-controls">';
  html += '<div class="form-group"><label>Unidad</label><select id="comp-unidad" onchange="compCargarFechas()"><option value="">Seleccionar unidad</option>';
  unidades.forEach(function(u) { html += '<option value="' + u + '">' + u + '</option>'; });
  html += '</select></div>';
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

function compCargarFechas() {
  var unidad = document.getElementById('comp-unidad').value;
  var regs = misRegistros().filter(function(r) { return r.unidad === unidad; });
  var fechas = [];
  regs.forEach(function(r) { if (fechas.indexOf(r.fecha) < 0) fechas.push(r.fecha); });
  fechas.sort();

  var s1 = document.getElementById('comp-fecha1');
  var s2 = document.getElementById('comp-fecha2');
  s1.innerHTML = '<option value="">—</option>' + fechas.map(function(f) { return '<option>' + f + '</option>'; }).join('');
  s2.innerHTML = '<option value="">—</option>' + fechas.map(function(f) { return '<option>' + f + '</option>'; }).join('');
}

function compCargarFotos() {
  var unidad = document.getElementById('comp-unidad').value;
  var f1 = document.getElementById('comp-fecha1').value;
  var f2 = document.getElementById('comp-fecha2').value;
  if (!unidad || !f1 || !f2) return;
  compModoSlider();
}

function compModoSlider() {
  document.getElementById('comp-btn-slider').className = 'btn btn-sm btn-primary';
  document.getElementById('comp-btn-side').className = 'btn btn-sm btn-outline';

  var unidad = document.getElementById('comp-unidad').value;
  var f1 = document.getElementById('comp-fecha1').value;
  var f2 = document.getElementById('comp-fecha2').value;
  if (!unidad || !f1 || !f2) { document.getElementById('comp-display').innerHTML = '<p style="text-align:center;color:#888">Selecciona unidad y dos fechas</p>'; return; }

  var regs = misRegistros();
  var r1 = regs.find(function(r) { return r.unidad === unidad && r.fecha === f1; });
  var r2 = regs.find(function(r) { return r.unidad === unidad && r.fecha === f2; });
  if (!r1 || !r2) return;

  // Obtener primera foto de cada uno
  var cod1 = r1.datos.fotos ? r1.datos.fotos.split(',')[0].trim() : '';
  var cod2 = r2.datos.fotos ? r2.datos.fotos.split(',')[0].trim() : '';

  var display = document.getElementById('comp-display');
  display.innerHTML = '<div class="comp-slider-wrap" id="comp-slider-wrap">' +
    '<img id="comp-img-before" src="" alt="Antes" style="z-index:1">' +
    '<img id="comp-img-after" class="comp-after" src="" alt="Después" style="z-index:2">' +
    '<div class="comp-slider-line" id="comp-slider-line"></div>' +
    '<div class="comp-slider-handle" id="comp-slider-handle">⇔</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;font-size:12px;color:#888;margin-top:4px"><span>' + f1 + '</span><span>' + f2 + '</span></div>';

  // Cargar fotos
  if (cod1) obtenerDeDB('fotos', cod1).then(function(f) { if (f) document.getElementById('comp-img-before').src = f.data; });
  if (cod2) obtenerDeDB('fotos', cod2).then(function(f) { if (f) document.getElementById('comp-img-after').src = f.data; });

  // Slider drag
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

  handle.addEventListener('mousedown', function() { compSliderDragging = true; });
  handle.addEventListener('touchstart', function() { compSliderDragging = true; });

  wrap.addEventListener('mousemove', function(e) { if (compSliderDragging) updateSlider(e.clientX); });
  wrap.addEventListener('touchmove', function(e) { if (compSliderDragging) updateSlider(e.touches[0].clientX); });

  document.addEventListener('mouseup', function() { compSliderDragging = false; });
  document.addEventListener('touchend', function() { compSliderDragging = false; });

  wrap.addEventListener('click', function(e) { updateSlider(e.clientX); });
}

function compModoSide() {
  document.getElementById('comp-btn-slider').className = 'btn btn-sm btn-outline';
  document.getElementById('comp-btn-side').className = 'btn btn-sm btn-primary';

  var unidad = document.getElementById('comp-unidad').value;
  var f1 = document.getElementById('comp-fecha1').value;
  var f2 = document.getElementById('comp-fecha2').value;
  if (!unidad || !f1 || !f2) return;

  var regs = misRegistros();
  var r1 = regs.find(function(r) { return r.unidad === unidad && r.fecha === f1; });
  var r2 = regs.find(function(r) { return r.unidad === unidad && r.fecha === f2; });
  if (!r1 || !r2) return;

  var cod1 = r1.datos.fotos ? r1.datos.fotos.split(',')[0].trim() : '';
  var cod2 = r2.datos.fotos ? r2.datos.fotos.split(',')[0].trim() : '';

  var display = document.getElementById('comp-display');
  display.innerHTML = '<div class="comp-side">' +
    '<div><img id="comp-side-1" src="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px"><div style="text-align:center;font-size:12px;color:#888;margin-top:4px">' + f1 + '</div></div>' +
    '<div><img id="comp-side-2" src="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px"><div style="text-align:center;font-size:12px;color:#888;margin-top:4px">' + f2 + '</div></div>' +
    '</div>';

  if (cod1) obtenerDeDB('fotos', cod1).then(function(f) { if (f) document.getElementById('comp-side-1').src = f.data; });
  if (cod2) obtenerDeDB('fotos', cod2).then(function(f) { if (f) document.getElementById('comp-side-2').src = f.data; });
}

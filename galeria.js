// ============================================================
// RAPCA Campo — galeria.js — Galería de fotos
// ============================================================

var galTab = 'todas';
var galSeleccionadas = [];

function renderGaleria() {
  var content = document.getElementById('galeria-content');

  var html = '<div class="gal-tabs">';
  html += '<button class="gal-tab' + (galTab === 'todas' ? ' active' : '') + '" onclick="galCambiarTab(\'todas\')">Todas</button>';
  html += '<button class="gal-tab' + (galTab === 'comparativas' ? ' active' : '') + '" onclick="galCambiarTab(\'comparativas\')">Comparativas</button>';
  html += '<button class="gal-tab' + (galTab === 'precache' ? ' active' : '') + '" onclick="galCambiarTab(\'precache\')">Pre-caché</button>';
  html += '</div>';

  // Filtros
  var regs = misRegistros();
  var unidades = [];
  regs.forEach(function(r) { if (unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });

  html += '<div class="gal-filters">';
  html += '<select id="gal-f-unidad" onchange="filtrarGaleria()"><option value="">Unidad</option>' + unidades.map(function(u) { return '<option>' + u + '</option>'; }).join('') + '</select>';
  html += '<select id="gal-f-tipo" onchange="filtrarGaleria()"><option value="">Tipo</option><option>VP</option><option>EL</option><option>EI</option></select>';
  html += '<input type="date" id="gal-f-fecha" onchange="filtrarGaleria()">';
  html += '</div>';

  // Acciones multi-selección
  html += '<div id="gal-multi-actions" style="display:none;margin-bottom:10px;gap:6px">';
  html += '<button class="btn btn-sm btn-primary" onclick="galDescargarSel()">📥 Descargar</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galCompararSel()">🔀 Comparar</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galDeseleccionar()">✕ Deseleccionar</button>';
  html += '</div>';

  html += '<div class="gal-grid" id="gal-grid"></div>';

  content.innerHTML = html;
  filtrarGaleria();
}

function galCambiarTab(tab) {
  galTab = tab;
  renderGaleria();
}

function filtrarGaleria() {
  var grid = document.getElementById('gal-grid');
  var regs = misRegistros();
  var unidad = document.getElementById('gal-f-unidad').value;
  var tipo = document.getElementById('gal-f-tipo').value;
  var fecha = document.getElementById('gal-f-fecha').value;

  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (fecha) regs = regs.filter(function(r) { return r.fecha === fecha; });

  // Recopilar fotos
  var fotos = [];
  regs.forEach(function(r) {
    if (galTab === 'comparativas') {
      if (r.datos.fotosComp) {
        r.datos.fotosComp.forEach(function(fc) {
          fotos.push({codigo: fc.numero, unidad: r.unidad, tipo: r.tipo, fecha: r.fecha, waypoint: fc.waypoint});
        });
      }
    } else {
      if (r.datos.fotos) {
        r.datos.fotos.split(',').forEach(function(f) {
          var cod = f.trim();
          if (cod) fotos.push({codigo: cod, unidad: r.unidad, tipo: r.tipo, fecha: r.fecha});
        });
      }
      if (r.datos.fotosComp) {
        r.datos.fotosComp.forEach(function(fc) {
          fotos.push({codigo: fc.numero, unidad: r.unidad, tipo: r.tipo, fecha: r.fecha, waypoint: fc.waypoint});
        });
      }
    }
  });

  if (fotos.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;padding:30px">Sin fotos</div>';
    return;
  }

  // Agrupar por unidad
  var grupos = {};
  fotos.forEach(function(f) {
    if (!grupos[f.unidad]) grupos[f.unidad] = [];
    grupos[f.unidad].push(f);
  });

  var html = '';
  Object.keys(grupos).sort().forEach(function(unidad) {
    html += '<div class="gal-group-title">' + unidad + ' (' + grupos[unidad].length + ')</div>';
    grupos[unidad].forEach(function(f, i) {
      var selected = galSeleccionadas.indexOf(f.codigo) >= 0;
      html += '<div class="gal-item' + (selected ? ' selected' : '') + '" data-codigo="' + f.codigo + '" onclick="galToggleSel(\'' + f.codigo + '\',this)">';
      html += '<img id="gal-img-' + f.codigo.replace(/[^a-zA-Z0-9]/g, '_') + '" src="" alt="' + f.codigo + '">';
      html += '<div class="gal-check">✓</div>';
      html += '</div>';
    });
  });

  grid.innerHTML = html;

  // Cargar thumbnails
  fotos.forEach(function(f) {
    obtenerDeDB('fotos', f.codigo).then(function(foto) {
      if (foto) {
        var img = document.getElementById('gal-img-' + f.codigo.replace(/[^a-zA-Z0-9]/g, '_'));
        if (img) img.src = foto.data;
      }
    });
  });
}

function galToggleSel(codigo, el) {
  vibrar();
  var idx = galSeleccionadas.indexOf(codigo);
  if (idx >= 0) {
    galSeleccionadas.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    galSeleccionadas.push(codigo);
    el.classList.add('selected');
  }

  var actions = document.getElementById('gal-multi-actions');
  if (galSeleccionadas.length === 0) {
    // Nada seleccionado: abrir lightbox del último tocado
    actions.style.display = 'none';
    var img = el.querySelector('img');
    if (img && img.src) abrirLightboxFoto(img.src, codigo);
  } else {
    actions.style.display = 'flex';
  }
}

function galDeseleccionar() {
  galSeleccionadas = [];
  var items = document.querySelectorAll('.gal-item.selected');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
  document.getElementById('gal-multi-actions').style.display = 'none';
}

async function galDescargarSel() {
  if (galSeleccionadas.length === 0) return;
  if (galSeleccionadas.length === 1) {
    var foto = await obtenerDeDB('fotos', galSeleccionadas[0]);
    if (foto) {
      var a = document.createElement('a');
      a.href = foto.data;
      a.download = galSeleccionadas[0] + '.jpg';
      a.click();
    }
    return;
  }
  // ZIP
  var zip = new JSZip();
  for (var i = 0; i < galSeleccionadas.length; i++) {
    var foto = await obtenerDeDB('fotos', galSeleccionadas[i]);
    if (foto) {
      var base64 = foto.data.split(',')[1];
      zip.file(galSeleccionadas[i] + '.jpg', base64, {base64: true});
    }
  }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapca_fotos_seleccionadas.zip';
    a.click();
  });
  showToast('Descargando ZIP...', 'info');
}

function galCompararSel() {
  if (galSeleccionadas.length !== 2) { showToast('Selecciona exactamente 2 fotos', 'error'); return; }
  // Abrir comparador inline
  var display = document.getElementById('gal-grid');
  display.innerHTML = '<div class="comp-slider-wrap" id="gal-comp-wrap" style="max-width:100%">' +
    '<img id="gal-comp-before" src="" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover">' +
    '<img id="gal-comp-after" src="" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;clip-path:inset(0 0 0 50%)">' +
    '<div class="comp-slider-line" style="left:50%"></div>' +
    '<div class="comp-slider-handle" style="left:50%">⇔</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-sm btn-outline" onclick="filtrarGaleria()">← Volver</button></div>';

  obtenerDeDB('fotos', galSeleccionadas[0]).then(function(f) { if (f) document.getElementById('gal-comp-before').src = f.data; });
  obtenerDeDB('fotos', galSeleccionadas[1]).then(function(f) { if (f) document.getElementById('gal-comp-after').src = f.data; });

  // Slider
  var wrap = document.getElementById('gal-comp-wrap');
  var dragging = false;

  function updateSlider(x) {
    var rect = wrap.getBoundingClientRect();
    var pct = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    wrap.querySelector('.comp-slider-handle').style.left = pct + '%';
    wrap.querySelector('.comp-slider-line').style.left = pct + '%';
    document.getElementById('gal-comp-after').style.clipPath = 'inset(0 0 0 ' + pct + '%)';
  }

  wrap.querySelector('.comp-slider-handle').addEventListener('touchstart', function() { dragging = true; });
  wrap.querySelector('.comp-slider-handle').addEventListener('mousedown', function() { dragging = true; });
  wrap.addEventListener('touchmove', function(e) { if (dragging) updateSlider(e.touches[0].clientX); });
  wrap.addEventListener('mousemove', function(e) { if (dragging) updateSlider(e.clientX); });
  document.addEventListener('touchend', function() { dragging = false; });
  document.addEventListener('mouseup', function() { dragging = false; });
  wrap.addEventListener('click', function(e) { updateSlider(e.clientX); });

  galSeleccionadas = [];
}

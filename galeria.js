// ============================================================
// RAPCA Campo — galeria.js — Galería de fotos
// ============================================================

var galTab = 'todas';
var galSeleccionadas = [];

// Cargar foto desde servidor (fallback cuando no está en IndexedDB local)
function cargarFotoServidor(img, foto) {
  // Construir URL del servidor: /uploads/rapca/{tipo}/{unidad}/{codigo}.jpg
  var serverUrl = API_BASE + 'uploads/rapca/' + foto.tipo + '/' + foto.unidad + '/' + foto.codigo + '.jpg';
  img.onerror = function() {
    // Segundo intento: Cloudinary directo
    img.onerror = function() { img.alt = foto.codigo; };
    img.src = 'https://res.cloudinary.com/drnqs1jwl/image/upload/rapca/' + foto.tipo + '/' + foto.unidad + '/' + foto.codigo;
  };
  img.src = serverUrl;
}

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
  html += '<select id="gal-f-unidad" onchange="filtrarGaleria()"><option value="">Unidad</option>' + unidades.map(function(u) { return '<option>' + escapeHtml(u) + '</option>'; }).join('') + '</select>';
  html += '<select id="gal-f-tipo" onchange="filtrarGaleria()"><option value="">Tipo</option><option>VP</option><option>EL</option><option>EI</option></select>';
  html += '<input type="date" id="gal-f-fecha" onchange="filtrarGaleria()">';
  html += '</div>';

  // Barra de selección (siempre visible)
  html += '<div class="gal-select-bar">';
  html += '<span class="gal-sel-count" id="gal-sel-count">0</span>';
  html += '<span style="color:#666">seleccionadas</span>';
  html += '<span style="flex:1"></span>';
  html += '<button onclick="galSeleccionarTodas()">☑ Todas</button>';
  html += '<button onclick="galDeseleccionar()">☐ Ninguna</button>';
  html += '</div>';

  // Pista visual
  html += '<div style="text-align:center;margin-bottom:8px;font-size:12px;color:#999">Toca el ☑ de cada foto para seleccionarla</div>';

  // Acciones (descargar siempre, resto al seleccionar)
  html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
  html += '<button class="btn btn-sm btn-primary" onclick="galDescargarTodas()">📥 Descargar todas</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galEliminarTodas()" style="color:#e74c3c;border-color:#e74c3c">🗑️ Eliminar todas</button>';
  html += '</div>';

  // Acciones multi-selección
  html += '<div id="gal-multi-actions" style="display:none;margin-bottom:10px;gap:6px;flex-wrap:wrap">';
  html += '<button class="btn btn-sm btn-primary" onclick="galDescargarSel()">📥 Descargar selección</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galCompararSel()">🔀 Comparar</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="galEliminarSel()" style="color:#e74c3c;border-color:#e74c3c">🗑️ Eliminar selección</button>';
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

  // Pestaña Pre-caché: mostrar las fotos precargadas offline (antes esta
  // pestaña enseñaba lo mismo que "Todas" — no estaba implementada)
  if (galTab === 'precache') {
    galRenderPrecache(grid, unidad);
    return;
  }

  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (fecha) regs = regs.filter(function(r) { return r.fecha === fecha; });

  // Recopilar fotos
  var fotos = [];
  regs.forEach(function(r) {
    if (!r.datos) return;
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
    html += '<div class="gal-group-title">' + escapeHtml(unidad) + ' (' + grupos[unidad].length + ')</div>';
    grupos[unidad].forEach(function(f, i) {
      var selected = galSeleccionadas.indexOf(f.codigo) >= 0;
      html += '<div class="gal-item' + (selected ? ' selected' : '') + '" data-codigo="' + escapeHtml(f.codigo) + '">';
      html += '<img id="gal-img-' + f.codigo.replace(/[^a-zA-Z0-9]/g, '_') + '" src="" alt="' + escapeHtml(f.codigo) + '" onclick="galAbrirFoto(\'' + escapeJsAttr(f.codigo) + '\')">';
      html += '<div class="gal-check" onclick="event.stopPropagation();galToggleSel(\'' + escapeJsAttr(f.codigo) + '\',this.parentNode)">✓</div>';
      html += '</div>';
    });
  });

  grid.innerHTML = html;

  // Cargar thumbnails desde todas las fuentes (local, precarga, Cloudinary)
  fotos.forEach(function(f) {
    var imgId = 'gal-img-' + f.codigo.replace(/[^a-zA-Z0-9]/g, '_');
    buscarFotoData(f.codigo, f.tipo, f.unidad).then(function(data) {
      var img = document.getElementById(imgId);
      if (!img) return;
      if (data) {
        img.src = data;
      } else {
        // Último fallback con tag img directo
        cargarFotoServidor(img, f);
      }
    }).catch(function() {
      var img = document.getElementById(imgId);
      if (img) cargarFotoServidor(img, f);
    });
  });
  galActualizarUI();
}

// Render de la pestaña Pre-caché: fotos descargadas para uso offline
function galRenderPrecache(grid, unidadFiltro) {
  if (!db) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;padding:30px">Almacenamiento no disponible</div>';
    return;
  }
  obtenerTodosDB('fotos_precargadas').then(function(fotos) {
    fotos = fotos || [];
    if (unidadFiltro) fotos = fotos.filter(function(f) { return f.unidad === unidadFiltro; });
    if (fotos.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;padding:30px">Sin fotos precargadas.<br><small>Descárgalas desde el menú Precarga offline.</small></div>';
      return;
    }
    // Agrupar por unidad
    var grupos = {};
    fotos.forEach(function(f) {
      var u = f.unidad || 'Sin unidad';
      if (!grupos[u]) grupos[u] = [];
      grupos[u].push(f);
    });
    var html = '';
    Object.keys(grupos).sort().forEach(function(u) {
      html += '<div class="gal-group-title">' + escapeHtml(u) + ' (' + grupos[u].length + ')</div>';
      grupos[u].forEach(function(f) {
        var imgId = 'gal-pc-' + String(f.codigo).replace(/[^a-zA-Z0-9]/g, '_');
        html += '<div class="gal-item">';
        html += '<img id="' + imgId + '" src="" alt="' + escapeHtml(f.codigo) + '" onclick="galAbrirFotoPrecache(\'' + escapeJsAttr(f.codigo) + '\')">';
        html += '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:1px 4px;text-align:center">' + escapeHtml((f.waypoint || 'G') + (f.fecha ? ' · ' + f.fecha : '')) + '</div>';
        html += '</div>';
      });
    });
    grid.innerHTML = html;
    // Cargar los thumbnails (data URLs ya en local)
    fotos.forEach(function(f) {
      var img = document.getElementById('gal-pc-' + String(f.codigo).replace(/[^a-zA-Z0-9]/g, '_'));
      if (img && f.data) img.src = f.data;
    });
    galActualizarUI();
  }).catch(function(e) {
    console.warn('Error listando precargadas:', e);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;padding:30px">Error al leer las fotos precargadas</div>';
  });
}

function galAbrirFotoPrecache(codigo) {
  if (!db) return;
  obtenerDeDB('fotos_precargadas', codigo).then(function(f) {
    if (f && f.data) abrirLightboxFoto(f.data, codigo);
  }).catch(function() {});
}

function galAbrirFoto(codigo) {
  var imgId = 'gal-img-' + codigo.replace(/[^a-zA-Z0-9]/g, '_');
  var img = document.getElementById(imgId);
  if (img && img.src) abrirLightboxFoto(img.src, codigo);
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
  galActualizarUI();
}

function galSeleccionarTodas() {
  vibrar();
  galSeleccionadas = [];
  var items = document.querySelectorAll('.gal-item');
  for (var i = 0; i < items.length; i++) {
    var codigo = items[i].getAttribute('data-codigo');
    if (codigo) {
      galSeleccionadas.push(codigo);
      items[i].classList.add('selected');
    }
  }
  galActualizarUI();
}

function galDeseleccionar() {
  vibrar();
  galSeleccionadas = [];
  var items = document.querySelectorAll('.gal-item.selected');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
  galActualizarUI();
}

function galActualizarUI() {
  var n = galSeleccionadas.length;
  var counter = document.getElementById('gal-sel-count');
  if (counter) counter.textContent = n;
  var actions = document.getElementById('gal-multi-actions');
  if (actions) actions.style.display = n > 0 ? 'flex' : 'none';
}

async function galDescargarSel() {
  if (galSeleccionadas.length === 0) return;
  if (galSeleccionadas.length === 1) {
    // Intentar descargar desde la imagen visible (funciona con server URLs)
    var imgEl = document.getElementById('gal-img-' + galSeleccionadas[0].replace(/[^a-zA-Z0-9]/g, '_'));
    if (imgEl && imgEl.src) {
      var a = document.createElement('a');
      a.href = imgEl.src;
      a.download = galSeleccionadas[0] + '.jpg';
      a.click();
    }
    return;
  }
  // ZIP
  var zip = new JSZip();
  var noEncontradas = 0;
  for (var i = 0; i < galSeleccionadas.length; i++) {
    var cod = galSeleccionadas[i];
    var info = (typeof fotoInfoDesdeCodigo === 'function' && fotoInfoDesdeCodigo(cod)) || {};
    // Preferir resolución completa (local/nube); thumbnail como último recurso
    var data = await fotoMejorCalidad(cod, info.tipo, info.unidad).catch(function() { return null; });
    if (!(data && data.indexOf('data:') === 0)) data = await buscarFotoData(cod, info.tipo, info.unidad).catch(function() { return null; });
    if (data && data.indexOf('data:') === 0) {
      zip.file(cod + '.jpg', data.split(',')[1], {base64: true});
    } else {
      noEncontradas++;
    }
  }
  if (noEncontradas === galSeleccionadas.length) { showToast('No se pudo recuperar ninguna foto', 'error'); return; }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapca_fotos_seleccionadas.zip';
    a.click();
  });
  showToast(noEncontradas > 0 ? 'Descargando ZIP (' + noEncontradas + ' fotos no disponibles)...' : 'Descargando ZIP...', 'info');
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

  ['gal-comp-before', 'gal-comp-after'].forEach(function(elId, i) {
    var cod = galSeleccionadas[i];
    var info = (typeof fotoInfoDesdeCodigo === 'function' && fotoInfoDesdeCodigo(cod)) || {};
    buscarFotoData(cod, info.tipo, info.unidad).then(function(data) {
      var el = document.getElementById(elId);
      if (el && data) el.src = data;
      else if (!data) showToast('Foto ' + cod + ' no disponible en este dispositivo', 'info');
    }).catch(function() {});
  });

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
  wrap.addEventListener('click', function(e) { updateSlider(e.clientX); });

  // Listeners de fin de arrastre a nivel document: limpiar el anterior para no acumular
  if (window._galCompEndDrag) {
    document.removeEventListener('touchend', window._galCompEndDrag);
    document.removeEventListener('mouseup', window._galCompEndDrag);
  }
  window._galCompEndDrag = function() { dragging = false; };
  document.addEventListener('touchend', window._galCompEndDrag);
  document.addEventListener('mouseup', window._galCompEndDrag);

  galSeleccionadas = [];
}

// ============================================================
// ELIMINAR FOTOS
// ============================================================
function galEliminarSel() {
  if (galSeleccionadas.length === 0) return;
  var n = galSeleccionadas.length;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar ' + n + ' foto' + (n > 1 ? 's' : '') + '</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 16px">Se eliminarán de los registros y del dispositivo. Esta acción no se puede deshacer.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="galConfirmarEliminar()" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar definitivamente</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function galEliminarTodas() {
  // Seleccionar todas las fotos visibles y pedir confirmación
  galSeleccionarTodas();
  if (galSeleccionadas.length === 0) { showToast('No hay fotos para eliminar', 'error'); return; }
  var n = galSeleccionadas.length;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar TODAS las fotos</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px">Se eliminarán <strong>' + n + '</strong> foto' + (n > 1 ? 's' : '') + ' visibles.</p>';
  html += '<p style="font-size:13px;color:#e74c3c;margin:0 0 16px">⚠️ Esta acción no se puede deshacer.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="galConfirmarEliminar()" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar ' + n + ' fotos</button>';
  html += '<button class="btn btn-outline" onclick="galCancelarEliminarTodas()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function galCancelarEliminarTodas() {
  cerrarModal();
  galDeseleccionar();
}

function galConfirmarEliminar() {
  cerrarModal();
  var codigos = galSeleccionadas.slice();
  eliminarFotosDeCodigos(codigos);
  galSeleccionadas = [];
  showToast(codigos.length + ' foto(s) eliminada(s)', 'success');
  filtrarGaleria();
  var actions = document.getElementById('gal-multi-actions');
  if (actions) actions.style.display = 'none';
}

function eliminarFotoLB() {
  var foto = lightboxFotos[lightboxIdx];
  if (!foto || !foto.info) return;
  var codigo = foto.info;
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar foto</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px">' + escapeHtml(codigo) + '</p>';
  html += '<p style="font-size:13px;color:#888;margin:0 0 16px">Se eliminará del registro y del dispositivo.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="galConfirmarEliminarLB(\'' + escapeHtml(codigo) + '\')" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function galConfirmarEliminarLB(codigo) {
  cerrarModal();
  eliminarFotosDeCodigos([codigo]);
  showToast('Foto eliminada', 'success');
  cerrarLightbox();
  // Refrescar galería si está visible
  var galGrid = document.getElementById('gal-grid');
  if (galGrid) filtrarGaleria();
  // Quitar también la miniatura de los formularios abiertos: el lightbox
  // puede abrirse desde el preview de VP/EL/EI y la miniatura quedaba
  // huérfana como si la foto siguiera adjunta
  ['vp', 'el', 'ev'].forEach(function(prefix) {
    var grid = document.getElementById(prefix + '-fotos-preview');
    if (!grid) return;
    var imgs = grid.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].title === codigo || imgs[i].alt === codigo) imgs[i].remove();
    }
    if (typeof actualizarBtnEliminarFotos === 'function') actualizarBtnEliminarFotos(prefix);
  });
}

function eliminarFotosDeCodigos(codigos) {
  // Recopilar info de tipo/unidad para cada código antes de borrar
  var fotosInfo = [];
  registros.forEach(function(r) {
    if (!r.datos) return;
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(Boolean).forEach(function(cod) {
        if (codigos.indexOf(cod) >= 0) {
          fotosInfo.push({codigo: cod, tipo: r.tipo, unidad: r.unidad});
        }
      });
    }
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        if (codigos.indexOf(fc.numero) >= 0) {
          fotosInfo.push({codigo: fc.numero, tipo: r.tipo, unidad: r.unidad});
        }
      });
    }
  });

  // 1. Eliminar de los registros locales
  registros.forEach(function(r) {
    if (!r.datos) return;
    // Fotos generales (string separado por comas)
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      var lista = r.datos.fotos.split(',').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
      var nuevaLista = lista.filter(function(f) { return codigos.indexOf(f) < 0; });
      if (nuevaLista.length !== lista.length) {
        r.datos.fotos = nuevaLista.join(', ');
        r.enviado = false; // Marcar para re-sincronizar
      }
    }
    // Fotos comparativas (array de objetos)
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      var antes = r.datos.fotosComp.length;
      r.datos.fotosComp = r.datos.fotosComp.filter(function(fc) {
        return codigos.indexOf(fc.numero) < 0;
      });
      if (r.datos.fotosComp.length !== antes) {
        r.enviado = false; // Marcar para re-sincronizar
      }
    }
  });
  guardarRegistros();

  // 2. Eliminar de IndexedDB (thumbnails y subidas pendientes)
  codigos.forEach(function(codigo) {
    if (typeof eliminarDeDB === 'function') {
      eliminarDeDB('fotos', codigo);
      eliminarDeDB('subidas_pendientes', codigo);
      eliminarDeDB('fotos_locales', codigo);
      eliminarDeDB('waypoints_comp', codigo);
      eliminarDeDB('fotos_precargadas', codigo);
    }
  });

  // 3. Limpiar de fotosPagina actual (por si el formulario está abierto)
  ['G', 'W1', 'W2'].forEach(function(key) {
    if (fotosPagina[key]) {
      if (key === 'G') {
        fotosPagina[key] = fotosPagina[key].filter(function(f) {
          var cod = typeof f === 'string' ? f : f.codigo;
          return codigos.indexOf(cod) < 0;
        });
      } else {
        fotosPagina[key] = fotosPagina[key].filter(function(f) {
          return codigos.indexOf(f.codigo) < 0;
        });
      }
    }
  });

  // 4. Eliminar del servidor y Cloudinary
  if (fotosInfo.length > 0 && sesion && sesion.token) {
    // Deduplicar
    var vistos = {};
    var unicos = [];
    fotosInfo.forEach(function(f) {
      if (!vistos[f.codigo]) {
        vistos[f.codigo] = true;
        unicos.push(f);
      }
    });
    fetch(API_BASE + 'fotos.php?accion=eliminar', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sesion.token},
      body: JSON.stringify({codigos: unicos})
    }).then(function(resp) { return resp.json(); }).then(function(data) {
      if (data.ok) {
        console.log('Fotos eliminadas del servidor:', data.eliminadas);
        if (data.errores && data.errores.length > 0) console.warn('Errores al eliminar en nube:', data.errores);
      }
    }).catch(function(e) {
      console.warn('No se pudo eliminar fotos del servidor:', e.message);
    });
  }

  // 5. Re-sincronizar registros modificados al servidor
  if (sesion && sesion.token && !sesion.token.startsWith('local_')) {
    setTimeout(function() { sincronizar(); }, 500);
  }
}

async function galDescargarTodas() {
  var regs = misRegistros();
  var unidad = document.getElementById('gal-f-unidad').value;
  var tipo = document.getElementById('gal-f-tipo').value;
  var fecha = document.getElementById('gal-f-fecha').value;
  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (fecha) regs = regs.filter(function(r) { return r.fecha === fecha; });

  var items = [], vistos = {};
  regs.forEach(function(r) {
    if (!r.datos) return;
    if (r.datos.fotos) {
      r.datos.fotos.split(',').forEach(function(f) {
        var cod = f.trim();
        if (cod && !vistos[cod]) { vistos[cod] = true; items.push({codigo: cod, tipo: r.tipo, unidad: r.unidad}); }
      });
    }
    if (r.datos.fotosComp) {
      r.datos.fotosComp.forEach(function(fc) {
        if (fc.numero && !vistos[fc.numero]) { vistos[fc.numero] = true; items.push({codigo: fc.numero, tipo: r.tipo, unidad: r.unidad}); }
      });
    }
  });

  if (items.length === 0) { showToast('No hay fotos para descargar', 'error'); return; }

  showToast('Preparando ' + items.length + ' fotos...', 'info');
  var zip = new JSZip();
  var noEncontradas = 0;
  for (var i = 0; i < items.length; i++) {
    // Buscar en todas las fuentes (local, precarga, pendientes, Cloudinary),
    // igual que los thumbnails: antes solo se miraba el store local y el ZIP
    // salía incompleto sin aviso
    var data = await fotoMejorCalidad(items[i].codigo, items[i].tipo, items[i].unidad).catch(function() { return null; });
    if (!(data && data.indexOf('data:') === 0)) data = await buscarFotoData(items[i].codigo, items[i].tipo, items[i].unidad).catch(function() { return null; });
    if (data && data.indexOf('data:') === 0) {
      zip.file(items[i].codigo + '.jpg', data.split(',')[1], {base64: true});
    } else {
      noEncontradas++;
    }
  }
  if (noEncontradas === items.length) { showToast('No se pudo recuperar ninguna foto', 'error'); return; }
  zip.generateAsync({type: 'blob'}).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapca_galeria_fotos.zip';
    a.click();
    if (noEncontradas > 0) {
      showToast('Descarga completada: ' + (items.length - noEncontradas) + ' fotos (' + noEncontradas + ' no disponibles)', 'info');
    } else {
      showToast('Descarga completada', 'success');
    }
  });
}

// ============================================================
// RAPCA Campo — timeline.js — Historial cronológico
// ============================================================

function renderTimeline() {
  var content = document.getElementById('timeline-content');
  var regs = misRegistros();

  // Filtros
  var html = '<div class="tl-filters">';
  html += '<select id="tl-f-tipo" onchange="filtrarTimeline()"><option value="">Todos</option><option value="VP">VP</option><option value="EL">EL</option><option value="EI">EI</option></select>';

  var operadores = [];
  regs.forEach(function(r) { if (r.operador_nombre && operadores.indexOf(r.operador_nombre) < 0) operadores.push(r.operador_nombre); });
  html += '<select id="tl-f-operador" onchange="filtrarTimeline()"><option value="">Operador</option>' + operadores.map(function(o) { return '<option>' + escapeHtml(o) + '</option>'; }).join('') + '</select>';

  var zonas = [];
  regs.forEach(function(r) { if (r.zona && zonas.indexOf(r.zona) < 0) zonas.push(r.zona); });
  zonas.sort();
  html += '<select id="tl-f-zona" onchange="filtrarTimeline()"><option value="">Zona</option>' + zonas.map(function(z) { return '<option>' + escapeHtml(z) + '</option>'; }).join('') + '</select>';

  var unidades = [];
  regs.forEach(function(r) { if (r.unidad && unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  unidades.sort();
  html += '<select id="tl-f-unidad" onchange="filtrarTimeline()"><option value="">Unidad</option>' + unidades.map(function(u) { return '<option>' + escapeHtml(u) + '</option>'; }).join('') + '</select>';

  html += '<input type="date" id="tl-f-desde" onchange="filtrarTimeline()" title="Desde">';
  html += '<input type="date" id="tl-f-hasta" onchange="filtrarTimeline()" title="Hasta">';
  html += '</div>';

  html += '<div id="tl-lista"></div>';
  content.innerHTML = html;
  filtrarTimeline();
}

function filtrarTimeline() {
  var regs = misRegistros();
  var tipo = document.getElementById('tl-f-tipo').value;
  var operador = document.getElementById('tl-f-operador').value;
  var zona = document.getElementById('tl-f-zona').value;
  var unidad = document.getElementById('tl-f-unidad').value;
  var desde = document.getElementById('tl-f-desde').value;
  var hasta = document.getElementById('tl-f-hasta').value;

  if (tipo) regs = regs.filter(function(r) { return r.tipo === tipo; });
  if (operador) regs = regs.filter(function(r) { return r.operador_nombre === operador; });
  if (zona) regs = regs.filter(function(r) { return r.zona === zona; });
  if (unidad) regs = regs.filter(function(r) { return r.unidad === unidad; });
  if (desde) regs = regs.filter(function(r) { return r.fecha >= desde; });
  if (hasta) regs = regs.filter(function(r) { return r.fecha <= hasta; });

  regs.sort(function(a, b) { return b.id - a.id; });

  var lista = document.getElementById('tl-lista');
  if (regs.length === 0) {
    lista.innerHTML = '<div style="text-align:center;color:#888;padding:30px">Sin registros</div>';
    return;
  }

  lista.innerHTML = regs.map(function(r) {
    var badgeClass = 'badge-' + r.tipo.toLowerCase();
    var h = '<div class="tl-card" data-tipo="' + escapeHtml(r.tipo) + '"><div class="tl-content">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
    h += '<span class="badge ' + badgeClass + '">' + escapeHtml(r.tipo) + '</span>';
    h += '<strong>' + escapeHtml(r.unidad) + '</strong>';
    if (r.transecto) h += '<span style="font-size:12px;color:#888">' + escapeHtml(r.transecto) + '</span>';
    h += '</div>';
    h += '<div style="font-size:12px;color:#888">' + escapeHtml(r.fecha) + ' · ' + escapeHtml(r.operador_nombre || '') + '</div>';
    if (r.datos && r.datos.observaciones) h += '<div style="font-size:13px;margin-top:4px">' + escapeHtml(r.datos.observaciones.substring(0, 100)) + '</div>';

    // Thumbnails de fotos (generales + comparativas)
    var todosCodigosFotos = [];
    if (r.datos.fotos) {
      r.datos.fotos.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(cod) {
        todosCodigosFotos.push(cod);
      });
    }
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        if (fc.numero) todosCodigosFotos.push(fc.numero);
      });
    }
    if (todosCodigosFotos.length > 0) {
      h += '<div class="tl-thumbs" id="tl-thumbs-' + r.id + '">';
      todosCodigosFotos.forEach(function(cod) {
        h += '<img data-codigo="' + escapeHtml(cod) + '" data-tipo="' + escapeHtml(r.tipo) + '" data-unidad="' + escapeHtml(r.unidad) + '" src="" alt="' + escapeHtml(cod) + '" onclick="if(this.src)abrirLightboxFoto(this.src,\'' + escapeHtml(cod) + '\')">';
      });
      h += '</div>';
    }

    // Acciones
    h += '<div class="tl-actions">';
    h += '<button class="btn btn-sm btn-outline" onclick="editarRegistro(' + r.id + ')">✏️ Editar</button>';
    h += '<button class="btn btn-sm btn-outline" onclick="tlEliminarRegistro(' + r.id + ')" style="color:#e74c3c;border-color:#e74c3c">🗑️ Eliminar</button>';
    h += '</div>';

    h += '</div></div>';
    return h;
  }).join('');

  // Cargar thumbnails desde IndexedDB
  cargarThumbsTimeline(regs);
}

function tlEliminarRegistro(id) {
  var r = misRegistros().find(function(r) { return r.id == id; });
  if (!r) { showToast('No tienes acceso a este registro', 'error'); return; }
  var html = '<div style="text-align:center;padding:8px 0">';
  html += '<div style="font-size:36px;margin-bottom:8px">🗑️</div>';
  html += '<h2 style="margin:0 0 8px;font-size:17px;color:#333">Eliminar registro</h2>';
  html += '<p style="font-size:13px;color:#666;margin:0 0 4px"><strong>' + escapeHtml(r.tipo) + '</strong> — ' + escapeHtml(r.unidad) + '</p>';
  html += '<p style="font-size:12px;color:#888;margin:0 0 16px">' + escapeHtml(r.fecha) + ' · ' + escapeHtml(r.operador_nombre || '') + '</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn btn-primary" onclick="tlConfirmarEliminar(' + id + ')" style="background:#e74c3c;padding:12px;font-size:14px;border-radius:8px">🗑️ Eliminar definitivamente</button>';
  html += '<button class="btn btn-outline" onclick="cerrarModal()" style="padding:12px;font-size:14px;border-radius:8px">Cancelar</button>';
  html += '</div></div>';
  abrirModal(html);
}

function tlConfirmarEliminar(id) {
  cerrarModal();
  registros = registros.filter(function(r) { return r.id != id; });
  guardarRegistros();
  filtrarTimeline();
  showToast('Registro eliminado', 'success');
}

function cargarThumbsTimeline(regs) {
  if (!db) return;
  regs.forEach(function(r) {
    var container = document.getElementById('tl-thumbs-' + r.id);
    if (!container) return;
    var imgs = container.querySelectorAll('img[data-codigo]');
    for (var i = 0; i < imgs.length; i++) {
      (function(img) {
        var cod = img.dataset.codigo;
        var tipo = img.dataset.tipo || r.tipo;
        var unidad = img.dataset.unidad || r.unidad;
        buscarFotoData(cod, tipo, unidad).then(function(data) {
          if (data) {
            img.src = data;
          } else {
            // Fallback: intentar directamente desde servidor
            var serverUrl = API_BASE + 'uploads/rapca/' + tipo + '/' + unidad + '/' + cod + '.jpg';
            img.onerror = function() {
              img.onerror = null;
              img.src = 'https://res.cloudinary.com/drnqs1jwl/image/upload/w_120,q_60/rapca/' + tipo + '/' + unidad + '/' + cod;
              img.onerror = function() { img.style.display = 'none'; };
            };
            img.src = serverUrl;
          }
        }).catch(function() {
          img.style.display = 'none';
        });
      })(imgs[i]);
    }
  });
}

// ============================================================
// RAPCA Campo — precarga.js — Precarga offline de fotos
// ============================================================

// ============================================================
// PRECARGA OFFLINE DE FOTOS
// ============================================================

var precargaFotosListadas = [];
var precargaDescargando = false;

function irPrecarga() {
  if (sesion && sesion.rol === 'admin') {
    showToast('Función disponible solo para operadores', 'info');
    irPagina('menu');
    return;
  }
  if (!navigator.onLine) {
    showToast('Necesitas conexión para precargar fotos', 'error');
    return;
  }
  actualizarEstadoPrecarga();
  cargarZonasPrecarga();
}

function actualizarEstadoPrecarga() {
  if (!db) return;
  obtenerTodosDB('fotos_precargadas').then(function(fotos) {
    var estado = document.getElementById('precarga-estado');
    var count = document.getElementById('precarga-count');
    if (fotos.length > 0) {
      count.textContent = fotos.length;
      estado.style.display = 'block';
      mostrarGaleriaPrecarga(fotos);
    } else {
      estado.style.display = 'none';
      document.getElementById('precarga-galeria').style.display = 'none';
    }
  }).catch(function(e) {
    console.warn('Error al obtener fotos precargadas:', e);
  });
}

function cargarZonasPrecarga() {
  var select = document.getElementById('precarga-zona');
  // Obtener zonas desde los registros locales
  var zonasMap = {};
  misRegistros().forEach(function(r) {
    var zona = r.zona || (r.unidad ? r.unidad.substring(0, 5) : '');
    if (!zona) return;
    if (!zonasMap[zona]) zonasMap[zona] = {};
    if (r.unidad) {
      if (!zonasMap[zona][r.unidad]) zonasMap[zona][r.unidad] = 0;
      zonasMap[zona][r.unidad]++;
    }
  });

  // También intentar desde servidor
  fetch(API_BASE + 'fotos.php?accion=zonas', {
    headers: {'Authorization': 'Bearer ' + (sesion ? sesion.token : '')}
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.ok && data.zonas) {
      Object.keys(data.zonas).forEach(function(zona) {
        if (!zonasMap[zona]) zonasMap[zona] = {};
        data.zonas[zona].forEach(function(u) {
          if (!zonasMap[zona][u.unidad]) zonasMap[zona][u.unidad] = 0;
          zonasMap[zona][u.unidad] += u.registros;
        });
      });
    }
    renderZonasPrecarga(select, zonasMap);
  }).catch(function() {
    renderZonasPrecarga(select, zonasMap);
  });
}

function renderZonasPrecarga(select, zonasMap) {
  select.innerHTML = '<option value="">-- Selecciona zona --</option>';
  Object.keys(zonasMap).sort().forEach(function(zona) {
    var nUnidades = Object.keys(zonasMap[zona]).length;
    var opt = document.createElement('option');
    opt.value = zona;
    opt.textContent = zona + ' (' + nUnidades + ' unidades)';
    opt.dataset.unidades = JSON.stringify(zonasMap[zona]);
    select.appendChild(opt);
  });
}

function precargaSeleccionarZona(zona) {
  var divUnidades = document.getElementById('precarga-unidades');
  var divInfo = document.getElementById('precarga-fotos-info');
  divInfo.style.display = 'none';
  precargaFotosListadas = [];

  if (!zona) {
    divUnidades.style.display = 'none';
    return;
  }

  var select = document.getElementById('precarga-zona');
  var opt = select.options[select.selectedIndex];
  var unidades = JSON.parse(opt.dataset.unidades || '{}');

  var lista = document.getElementById('precarga-unidades-lista');
  lista.innerHTML = '';

  Object.keys(unidades).sort().forEach(function(unidad) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.style.cssText = 'background:#607d8b;color:#fff;border-radius:12px;padding:6px 14px';
    btn.textContent = unidad + ' (' + unidades[unidad] + ' reg.)';
    btn.dataset.unidad = unidad;
    btn.dataset.selected = 'false';
    btn.onclick = function() {
      if (this.dataset.selected === 'true') {
        this.dataset.selected = 'false';
        this.style.background = '#607d8b';
      } else {
        this.dataset.selected = 'true';
        this.style.background = '#2196f3';
      }
      precargaListarFotos(zona);
    };
    lista.appendChild(btn);
  });

  // Botón seleccionar toda la zona
  var btnTodo = document.createElement('button');
  btnTodo.className = 'btn btn-sm';
  btnTodo.style.cssText = 'background:#ff9800;color:#fff;border-radius:12px;padding:6px 14px;font-weight:600';
  btnTodo.textContent = 'Toda la zona';
  btnTodo.onclick = function() {
    var btns = lista.querySelectorAll('button[data-unidad]');
    btns.forEach(function(b) { b.dataset.selected = 'true'; b.style.background = '#2196f3'; });
    precargaListarFotos(zona);
  };
  lista.insertBefore(btnTodo, lista.firstChild);

  divUnidades.style.display = 'block';
}

function precargaListarFotos(zona) {
  var btns = document.getElementById('precarga-unidades-lista').querySelectorAll('button[data-unidad]');
  var unidadesSeleccionadas = [];
  btns.forEach(function(b) {
    if (b.dataset.selected === 'true') unidadesSeleccionadas.push(b.dataset.unidad);
  });

  if (unidadesSeleccionadas.length === 0) {
    document.getElementById('precarga-fotos-info').style.display = 'none';
    precargaFotosListadas = [];
    return;
  }

  // Buscar fotos en registros locales
  var fotosEncontradas = [];
  var codigosVistos = {};

  misRegistros().forEach(function(r) {
    if (unidadesSeleccionadas.indexOf(r.unidad) === -1) return;
    if (!r.datos) return;

    // Fotos comparativas
    if (r.datos.fotosComp) {
      r.datos.fotosComp.forEach(function(fc) {
        var cod = fc.numero || '';
        if (!cod || codigosVistos[cod]) return;
        codigosVistos[cod] = true;
        fotosEncontradas.push({
          codigo: cod,
          tipo: r.tipo,
          fecha: r.fecha,
          unidad: r.unidad,
          waypoint: fc.waypoint || '',
          lat: fc.lat || null,
          lon: fc.lon || null
        });
      });
    }

    // Fotos generales
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').forEach(function(cod) {
        cod = cod.trim();
        if (!cod || codigosVistos[cod]) return;
        codigosVistos[cod] = true;
        fotosEncontradas.push({
          codigo: cod,
          tipo: r.tipo,
          fecha: r.fecha,
          unidad: r.unidad,
          waypoint: 'G',
          lat: null,
          lon: null
        });
      });
    }
  });

  // También intentar listar desde el servidor
  var promises = unidadesSeleccionadas.map(function(unidad) {
    return fetch(API_BASE + 'fotos.php?accion=listar&unidad=' + encodeURIComponent(unidad), {
      headers: {'Authorization': 'Bearer ' + (sesion ? sesion.token : '')}
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.ok && data.fotos) {
        data.fotos.forEach(function(f) {
          if (codigosVistos[f.codigo]) return;
          codigosVistos[f.codigo] = true;
          fotosEncontradas.push(f);
        });
      }
    }).catch(function() {});
  });

  Promise.all(promises).then(function() {
    precargaFotosListadas = fotosEncontradas;
    var nComp = fotosEncontradas.filter(function(f) { return f.waypoint === 'W1' || f.waypoint === 'W2'; }).length;
    var nGen = fotosEncontradas.length - nComp;

    var resumen = document.getElementById('precarga-fotos-resumen');
    resumen.innerHTML = '<strong>' + fotosEncontradas.length + ' fotos</strong> encontradas (' + nComp + ' comparativas, ' + nGen + ' generales)';

    document.getElementById('precarga-fotos-info').style.display = fotosEncontradas.length > 0 ? 'block' : 'none';

    // Marcar las que ya están precargadas
    if (db) {
      obtenerTodosDB('fotos_precargadas').then(function(existentes) {
        var existentesMap = {};
        existentes.forEach(function(e) { existentesMap[e.codigo] = true; });
        var nuevas = fotosEncontradas.filter(function(f) { return !existentesMap[f.codigo]; });
        if (nuevas.length < fotosEncontradas.length) {
          resumen.innerHTML += '<br><small>' + (fotosEncontradas.length - nuevas.length) + ' ya precargadas, ' + nuevas.length + ' nuevas</small>';
        }
      }).catch(function(e) {
        console.warn('Error verificando fotos precargadas:', e);
      });
    }
  }).catch(function(e) {
    console.warn('Error listando fotos para precarga:', e);
    showToast('Error al listar fotos del servidor', 'error');
  });
}

function precargaDescargarTodo() {
  precargaDescargar(precargaFotosListadas);
}

function precargaDescargarComp() {
  var comp = precargaFotosListadas.filter(function(f) { return f.waypoint === 'W1' || f.waypoint === 'W2'; });
  precargaDescargar(comp);
}

async function precargaDescargar(listaFotos) {
  if (precargaDescargando) { showToast('Ya hay una descarga en curso', 'info'); return; }
  if (listaFotos.length === 0) { showToast('No hay fotos para descargar', 'info'); return; }
  if (!db) { showToast('Base de datos no disponible', 'error'); return; }

  // Filtrar las que ya tenemos
  var existentes = await obtenerTodosDB('fotos_precargadas');
  var existentesMap = {};
  existentes.forEach(function(e) { existentesMap[e.codigo] = true; });
  var nuevas = listaFotos.filter(function(f) { return !existentesMap[f.codigo]; });

  if (nuevas.length === 0) {
    showToast('Todas las fotos ya están precargadas', 'success');
    return;
  }

  precargaDescargando = true;
  var progreso = document.getElementById('precarga-progreso');
  var barra = document.getElementById('precarga-barra');
  var texto = document.getElementById('precarga-progreso-texto');
  progreso.style.display = 'block';

  var descargadas = 0;
  var errores = 0;
  var total = nuevas.length;

  // Descargar en lotes de 5
  for (var i = 0; i < nuevas.length; i += 5) {
    var lote = nuevas.slice(i, i + 5);

    try {
      var resp = await fetch(API_BASE + 'fotos.php?accion=descargar_lote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (sesion ? sesion.token : '')
        },
        body: JSON.stringify({fotos: lote})
      });

      var data = await resp.json();

      if (data.ok && data.fotos) {
        for (var j = 0; j < data.fotos.length; j++) {
          var foto = data.fotos[j];
          await guardarEnDB('fotos_precargadas', {
            codigo: foto.codigo,
            data: foto.data,
            tipo: foto.tipo,
            unidad: foto.unidad,
            zona: foto.unidad ? foto.unidad.substring(0, 5) : '',
            waypoint: foto.waypoint,
            fecha: foto.fecha,
            lat: foto.lat,
            lon: foto.lon,
            descargado: Date.now()
          });
          descargadas++;
        }
        // Fotos del lote que no se descargaron
        errores += lote.length - data.fotos.length;
      } else {
        errores += lote.length;
      }
    } catch(e) {
      console.warn('Error descargando lote:', e);
      errores += lote.length;
    }

    var pct = Math.round(((descargadas + errores) / total) * 100);
    barra.style.width = pct + '%';
    texto.textContent = descargadas + '/' + total + ' descargadas' + (errores > 0 ? ' (' + errores + ' errores)' : '');
  }

  precargaDescargando = false;
  texto.textContent = 'Completado: ' + descargadas + ' fotos descargadas' + (errores > 0 ? ', ' + errores + ' errores' : '');
  showToast(descargadas + ' fotos precargadas para uso offline', 'success');

  actualizarEstadoPrecarga();
}

function limpiarPrecarga() {
  if (!confirm('¿Borrar todas las fotos precargadas?')) return;
  if (!db) return;
  var tx = db.transaction('fotos_precargadas', 'readwrite');
  tx.objectStore('fotos_precargadas').clear();
  tx.oncomplete = function() {
    showToast('Fotos precargadas eliminadas', 'info');
    actualizarEstadoPrecarga();
  };
}

function mostrarGaleriaPrecarga(fotos) {
  var galeria = document.getElementById('precarga-galeria');
  var grid = document.getElementById('precarga-galeria-grid');
  if (!fotos || fotos.length === 0) { galeria.style.display = 'none'; return; }

  galeria.style.display = 'block';
  grid.innerHTML = '';

  // Agrupar por unidad
  var porUnidad = {};
  fotos.forEach(function(f) {
    if (!porUnidad[f.unidad]) porUnidad[f.unidad] = [];
    porUnidad[f.unidad].push(f);
  });

  Object.keys(porUnidad).sort().forEach(function(unidad) {
    var header = document.createElement('div');
    header.style.cssText = 'grid-column:1/-1;font-weight:600;font-size:14px;margin-top:8px;color:#607d8b';
    header.textContent = unidad + ' (' + porUnidad[unidad].length + ')';
    grid.appendChild(header);

    porUnidad[unidad].forEach(function(f) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;border-radius:6px;overflow:hidden;aspect-ratio:3/4;cursor:pointer';
      var img = document.createElement('img');
      img.src = f.data;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      img.onclick = function() { abrirLightboxFoto(f.data, f.codigo + ' (' + f.fecha + ')'); };
      wrap.appendChild(img);

      var badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:2px 4px;text-align:center';
      badge.textContent = (f.waypoint || 'G') + ' · ' + (f.fecha || '');
      wrap.appendChild(badge);

      grid.appendChild(wrap);
    });
  });
}


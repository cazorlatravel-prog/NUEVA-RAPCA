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
    irPagina('menu');
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
    var dm = document.getElementById('precarga-mapas');
    if (dm) dm.style.display = 'none';
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
  var divMapas = document.getElementById('precarga-mapas');
  if (divMapas) divMapas.style.display = 'block';
  actualizarEstimacionMapas();
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
    actualizarEstimacionMapas();
    return;
  }
  actualizarEstimacionMapas();

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

  // También intentar listar desde el servidor (y recordar qué códigos tiene:
  // las fotos generales nuevas viven solo en el teléfono que las hizo y
  // pedirlas al servidor contaba "errores" eternos en cada precarga)
  var codigosServidor = {};
  var servidorRespondio = false;
  var promises = unidadesSeleccionadas.map(function(unidad) {
    return fetch(API_BASE + 'fotos.php?accion=listar&unidad=' + encodeURIComponent(unidad), {
      headers: {'Authorization': 'Bearer ' + (sesion ? sesion.token : '')}
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.ok && data.fotos) {
        servidorRespondio = true;
        data.fotos.forEach(function(f) {
          codigosServidor[f.codigo] = true;
          if (codigosVistos[f.codigo]) return;
          codigosVistos[f.codigo] = true;
          fotosEncontradas.push(f);
        });
      }
    }).catch(function() {});
  });

  Promise.all(promises).then(function() {
    // Excluir las generales que el servidor no tiene (solo si respondió:
    // sin respuesta no podemos distinguir y se mantiene la lista completa)
    var soloEnOrigen = 0;
    if (servidorRespondio) {
      fotosEncontradas = fotosEncontradas.filter(function(f) {
        if ((f.waypoint || 'G') !== 'G') return true;
        if (codigosServidor[f.codigo]) return true;
        soloEnOrigen++;
        return false;
      });
    }
    precargaFotosListadas = fotosEncontradas;
    var nComp = fotosEncontradas.filter(function(f) { return f.waypoint === 'W1' || f.waypoint === 'W2'; }).length;
    var nGen = fotosEncontradas.length - nComp;

    var resumen = document.getElementById('precarga-fotos-resumen');
    resumen.innerHTML = '<strong>' + fotosEncontradas.length + ' fotos</strong> encontradas (' + nComp + ' comparativas, ' + nGen + ' generales)' +
      (soloEnOrigen ? '<br><small style="color:#888">' + soloEnOrigen + ' generales solo en el teléfono que las hizo (no descargables)</small>' : '');

    document.getElementById('precarga-fotos-info').style.display = fotosEncontradas.length > 0 ? 'block' : 'none';

    // Marcar las que ya están precargadas
    if (db) {
      obtenerClavesDB('fotos_precargadas').then(function(clavesExist) {
        var existentes = clavesExist.map(function(c) { return {codigo: c}; });
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
  if (typeof precargaMapasDescargando !== 'undefined' && precargaMapasDescargando) { showToast('Espera a que termine la descarga de mapas', 'info'); return; }
  if (listaFotos.length === 0) { showToast('No hay fotos para descargar', 'info'); return; }
  if (!db) { showToast('Base de datos no disponible', 'error'); return; }

  // Filtrar las que ya tenemos
  var clavesExistentes = await obtenerClavesDB('fotos_precargadas');
  var existentes = clavesExistentes.map(function(c) { return {codigo: c}; });
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
  confirmarAccion('Borrar precarga', '¿Borrar todas las fotos precargadas?', '🗑️ Borrar', function() { _limpiarPrecargaConfirmado(); });
}

function _limpiarPrecargaConfirmado() {
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
      // Pasar el código limpio: con ' (fecha)' pegado, "Eliminar" del lightbox
      // no borraba nada y la mejora a HD generaba URLs inválidas
      img.onclick = function() { abrirLightboxFoto(f.data, f.codigo); };
      wrap.appendChild(img);

      var badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:2px 4px;text-align:center';
      badge.textContent = (f.waypoint || 'G') + ' · ' + (f.fecha || '');
      wrap.appendChild(badge);

      grid.appendChild(wrap);
    });
  });
}

// ============================================================
// CARTOGRAFÍA OFFLINE — precarga de teselas de mapa por zona
// El Service Worker cachea toda petición de tesela (cache-first para
// orígenes externos): basta con pedirlas una vez con conexión para que
// el mapa y el mini-mapa de las fotos funcionen luego sin cobertura.
// ============================================================

var PRECARGA_CAPAS = {
  osm: {
    nombre: 'Mapa base',
    // Réplica de la elección de subdominio de Leaflet: (x+y) % 3 → a/b/c
    url: function(z, x, y) {
      var s = 'abc'[Math.abs(x + y) % 3];
      return 'https://' + s + '.tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    }
  },
  topo: {
    nombre: 'Topográfico IGN',
    url: function(z, x, y) {
      return 'https://www.ign.es/wmts/mapa-raster?layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix=' + z + '&TileCol=' + x + '&TileRow=' + y;
    }
  },
  orto: {
    nombre: 'Ortofoto PNOA',
    url: function(z, x, y) {
      return 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix=' + z + '&TileCol=' + x + '&TileRow=' + y;
    }
  }
};

function _tileXY(lat, lon, z) {
  var n = Math.pow(2, z);
  var x = Math.floor((lon + 180) / 360 * n);
  var latRad = lat * Math.PI / 180;
  var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return {x: x, y: y};
}

// Puntos (lat/lon) conocidos de las unidades seleccionadas: registros,
// fotos comparativas, infraestructuras y waypoints persistentes
function precargaPuntosSeleccionados() {
  var btns = document.getElementById('precarga-unidades-lista');
  var unidades = [];
  if (btns) {
    btns.querySelectorAll('button[data-unidad]').forEach(function(b) {
      if (b.dataset.selected === 'true') unidades.push(b.dataset.unidad);
    });
  }
  var puntos = [];
  function add(lat, lon) {
    if (typeof lat === 'number' && typeof lon === 'number' && lat && lon) puntos.push({lat: lat, lon: lon});
  }
  misRegistros().forEach(function(r) {
    if (unidades.indexOf(r.unidad) < 0) return;
    add(r.lat, r.lon);
    if (r.datos && r.datos.fotosComp) {
      r.datos.fotosComp.forEach(function(fc) { add(fc.lat, fc.lon); });
    }
  });
  (infraestructuras || []).forEach(function(inf) {
    if (unidades.indexOf(inf.idUnidad) >= 0) add(parseFloat(inf.lat), parseFloat(inf.lon));
  });
  if (!db) return Promise.resolve({unidades: unidades, puntos: puntos});
  return obtenerTodosDB('waypoints_comp').then(function(wps) {
    (wps || []).forEach(function(w) {
      if (unidades.indexOf(w.unidad) >= 0) add(w.lat, w.lon);
    });
    return {unidades: unidades, puntos: puntos};
  }).catch(function() { return {unidades: unidades, puntos: puntos}; });
}

// URLs de teselas alrededor de los puntos: zooms 12-16 (+ zoom del
// mini-mapa configurado) con radio creciente por zoom
function _urlsTilesParaPuntos(puntos, capas) {
  var cfg = typeof obtenerConfigWatermark === 'function' ? obtenerConfigWatermark() : {escalaMiniMapa: 14};
  var zooms = [12, 13, 14, 15, 16];
  var zMini = parseInt(cfg.escalaMiniMapa) || 14;
  if (zooms.indexOf(zMini) < 0) zooms.push(zMini);
  var radios = {12: 1, 13: 1, 14: 1, 15: 2, 16: 2, 17: 2, 18: 2};

  var urls = {};
  puntos.forEach(function(p) {
    zooms.forEach(function(z) {
      var c = _tileXY(p.lat, p.lon, z);
      var r = radios[z] || 1;
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          capas.forEach(function(capa) {
            urls[PRECARGA_CAPAS[capa].url(z, c.x + dx, c.y + dy)] = true;
          });
        }
      }
    });
  });
  return Object.keys(urls);
}

function _capasSeleccionadas() {
  var capas = [];
  if ((document.getElementById('pc-capa-osm') || {}).checked) capas.push('osm');
  if ((document.getElementById('pc-capa-topo') || {}).checked) capas.push('topo');
  if ((document.getElementById('pc-capa-orto') || {}).checked) capas.push('orto');
  return capas;
}

var _estimacionMapasGen = 0;
function actualizarEstimacionMapas() {
  var info = document.getElementById('precarga-mapas-info');
  var btn = document.getElementById('precarga-btn-mapas');
  if (!info) return;
  var gen = ++_estimacionMapasGen;
  precargaPuntosSeleccionados().then(function(res) {
    if (gen !== _estimacionMapasGen) return;
    if (res.unidades.length === 0) {
      info.textContent = 'Selecciona unidades para calcular la descarga';
      if (btn) btn.disabled = true;
      return;
    }
    if (res.puntos.length === 0) {
      info.textContent = 'Las unidades seleccionadas no tienen coordenadas conocidas (visítalas una vez con GPS)';
      if (btn) btn.disabled = true;
      return;
    }
    var capas = _capasSeleccionadas();
    if (capas.length === 0) {
      info.textContent = 'Marca al menos una capa de mapa';
      if (btn) btn.disabled = true;
      return;
    }
    var urls = _urlsTilesParaPuntos(res.puntos, capas);
    var mb = (urls.length * 18 / 1024).toFixed(1); // ~18 KB por tesela
    info.textContent = res.puntos.length + ' puntos · ' + urls.length + ' teselas (~' + mb + ' MB)';
    if (btn) btn.disabled = !!precargaMapasDescargando;
  });
}

var precargaMapasDescargando = false;
function precargaDescargarMapas() {
  if (precargaMapasDescargando) return;
  if (precargaDescargando) { showToast('Espera a que termine la descarga de fotos', 'info'); return; }
  if (!navigator.onLine) { showToast('Necesitas conexión para descargar los mapas', 'error'); return; }
  precargaPuntosSeleccionados().then(function(res) {
    if (res.puntos.length === 0) { showToast('Sin coordenadas para estas unidades', 'error'); return; }
    var capas = _capasSeleccionadas();
    if (capas.length === 0) { showToast('Marca al menos una capa de mapa', 'error'); return; }
    var urls = _urlsTilesParaPuntos(res.puntos, capas);
    var MAX_TILES = 4000;
    if (urls.length > MAX_TILES) {
      urls = urls.slice(0, MAX_TILES);
      showToast('Zona muy grande: se descargan las primeras ' + MAX_TILES + ' teselas', 'info');
    }

    precargaMapasDescargando = true;
    var btn = document.getElementById('precarga-btn-mapas');
    if (btn) btn.disabled = true;
    var prog = document.getElementById('precarga-progreso');
    var barra = document.getElementById('precarga-barra');
    var texto = document.getElementById('precarga-progreso-texto');
    if (prog) prog.style.display = 'block';

    var total = urls.length, hechas = 0, exitos = 0, fallos = 0;
    var CONCURRENCIA = 6;
    var idx = 0;

    function actualizar() {
      if (barra) barra.style.width = Math.round(hechas / total * 100) + '%';
      if (texto) texto.textContent = 'Mapas: ' + hechas + ' / ' + total + ' teselas' + (fallos ? ' (' + fallos + ' fallos)' : '');
    }

    function siguiente() {
      if (idx >= total) return Promise.resolve();
      var url = urls[idx++];
      // La petición pasa por el Service Worker, que la guarda en caché:
      // esa misma URL se servirá offline en el mapa y el mini-mapa
      return fetch(url, {mode: 'cors', cache: 'reload'}).then(function(resp) {
        if (resp && resp.ok) exitos++; else fallos++;
      }).catch(function() { fallos++; }).then(function() {
        hechas++;
        if (hechas % 10 === 0 || hechas === total) actualizar();
        return siguiente();
      });
    }

    actualizar();
    var trabajadores = [];
    for (var i = 0; i < CONCURRENCIA; i++) trabajadores.push(siguiente());
    Promise.all(trabajadores).then(function() {
      precargaMapasDescargando = false;
      if (btn) btn.disabled = false;
      if (prog) setTimeout(function() {
        if (!precargaDescargando && !precargaMapasDescargando) prog.style.display = 'none';
      }, 2500);
      if (fallos === 0) {
        showToast('Cartografía descargada: ' + exitos + ' teselas listas para usar sin cobertura', 'success', 5000);
      } else if (exitos > 0) {
        showToast('Cartografía: ' + exitos + ' teselas descargadas, ' + fallos + ' fallaron (reintenta con mejor conexión)', 'info', 5000);
      } else {
        showToast('No se pudo descargar la cartografía. Comprueba la conexión.', 'error');
      }
    });
  });
}

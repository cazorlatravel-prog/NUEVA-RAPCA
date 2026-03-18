// ============================================================
// RAPCA Campo — map.js — Mapa, KML, GPS, exportaciones geo
// ============================================================

// Capa persistente de waypoints comparativos
var capaWaypointsPersist = null;
// Capa de infraestructuras KML
var capaInfraKML = null;
var infraKMLFeatures = []; // Array de {nombre, lat, lon, attrs}
var gpxCapas = []; // Array de {nombre, layer}

// GPS tracking del operador en mapa
var gpsMapMarker = null;
var gpsMapCircle = null;
var gpsMapWatchId = null;

function initMapa() {
  if (mapa) { mapa.invalidateSize(); actualizarMarcadores(); return; }
  var mapDiv = document.getElementById('map-container');
  mapa = L.map(mapDiv, {zoomControl: false}).setView([37.78, -3.79], 10);

  // Basemaps
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OSM', maxZoom: 19});
  var pnoa = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {attribution: '© IGN PNOA', maxZoom: 19});
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {attribution: '© OpenTopoMap', maxZoom: 17});
  osm.addTo(mapa);

  // Capa de fotos comparativas (W1/W2)
  capaFotosComp = L.layerGroup();
  // Capa persistente de waypoints
  capaWaypointsPersist = L.layerGroup();
  // Capa de infraestructuras KML
  capaInfraKML = L.layerGroup();

  L.control.layers(
    {'OpenStreetMap': osm, 'PNOA Ortofoto': pnoa, 'Topográfico': topo},
    {'Fotos comparativas W1/W2': capaFotosComp, 'Waypoints persistentes': capaWaypointsPersist, 'Infraestructuras KML': capaInfraKML},
    {position: 'topright'}
  ).addTo(mapa);
  L.control.zoom({position: 'topright'}).addTo(mapa);

  // MarkerCluster
  mapaMarkers = L.markerClusterGroup();
  mapa.addLayer(mapaMarkers);
  mapa.addLayer(capaFotosComp);
  mapa.addLayer(capaWaypointsPersist);
  mapa.addLayer(capaInfraKML);

  actualizarMarcadores();
  cargarCapasKML();
  cargarWaypointsPersistentes();
  cargarInfraKMLGuardada();

  // Iniciar tracking GPS automático del operador
  iniciarGPSMapa();
}

function actualizarMarcadores() {
  if (!mapaMarkers) return;
  mapaMarkers.clearLayers();
  var regs = misRegistros();
  var colores = {VP: '#88d8b0', EL: '#2ecc71', EI: '#fd9853'};

  for (var i = 0; i < regs.length; i++) {
    var r = regs[i];
    if (!r.lat || !r.lon) continue;
    var color = colores[r.tipo] || '#888';
    var marker = L.circleMarker([r.lat, r.lon], {radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9});
    var primerFoto = r.datos && r.datos.fotos ? r.datos.fotos.split(',')[0].trim() : '';
    var popupHtml = '<strong>' + escapeHtml(r.tipo) + '</strong><br>' + escapeHtml(r.unidad) + '<br>' + escapeHtml(r.fecha) + '<br><small>' + escapeHtml(r.operador_nombre || '') + '</small>';
    if (primerFoto) {
      popupHtml += '<div id="popup-foto-' + r.id + '" style="margin-top:6px;text-align:center"><span style="color:#888;font-size:11px">Cargando foto...</span></div>';
    }
    marker.bindPopup(popupHtml, {minWidth: 140, maxWidth: 200});
    if (primerFoto) {
      (function(regId, codigo) {
        marker.on('popupopen', function() {
          var container = document.getElementById('popup-foto-' + regId);
          if (!container || container.dataset.loaded) return;
          container.dataset.loaded = '1';
          obtenerDeDB('fotos', codigo).then(function(f) {
            if (f && container) {
              container.innerHTML = '<img src="' + f.data + '" style="width:100%;max-width:180px;border-radius:6px;cursor:pointer" onclick="abrirLightboxFoto(this.src,\'' + escapeHtml(codigo) + '\')">';
            } else if (container) {
              container.innerHTML = '<span style="color:#888;font-size:11px">' + escapeHtml(codigo) + '</span>';
            }
          }).catch(function() {
            if (container) container.innerHTML = '';
          });
        });
      })(r.id, primerFoto);
    }
    mapaMarkers.addLayer(marker);
  }

  // Infraestructuras
  for (var i = 0; i < infraestructuras.length; i++) {
    var inf = infraestructuras[i];
    if (!inf.lat || !inf.lon) continue;
    var m = L.circleMarker([inf.lat, inf.lon], {radius: 8, fillColor: '#8e44ad', color: '#fff', weight: 2, fillOpacity: 0.9});
    // Badges
    var vpCount = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'VP'; }).length;
    var elCount = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'EL'; }).length;
    var eiCount = regs.filter(function(r) { return r.unidad === inf.idUnidad && r.tipo === 'EI'; }).length;
    m.bindPopup('<strong>' + escapeHtml(inf.nombre || inf.idUnidad) + '</strong><br>' +
      '<span class="badge badge-vp">VP:' + vpCount + '</span> ' +
      '<span class="badge badge-el">EL:' + elCount + '</span> ' +
      '<span class="badge badge-ei">EI:' + eiCount + '</span>');
    mapaMarkers.addLayer(m);
  }

  // Capa de fotos comparativas W1/W2
  if (capaFotosComp) {
    capaFotosComp.clearLayers();
    var coloresWP = {W1: '#e74c3c', W2: '#3498db'};
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var fc = r.datos && r.datos.fotosComp ? r.datos.fotosComp : [];
      for (var j = 0; j < fc.length; j++) {
        var foto = fc[j];
        var fLat = foto.lat || r.lat;
        var fLon = foto.lon || r.lon;
        if (!fLat || !fLon) continue;
        var wColor = coloresWP[foto.waypoint] || '#888';
        var wMarker = L.circleMarker([fLat, fLon], {radius: 6, fillColor: wColor, color: '#fff', weight: 2, fillOpacity: 0.9});
        var wPopupId = 'popup-wfoto-' + r.id + '-' + j;
        wMarker.bindPopup('<strong>' + escapeHtml(foto.waypoint) + '</strong><br>' +
          '<small>' + escapeHtml(foto.numero) + '</small><br>' +
          escapeHtml(r.tipo) + ' - ' + escapeHtml(r.unidad) + '<br>' +
          escapeHtml(r.fecha) +
          '<div id="' + wPopupId + '" style="margin-top:6px;text-align:center"><span style="color:#888;font-size:11px">Cargando foto...</span></div>',
          {minWidth: 140, maxWidth: 200});
        (function(popId, codigo) {
          wMarker.on('popupopen', function() {
            var container = document.getElementById(popId);
            if (!container || container.dataset.loaded) return;
            container.dataset.loaded = '1';
            obtenerDeDB('fotos', codigo).then(function(f) {
              if (f && container) {
                container.innerHTML = '<img src="' + f.data + '" style="width:100%;max-width:180px;border-radius:6px;cursor:pointer" onclick="abrirLightboxFoto(this.src,\'' + escapeHtml(codigo) + '\')">';
              } else if (container) {
                container.innerHTML = '<span style="color:#888;font-size:11px">' + escapeHtml(codigo) + '</span>';
              }
            }).catch(function() {
              if (container) container.innerHTML = '';
            });
          });
        })(wPopupId, foto.numero);
        capaFotosComp.addLayer(wMarker);
      }
    }
  }

  // Poblar tabla de atributos
  attrData = regs.map(function(r) { return {tipo: r.tipo, unidad: r.unidad, zona: r.zona, fecha: r.fecha, operador: r.operador_nombre, coordenadas: r.lat ? formatCoordNW(r.lat, r.lon) : '—'}; });
}

function iniciarGPSMapa() {
  if (!navigator.geolocation || !mapa) return;
  // Limpiar watch anterior si existe
  if (gpsMapWatchId) navigator.geolocation.clearWatch(gpsMapWatchId);

  gpsMapWatchId = navigator.geolocation.watchPosition(function(pos) {
    gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    var latlng = [pos.coords.latitude, pos.coords.longitude];
    var accuracy = pos.coords.accuracy || 30;
    var heading = pos.coords.heading;

    if (!gpsMapMarker) {
      // Crear marcador con punto azul pulsante
      var icon = L.divIcon({
        className: '',
        html: '<div style="position:relative;width:18px;height:18px">' +
              '<div class="gps-marker-pulse"></div>' +
              '<div class="gps-marker-dot"></div>' +
              '<div class="gps-marker-heading" id="gps-heading-arrow" style="display:none"></div>' +
              '</div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      gpsMapMarker = L.marker(latlng, {icon: icon, zIndexOffset: 9999}).addTo(mapa);
      gpsMapMarker.bindPopup('Mi posición');
      // Círculo de precisión
      gpsMapCircle = L.circle(latlng, {radius: accuracy, color: '#3498db', fillColor: '#3498db', fillOpacity: 0.08, weight: 1, opacity: 0.3}).addTo(mapa);
    } else {
      gpsMapMarker.setLatLng(latlng);
      gpsMapCircle.setLatLng(latlng);
      gpsMapCircle.setRadius(accuracy);
    }

    // Flecha de dirección
    var arrow = document.getElementById('gps-heading-arrow');
    if (arrow) {
      if (heading !== null && !isNaN(heading)) {
        arrow.style.display = '';
        arrow.style.transform = 'rotate(' + heading + 'deg)';
      } else {
        arrow.style.display = 'none';
      }
    }
  }, function(err) {
    if (err.code === 1) showToast('GPS: permiso denegado', 'error');
  }, {enableHighAccuracy: true, maximumAge: 3000, timeout: 10000});
}

function detenerGPSMapa() {
  if (gpsMapWatchId) {
    navigator.geolocation.clearWatch(gpsMapWatchId);
    gpsMapWatchId = null;
  }
  if (gpsMapMarker && mapa) { mapa.removeLayer(gpsMapMarker); gpsMapMarker = null; }
  if (gpsMapCircle && mapa) { mapa.removeLayer(gpsMapCircle); gpsMapCircle = null; }
}

function miPosicion() {
  if (!navigator.geolocation) { showToast('GPS no disponible', 'error'); return; }
  // Si no hay tracking activo, iniciarlo
  if (!gpsMapWatchId) iniciarGPSMapa();
  // Centrar en posición actual
  if (gpsPos && mapa) {
    mapa.setView([gpsPos.lat, gpsPos.lon], 16);
  } else {
    showToast('Obteniendo posición...', 'info');
    navigator.geolocation.getCurrentPosition(function(pos) {
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
      if (mapa) mapa.setView([gpsPos.lat, gpsPos.lon], 16);
    }, function() { showToast('No se pudo obtener posición', 'error'); }, {enableHighAccuracy: true});
  }
}

function toggleGPS() {
  var panel = document.getElementById('gps-panel');
  if (panel.classList.contains('visible')) {
    panel.classList.remove('visible');
    if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    return;
  }
  panel.classList.add('visible');
  if (!navigator.geolocation) return;
  gpsWatchId = navigator.geolocation.watchPosition(function(pos) {
    gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude};
    var coordNW = formatCoordNW(pos.coords.latitude, pos.coords.longitude);
    document.getElementById('gps-lat').textContent = coordNW.split('  ')[0];
    document.getElementById('gps-lon').textContent = coordNW.split('  ')[1];
    document.getElementById('gps-alt').textContent = pos.coords.altitude ? pos.coords.altitude.toFixed(1) + 'm' : '—';
    document.getElementById('gps-utm').textContent = latLonToUTM(pos.coords.latitude, pos.coords.longitude);
    document.getElementById('gps-speed').textContent = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) + ' km/h' : '—';
    document.getElementById('gps-acc').textContent = pos.coords.accuracy ? pos.coords.accuracy.toFixed(0) + 'm' : '—';
    document.getElementById('gps-heading').textContent = pos.coords.heading ? pos.coords.heading.toFixed(0) + '°' : '—';
  }, function() {}, {enableHighAccuracy: true, maximumAge: 1000, timeout: 5000});
}

function toggleGPSPanelBody() {
  var body = document.getElementById('gps-panel-body');
  var btn = document.getElementById('gps-panel-collapse');
  body.classList.toggle('collapsed');
  btn.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
}

function toggleMapToolbar() {
  var toolbar = document.getElementById('map-toolbar');
  var btn = document.getElementById('map-toolbar-toggle');
  toolbar.classList.toggle('open');
  btn.classList.toggle('shifted');
  btn.textContent = toolbar.classList.contains('open') ? '✕' : '🔧';
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('mapa-page').requestFullscreen().catch(function() {});
  } else {
    document.exitFullscreen();
  }
}

function toggleMapSearch() {
  var s = document.getElementById('map-search');
  s.classList.toggle('open');
  if (s.classList.contains('open')) document.getElementById('map-search-input').focus();
}

function buscarEnMapa(val) {
  if (!val || val.length < 2) return;
  var v = val.toLowerCase();

  // Buscar en infraestructuras KML
  for (var i = 0; i < infraKMLFeatures.length; i++) {
    var f = infraKMLFeatures[i];
    if (f.nombre && f.nombre.toLowerCase().indexOf(v) >= 0) {
      if (f.lat && f.lon) {
        mapa.setView([f.lat, f.lon], 16);
        // Abrir popup si existe
        if (f.marker) f.marker.openPopup();
        return;
      }
    }
    // Buscar en todos los atributos
    if (f.attrs) {
      var found = false;
      for (var k in f.attrs) {
        if (String(f.attrs[k]).toLowerCase().indexOf(v) >= 0) { found = true; break; }
      }
      if (found && f.lat && f.lon) {
        mapa.setView([f.lat, f.lon], 16);
        if (f.marker) f.marker.openPopup();
        return;
      }
    }
  }

  // Buscar en registros
  var regs = misRegistros();
  var found = regs.find(function(r) { return r.unidad.toLowerCase().indexOf(v) >= 0; });
  if (found && found.lat && found.lon) { mapa.setView([found.lat, found.lon], 16); return; }

  // Buscar en waypoints persistentes
  if (db) {
    obtenerTodosDB('waypoints_comp').then(function(wps) {
      var wp = wps.find(function(w) { return (w.unidad || '').toLowerCase().indexOf(v) >= 0 || (w.codigo || '').toLowerCase().indexOf(v) >= 0; });
      if (wp && wp.lat && wp.lon) mapa.setView([wp.lat, wp.lon], 16);
    });
  }
}

function medirDistancia() {
  medirActivo = !medirActivo;
  if (medirActivo) {
    showToast('Toca el mapa para medir distancia', 'info');
    medirPuntos = [];
    if (medirLinea) { mapa.removeLayer(medirLinea); medirLinea = null; }
    mapa.on('click', medirClick);
  } else {
    mapa.off('click', medirClick);
    if (medirLinea) { mapa.removeLayer(medirLinea); medirLinea = null; }
    medirPuntos = [];
  }
}

function medirClick(e) {
  medirPuntos.push(e.latlng);
  if (medirPuntos.length >= 2) {
    if (medirLinea) mapa.removeLayer(medirLinea);
    medirLinea = L.polyline(medirPuntos, {color: '#e74c3c', weight: 3}).addTo(mapa);
    var dist = 0;
    for (var i = 1; i < medirPuntos.length; i++) dist += medirPuntos[i-1].distanceTo(medirPuntos[i]);
    showToast('Distancia: ' + (dist > 1000 ? (dist/1000).toFixed(2) + ' km' : dist.toFixed(0) + ' m'), 'info');
  }
}

function agregarWaypoint() {
  if (!gpsPos) { showToast('Esperando GPS...', 'error'); return; }
  var name = prompt('Nombre del waypoint:');
  if (!name) return;
  L.marker([gpsPos.lat, gpsPos.lon]).addTo(mapa).bindPopup('<strong>' + name + '</strong><br>' + formatCoordNW(gpsPos.lat, gpsPos.lon)).openPopup();
  showToast('Waypoint añadido', 'success');
}

function toggleCapas() { showToast('Usa el control de capas en la esquina superior derecha', 'info'); }

function toggleKMLPanel() {
  var panel = document.getElementById('kml-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderKMLPanel();
}

function toggleWMS() {
  var panel = document.getElementById('wms-panel');
  panel.classList.toggle('open');
}

function agregarWMS() {
  var url = document.getElementById('wms-url').value.trim();
  if (!url) return;
  var layer = L.tileLayer.wms(url, {layers: '', format: 'image/png', transparent: true});
  layer.addTo(mapa);
  wmsCapas.push({url: url, layer: layer});
  var list = document.getElementById('wms-layers-list');
  var idx = wmsCapas.length - 1;
  var div = document.createElement('div');
  div.className = 'wms-layer';
  div.innerHTML = '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)">' +
    '<span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis">' + url.substring(0, 40) + '...</span>' +
    '<button onclick="removeWMSLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0" title="Eliminar capa">✕</button>';
  list.appendChild(div);
  document.getElementById('wms-url').value = '';
  showToast('Capa WMS añadida', 'success');
}

function toggleWMSLayer(idx, visible) {
  if (visible) mapa.addLayer(wmsCapas[idx].layer);
  else mapa.removeLayer(wmsCapas[idx].layer);
}

function removeWMSLayer(idx) {
  if (!wmsCapas[idx]) return;
  mapa.removeLayer(wmsCapas[idx].layer);
  wmsCapas.splice(idx, 1);
  renderWMSList();
  showToast('Capa WMS eliminada', 'info');
}

function renderWMSList() {
  var list = document.getElementById('wms-layers-list');
  if (!list) return;
  list.innerHTML = '';
  wmsCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'wms-layer';
    div.innerHTML = '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)">' +
      '<span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis">' + capa.url.substring(0, 40) + '...</span>' +
      '<button onclick="removeWMSLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0" title="Eliminar capa">✕</button>';
    list.appendChild(div);
  });
}

function toggleAttrTable() {
  var panel = document.getElementById('attr-table-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderAttrTable();
}

function renderAttrTable() {
  var thead = document.getElementById('attr-thead');
  var tbody = document.getElementById('attr-tbody');
  if (attrData.length === 0) { tbody.innerHTML = '<tr><td>Sin datos</td></tr>'; return; }
  var cols = Object.keys(attrData[0]);
  thead.innerHTML = '<tr>' + cols.map(function(c) { return '<th onclick="ordenarAttrTable(\'' + c + '\')">' + c + '</th>'; }).join('') + '</tr>';
  tbody.innerHTML = attrData.map(function(row) {
    return '<tr>' + cols.map(function(c) { return '<td>' + (row[c] || '') + '</td>'; }).join('') + '</tr>';
  }).join('');
}

function filtrarTablaAttr(val) {
  var rows = document.getElementById('attr-tbody').querySelectorAll('tr');
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(val.toLowerCase()) >= 0 ? '' : 'none';
  }
}

function ordenarAttrTable(col) {
  attrData.sort(function(a, b) { return (a[col] || '').toString().localeCompare((b[col] || '').toString()); });
  renderAttrTable();
}

// ============================================================
// KML / GPX
// ============================================================
function cargarKML() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kml,.kmz';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    if (file.name.endsWith('.kmz')) {
      reader.onload = function(ev) {
        JSZip.loadAsync(ev.target.result).then(function(zip) {
          var kmlFile = Object.keys(zip.files).find(function(f) { return f.endsWith('.kml'); });
          if (kmlFile) return zip.files[kmlFile].async('string');
        }).then(function(kmlStr) {
          if (kmlStr) parsearKML(kmlStr, file.name);
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function(ev) { parsearKML(ev.target.result, file.name); };
      reader.readAsText(file);
    }
  };
  input.click();
}

function parsearKML(kmlStr, nombre, opts) {
  opts = opts || {};
  var parser = new DOMParser();
  var doc = parser.parseFromString(kmlStr, 'text/xml');
  var placemarks = doc.querySelectorAll('Placemark');
  var layerGroup = L.featureGroup();
  var allAttrs = [];
  var attrFields = [];
  var popupField = opts.popupField || null;

  // Extract all attribute fields from ExtendedData
  placemarks.forEach(function(pm) {
    var attrs = extraerAtributosKML(pm);
    var keys = Object.keys(attrs);
    keys.forEach(function(k) { if (attrFields.indexOf(k) < 0) attrFields.push(k); });
  });

  // If no popupField set, use 'name' or first available field
  if (!popupField && attrFields.length > 0) popupField = attrFields[0];

  placemarks.forEach(function(pm, featureIdx) {
    var attrs = extraerAtributosKML(pm);
    allAttrs.push(attrs);
    var popupContent = buildKMLPopup(attrs, popupField);

    // Detect geometry type
    var pointEl = pm.querySelector('Point');
    var lineEl = pm.querySelector('LineString');
    var polyEl = pm.querySelector('Polygon');
    var multiGeom = pm.querySelector('MultiGeometry');

    var addedLayers = [];
    if (multiGeom) {
      var subPoints = multiGeom.querySelectorAll('Point');
      var subLines = multiGeom.querySelectorAll('LineString');
      var subPolys = multiGeom.querySelectorAll('Polygon');
      subPoints.forEach(function(el) { addedLayers.push(addKMLPoint(el, popupContent, layerGroup)); });
      subLines.forEach(function(el) { addedLayers.push(addKMLLine(el, popupContent, layerGroup)); });
      subPolys.forEach(function(el) { addedLayers.push(addKMLPolygon(el, popupContent, layerGroup)); });
      if ((subLines.length > 0 || subPolys.length > 0) && subPoints.length === 0) {
        addedLayers.push(addKMLCenterMarker(multiGeom, popupContent, layerGroup));
      }
    } else if (pointEl) {
      addedLayers.push(addKMLPoint(pointEl, popupContent, layerGroup));
    } else if (lineEl) {
      addedLayers.push(addKMLLine(lineEl, popupContent, layerGroup));
      addedLayers.push(addKMLCenterMarker(lineEl, popupContent, layerGroup));
    } else if (polyEl) {
      addedLayers.push(addKMLPolygon(polyEl, popupContent, layerGroup));
      addedLayers.push(addKMLCenterMarker(polyEl, popupContent, layerGroup));
    }
    // Tag each sublayer with its feature index
    addedLayers.forEach(function(l) { if (l) l._kmlFeatureIdx = featureIdx; });
  });

  layerGroup.addTo(mapa);

  // Store layer info
  var capaInfo = {
    nombre: nombre,
    layer: layerGroup,
    attrs: allAttrs,
    attrFields: attrFields,
    popupField: popupField,
    color: opts.color || '#8e44ad',
    weight: opts.weight || 3,
    opacity: opts.opacity || 0.8
  };
  kmlCapas.push(capaInfo);
  applyKMLLayerStyle(kmlCapas.length - 1);

  // Persist
  var capas = JSON.parse(localStorage.getItem('rapca_kml_capas') || '[]');
  if (!capas.includes(nombre)) { capas.push(nombre); localStorage.setItem('rapca_kml_capas', JSON.stringify(capas)); }
  guardarEnDB('capas_kml', {nombre: nombre, data: kmlStr});

  var featureCount = layerGroup.getLayers().length;
  showToast(featureCount + ' elementos cargados de ' + nombre, 'success');
  if (featureCount > 0) {
    try { mapa.fitBounds(layerGroup.getBounds().pad(0.1)); } catch(e) {}
  }

  renderKMLPanel();
}

function extraerAtributosKML(pm) {
  var attrs = {};
  var nameEl = pm.querySelector('name');
  var descEl = pm.querySelector('description');
  if (nameEl) attrs['name'] = nameEl.textContent.trim();
  // Parsear description: si contiene HTML con tabla, extraer campos
  if (descEl) {
    var descText = descEl.textContent.trim();
    if (descText.indexOf('<table') >= 0 || descText.indexOf('<TABLE') >= 0 || descText.indexOf('<html') >= 0 || descText.indexOf('<HTML') >= 0) {
      var descAttrs = parsearHTMLDescription(descText);
      for (var dk in descAttrs) { if (!attrs[dk]) attrs[dk] = descAttrs[dk]; }
    } else if (descText.indexOf('<') >= 0 && descText.indexOf('>') >= 0) {
      // HTML simple sin tabla, guardar como description limpia
      var tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = descText;
      var cleanText = tmpDiv.textContent.trim();
      if (cleanText) attrs['description'] = cleanText;
    } else {
      if (descText) attrs['description'] = descText;
    }
  }
  // SimpleData / SchemaData
  var simpleData = pm.querySelectorAll('SimpleData');
  simpleData.forEach(function(sd) {
    var key = sd.getAttribute('name');
    if (key) attrs[key] = sd.textContent.trim();
  });
  // Data elements
  var dataEls = pm.querySelectorAll('Data');
  dataEls.forEach(function(d) {
    var key = d.getAttribute('name');
    var val = d.querySelector('value');
    if (key && val) attrs[key] = val.textContent.trim();
  });
  // ExtendedData with namespace
  var extData = pm.querySelectorAll('ExtendedData *');
  extData.forEach(function(el) {
    if (el.tagName !== 'Data' && el.tagName !== 'value' && el.tagName !== 'SchemaData' && el.tagName !== 'SimpleData') {
      var key = el.tagName;
      if (el.textContent && !attrs[key]) attrs[key] = el.textContent.trim();
    }
  });
  return attrs;
}

// Parsear HTML de description que contiene tabla de atributos (común en KML de ArcGIS/QGIS)
function parsearHTMLDescription(htmlStr) {
  var attrs = {};
  try {
    var div = document.createElement('div');
    div.innerHTML = htmlStr;
    // Buscar filas de tabla con 2 celdas (clave-valor)
    var rows = div.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (cells.length >= 2) {
        var key = cells[0].textContent.trim();
        var val = cells[1].textContent.trim();
        if (key && key !== '' && val !== '') {
          attrs[key] = val;
        }
      }
    }
    // Si no se encontraron pares clave-valor en tabla, buscar texto limpio
    if (Object.keys(attrs).length === 0) {
      var text = div.textContent.trim();
      if (text) attrs['description'] = text;
    }
  } catch(e) {
    attrs['description'] = htmlStr.replace(/<[^>]+>/g, ' ').trim();
  }
  return attrs;
}

function parseKMLCoords(coordEl) {
  if (!coordEl) return [];
  return coordEl.textContent.trim().split(/\s+/).map(function(c) {
    var p = c.split(',');
    return p.length >= 2 ? [parseFloat(p[1]), parseFloat(p[0])] : null;
  }).filter(function(l) { return l && !isNaN(l[0]) && !isNaN(l[1]); });
}

function addKMLPoint(el, popup, group) {
  var coords = parseKMLCoords(el.querySelector('coordinates'));
  if (coords.length > 0) {
    var m = L.marker(coords[0]).bindPopup(popup).addTo(group);
    return m;
  }
  return null;
}

function addKMLLine(el, popup, group) {
  var coords = parseKMLCoords(el.querySelector('coordinates'));
  if (coords.length > 1) {
    var l = L.polyline(coords, {className: 'kml-vector'}).bindPopup(popup).addTo(group);
    return l;
  }
  return null;
}

function addKMLPolygon(el, popup, group) {
  var outerRing = el.querySelector('outerBoundaryIs coordinates') || el.querySelector('coordinates');
  var coords = parseKMLCoords(outerRing);
  if (coords.length > 2) {
    var p = L.polygon(coords, {className: 'kml-vector'}).bindPopup(popup).addTo(group);
    return p;
  }
  return null;
}

function addKMLCenterMarker(geomEl, popup, group) {
  var allCoords = geomEl.querySelectorAll('coordinates');
  var lats = [], lons = [];
  allCoords.forEach(function(coordEl) {
    parseKMLCoords(coordEl).forEach(function(c) { lats.push(c[0]); lons.push(c[1]); });
  });
  if (lats.length > 0) {
    var centerLat = lats.reduce(function(a, b) { return a + b; }) / lats.length;
    var centerLon = lons.reduce(function(a, b) { return a + b; }) / lons.length;
    var icon = L.divIcon({className: 'kml-center-icon', html: '<div style="width:10px;height:10px;background:#8e44ad;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>', iconSize: [14, 14], iconAnchor: [7, 7]});
    var m = L.marker([centerLat, centerLon], {icon: icon}).bindPopup(popup).addTo(group);
    return m;
  }
  return null;
}

function buildKMLPopup(attrs, popupField) {
  var keys = Object.keys(attrs);
  if (keys.length === 0) return '<i>Sin datos</i>';
  var html = '<div style="max-height:250px;overflow-y:auto;font-size:12px;line-height:1.5">';
  if (popupField && attrs[popupField]) {
    html += '<b style="font-size:13px;color:#1a3d2e">' + escapeHtml(String(attrs[popupField])) + '</b><hr style="margin:4px 0;border:none;border-top:1px solid #ddd">';
  }
  keys.forEach(function(k) {
    if (k !== popupField) {
      var val = String(attrs[k] || '');
      if (val.length > 100) val = val.substring(0, 100) + '...';
      html += '<b>' + escapeHtml(k) + ':</b> ' + escapeHtml(val) + '<br>';
    }
  });
  html += '</div>';
  return html;
}

function applyKMLLayerStyle(idx) {
  var info = kmlCapas[idx];
  if (!info) return;
  info.layer.eachLayer(function(l) {
    if (l.setStyle) {
      l.setStyle({color: info.color, weight: info.weight, opacity: info.opacity, fillOpacity: info.opacity * 0.3});
    }
    if (l.setOpacity) l.setOpacity(info.opacity);
  });
}

function renderKMLPanel() {
  var list = document.getElementById('kml-layers-list');
  if (!list) return;
  list.innerHTML = '';
  kmlCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'kml-layer-item';
    div.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox" checked onchange="toggleKMLLayer(' + idx + ',this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📂 ' + capa.nombre + '</span>' +
        '</label>' +
        '<button onclick="removeKMLLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>' +
      '<div class="kml-layer-controls">' +
        '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Color <input type="color" value="' + capa.color + '" onchange="updateKMLStyle(' + idx + ',\'color\',this.value)" style="width:28px;height:20px;border:none;padding:0;cursor:pointer"></label>' +
        '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Grosor <input type="range" min="1" max="10" value="' + capa.weight + '" onchange="updateKMLStyle(' + idx + ',\'weight\',this.value)" style="width:60px"></label>' +
        '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Opacidad <input type="range" min="10" max="100" value="' + Math.round(capa.opacity * 100) + '" onchange="updateKMLStyle(' + idx + ',\'opacity\',this.value/100)" style="width:60px"></label>' +
      '</div>' +
      (capa.attrFields.length > 0 ?
        '<div class="kml-layer-controls">' +
          '<label style="font-size:10px;display:flex;align-items:center;gap:4px">Popup: <select onchange="updateKMLPopupField(' + idx + ',this.value)" style="font-size:10px;flex:1;min-width:0">' +
            capa.attrFields.map(function(f) { return '<option value="' + f + '"' + (f === capa.popupField ? ' selected' : '') + '>' + f + '</option>'; }).join('') +
          '</select></label>' +
        '</div>' : '') +
    '';
    list.appendChild(div);
  });
  // GPX layers
  gpxCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'kml-layer-item';
    div.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox" checked onchange="toggleGPXLayer(' + idx + ',this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🗺️ ' + capa.nombre + '</span>' +
        '</label>' +
        '<button onclick="removeGPXLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>';
    list.appendChild(div);
  });
  // WMS layers
  wmsCapas.forEach(function(capa, idx) {
    var div = document.createElement('div');
    div.className = 'kml-layer-item';
    div.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox" checked onchange="toggleWMSLayer(' + idx + ',this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🌐 ' + capa.url.substring(0, 35) + '</span>' +
        '</label>' +
        '<button onclick="removeWMSLayer(' + idx + ')" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>';
    list.appendChild(div);
  });
  // Infrastructure KML layer
  if (infraKMLFeatures.length > 0) {
    var infraNombre = localStorage.getItem('rapca_infra_kml_nombre') || 'Infraestructuras KML';
    var infraVisible = mapa.hasLayer(capaInfraKML);
    var divInfra = document.createElement('div');
    divInfra.className = 'kml-layer-item';
    divInfra.innerHTML =
      '<div class="kml-layer-header">' +
        '<label style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">' +
          '<input type="checkbox"' + (infraVisible ? ' checked' : '') + ' onchange="toggleInfraKMLLayer(this.checked)" style="width:16px;height:16px">' +
          '<span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🌳 ' + infraNombre + ' (' + infraKMLFeatures.length + ')</span>' +
        '</label>' +
        '<button onclick="eliminarInfraKML();renderKMLPanel()" style="background:none;border:none;color:#e74c3c;font-size:14px;cursor:pointer;padding:0">✕</button>' +
      '</div>';
    list.appendChild(divInfra);
  }
  // Empty state
  var totalCapas = kmlCapas.length + gpxCapas.length + wmsCapas.length + (infraKMLFeatures.length > 0 ? 1 : 0);
  if (totalCapas === 0) {
    list.innerHTML = '<div style="padding:12px;color:#888;font-size:12px;text-align:center">No hay capas cargadas</div>';
  }
}

function toggleGPXLayer(idx, visible) {
  if (!gpxCapas[idx]) return;
  if (visible) mapa.addLayer(gpxCapas[idx].layer);
  else mapa.removeLayer(gpxCapas[idx].layer);
}

function removeGPXLayer(idx) {
  if (!gpxCapas[idx]) return;
  mapa.removeLayer(gpxCapas[idx].layer);
  gpxCapas.splice(idx, 1);
  renderKMLPanel();
  showToast('Capa GPX eliminada', 'info');
}

function toggleKMLLayer(idx, visible) {
  if (!kmlCapas[idx]) return;
  if (visible) mapa.addLayer(kmlCapas[idx].layer);
  else mapa.removeLayer(kmlCapas[idx].layer);
}

function removeKMLLayer(idx) {
  if (!kmlCapas[idx]) return;
  mapa.removeLayer(kmlCapas[idx].layer);
  var nombre = kmlCapas[idx].nombre;
  kmlCapas.splice(idx, 1);
  var capas = JSON.parse(localStorage.getItem('rapca_kml_capas') || '[]');
  capas = capas.filter(function(c) { return c !== nombre; });
  localStorage.setItem('rapca_kml_capas', JSON.stringify(capas));
  renderKMLPanel();
  showToast('Capa eliminada', 'info');
}

function updateKMLStyle(idx, prop, val) {
  if (!kmlCapas[idx]) return;
  if (prop === 'weight') val = parseInt(val);
  if (prop === 'opacity') val = parseFloat(val);
  kmlCapas[idx][prop] = val;
  applyKMLLayerStyle(idx);
}

function updateKMLPopupField(idx, field) {
  if (!kmlCapas[idx]) return;
  kmlCapas[idx].popupField = field;
  var attrs = kmlCapas[idx].attrs;
  kmlCapas[idx].layer.eachLayer(function(l) {
    var fi = l._kmlFeatureIdx;
    if (fi !== undefined && attrs[fi] && l.getPopup) {
      l.setPopupContent(buildKMLPopup(attrs[fi], field));
    }
  });
}

function cargarCapasKML() {
  var capas = JSON.parse(localStorage.getItem('rapca_kml_capas') || '[]');
  capas.forEach(function(nombre) {
    obtenerDeDB('capas_kml', nombre).then(function(capa) {
      if (capa) parsearKML(capa.data, nombre);
    });
  });
}

function exportarKML() {
  var regs = misRegistros().filter(function(r) { return r.lat && r.lon; });
  var kml = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>RAPCA Registros</name>';
  regs.forEach(function(r) {
    kml += '<Placemark><name>' + r.tipo + ' - ' + r.unidad + '</name><description>' + r.fecha + '</description><Point><coordinates>' + r.lon + ',' + r.lat + ',0</coordinates></Point></Placemark>';
  });
  kml += '</Document></kml>';
  descargarArchivo(kml, 'rapca_registros.kml', 'application/vnd.google-earth.kml+xml');
}

function exportarKMLRegistros() { exportarKML(); }

function importarGPX() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(ev.target.result, 'text/xml');
      var gpxGroup = L.featureGroup();
      var wpts = doc.querySelectorAll('wpt');
      var count = 0;
      wpts.forEach(function(wpt) {
        var lat = parseFloat(wpt.getAttribute('lat'));
        var lon = parseFloat(wpt.getAttribute('lon'));
        var name = wpt.querySelector('name');
        if (!isNaN(lat) && !isNaN(lon)) {
          L.marker([lat, lon]).bindPopup(name ? name.textContent : 'Waypoint').addTo(gpxGroup);
          count++;
        }
      });
      var trks = doc.querySelectorAll('trkpt');
      var latlngs = [];
      trks.forEach(function(pt) {
        var lat = parseFloat(pt.getAttribute('lat'));
        var lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) latlngs.push([lat, lon]);
      });
      if (latlngs.length > 1) L.polyline(latlngs, {color: '#e74c3c', weight: 3}).addTo(gpxGroup);
      gpxGroup.addTo(mapa);
      gpxCapas.push({nombre: file.name, layer: gpxGroup});
      if (gpxGroup.getLayers().length > 0) {
        try { mapa.fitBounds(gpxGroup.getBounds().pad(0.1)); } catch(e) {}
      }
      showToast((count + latlngs.length) + ' elementos GPX cargados', 'success');
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportarGPX() {
  var regs = misRegistros().filter(function(r) { return r.lat && r.lon; });
  var gpx = '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="RAPCA Campo">';
  regs.forEach(function(r) {
    gpx += '<wpt lat="' + r.lat + '" lon="' + r.lon + '"><name>' + r.tipo + ' - ' + r.unidad + '</name><desc>' + r.fecha + '</desc></wpt>';
  });
  gpx += '</gpx>';
  descargarArchivo(gpx, 'rapca_registros.gpx', 'application/gpx+xml');
}

function exportarMapaPDF() {
  showToast('Generando PDF del mapa...', 'info');
  html2canvas(document.getElementById('map-container')).then(function(canvas) {
    var win = window.open('', '_blank');
    win.document.write('<html><head><title>Mapa RAPCA</title><style>@page{size:A4 landscape;margin:1cm}body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body>');
    win.document.write('<h2 style="font-family:sans-serif;color:#1a3d2e">RAPCA Campo — Mapa</h2>');
    win.document.write('<img src="' + canvas.toDataURL('image/png') + '">');
    win.document.write('<p style="font-size:12px;color:#888">' + new Date().toLocaleString('es-ES') + '</p>');
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  });
}

function filtrarOperadorMapa() {
  var misRegs = misRegistros();
  var ops = [];
  misRegs.forEach(function(r) { if (r.operador_nombre && ops.indexOf(r.operador_nombre) < 0) ops.push(r.operador_nombre); });
  var sel = prompt('Filtrar por operador (' + ops.join(', ') + '):');
  if (!sel) { actualizarMarcadores(); return; }
  mapaMarkers.clearLayers();
  var regs = misRegs.filter(function(r) { return r.operador_nombre === sel && r.lat && r.lon; });
  var colores = {VP: '#88d8b0', EL: '#2ecc71', EI: '#fd9853'};
  regs.forEach(function(r) {
    var marker = L.circleMarker([r.lat, r.lon], {radius: 8, fillColor: colores[r.tipo], color: '#fff', weight: 2, fillOpacity: 0.9});
    marker.bindPopup(r.tipo + ' - ' + r.unidad);
    mapaMarkers.addLayer(marker);
  });
}

// ============================================================
// GPS Precision Improvement
// ============================================================
function capturarGPSConPrecision(callback) {
  if (!navigator.geolocation) {
    callback(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(function(pos) {
    var data = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      alt: pos.coords.altitude,
      accuracy: pos.coords.accuracy
    };
    gpsPos = data;
    callback(data);
  }, function(err) {
    callback(null);
  }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 5000});
}

function mostrarPrecisionGPS() {
  var el = document.getElementById('gps-precision-indicator');
  if (!el || !gpsPos) return;
  var acc = gpsPos.accuracy;
  var color = acc <= 10 ? '#27ae60' : acc <= 30 ? '#f39c12' : '#e74c3c';
  var label = acc <= 10 ? 'Excelente' : acc <= 30 ? 'Buena' : 'Baja';
  el.innerHTML = '<span style="color:' + color + '">📡 GPS: ±' + Math.round(acc) + 'm (' + label + ')</span>';
  el.style.display = 'block';
}

// ============================================================
// WAYPOINTS PERSISTENTES (IndexedDB — sobreviven cierre/reinicio/borrar caché)
// ============================================================

function cargarWaypointsPersistentes() {
  if (!db || !capaWaypointsPersist) return;
  capaWaypointsPersist.clearLayers();

  obtenerTodosDB('waypoints_comp').then(function(wps) {
    if (!wps || wps.length === 0) {
      var badge = document.getElementById('wp-persist-count');
      if (badge) badge.textContent = '0';
      return;
    }
    var coloresWP = {W1: '#e74c3c', W2: '#3498db'};

    wps.forEach(function(wp) {
      if (!wp.lat || !wp.lon) return;
      var wColor = coloresWP[wp.waypoint] || '#888';
      var marker = L.circleMarker([wp.lat, wp.lon], {
        radius: 7, fillColor: wColor, color: '#fff', weight: 2, fillOpacity: 0.9
      });

      var safeId = wp.id.replace(/[^a-zA-Z0-9_]/g, '_');
      var popupId = 'popup-wp-' + safeId;
      var escapedId = escapeHtml(wp.id).replace(/'/g, "\\'");
      marker.bindPopup(
        '<strong style="color:' + wColor + '">' + escapeHtml(wp.waypoint) + '</strong>' +
        '<br><small>' + escapeHtml(wp.codigo) + '</small>' +
        '<br>' + escapeHtml(wp.unidad || '') +
        '<br><span style="color:#888;font-size:11px">' + escapeHtml(wp.fecha ? wp.fecha.split('T')[0] : '') + '</span>' +
        (wp.operador ? '<br><span style="color:#888;font-size:11px">' + escapeHtml(wp.operador) + '</span>' : '') +
        '<div id="' + popupId + '" style="margin-top:6px;text-align:center"></div>' +
        '<button onclick="borrarWaypointPersistente(\'' + escapedId + '\')" style="margin-top:6px;width:100%;padding:4px;background:#e74c3c;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer">Borrar waypoint</button>',
        {minWidth: 140, maxWidth: 200}
      );

      // Lazy load foto
      (function(pId, codigo) {
        marker.on('popupopen', function() {
          var container = document.getElementById(pId);
          if (!container || container.dataset.loaded) return;
          container.dataset.loaded = '1';
          obtenerDeDB('fotos', codigo).then(function(f) {
            if (f && f.data && container) {
              container.innerHTML = '<img src="' + f.data + '" style="width:100%;max-width:180px;border-radius:6px;cursor:pointer" onclick="abrirLightboxFoto(this.src,\'' + escapeHtml(codigo) + '\')">';
            }
          }).catch(function() {});
        });
      })(popupId, wp.codigo);

      capaWaypointsPersist.addLayer(marker);
    });

    // Actualizar contador en toolbar
    var badge = document.getElementById('wp-persist-count');
    if (badge) badge.textContent = wps.length;
  }).catch(function(e) { console.warn('Error cargando waypoints persistentes:', e); });
}

function borrarWaypointPersistente(id) {
  if (!confirm('¿Borrar este waypoint?')) return;
  if (!db) return;
  eliminarDeDB('waypoints_comp', id).then(function() {
    mapa.closePopup();
    cargarWaypointsPersistentes();
    showToast('Waypoint borrado', 'info');
  }).catch(function(e) { showToast('Error al borrar: ' + e, 'error'); });
}

function borrarTodosWaypointsPersistentes() {
  if (!confirm('¿Borrar TODOS los waypoints persistentes? Esta acción no se puede deshacer.')) return;
  if (!db) return;
  obtenerTodosDB('waypoints_comp').then(function(wps) {
    var promises = wps.map(function(wp) { return eliminarDeDB('waypoints_comp', wp.id); });
    return Promise.all(promises);
  }).then(function() {
    capaWaypointsPersist.clearLayers();
    var badge = document.getElementById('wp-persist-count');
    if (badge) badge.textContent = '0';
    showToast('Todos los waypoints borrados', 'info');
  }).catch(function(e) { showToast('Error: ' + e, 'error'); });
}

// También guardar waypoints desde registros existentes (migración)
function migrarWaypointsDeRegistros() {
  if (!db) return;
  var regs = registros || [];
  var promises = [];
  regs.forEach(function(r) {
    if (!r.datos || !r.datos.fotosComp) return;
    r.datos.fotosComp.forEach(function(fc) {
      if (!fc.lat || !fc.lon) return;
      promises.push(
        obtenerDeDB('waypoints_comp', fc.numero).then(function(existing) {
          if (existing) return; // Ya existe
          return guardarEnDB('waypoints_comp', {
            id: fc.numero,
            codigo: fc.numero,
            waypoint: fc.waypoint || 'W1',
            lat: fc.lat,
            lon: fc.lon,
            unidad: r.unidad,
            tipo: r.tipo,
            fecha: r.fecha,
            operador: r.operador_nombre || ''
          });
        })
      );
    });
  });
  Promise.all(promises).then(function() {
    cargarWaypointsPersistentes();
  });
}

// ============================================================
// KML INFRAESTRUCTURAS (carga, selección de campo nombre, búsqueda)
// ============================================================

function cargarKMLInfraestructuras() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kml,.kmz';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    if (file.name.endsWith('.kmz')) {
      reader.onload = function(ev) {
        JSZip.loadAsync(ev.target.result).then(function(zip) {
          var kmlFile = Object.keys(zip.files).find(function(f) { return f.endsWith('.kml'); });
          if (kmlFile) return zip.files[kmlFile].async('string');
        }).then(function(kmlStr) {
          if (kmlStr) mostrarSelectorCampoInfraKML(kmlStr, file.name);
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function(ev) { mostrarSelectorCampoInfraKML(ev.target.result, file.name); };
      reader.readAsText(file);
    }
  };
  input.click();
}

function mostrarSelectorCampoInfraKML(kmlStr, nombre) {
  // Parsear para obtener los campos disponibles
  var parser = new DOMParser();
  var doc = parser.parseFromString(kmlStr, 'text/xml');
  var placemarks = doc.querySelectorAll('Placemark');
  if (placemarks.length === 0) { showToast('No se encontraron elementos en el KML', 'error'); return; }

  // Extraer campos de la primera entidad
  var camposDisponibles = [];
  var ejemplo = {};
  placemarks.forEach(function(pm) {
    var attrs = extraerAtributosKML(pm);
    Object.keys(attrs).forEach(function(k) {
      if (camposDisponibles.indexOf(k) < 0) {
        camposDisponibles.push(k);
        if (!ejemplo[k]) ejemplo[k] = attrs[k];
      }
    });
  });

  // Guardar KML temporalmente
  window._infraKMLTemp = kmlStr;
  window._infraKMLNombre = nombre;

  var html = '<h2>Cargar Infraestructuras KML</h2>';
  html += '<p style="color:#666;font-size:13px">' + placemarks.length + ' elementos encontrados en <strong>' + escapeHtml(nombre) + '</strong></p>';

  html += '<div class="form-group"><label style="font-weight:700">Campo para el nombre de la infraestructura</label>';
  html += '<select id="infra-kml-campo-nombre" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc">';
  camposDisponibles.forEach(function(c) {
    var preview = ejemplo[c] ? ' (' + String(ejemplo[c]).substring(0, 30) + ')' : '';
    html += '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + escapeHtml(preview) + '</option>';
  });
  html += '</select></div>';

  // Vista previa de los campos
  html += '<div style="max-height:200px;overflow-y:auto;margin:8px 0;border:1px solid #eee;border-radius:6px;padding:8px">';
  html += '<div style="font-size:11px;color:#888;margin-bottom:4px">Vista previa del primer elemento:</div>';
  camposDisponibles.forEach(function(c) {
    html += '<div style="font-size:12px;padding:2px 0"><strong>' + escapeHtml(c) + ':</strong> ' + escapeHtml(String(ejemplo[c] || '')) + '</div>';
  });
  html += '</div>';

  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="ejecutarCargaInfraKML()">Cargar en mapa</button><button class="btn btn-outline" onclick="cerrarModal()">Cancelar</button></div>';
  abrirModal(html);
}

function ejecutarCargaInfraKML() {
  var kmlStr = window._infraKMLTemp;
  var nombre = window._infraKMLNombre;
  var campoNombre = document.getElementById('infra-kml-campo-nombre').value;
  if (!kmlStr) return;

  cerrarModal();

  // Parsear KML y crear marcadores
  var parser = new DOMParser();
  var doc = parser.parseFromString(kmlStr, 'text/xml');
  var placemarks = doc.querySelectorAll('Placemark');

  capaInfraKML.clearLayers();
  infraKMLFeatures = [];

  placemarks.forEach(function(pm) {
    var attrs = extraerAtributosKML(pm);
    var nombreInfra = attrs[campoNombre] || attrs['name'] || 'Sin nombre';

    // Obtener coordenadas
    var lat = null, lon = null;
    var pointEl = pm.querySelector('Point');
    var lineEl = pm.querySelector('LineString');
    var polyEl = pm.querySelector('Polygon');
    var geomEl = pointEl || lineEl || polyEl;
    if (!geomEl) {
      var multi = pm.querySelector('MultiGeometry');
      if (multi) geomEl = multi.querySelector('Point') || multi.querySelector('LineString') || multi.querySelector('Polygon');
    }
    if (geomEl) {
      var coordEl = geomEl.querySelector('coordinates');
      if (coordEl) {
        var txt = coordEl.textContent.trim().split(/\s+/)[0];
        var parts = txt.split(',');
        if (parts.length >= 2) {
          lon = parseFloat(parts[0]);
          lat = parseFloat(parts[1]);
        }
      }
    }

    // Construir popup con todos los atributos
    var popupHtml = '<strong style="color:#8e44ad;font-size:14px">' + escapeHtml(nombreInfra) + '</strong><br>';
    for (var k in attrs) {
      if (k !== campoNombre) {
        popupHtml += '<span style="font-size:11px"><strong>' + escapeHtml(k) + ':</strong> ' + escapeHtml(String(attrs[k])) + '</span><br>';
      }
    }

    var marker = null;

    // También añadir geometrías de línea/polígono
    if (lineEl || polyEl) {
      var coords = parseKMLCoords(geomEl.querySelector('coordinates'));
      if (lineEl && coords.length > 1) {
        var line = L.polyline(coords, {color: '#8e44ad', weight: 3, opacity: 0.8});
        line.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
        capaInfraKML.addLayer(line);
      }
      if (polyEl && coords.length > 2) {
        var poly = L.polygon(coords, {color: '#8e44ad', fillColor: '#8e44ad', fillOpacity: 0.2, weight: 2});
        poly.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
        capaInfraKML.addLayer(poly);
      }
    }

    // Crear marcador con etiqueta
    if (lat && lon) {
      marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'infra-kml-marker',
          html: '<div class="infra-kml-dot"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      });
      marker.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
      marker.bindTooltip(nombreInfra, {
        permanent: true,
        direction: 'right',
        offset: [10, 0],
        className: 'infra-kml-label'
      });
      capaInfraKML.addLayer(marker);
    }

    infraKMLFeatures.push({
      nombre: nombreInfra,
      lat: lat,
      lon: lon,
      attrs: attrs,
      marker: marker
    });
  });

  // Persistir en IndexedDB
  guardarEnDB('kml_infraestructuras', {
    nombre: nombre,
    data: kmlStr,
    campoNombre: campoNombre
  });
  localStorage.setItem('rapca_infra_kml_nombre', nombre);
  localStorage.setItem('rapca_infra_kml_campo', campoNombre);

  // Zoom a los elementos
  if (capaInfraKML.getLayers().length > 0) {
    try { mapa.fitBounds(capaInfraKML.getBounds().pad(0.1)); } catch(e) {}
  }

  showToast(infraKMLFeatures.length + ' infraestructuras cargadas de ' + nombre, 'success');
  actualizarBuscadorInfraKML();

  window._infraKMLTemp = null;
  window._infraKMLNombre = null;
}

function cargarInfraKMLGuardada() {
  var nombre = localStorage.getItem('rapca_infra_kml_nombre');
  var campo = localStorage.getItem('rapca_infra_kml_campo');
  if (!nombre || !campo || !db) return;

  obtenerDeDB('kml_infraestructuras', nombre).then(function(stored) {
    if (!stored || !stored.data) return;
    // Simular la carga sin modal
    window._infraKMLTemp = stored.data;
    window._infraKMLNombre = nombre;
    // Parsear directamente
    var parser = new DOMParser();
    var doc = parser.parseFromString(stored.data, 'text/xml');
    var placemarks = doc.querySelectorAll('Placemark');

    capaInfraKML.clearLayers();
    infraKMLFeatures = [];

    placemarks.forEach(function(pm) {
      var attrs = extraerAtributosKML(pm);
      var nombreInfra = attrs[campo] || attrs['name'] || 'Sin nombre';
      var lat = null, lon = null;

      var pointEl = pm.querySelector('Point');
      var lineEl = pm.querySelector('LineString');
      var polyEl = pm.querySelector('Polygon');
      var geomEl = pointEl || lineEl || polyEl;
      if (!geomEl) {
        var multi = pm.querySelector('MultiGeometry');
        if (multi) geomEl = multi.querySelector('Point') || multi.querySelector('LineString') || multi.querySelector('Polygon');
      }
      if (geomEl) {
        var coordEl = geomEl.querySelector('coordinates');
        if (coordEl) {
          var txt = coordEl.textContent.trim().split(/\s+/)[0];
          var parts = txt.split(',');
          if (parts.length >= 2) { lon = parseFloat(parts[0]); lat = parseFloat(parts[1]); }
        }
      }

      var popupHtml = '<strong style="color:#8e44ad;font-size:14px">' + escapeHtml(nombreInfra) + '</strong><br>';
      for (var k in attrs) {
        if (k !== campo) popupHtml += '<span style="font-size:11px"><strong>' + escapeHtml(k) + ':</strong> ' + escapeHtml(String(attrs[k])) + '</span><br>';
      }

      var marker = null;

      if (lineEl) {
        var coords = parseKMLCoords(geomEl.querySelector('coordinates'));
        if (coords.length > 1) {
          var line = L.polyline(coords, {color: '#8e44ad', weight: 3, opacity: 0.8});
          line.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250}); capaInfraKML.addLayer(line);
        }
      }
      if (polyEl) {
        var coords = parseKMLCoords(geomEl.querySelector('coordinates'));
        if (coords.length > 2) {
          var poly = L.polygon(coords, {color: '#8e44ad', fillColor: '#8e44ad', fillOpacity: 0.2, weight: 2});
          poly.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250}); capaInfraKML.addLayer(poly);
        }
      }

      if (lat && lon) {
        marker = L.marker([lat, lon], {
          icon: L.divIcon({
            className: 'infra-kml-marker',
            html: '<div class="infra-kml-dot"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        });
        marker.bindPopup(popupHtml, {minWidth: 160, maxWidth: 250});
        marker.bindTooltip(nombreInfra, {
          permanent: true,
          direction: 'right',
          offset: [10, 0],
          className: 'infra-kml-label'
        });
        capaInfraKML.addLayer(marker);
      }

      infraKMLFeatures.push({ nombre: nombreInfra, lat: lat, lon: lon, attrs: attrs, marker: marker });
    });

    actualizarBuscadorInfraKML();
    window._infraKMLTemp = null;
    window._infraKMLNombre = null;
  }).catch(function(e) { console.warn('Error cargando KML infraestructuras guardado:', e); });
}

function toggleInfraKMLLayer(visible) {
  if (visible) mapa.addLayer(capaInfraKML);
  else mapa.removeLayer(capaInfraKML);
}

function eliminarInfraKML() {
  if (!confirm('¿Borrar la capa de infraestructuras KML? Esta acción no se puede deshacer.')) return;
  var nombre = localStorage.getItem('rapca_infra_kml_nombre');
  capaInfraKML.clearLayers();
  infraKMLFeatures = [];
  localStorage.removeItem('rapca_infra_kml_nombre');
  localStorage.removeItem('rapca_infra_kml_campo');
  if (db && nombre) {
    eliminarDeDB('kml_infraestructuras', nombre);
  }
  actualizarBuscadorInfraKML();
  renderKMLPanel();
  showToast('Infraestructuras KML eliminadas', 'info');
}

function actualizarBuscadorInfraKML() {
  var container = document.getElementById('infra-kml-search-container');
  if (!container) return;
  if (infraKMLFeatures.length > 0) {
    container.style.display = 'block';
    container.querySelector('.infra-kml-count').textContent = infraKMLFeatures.length + ' infraestructuras';
  } else {
    container.style.display = 'none';
  }
}

function buscarInfraKML(val) {
  var results = document.getElementById('infra-kml-results');
  if (!results) return;
  if (!val || val.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }

  var v = val.toLowerCase();
  var matches = infraKMLFeatures.filter(function(f) {
    if (f.nombre && f.nombre.toLowerCase().indexOf(v) >= 0) return true;
    if (f.attrs) {
      for (var k in f.attrs) {
        if (String(f.attrs[k]).toLowerCase().indexOf(v) >= 0) return true;
      }
    }
    return false;
  }).slice(0, 10); // Max 10 resultados

  if (matches.length === 0) {
    results.innerHTML = '<div style="padding:8px;color:#888;font-size:13px">Sin resultados</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = matches.map(function(f, i) {
    return '<div class="infra-kml-result" onclick="irAInfraKML(' + i + ',\'' + escapeHtml(val) + '\')" style="padding:8px;cursor:pointer;border-bottom:1px solid #eee;font-size:13px">' +
      '<strong style="color:#8e44ad">' + escapeHtml(f.nombre) + '</strong>' +
      (f.lat ? '<br><span style="color:#888;font-size:11px">' + f.lat.toFixed(5) + ', ' + f.lon.toFixed(5) + '</span>' : '') +
      '</div>';
  }).join('');
  results.style.display = 'block';
}

function irAInfraKML(idx, searchVal) {
  // Encontrar el match real (ya que el idx es del slice filtrado)
  var v = searchVal.toLowerCase();
  var matches = infraKMLFeatures.filter(function(f) {
    if (f.nombre && f.nombre.toLowerCase().indexOf(v) >= 0) return true;
    if (f.attrs) { for (var k in f.attrs) { if (String(f.attrs[k]).toLowerCase().indexOf(v) >= 0) return true; } }
    return false;
  });
  var f = matches[idx];
  if (!f) return;

  if (f.lat && f.lon) {
    mapa.setView([f.lat, f.lon], 16);
    if (f.marker) setTimeout(function() { f.marker.openPopup(); }, 300);
  }

  var results = document.getElementById('infra-kml-results');
  if (results) { results.innerHTML = ''; results.style.display = 'none'; }
}

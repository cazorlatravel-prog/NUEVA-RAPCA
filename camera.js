// RAPCA Campo — camera.js — Cámara y fotos
// ============================================================

// Objeto ImageCapture para tomar fotos a resolución nativa del sensor
var imageCaptureObj = null;

// Heading de brújula en grados (0-359, sentido horario desde el Norte geográfico)
var compassHeading = null;

// Crea el objeto ImageCapture a partir del stream actual (si el navegador lo soporta)
function crearImageCapture(stream) {
  imageCaptureObj = null;
  try {
    var vt = stream.getVideoTracks()[0];
    if (window.ImageCapture && vt) {
      imageCaptureObj = new ImageCapture(vt);
    }
  } catch(e) {
    imageCaptureObj = null;
  }
}

function abrirCamara(tipo, subtipo) {
  camaraTipo = tipo;
  camaraSubtipo = subtipo;
  vibrar();

  // Generar código de foto
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || 'SIN_ID';
  // EI y EL usan 'EV' en el código de foto, VP usa 'VP'
  var codeTipo = (tipo === 'EI' || tipo === 'EL') ? 'EV' : tipo;
  var contKey = unidad + '_' + codeTipo + '_' + subtipo;
  var contadores = safeParse('rapca_contadores_' + tipo, {});

  // Buscar el máximo número usado en TODOS los registros (locales + servidor) para evitar colisiones
  var maxEnRegistros = 0;
  var prefijoBuscar = subtipo === 'G' ? unidad + '_' + codeTipo + '_' : unidad + '_' + codeTipo + '_' + subtipo + '_';

  function extraerNumDeCodigo(codigo) {
    if (!codigo || codigo.indexOf(prefijoBuscar) !== 0) return 0;
    var num = parseInt(codigo.substring(prefijoBuscar.length));
    return isNaN(num) ? 0 : num;
  }

  registros.forEach(function(r) {
    if (!r.datos) return;
    // Buscar en fotos generales
    if (r.datos.fotos && typeof r.datos.fotos === 'string') {
      r.datos.fotos.split(',').forEach(function(f) {
        var n = extraerNumDeCodigo(f.trim());
        if (n > maxEnRegistros) maxEnRegistros = n;
      });
    }
    // Buscar en fotos comparativas (fotosComp)
    if (r.datos.fotosComp && Array.isArray(r.datos.fotosComp)) {
      r.datos.fotosComp.forEach(function(fc) {
        var n = extraerNumDeCodigo(fc.numero || '');
        if (n > maxEnRegistros) maxEnRegistros = n;
      });
    }
  });

  // También buscar en fotos de la página/formulario actual
  var todasFotosPagina = [].concat(fotosPagina['G'] || [], fotosPagina['W1'] || [], fotosPagina['W2'] || []);
  todasFotosPagina.forEach(function(f) {
    var codigo = typeof f === 'object' ? f.codigo : f;
    var n = extraerNumDeCodigo(codigo);
    if (n > maxEnRegistros) maxEnRegistros = n;
  });

  // Y en los borradores sin guardar de los 3 formularios: EL y EI comparten
  // el prefijo 'EV', y una foto de un borrador EL podía colisionar (y
  // sobrescribirse en IndexedDB) con una nueva foto EI de la misma unidad
  ['vp', 'el', 'ei'].forEach(function(bt) {
    var borr = safeParse('rapca_borrador_' + bt, null);
    if (!borr) return;
    function escanearFP(fp) {
      if (!fp) return;
      [].concat(fp['G'] || [], fp['W1'] || [], fp['W2'] || []).forEach(function(f) {
        var codigo = typeof f === 'object' ? f.codigo : f;
        var n = extraerNumDeCodigo(codigo);
        if (n > maxEnRegistros) maxEnRegistros = n;
      });
    }
    escanearFP(borr.fotosPagina);
    // Borrador EI: fotos guardadas dentro de cada transecto
    if (borr.transectosDatos) {
      ['T1', 'T2', 'T3'].forEach(function(t) {
        var dt = borr.transectosDatos[t];
        if (!dt) return;
        if (dt.fotos && typeof dt.fotos === 'string') {
          dt.fotos.split(',').forEach(function(f) {
            var n = extraerNumDeCodigo(f.trim());
            if (n > maxEnRegistros) maxEnRegistros = n;
          });
        }
        if (dt.fotosComp && Array.isArray(dt.fotosComp)) {
          dt.fotosComp.forEach(function(fc) {
            var n = extraerNumDeCodigo(fc.numero || '');
            if (n > maxEnRegistros) maxEnRegistros = n;
          });
        }
      });
    }
  });

  // Usar el mayor entre el contador localStorage y el máximo en registros
  // Si se reiniciaron manualmente, ignorar registros anteriores
  var contadorLocal = contadores[contKey] || 0;
  var reiniciados = localStorage.getItem('rapca_contadores_reiniciados') === 'true';
  var nuevoContador = reiniciados ? contadorLocal + 1 : Math.max(contadorLocal, maxEnRegistros) + 1;
  // NUNCA reutilizar un código ya existente: sobrescribiría el thumbnail,
  // la subida pendiente y la copia de Cloudinary de la foto antigua
  if (nuevoContador <= maxEnRegistros) nuevoContador = maxEnRegistros + 1;
  contadores[contKey] = nuevoContador;
  safeStore('rapca_contadores_' + tipo, contadores);
  // Nota: el flag 'rapca_contadores_reiniciados' se consume en aceptarFoto(),
  // no aquí — si el usuario cancela sin hacer foto, el reinicio sigue vigente

  if (subtipo === 'G') {
    fotoCodigo = unidad + '_' + codeTipo + '_' + nuevoContador;
  } else {
    fotoCodigo = unidad + '_' + codeTipo + '_' + subtipo + '_' + nuevoContador;
  }

  document.getElementById('cam-code').textContent = fotoCodigo;

  // Abrir cámara
  var constraints = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    camaraStream = stream;
    var video = document.getElementById('camera-video');
    video.srcObject = stream;
    document.getElementById('camera-modal').classList.add('open');
    iniciarOverlayCamara();
    cargarGhostFoto(tipo, subtipo);
    iniciarIndicadorDistancia(tipo, subtipo);
    // Iniciar tap-to-focus y ajuste de exposición
    iniciarTapToFocus();
    iniciarExposureSlide();
    // Configurar focus y exposición continuos por defecto
    configurarCamaraInicial(stream);
    // Preparar captura a resolución nativa del sensor
    crearImageCapture(stream);
  }).catch(function(err) {
    showToast('Error al acceder a la cámara: ' + err.message, 'error');
    // Decrementar contador
    contadores[contKey]--;
    safeStore('rapca_contadores_' + tipo, contadores);
  });
}

// Detener sensor y listeners de la brújula (fuga de batería si quedan vivos)
function detenerBrujula() {
  if (window._compassHandler) {
    window.removeEventListener('deviceorientationabsolute', window._compassHandler, true);
    window.removeEventListener('deviceorientation', window._compassHandler, true);
    window._compassHandler = null;
  }
  if (window._compassSensor) {
    try { window._compassSensor.stop(); } catch(e) {}
    window._compassSensor = null;
  }
}

function cerrarCamara() {
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
    camaraStream = null;
  }
  imageCaptureObj = null;
  detenerBrujula();
  detenerIndicadorDistancia();
  document.getElementById('camera-modal').classList.remove('open');
  if (miniMapaCamera) { miniMapaCamera.remove(); miniMapaCamera = null; }
  // Limpiar ghost
  document.getElementById('ghost-overlay').style.display = 'none';
  document.getElementById('ghost-controls').style.display = 'none';
  ghostingActivo = false;

  // Decrementar contador si se cancela
  var prefix = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || 'SIN_ID';
  var codeTipo = (camaraTipo === 'EI' || camaraTipo === 'EL') ? 'EV' : camaraTipo;
  var contKey = unidad + '_' + codeTipo + '_' + camaraSubtipo;
  var contadores = safeParse('rapca_contadores_' + camaraTipo, {});
  if (contadores[contKey] > 0) contadores[contKey]--;
  safeStore('rapca_contadores_' + camaraTipo, contadores);
}

function switchCamara() {
  var anterior = camaraFacing;
  camaraFacing = camaraFacing === 'environment' ? 'user' : 'environment';
  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
  }
  var constraints = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    camaraStream = stream;
    document.getElementById('camera-video').srcObject = stream;
    configurarCamaraInicial(stream);
    crearImageCapture(stream);
    iniciarTapToFocus();
    iniciarExposureSlide();
  }).catch(function(err) {
    // Restaurar la cámara anterior si el cambio falla (p.ej. solo hay una cámara)
    camaraFacing = anterior;
    var fallback = {video: {facingMode: camaraFacing, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false};
    navigator.mediaDevices.getUserMedia(fallback).then(function(stream) {
      camaraStream = stream;
      document.getElementById('camera-video').srcObject = stream;
      configurarCamaraInicial(stream);
      crearImageCapture(stream);
      iniciarTapToFocus();
      iniciarExposureSlide();
      showToast('No se pudo cambiar de cámara', 'info');
    }).catch(function() {
      showToast('Error al acceder a la cámara', 'error');
    });
  });
}

// ============================================================
// CONFIGURACIÓN INICIAL DE CÁMARA (calidad, focus, exposición)
// ============================================================

function configurarCamaraInicial(stream) {
  var track = stream.getVideoTracks()[0];
  if (!track) return;

  var caps;
  try { caps = track.getCapabilities(); } catch(e) { return; }

  var constraints = {};
  var hasChanges = false;

  // Focus continuo automático
  if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
    constraints.focusMode = 'continuous';
    hasChanges = true;
  }

  // Exposición continua automática
  if (caps.exposureMode && caps.exposureMode.indexOf('continuous') >= 0) {
    constraints.exposureMode = 'continuous';
    hasChanges = true;
  }

  // Balance de blancos automático continuo
  if (caps.whiteBalanceMode && caps.whiteBalanceMode.indexOf('continuous') >= 0) {
    constraints.whiteBalanceMode = 'continuous';
    hasChanges = true;
  }

  if (hasChanges) {
    track.applyConstraints({advanced: [constraints]}).catch(function(err) {
      console.log('Config cámara inicial:', err.message);
    });
  }
}

// ============================================================
// TAP-TO-FOCUS Y AUTO-EXPOSICIÓN
// ============================================================

function iniciarTapToFocus() {
  var video = document.getElementById('camera-video');
  var wrap = video.parentElement;
  if (!video || !wrap) return;

  // Limpiar listener anterior si existe
  if (video._tapFocusHandler) {
    video.removeEventListener('touchstart', video._tapFocusHandler);
    video.removeEventListener('click', video._tapFocusHandler);
  }

  var handler = function(e) {
    // No interferir con ghost controls ni botones
    if (e.target.closest('#ghost-controls') || e.target.closest('.camera-overlay') || e.target.closest('.camera-controls')) return;
    e.preventDefault();

    var touch = e.touches ? e.touches[0] : e;
    var rect = video.getBoundingClientRect();

    // Coordenadas relativas al video (0-1)
    var x = (touch.clientX - rect.left) / rect.width;
    var y = (touch.clientY - rect.top) / rect.height;

    // Clamp
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Mostrar indicador visual
    mostrarFocusIndicator(wrap, touch.clientX - rect.left, touch.clientY - rect.top);

    // Medir brillo real del punto tocado desde el frame del video
    var luminancia = medirLuminancia(video, x, y);

    // Aplicar focus y exposición al track de video
    aplicarFocusExposicion(x, y, luminancia);
  };

  video._tapFocusHandler = handler;
  video.addEventListener('touchstart', handler, {passive: false});
  video.addEventListener('click', handler);
}

function mostrarFocusIndicator(container, px, py) {
  // Eliminar indicadores previos
  var prevs = container.querySelectorAll('.focus-ring');
  prevs.forEach(function(p) { p.remove(); });

  var ring = document.createElement('div');
  ring.className = 'focus-ring';
  ring.style.left = px + 'px';
  ring.style.top = py + 'px';
  ring.innerHTML = '<div class="focus-ring-inner"></div><div class="focus-ring-cross-h"></div><div class="focus-ring-cross-v"></div>';
  container.appendChild(ring);

  // Limpiar después de la animación
  setTimeout(function() {
    if (ring.parentNode) ring.remove();
  }, 800);
}

// Mide la luminancia media (0-255) de una región alrededor del punto tocado
function medirLuminancia(video, x, y) {
  try {
    if (!video.videoWidth || !video.videoHeight) return null;
    var c = document.createElement('canvas');
    var regionSize = 60; // muestreo de 60x60 px
    c.width = regionSize;
    c.height = regionSize;
    var ctx = c.getContext('2d');
    var sx = Math.max(0, x * video.videoWidth - regionSize / 2);
    var sy = Math.max(0, y * video.videoHeight - regionSize / 2);
    sx = Math.min(sx, video.videoWidth - regionSize);
    sy = Math.min(sy, video.videoHeight - regionSize);
    ctx.drawImage(video, sx, sy, regionSize, regionSize, 0, 0, regionSize, regionSize);
    var data = ctx.getImageData(0, 0, regionSize, regionSize).data;
    var sum = 0, n = 0;
    for (var i = 0; i < data.length; i += 4) {
      // Luminancia aprox: 0.299R + 0.587G + 0.114B
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
    return n > 0 ? sum / n : null;
  } catch(e) {
    console.log('No se pudo medir luminancia:', e.message);
    return null;
  }
}

function aplicarFocusExposicion(x, y, luminancia) {
  if (!camaraStream) return;

  var track = camaraStream.getVideoTracks()[0];
  if (!track) return;

  // Verificar capacidades del dispositivo
  var capabilities;
  try {
    capabilities = track.getCapabilities();
  } catch(e) {
    return;
  }

  // PRIMERA PASADA: Solo enfoque (focus) + point of interest.
  // No tocamos exposureMode para no bloquear el auto-ajuste del sistema.
  var focusConstraints = {};
  var focusChanges = false;

  if (capabilities.focusMode) {
    if (capabilities.focusMode.indexOf('single-shot') >= 0) {
      focusConstraints.focusMode = 'single-shot';
      focusChanges = true;
    } else if (capabilities.focusMode.indexOf('continuous') >= 0) {
      focusConstraints.focusMode = 'continuous';
      focusChanges = true;
    }
  }

  if (capabilities.pointsOfInterest) {
    focusConstraints.pointsOfInterest = [{x: x, y: y}];
    focusChanges = true;
  }

  if (focusChanges) {
    track.applyConstraints({advanced: [focusConstraints]}).catch(function(err) {
      console.log('Focus no soportado:', err.message);
    });
  }

  // SEGUNDA PASADA: Compensación de exposición basada en luminancia real medida
  // Esto funciona de forma fiable en todos los Androids.
  if (capabilities.exposureCompensation && luminancia !== null) {
    var min = capabilities.exposureCompensation.min;
    var max = capabilities.exposureCompensation.max;
    var step = capabilities.exposureCompensation.step || 0.33;

    // Objetivo: llevar la luminancia del punto hacia ~128 (gris medio)
    // Cada +1 EV aproximadamente dobla el brillo (factor 2x)
    // luminancia=60 -> +1 EV ; luminancia=30 -> +2 EV ; luminancia=200 -> -0.7 EV
    var target = 128;
    var ev = 0;
    if (luminancia > 0) {
      ev = Math.log2(target / Math.max(10, luminancia));
    }
    // Clamp
    ev = Math.max(min, Math.min(max, ev));
    // Ajustar a step
    ev = Math.round(ev / step) * step;

    var expoConstraints = {
      exposureMode: 'continuous',
      exposureCompensation: ev
    };

    track.applyConstraints({advanced: [expoConstraints]}).catch(function(err) {
      // Fallback: sólo exposureCompensation sin exposureMode
      track.applyConstraints({advanced: [{exposureCompensation: ev}]}).catch(function() {});
    });
  } else if (capabilities.exposureMode && capabilities.exposureMode.indexOf('continuous') >= 0) {
    // Si no hay exposureCompensation, al menos asegurar que esté en continuo
    track.applyConstraints({advanced: [{exposureMode: 'continuous'}]}).catch(function() {});
  }

  // White balance continuo (no lo bloqueamos)
  if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.indexOf('continuous') >= 0) {
    track.applyConstraints({advanced: [{whiteBalanceMode: 'continuous'}]}).catch(function() {});
  }
}

// Ajuste manual de exposición (deslizar verticalmente después de tocar)
var _exposureSlideActive = false;
var _exposureStartY = 0;
var _exposureBaseComp = 0;

function iniciarExposureSlide() {
  var video = document.getElementById('camera-video');
  if (!video) return;

  // Retirar handlers previos: se llamaba en cada apertura/switch de cámara y
  // los listeners se acumulaban sobre el mismo <video> (lag creciente)
  if (video._expoMoveHandler) {
    video.removeEventListener('touchmove', video._expoMoveHandler);
    video.removeEventListener('touchend', video._expoEndHandler);
  }

  video._expoMoveHandler = function(e) {
    if (!camaraStream || e.touches.length !== 1) return;

    var track = camaraStream.getVideoTracks()[0];
    if (!track) return;

    var caps;
    try { caps = track.getCapabilities(); } catch(e2) { return; }

    if (!caps.exposureCompensation) return;

    var touch = e.touches[0];

    // Requerir un mínimo de movimiento para activar el slide
    // (evita que un tap normal active el modo manual y oscurezca la imagen)
    var THRESHOLD = 25;

    if (!_exposureSlideActive) {
      if (_exposureStartY === 0) {
        _exposureStartY = touch.clientY;
        try {
          var settings = track.getSettings();
          _exposureBaseComp = settings.exposureCompensation || 0;
        } catch(e3) {
          _exposureBaseComp = 0;
        }
        return;
      }
      // Aún no activado: comprobar si se ha superado el umbral
      if (Math.abs(touch.clientY - _exposureStartY) < THRESHOLD) return;
      _exposureSlideActive = true;
    }

    // Deslizar hacia arriba = más brillo, hacia abajo = menos
    var deltaY = _exposureStartY - touch.clientY;
    var range = caps.exposureCompensation.max - caps.exposureCompensation.min;
    var step = caps.exposureCompensation.step || 0.1;
    // 200px de movimiento = rango completo
    var factor = deltaY / 200;
    var newComp = _exposureBaseComp + factor * range;
    newComp = Math.max(caps.exposureCompensation.min, Math.min(caps.exposureCompensation.max, newComp));
    // Ajustar a step
    newComp = Math.round(newComp / step) * step;

    // NO cambiar exposureMode a 'manual' aquí porque bloquearía el auto-ajuste.
    // Solo ajustar exposureCompensation (que funciona con modo continuous).
    track.applyConstraints({advanced: [{exposureCompensation: newComp}]}).catch(function() {});
  };
  video.addEventListener('touchmove', video._expoMoveHandler, {passive: true});

  video._expoEndHandler = function() {
    _exposureSlideActive = false;
    _exposureStartY = 0;
  };
  video.addEventListener('touchend', video._expoEndHandler);
}

var miniMapaImg = null; // Imagen capturada del mini mapa para overlay

function capturarMiniMapaDesdeDiv(mapDiv) {
  try {
    var mapCanvas = document.createElement('canvas');
    var mapRect = mapDiv.getBoundingClientRect();
    if (mapRect.width === 0 || mapRect.height === 0) return;
    mapCanvas.width = mapRect.width * 2;
    mapCanvas.height = mapRect.height * 2;
    var mctx = mapCanvas.getContext('2d');

    var tiles = mapDiv.querySelectorAll('.leaflet-tile');
    var dibujados = 0;
    tiles.forEach(function(tile) {
      if (!tile.complete || tile.naturalWidth === 0) return;
      var tileRect = tile.getBoundingClientRect();
      var dx = (tileRect.left - mapRect.left) * 2;
      var dy = (tileRect.top - mapRect.top) * 2;
      try { mctx.drawImage(tile, dx, dy, tileRect.width * 2, tileRect.height * 2); dibujados++; } catch(e) {}
    });

    if (dibujados > 0) {
      var centerX = mapCanvas.width / 2;
      var centerY = mapCanvas.height / 2;
      mctx.beginPath();
      mctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
      mctx.fillStyle = '#e74c3c';
      mctx.fill();
      mctx.strokeStyle = '#fff';
      mctx.lineWidth = 4;
      mctx.stroke();
      miniMapaImg = mapCanvas;
    }
  } catch(e) { console.warn('No se pudo capturar mini mapa:', e); }
}

// Espera a que TODAS las tiles del mini-mapa estén cargadas y luego captura.
// Reintenta hasta maxRetries veces si quedan tiles pendientes.
function esperarTilesYCapturar(mapDiv, maxRetries) {
  if (!mapDiv) return;
  var retries = maxRetries || 20;

  function intentar(n) {
    var tiles = mapDiv.querySelectorAll('.leaflet-tile');
    if (tiles.length === 0) {
      if (n > 0) setTimeout(function() { intentar(n - 1); }, 500);
      return;
    }
    var pendientes = 0;
    tiles.forEach(function(tile) {
      if (!tile.complete || tile.naturalWidth === 0) pendientes++;
    });
    if (pendientes === 0) {
      capturarMiniMapaDesdeDiv(mapDiv);
    } else if (n > 0) {
      setTimeout(function() { intentar(n - 1); }, 500);
    } else {
      capturarMiniMapaDesdeDiv(mapDiv);
    }
  }

  intentar(retries);
}

function iniciarOverlayCamara() {
  var cfg = typeof obtenerConfigWatermark === 'function' ? obtenerConfigWatermark() : {
    mostrarBrujula: true, tipoMiniMapa: 'topografico', escalaMiniMapa: 14,
    tipoCoordenadas: 'utm', mostrarMunicipio: false
  };

  // Brújula — limpiar handlers/sensores previos
  if (window._compassHandler) {
    window.removeEventListener('deviceorientationabsolute', window._compassHandler, true);
    window.removeEventListener('deviceorientation', window._compassHandler, true);
    window._compassHandler = null;
  }
  if (window._compassSensor) {
    try { window._compassSensor.stop(); } catch(e) {}
    window._compassSensor = null;
  }
  window._compassAbsolute = false;
  compassHeading = null;

  function actualizarBrujulaUI(heading) {
    compassHeading = Math.round(heading) % 360;
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    var dir = dirs[Math.floor((compassHeading + 22.5) / 45) % 8];
    var el = document.getElementById('cam-compass');
    if (el) el.textContent = dir + ' ' + compassHeading + '°';
  }

  // --- Método 1: AbsoluteOrientationSensor (más fiable en Android Chrome) ---
  var sensorIniciado = false;
  if ('AbsoluteOrientationSensor' in window) {
    try {
      var sensor = new AbsoluteOrientationSensor({frequency: 10});
      sensor.addEventListener('reading', function() {
        var q = sensor.quaternion;
        var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        // Dirección de la cámara (0,0,-1 en coords dispositivo) rotada al marco terrestre
        var fx = -2 * (qw * qy + qx * qz); // componente Este
        var fy = 2 * (qw * qx - qy * qz);  // componente Norte
        var h = Math.atan2(fx, fy) * 180 / Math.PI;
        if (h < 0) h += 360;
        window._compassAbsolute = true;
        actualizarBrujulaUI(h);
      });
      sensor.addEventListener('error', function(e) {
        console.warn('Sensor brújula error:', e.error.message);
      });
      sensor.start();
      window._compassSensor = sensor;
      sensorIniciado = true;
    } catch(e) {
      // Sensor no disponible, continuar con fallback
    }
  }

  // --- Método 2 (fallback): deviceorientation events ---
  var handler = function(e) {
    if (sensorIniciado && window._compassAbsolute) return;
    var heading = null;
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading;
      window._compassAbsolute = true;
    } else if (e.absolute === true && typeof e.alpha === 'number') {
      heading = (360 - e.alpha) % 360;
      window._compassAbsolute = true;
    } else if (typeof e.alpha === 'number' && !window._compassAbsolute) {
      heading = (360 - e.alpha) % 360;
    }
    if (heading !== null) actualizarBrujulaUI(heading);
  };
  window._compassHandler = handler;

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(state) {
      if (state === 'granted') {
        window.addEventListener('deviceorientationabsolute', handler, true);
        window.addEventListener('deviceorientation', handler, true);
      }
    }).catch(function() {
      window.addEventListener('deviceorientation', handler, true);
    });
  } else if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
  }

  miniMapaImg = null;

  // GPS para overlay
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      // Si el usuario canceló la cámara antes de llegar el fix (GPS lento en
      // el monte), no crear el mini-mapa sobre un modal ya cerrado
      if (!camaraStream) return;
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude, accuracy: pos.coords.accuracy, ts: pos.timestamp || Date.now()};

      // Mostrar coordenadas según config
      if (cfg.tipoCoordenadas === 'geograficas') {
        document.getElementById('cam-coords').textContent = formatCoordGeo(gpsPos.lat, gpsPos.lon);
      } else {
        document.getElementById('cam-coords').textContent = formatUTMString(gpsPos.lat, gpsPos.lon);
      }

      // Geocodificación inversa para municipio/provincia/CP
      if (cfg.mostrarMunicipio) {
        geocodificarInverso(gpsPos.lat, gpsPos.lon, function(geo) {
          gpsPos._geo = geo;
        });
      }

      // Mini mapa configurable
      if (cfg.tipoMiniMapa !== 'ninguno') {
        try {
          var mapDiv = document.getElementById('camera-minimap');
          if (miniMapaCamera) miniMapaCamera.remove();
          var zoomLevel = cfg.escalaMiniMapa || 14;
          miniMapaCamera = L.map(mapDiv, {zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false}).setView([gpsPos.lat, gpsPos.lon], zoomLevel);

          var CORSTileLayer = L.TileLayer.extend({
            createTile: function(coords, done) {
              var tile = document.createElement('img');
              tile.crossOrigin = 'anonymous';
              tile.alt = '';
              tile.setAttribute('role', 'presentation');
              tile.onload = function() { done(null, tile); };
              tile.onerror = function(e) { done(e, tile); };
              tile.src = this.getTileUrl(coords);
              return tile;
            }
          });

          // Seleccionar capa según configuración
          var tileUrl;
          if (cfg.tipoMiniMapa === 'ortofoto') {
            tileUrl = 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}';
            new CORSTileLayer(tileUrl, {maxZoom: 20}).addTo(miniMapaCamera);
          } else {
            // Topográfico (IGN España)
            tileUrl = 'https://www.ign.es/wmts/mapa-raster?layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}';
            new CORSTileLayer(tileUrl, {maxZoom: 20}).addTo(miniMapaCamera);
          }

          L.marker([gpsPos.lat, gpsPos.lon], {
            icon: L.divIcon({className: '', html: '<div style="width:14px;height:14px;background:#e74c3c;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>', iconSize: [14,14], iconAnchor: [7,7]})
          }).addTo(miniMapaCamera);

          // Esperar a que las tiles se carguen realmente antes de capturar.
          // 'load' de Leaflet salta cuando todas las tiles visibles están listas.
          miniMapaCamera.on('load', function() {
            setTimeout(function() { capturarMiniMapaDesdeDiv(mapDiv); }, 200);
          });

          // Además, polling robusto: comprueba cada 500ms si todas las tiles
          // <img> del DOM tienen .complete=true (hasta 20 intentos = 10s).
          esperarTilesYCapturar(mapDiv, 20);
        } catch(e) {}
      }
    }, function() {}, {enableHighAccuracy: true});
  }
}

// Dibujar rosa de los vientos en canvas, rotada según heading del dispositivo
function dibujarRosaVientos(ctx, cx, cy, size) {
  ctx.save();

  // Fondo circular semitransparente (no rota)
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(80,80,80,0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Rotar todo el contenido interior según el heading del dispositivo.
  // compassHeading = grados desde el Norte geográfico en sentido horario.
  // Si el dispositivo apunta al Este (heading=90), el Norte real queda a la
  // izquierda del usuario → rotamos la rosa -90° para que la flecha N apunte
  // hacia la izquierda en la imagen.
  var headingRad = 0;
  if (compassHeading !== null) {
    headingRad = -(compassHeading * Math.PI / 180);
  }

  ctx.translate(cx, cy);
  ctx.rotate(headingRad);

  var r = size * 0.7;

  // Flecha Norte (cian)
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(-r * 0.18, 0);
  ctx.lineTo(0, -r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#00e5ff';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.18, 0);
  ctx.lineTo(0, -r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#00b8d4';
  ctx.fill();

  // Flecha Sur
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(-r * 0.18, 0);
  ctx.lineTo(0, r * 0.15);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.18, 0);
  ctx.lineTo(0, r * 0.15);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Flecha Este
  ctx.beginPath();
  ctx.moveTo(r * 0.6, 0);
  ctx.lineTo(0, -r * 0.12);
  ctx.lineTo(r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.6, 0);
  ctx.lineTo(0, r * 0.12);
  ctx.lineTo(r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // Flecha Oeste
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(0, -r * 0.12);
  ctx.lineTo(-r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(0, r * 0.12);
  ctx.lineTo(-r * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // Letras cardinales (también rotan con la rosa)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var fs = size * 0.28;
  ctx.font = 'bold ' + fs + 'px sans-serif';

  ctx.fillStyle = '#00e5ff';
  ctx.fillText('N', 0, -size * 0.88);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('S', 0, size * 0.90);
  ctx.fillText('E', size * 0.88, 0);
  ctx.fillText('W', -size * 0.88, 0);

  ctx.restore();
}

// Formatear coordenadas geográficas con grados/minutos/segundos
function formatCoordGeo(lat, lon) {
  function toDMS(val, pos, neg) {
    var abs = Math.abs(val);
    var d = Math.floor(abs);
    var m = Math.floor((abs - d) * 60);
    var s = ((abs - d) * 60 - m) * 60;
    return d + '° ' + ('0' + m).slice(-2) + "' " + s.toFixed(1) + '" ' + (val >= 0 ? pos : neg);
  }
  return toDMS(lat, 'N', 'S') + '  ' + toDMS(lon, 'E', 'W');
}

// Alias usado por mapa (panel GPS, tabla de atributos, waypoints) y por los
// informes PDF. Existía en versiones antiguas y se perdió en un refactor:
// sin él, generar el PDF de un registro con coordenadas lanzaba
// ReferenceError y el informe nunca se creaba.
function formatCoordNW(lat, lon) {
  return formatCoordGeo(lat, lon);
}

// Formatear coordenadas UTM como string
function formatUTMString(lat, lon) {
  var u = latLonToUTM(lat, lon);
  return 'UTM ' + u.zone + u.letter + ' ' + u.easting + ' ' + u.northing;
}

// Geocodificación inversa usando Nominatim (cacheada)
var _geocodeCache = {};
function geocodificarInverso(lat, lon, callback) {
  var key = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (_geocodeCache[key]) { callback(_geocodeCache[key]); return; }
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&zoom=16&addressdetails=1&accept-language=es')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var addr = data.address || {};
      var result = {
        municipio: addr.city || addr.town || addr.village || addr.municipality || '',
        provincia: addr.province || addr.state || '',
        cp: addr.postcode || ''
      };
      _geocodeCache[key] = result;
      callback(result);
    })
    .catch(function() { callback({municipio: '', provincia: '', cp: ''}); });
}

var _capturandoFoto = false;

function capturarFoto() {
  // Ignorar pulsaciones repetidas mientras se procesa la captura anterior:
  // takePhoto tarda 1-3s en algunos móviles, parecía que el botón no
  // respondía y el usuario pulsaba varias veces
  if (_capturandoFoto) return;
  _capturandoFoto = true;
  vibrar(30);

  var video = document.getElementById('camera-video');
  var btnCap = document.querySelector('.cam-btn-capture');
  if (btnCap) btnCap.style.opacity = '0.4';

  var entregado = false;
  function entregar(fuente, fw, fh) {
    if (entregado) return;
    entregado = true;
    _capturandoFoto = false;
    clearTimeout(fallbackTimer);
    if (btnCap) btnCap.style.opacity = '';
    // Si el usuario canceló la cámara mientras se procesaba la captura,
    // descartar: abrir el preview aquí mostraría una foto "zombi" (frame
    // negro de un vídeo parado) encima del formulario
    var modal = document.getElementById('camera-modal');
    if (!camaraStream || !modal || !modal.classList.contains('open')) return;
    _renderizarFotoFinal(fuente, fw, fh);
  }

  // Red de seguridad: si takePhoto no entrega en 2.5s (pasa en algunos
  // Android), capturar el frame del vídeo — el botón SIEMPRE responde
  var fallbackTimer = setTimeout(function() {
    entregar(video, video.videoWidth, video.videoHeight);
  }, 2500);

  // Intentar capturar a la RESOLUCIÓN NATIVA del sensor con ImageCapture.
  // El vídeo de previsualización es 1080p, pero takePhoto() entrega la foto
  // a plena resolución (p.ej. 4000x3000), dando imágenes mucho más nítidas.
  if (imageCaptureObj && typeof imageCaptureObj.takePhoto === 'function') {

    var procesarBlob = function(blob) {
      if (entregado) return; // ya respondió el fallback
      // createImageBitmap con orientación EXIF garantiza que la foto se
      // dibuje siempre derecha, independientemente de cómo el navegador
      // interprete la rotación del sensor (evita fotos giradas 90°).
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(blob, {imageOrientation: 'from-image'}).then(function(bmp) {
          clearTimeout(fallbackTimer);
          entregar(bmp, bmp.width, bmp.height);
          try { bmp.close(); } catch(e) {}
        }).catch(function() {
          procesarBlobConImagen(blob);
        });
      } else {
        procesarBlobConImagen(blob);
      }
    };

    var procesarBlobConImagen = function(blob) {
      var img = new Image();
      img.onload = function() {
        clearTimeout(fallbackTimer);
        entregar(img, img.naturalWidth, img.naturalHeight);
        try { URL.revokeObjectURL(img.src); } catch(e) {}
      };
      img.onerror = function() {
        // Si falla la carga del blob, usar el frame del vídeo
        clearTimeout(fallbackTimer);
        entregar(video, video.videoWidth, video.videoHeight);
      };
      img.src = URL.createObjectURL(blob);
    };

    var tomarFoto = function(opciones) {
      imageCaptureObj.takePhoto(opciones).then(procesarBlob).catch(function() {
        // Reintentar sin opciones por si las opciones no son válidas.
        // imageCaptureObj puede ser null si el usuario canceló la cámara
        // mientras takePhoto estaba pendiente.
        if (imageCaptureObj && opciones && Object.keys(opciones).length > 0) {
          imageCaptureObj.takePhoto().then(procesarBlob).catch(function() {
            entregar(video, video.videoWidth, video.videoHeight);
          });
        } else {
          entregar(video, video.videoWidth, video.videoHeight);
        }
      });
    };

    // Consultar capacidades para pedir la MÁXIMA resolución del sensor
    if (typeof imageCaptureObj.getPhotoCapabilities === 'function') {
      imageCaptureObj.getPhotoCapabilities().then(function(caps) {
        var opts = {};
        if (caps && caps.imageWidth && caps.imageWidth.max) opts.imageWidth = caps.imageWidth.max;
        if (caps && caps.imageHeight && caps.imageHeight.max) opts.imageHeight = caps.imageHeight.max;
        // Desactivar flash en campo (rara vez útil, puede falsear color de vegetación)
        if (caps && caps.fillLightMode && caps.fillLightMode.indexOf('off') >= 0) {
          opts.fillLightMode = 'off';
        }
        tomarFoto(opts);
      }).catch(function() { tomarFoto({}); });
    } else {
      tomarFoto({});
    }

  } else {
    clearTimeout(fallbackTimer);
    entregar(video, video.videoWidth, video.videoHeight);
  }
}

function _renderizarFotoFinal(fuente, fw, fh) {
  var cfg = typeof obtenerConfigWatermark === 'function' ? obtenerConfigWatermark() : {
    tamanoTexto: 'mediano', mostrarCodigo: true, formatoFecha: 'fecha',
    tipoCoordenadas: 'utm', mostrarOrientacion: true, mostrarMunicipio: false,
    mostrarBrujula: true, tipoMiniMapa: 'topografico', escalaMiniMapa: 14
  };

  // Intentar capturar mini mapa una última vez si no se tiene
  if (!miniMapaImg && cfg.tipoMiniMapa !== 'ninguno') {
    var mapDiv = document.getElementById('camera-minimap');
    if (mapDiv) capturarMiniMapaDesdeDiv(mapDiv);
  }

  var canvas = document.getElementById('preview-canvas');
  var vw = fw || 1920, vh = fh || 1080;

  // --- CANVAS ADAPTATIVO: respeta la ORIENTACIÓN real de la fuente ---
  // Antes se forzaba SIEMPRE retrato (H=srcLong), lo que en fuentes
  // landscape (vídeo 1080p, fotos sin EXIF) provocaba un upscale del
  // 33–122% y recortaba más de la mitad de la escena.
  // Ahora: si la fuente es horizontal → lienzo horizontal (4:3); si es
  // vertical → lienzo vertical (3:4). En ambos casos escala ≤ 1 (sin
  // ampliar) y recorte mínimo.
  var W, H;
  var srcShort = Math.min(vw, vh);
  var srcLong = Math.max(vw, vh);
  var esLandscape = vw > vh;

  if (esLandscape) {
    // Lienzo horizontal 4:3
    W = srcLong;
    H = Math.round(W * 3 / 4);
    if (H > srcShort) {
      H = srcShort;
      W = Math.round(H * 4 / 3);
      if (W > srcLong) W = srcLong;
    }
  } else {
    // Lienzo vertical 3:4 (caso típico: teléfono en vertical)
    H = srcLong;
    W = Math.round(H * 3 / 4);
    if (W > srcShort) {
      W = srcShort;
      H = Math.round(W * 4 / 3);
      if (H > srcLong) H = srcLong;
    }
  }

  // Mínimo de tamaño para watermarks legibles, SIN ampliar por encima
  // de la resolución nativa de la fuente (evita pixelado de vídeo 720p).
  var ladoCorto = Math.min(W, H);
  if (ladoCorto < 1200) {
    var objetivo = Math.min(1200, srcShort);
    if (objetivo > ladoCorto) {
      var minScale = objetivo / ladoCorto;
      W = Math.round(W * minScale);
      H = Math.round(H * minScale);
    }
  }
  // Máximo 5000px en el lado largo por memoria
  var ladoLargo = Math.max(W, H);
  if (ladoLargo > 5000) {
    var maxScale = 5000 / ladoLargo;
    W = Math.round(W * maxScale);
    H = Math.round(H * maxScale);
  }

  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Dibujar foto (recorte "cover")
  var scale = Math.max(W / vw, H / vh);
  var sw = W / scale, sh = H / scale;
  var sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, W, H);

  // Postproceso: reducción de ruido (adaptada a la luz) + micro-nitidez,
  // en una sola pasada para minimizar memoria en móvil.
  _postprocesarFoto(ctx, W, H);

  // --- Factor de escala proporcional para watermarks ---
  // El diseño base era un lienzo retrato de 3060px de ancho (lado corto).
  // Usar el lado corto mantiene el tamaño de los watermarks consistente
  // tanto en fotos verticales como horizontales.
  var refScale = Math.min(W, H) / 3060;
  var factorTexto = cfg.tamanoTexto === 'pequeno' ? 0.75 : (cfg.tamanoTexto === 'grande' ? 1.3 : 1.0);

  // --- ROSA DE LOS VIENTOS ---
  if (cfg.mostrarBrujula) {
    var rPos = Math.round(120 * refScale);
    dibujarRosaVientos(ctx, rPos, rPos, Math.round(95 * refScale));
  }

  // --- MINI MAPA ---
  if (cfg.tipoMiniMapa !== 'ninguno') {
    var mapSize = Math.round(500 * refScale);
    var mapMargin = Math.round(30 * refScale);
    var mapX = mapMargin, mapY = H - mapSize - mapMargin;
    var mapRadius = Math.round(16 * refScale);
    if (miniMapaImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius);
      ctx.clip();
      ctx.drawImage(miniMapaImg, mapX, mapY, mapSize, mapSize);
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.round(4 * refScale);
      ctx.stroke();
    } else if (gpsPos) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius);
      ctx.fillStyle = 'rgba(200,220,200,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.round(4 * refScale);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, Math.round(16 * refScale), 0, Math.PI * 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.round(5 * refScale);
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.font = Math.round(22 * refScale) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Zoom ' + cfg.escalaMiniMapa, mapX + mapSize / 2, mapY + mapSize - Math.round(20 * refScale));
      ctx.textAlign = 'start';
    }
  }

  // --- INFO PANEL (esquina inferior derecha) ---
  var coordStr = 'Sin GPS';
  if (gpsPos) {
    if (cfg.tipoCoordenadas === 'geograficas') {
      coordStr = formatCoordGeo(gpsPos.lat, gpsPos.lon);
    } else {
      coordStr = formatUTMString(gpsPos.lat, gpsPos.lon);
    }
  }

  var fechaFoto = new Date();
  var dd = ('0' + fechaFoto.getDate()).slice(-2);
  var mm = ('0' + (fechaFoto.getMonth() + 1)).slice(-2);
  var yyyy = fechaFoto.getFullYear();
  var fechaStr = dd + '/' + mm + '/' + yyyy;
  if (cfg.formatoFecha === 'fechahora') {
    try {
      var horaM = fechaFoto.toLocaleTimeString('es-ES', {timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false});
      fechaStr += ' ' + horaM;
    } catch(e) {
      var hh = ('0' + fechaFoto.getHours()).slice(-2);
      var mi = ('0' + fechaFoto.getMinutes()).slice(-2);
      fechaStr += ' ' + hh + ':' + mi;
    }
  }

  var orientStr = '';
  if (cfg.mostrarOrientacion && compassHeading !== null) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    var dir = dirs[Math.floor((compassHeading + 22.5) / 45) % 8];
    orientStr = dir + ' ' + compassHeading + '°';
  }

  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = Math.round(8 * refScale);
  ctx.shadowOffsetX = Math.round(2 * refScale);
  ctx.shadowOffsetY = Math.round(2 * refScale);
  ctx.textAlign = 'right';

  var textRight = W - Math.round(50 * refScale);
  var lineY = H - Math.round(40 * refScale);
  var lineSpacing = Math.round(65 * refScale * factorTexto);
  var fontBase = Math.round(42 * refScale * factorTexto);

  if (cfg.mostrarMunicipio && gpsPos && gpsPos._geo) {
    var geo = gpsPos._geo;
    var geoStr = [geo.municipio, geo.provincia, geo.cp].filter(Boolean).join(', ');
    if (geoStr) {
      ctx.fillStyle = '#ffffff';
      ctx.font = Math.round(34 * refScale * factorTexto) + 'px sans-serif';
      ctx.fillText(geoStr, textRight, lineY);
      lineY -= lineSpacing;
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = Math.round(38 * refScale * factorTexto) + 'px sans-serif';
  ctx.fillText(coordStr, textRight, lineY);
  lineY -= lineSpacing;

  if (orientStr) {
    ctx.fillStyle = '#ffffff';
    ctx.font = Math.round(38 * refScale * factorTexto) + 'px sans-serif';
    ctx.fillText(orientStr, textRight, lineY);
    lineY -= lineSpacing;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = fontBase + 'px sans-serif';
  ctx.fillText(fechaStr, textRight, lineY);
  lineY -= lineSpacing;

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.round(48 * refScale * factorTexto) + 'px sans-serif';
  ctx.fillText(fotoCodigo, textRight, lineY);
  lineY -= lineSpacing;

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.round(56 * refScale * factorTexto) + 'px sans-serif';
  ctx.fillText('RAPCA EMA', textRight, lineY);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.textAlign = 'start';

  fotoCapturada = canvas;
  anotaciones = [];

  if (camaraStream) {
    camaraStream.getTracks().forEach(function(t) { t.stop(); });
    camaraStream = null;
  }
  // Parar la brújula: el sensor a 10Hz seguía emitiendo (gastando batería)
  // hasta la siguiente apertura de cámara. "Repetir" la reactiva vía abrirCamara.
  detenerBrujula();
  detenerIndicadorDistancia();
  document.getElementById('camera-modal').classList.remove('open');
  document.getElementById('preview-modal').classList.add('open');
}

// Postproceso en una sola pasada: reducción de ruido adaptada a la luz
// + realce sutil de bordes (unsharp mask). Una pasada para limitar el
// uso de memoria en móviles (un único getImageData/putImageData).
//
// Combina dos operaciones lineales sobre cada canal:
//   denoise = d·(1-nr) + a·nr           (acerca al promedio local: suaviza ruido)
//   sharp   = denoise + (denoise - a)·s (unsharp mask)
// que se reduce a: result = d·(1-nr)(1+s) + a·(nr·(1+s) - s)
// donde d = píxel, a = promedio de los 4 vecinos ortogonales.
// Con nr=0 equivale al sharpening puro de antes.
function _postprocesarFoto(ctx, w, h) {
  if (w * h > 20000000) return;
  try {
    var imgData = ctx.getImageData(0, 0, w, h);
    var d = imgData.data;
    var src = new Uint8ClampedArray(d);
    var stride = w * 4;

    // Estimar luz media muestreando luminancia (1 de cada ~50 px)
    var sumL = 0, nL = 0;
    var paso = Math.max(4, Math.round(src.length / 4 / 20000)) * 4;
    for (var p = 0; p < src.length; p += paso) {
      sumL += 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
      nL++;
    }
    var meanLum = nL > 0 ? sumL / nL : 128;

    // Reducción de ruido proporcional a la oscuridad de la escena.
    // Escenas luminosas (campo soleado): nr=0 → solo nitidez, color fiel.
    // Escenas oscuras (amanecer/sombra densa): más suavizado del ruido.
    var nr = 0;
    if (meanLum < 60) nr = 0.35;
    else if (meanLum < 120) nr = 0.35 * (120 - meanLum) / 60;

    // En muy poca luz, bajar el realce para no amplificar ruido residual.
    var s = meanLum < 60 ? 0.18 : 0.3;

    // Coeficientes precalculados: result = kd·d + ka·a
    var kd = (1 - nr) * (1 + s);
    var ka = nr * (1 + s) - s;

    for (var y = 1; y < h - 1; y++) {
      var row = y * stride;
      for (var x = 1; x < w - 1; x++) {
        var i = row + x * 4;
        for (var c = 0; c < 3; c++) {
          var center = src[i + c];
          var a = (src[i - stride + c] + src[i + stride + c] + src[i - 4 + c] + src[i + 4 + c]) * 0.25;
          d[i + c] = kd * center + ka * a;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch(e) {}
}

// --- SISTEMA DE GHOSTING PARA FOTOS COMPARATIVAS ---

// ============================================================
// INDICADOR DE DISTANCIA AL WAYPOINT DE LA VISITA ANTERIOR
// Solo se muestra en pantalla mientras se encuadra la foto comparativa:
// el sello de la foto se dibuja en canvas y NO incluye este elemento.
// ============================================================
var camDistWatchId = null;
// Token de generación: invalida búsquedas/watches en vuelo cuando se detiene
// el indicador (la búsqueda en IndexedDB es async y el watch podía arrancar
// DESPUÉS de cerrar la cámara, quedándose huérfano gastando batería)
var camDistGen = 0;

function _distanciaMetros(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function iniciarIndicadorDistancia(tipo, subtipo) {
  detenerIndicadorDistancia();
  var gen = camDistGen;
  var el = document.getElementById('cam-distancia');
  if (!el) return;
  // Solo para fotos comparativas W1/W2
  if (subtipo !== 'W1' && subtipo !== 'W2') return;
  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var unidad = (document.getElementById(prefix + '-unidad') || {}).value || '';
  if (!unidad || !db || !navigator.geolocation) return;

  // Buscar el waypoint de referencia: el más reciente de esa unidad+waypoint
  obtenerTodosDB('waypoints_comp').then(function(wps) {
    // Si el indicador se detuvo mientras resolvía IndexedDB, abortar
    if (gen !== camDistGen) return;
    var candidatos = (wps || []).filter(function(w) {
      return w.unidad === unidad && w.waypoint === subtipo && w.lat && w.lon;
    }).sort(function(a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')); });

    // Fallback: coordenadas guardadas en las fotosComp de los registros
    if (candidatos.length === 0 && typeof registros !== 'undefined' && registros) {
      var deRegistros = [];
      registros.forEach(function(r) {
        if (r.unidad !== unidad || !r.datos || !r.datos.fotosComp) return;
        r.datos.fotosComp.forEach(function(fc) {
          if ((fc.waypoint || '') === subtipo && fc.lat && fc.lon) {
            deRegistros.push({lat: fc.lat, lon: fc.lon, fecha: r.fecha || ''});
          }
        });
      });
      deRegistros.sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
      candidatos = deRegistros;
    }

    if (candidatos.length === 0) return; // sin waypoint previo: no mostrar nada
    var ref = candidatos[0];

    function pintar(lat, lon, accuracy) {
      var d = _distanciaMetros(lat, lon, ref.lat, ref.lon);
      var txt = d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m';
      // Verde en el punto (según precisión GPS), naranja cerca, blanco lejos
      var cerca = d <= Math.max(10, accuracy || 10);
      var medio = d <= 25;
      el.style.background = cerca ? 'rgba(39,174,96,.85)' : (medio ? 'rgba(230,126,34,.85)' : 'rgba(0,0,0,.7)');
      el.textContent = '📏 ' + txt + ' al ' + subtipo + (cerca ? ' ✓' : '');
      el.style.display = 'block';
    }

    if (gpsPos && gpsPos.ts && (Date.now() - gpsPos.ts) < 15000) {
      pintar(gpsPos.lat, gpsPos.lon, gpsPos.accuracy);
    } else {
      el.textContent = '📏 buscando GPS...';
      el.style.background = 'rgba(0,0,0,.7)';
      el.style.display = 'block';
    }

    camDistWatchId = navigator.geolocation.watchPosition(function(pos) {
      if (gen !== camDistGen) return;
      gpsPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude,
                accuracy: pos.coords.accuracy, ts: pos.timestamp || Date.now()};
      pintar(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    }, function() {}, {enableHighAccuracy: true, maximumAge: 0});
  }).catch(function() {});
}

function detenerIndicadorDistancia() {
  camDistGen++;
  if (camDistWatchId) {
    navigator.geolocation.clearWatch(camDistWatchId);
    camDistWatchId = null;
  }
  var el = document.getElementById('cam-distancia');
  if (el) el.style.display = 'none';
}

function cargarGhostFoto(tipo, subtipo) {
  // Buscar foto previa del mismo waypoint y unidad para usar como ghost
  var ghostEl = document.getElementById('ghost-overlay');
  var ghostControls = document.getElementById('ghost-controls');
  ghostEl.style.display = 'none';
  ghostControls.style.display = 'none';
  ghostingActivo = false;

  // Solo para fotos comparativas W1/W2
  if (subtipo !== 'W1' && subtipo !== 'W2') return;

  var prefix = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
  var unidad = document.getElementById(prefix + '-unidad').value || '';
  if (!unidad) return;

  // El ghost debe mostrar el waypoint de CUALQUIER visita anterior: la VP usa
  // códigos UNIDAD_VP_W1_n y EL/EI usan UNIDAD_EV_W1_n. Antes solo se buscaba
  // el prefijo del tipo actual y, p. ej., al hacer la EL nunca aparecía la
  // foto de la Visita Previa.
  function coincideGhost(codigo) {
    if (!codigo) return false;
    // Exigir el segmento de tipo completo: evita que una unidad que sea
    // prefijo de otra (p.ej. FINCA y FINCA_SUR) coja fotos ajenas
    return codigo.indexOf(unidad + '_VP_' + subtipo + '_') === 0 ||
           codigo.indexOf(unidad + '_EV_' + subtipo + '_') === 0;
  }

  function activarGhost(src) {
    ghostEl.src = src;
    ghostEl.onload = function() {
      ghostEl.style.display = 'block';
      ghostEl.style.opacity = ghostOpacity / 100;
      ghostControls.style.display = 'flex';
      ghostingActivo = true;

      var btn = document.getElementById('ghost-toggle-btn');
      btn.textContent = '👻 Ghost ON';
      btn.style.color = '#00e5ff';
      btn.style.borderColor = '#00e5ff';

      var slider = document.getElementById('ghost-slider');
      slider.value = ghostOpacity;
    };
  }

  // Buscar en IndexedDB el thumbnail más reciente que coincida
  if (!db) return;
  obtenerTodosDB('fotos').then(function(fotos) {
    var matches = fotos.filter(function(f) {
      return coincideGhost(f.codigo);
    }).sort(function(a, b) { return (b.fecha || 0) - (a.fecha || 0); });

    if (matches.length > 0 && matches[0].data) {
      activarGhost(matches[0].data);
    } else {
      // Buscar en subidas_pendientes
      obtenerTodosDB('subidas_pendientes').then(function(pendientes) {
        var matchesPend = pendientes.filter(function(f) {
          return coincideGhost(f.codigo);
        }).sort(function(a, b) { return (b.fecha || 0) - (a.fecha || 0); });

        if (matchesPend.length > 0 && matchesPend[0].data) {
          activarGhost(matchesPend[0].data);
        } else {
          // Buscar en fotos precargadas offline y, como último recurso,
          // en los registros sincronizados (descarga de Cloudinary si hay red)
          buscarGhostEnPrecargadas(unidad, subtipo, activarGhost, function() {
            buscarGhostEnRegistros(unidad, subtipo, activarGhost);
          });
        }
      });
    }
  }).catch(function() {});
}

function buscarGhostEnPrecargadas(unidad, subtipo, callback, onMiss) {
  if (!db) return;
  // El store 'fotos_precargadas' no tiene índice 'unidad', así que filtramos en memoria
  obtenerTodosDB('fotos_precargadas').then(function(fotos) {
    var matches = (fotos || []).filter(function(f) {
      return f.unidad === unidad && f.waypoint === subtipo;
    }).sort(function(a, b) {
      // Más reciente primero
      return (b.fecha || '').localeCompare(a.fecha || '');
    });

    if (matches.length > 0 && matches[0].data) {
      callback(matches[0].data);
    } else if (onMiss) {
      onMiss();
    }
  }).catch(function(e) {
    console.warn('Error buscando ghost en precargadas:', e);
    if (onMiss) onMiss();
  });
}

// Último recurso del ghost: buscar en los registros el waypoint más reciente
// de la unidad (de cualquier tipo de visita) y cargar su foto desde cualquier
// fuente, incluida Cloudinary si hay conexión.
function buscarGhostEnRegistros(unidad, subtipo, callback) {
  if (typeof registros === 'undefined' || !registros) return;
  var candidatos = [];
  registros.forEach(function(r) {
    if (r.unidad !== unidad || !r.datos || !r.datos.fotosComp) return;
    r.datos.fotosComp.forEach(function(fc) {
      if ((fc.waypoint || '') === subtipo && fc.numero) {
        candidatos.push({codigo: fc.numero, fecha: r.fecha || '', tipo: r.tipo});
      }
    });
  });
  if (candidatos.length === 0) return;
  candidatos.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
  buscarFotoData(candidatos[0].codigo, candidatos[0].tipo, unidad).then(function(data) {
    if (data) callback(data);
  }).catch(function() {});
}

function toggleGhost() {
  var ghostEl = document.getElementById('ghost-overlay');
  var btn = document.getElementById('ghost-toggle-btn');
  ghostingActivo = !ghostingActivo;
  if (ghostingActivo) {
    ghostEl.style.display = 'block';
    ghostEl.style.opacity = ghostOpacity / 100;
    btn.textContent = '👻 Ghost ON';
    btn.style.color = '#00e5ff';
    btn.style.borderColor = '#00e5ff';
  } else {
    ghostEl.style.display = 'none';
    btn.textContent = '👻 Ghost OFF';
    btn.style.color = '#888';
    btn.style.borderColor = '#888';
  }
}

function ajustarGhost(val) {
  ghostOpacity = parseInt(val);
  var ghostEl = document.getElementById('ghost-overlay');
  if (ghostingActivo) {
    ghostEl.style.opacity = ghostOpacity / 100;
  }
  var label = document.getElementById('ghost-label');
  if (label) label.textContent = ghostOpacity + '%';
}

function repetirFoto() {
  limpiarAnotaciones();
  document.getElementById('preview-modal').classList.remove('open');
  abrirCamara(camaraTipo, camaraSubtipo);
}

// --- Anotaciones interactivas ---
var anotDragging = null;
var anotResizing = null;
var anotStartPos = null;

function anotarFoto() {
  var previewModal = document.getElementById('preview-modal');
  var canvas = document.getElementById('preview-canvas');

  // Crear overlay de anotaciones si no existe
  var overlay = document.getElementById('anot-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'anot-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    // Posicionar relativamente al canvas
    var canvasWrap = document.getElementById('anot-canvas-wrap');
    if (!canvasWrap) {
      canvasWrap = document.createElement('div');
      canvasWrap.id = 'anot-canvas-wrap';
      canvasWrap.style.cssText = 'position:relative;display:inline-block;max-width:95vw;max-height:70vh;';
      canvas.parentNode.insertBefore(canvasWrap, canvas);
      canvasWrap.appendChild(canvas);
      canvasWrap.appendChild(overlay);
    }
  }

  var numAnot = anotaciones.length + 1;
  var circleSize = 50; // Radio en píxeles de pantalla

  // Mostrar diálogo para escribir la anotación
  mostrarDialogoAnotacion(numAnot, function(texto) {
    if (texto === null) return; // Cancelado

    // Crear elemento de anotación
    var anot = document.createElement('div');
    anot.className = 'anot-circle';
    anot.dataset.num = numAnot;
    anot.dataset.radius = circleSize;
    anot.dataset.texto = texto;
    anot.style.cssText = 'position:absolute;left:50%;top:50%;width:' + (circleSize * 2) + 'px;height:' + (circleSize * 2) + 'px;' +
      'margin-left:-' + circleSize + 'px;margin-top:-' + circleSize + 'px;' +
      'border:3px solid #e74c3c;border-radius:50%;pointer-events:auto;touch-action:none;cursor:grab;' +
      'display:flex;align-items:center;justify-content:center;z-index:10;';
    anot.innerHTML = '<span style="color:#e74c3c;font-weight:700;font-size:18px;pointer-events:none;text-shadow:0 0 3px #fff,0 0 5px #fff;">' + numAnot + '</span>' +
      '<div class="anot-resize-handle" style="position:absolute;bottom:-6px;right:-6px;width:18px;height:18px;background:#e74c3c;border-radius:50%;cursor:nwse-resize;pointer-events:auto;touch-action:none;border:2px solid #fff;"></div>';

    // Etiqueta de texto debajo del círculo
    if (texto) {
      var label = document.createElement('div');
      label.className = 'anot-label';
      label.style.cssText = 'position:absolute;top:' + (circleSize * 2 + 4) + 'px;left:50%;transform:translateX(-50%);' +
        'background:rgba(231,76,60,0.9);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;' +
        'white-space:nowrap;pointer-events:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
      label.textContent = texto;
      anot.appendChild(label);
    }

    overlay.appendChild(anot);

    // Eventos táctiles y ratón para arrastrar
    anot.addEventListener('mousedown', anotStartDrag);
    anot.addEventListener('touchstart', anotStartDrag, {passive: false});

    // Eventos para redimensionar
    var handle = anot.querySelector('.anot-resize-handle');
    handle.addEventListener('mousedown', anotStartResize);
    handle.addEventListener('touchstart', anotStartResize, {passive: false});

    anotaciones.push({el: anot, num: numAnot, radius: circleSize, texto: texto});
    showToast('Anotación ' + numAnot + (texto ? ': ' + texto : '') + '. Arrastra para mover.', 'info');
  });
}

function mostrarDialogoAnotacion(numAnot, callback) {
  // Crear modal de anotación
  var modal = document.createElement('div');
  modal.id = 'anot-dialog';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);' +
    'display:flex;align-items:center;justify-content:center;z-index:10000;';

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;max-width:90vw;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
  box.innerHTML = '<h3 style="margin:0 0 12px;color:#1a3d2e;font-size:16px;">Anotación ' + numAnot + '</h3>' +
    '<textarea id="anot-texto-input" placeholder="Escribe la anotación..." ' +
    'style="width:100%;height:80px;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;" autofocus></textarea>' +
    '<div style="display:flex;gap:10px;margin-top:12px;">' +
    '<button id="anot-cancelar-btn" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;font-size:14px;cursor:pointer;">Cancelar</button>' +
    '<button id="anot-guardar-btn" style="flex:1;padding:10px;border:none;border-radius:8px;background:#1a3d2e;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Guardar</button>' +
    '</div>';

  modal.appendChild(box);
  document.body.appendChild(modal);

  var input = document.getElementById('anot-texto-input');
  setTimeout(function() { input.focus(); }, 100);

  document.getElementById('anot-guardar-btn').addEventListener('click', function() {
    var texto = input.value.trim();
    document.body.removeChild(modal);
    callback(texto);
  });

  document.getElementById('anot-cancelar-btn').addEventListener('click', function() {
    document.body.removeChild(modal);
    callback(null);
  });

  // Enter para guardar
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('anot-guardar-btn').click();
    }
  });
}

function anotStartDrag(e) {
  // Evitar si es el handle de resize
  if (e.target.classList.contains('anot-resize-handle')) return;
  e.preventDefault();
  e.stopPropagation();

  var anot = e.currentTarget;
  anotDragging = anot;
  anot.style.cursor = 'grabbing';

  var touch = e.touches ? e.touches[0] : e;
  anotStartPos = {
    x: touch.clientX,
    y: touch.clientY,
    left: anot.offsetLeft + parseInt(anot.style.marginLeft || 0),
    top: anot.offsetTop + parseInt(anot.style.marginTop || 0)
  };
}

function anotStartResize(e) {
  e.preventDefault();
  e.stopPropagation();

  var anot = e.currentTarget.parentElement;
  anotResizing = anot;

  var touch = e.touches ? e.touches[0] : e;
  var rect = anot.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  anotStartPos = {
    x: touch.clientX,
    y: touch.clientY,
    cx: cx,
    cy: cy,
    origRadius: parseInt(anot.dataset.radius)
  };
}

document.addEventListener('mousemove', anotOnMove);
document.addEventListener('touchmove', anotOnMove, {passive: false});
document.addEventListener('mouseup', anotEndDrag);
document.addEventListener('touchend', anotEndDrag);

function anotOnMove(e) {
  if (!anotDragging && !anotResizing) return;
  e.preventDefault();

  var touch = e.touches ? e.touches[0] : e;

  if (anotDragging) {
    var dx = touch.clientX - anotStartPos.x;
    var dy = touch.clientY - anotStartPos.y;
    anotDragging.style.left = (anotStartPos.left + dx) + 'px';
    anotDragging.style.top = (anotStartPos.top + dy) + 'px';
    anotDragging.style.marginLeft = '0';
    anotDragging.style.marginTop = '0';
  }

  if (anotResizing) {
    var dx2 = touch.clientX - anotStartPos.cx;
    var dy2 = touch.clientY - anotStartPos.cy;
    var newRadius = Math.max(20, Math.round(Math.sqrt(dx2 * dx2 + dy2 * dy2)));
    anotResizing.style.width = (newRadius * 2) + 'px';
    anotResizing.style.height = (newRadius * 2) + 'px';
    anotResizing.dataset.radius = newRadius;
    // Ajustar posición para mantener centrado
    var currentLeft = anotResizing.offsetLeft;
    var currentTop = anotResizing.offsetTop;
    var oldRadius = parseInt(anotResizing.style.width) / 2;
    // No recentrar, dejar que el usuario mueva después si quiere
  }
}

function anotEndDrag() {
  if (anotDragging) {
    anotDragging.style.cursor = 'grab';
    anotDragging = null;
  }
  anotResizing = null;
  anotStartPos = null;
}

// Renderizar anotaciones sobre el canvas antes de guardar
function renderizarAnotaciones() {
  var canvas = document.getElementById('preview-canvas');
  var overlay = document.getElementById('anot-overlay');
  if (!overlay || anotaciones.length === 0) return;

  var ctx = canvas.getContext('2d');
  var canvasRect = canvas.getBoundingClientRect();

  // Escala entre el canvas visual y el canvas real
  var scaleX = canvas.width / canvasRect.width;
  var scaleY = canvas.height / canvasRect.height;

  for (var i = 0; i < anotaciones.length; i++) {
    var a = anotaciones[i];
    var el = a.el;
    if (!el) continue;

    var elRect = el.getBoundingClientRect();
    // Centro del elemento relativo al canvas
    var cx = (elRect.left + elRect.width / 2 - canvasRect.left) * scaleX;
    var cy = (elRect.top + elRect.height / 2 - canvasRect.top) * scaleY;
    var radius = (elRect.width / 2) * scaleX;

    // Dibujar círculo
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = Math.max(4, radius * 0.08);
    ctx.stroke();

    // Dibujar número
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold ' + Math.max(24, radius * 0.6) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.num.toString(), cx, cy);

    // Dibujar texto de anotación debajo del círculo
    if (a.texto) {
      var fontSize = Math.max(18, radius * 0.35);
      ctx.font = 'bold ' + fontSize + 'px sans-serif';
      var textWidth = ctx.measureText(a.texto).width;
      var padding = 8 * scaleX;
      var textY = cy + radius + fontSize + padding;
      // Fondo del texto
      ctx.fillStyle = 'rgba(231,76,60,0.85)';
      ctx.beginPath();
      var rr = 6 * scaleX;
      var bx = cx - textWidth / 2 - padding;
      var by = textY - fontSize;
      var bw = textWidth + padding * 2;
      var bh = fontSize + padding;
      ctx.roundRect(bx, by, bw, bh, rr);
      ctx.fill();
      // Texto
      ctx.fillStyle = '#fff';
      ctx.fillText(a.texto, cx, textY - padding / 2);
    }
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// Limpiar overlay de anotaciones
function limpiarAnotaciones() {
  var overlay = document.getElementById('anot-overlay');
  if (overlay) overlay.innerHTML = '';
  anotaciones = [];
}

// Codifica un canvas a JPEG de forma asíncrona (no bloquea la UI).
// Devuelve {dataUrl, blob}. Usa toBlob si está disponible; si no, cae a
// toDataURL síncrono como respaldo.
function _canvasAJpeg(canvas, quality) {
  return new Promise(function(resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('toBlob devolvió null')); return; }
        var r = new FileReader();
        r.onload = function() { resolve({dataUrl: r.result, blob: blob}); };
        r.onerror = function() { reject(r.error || new Error('FileReader')); };
        r.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    } else {
      try { resolve({dataUrl: canvas.toDataURL('image/jpeg', quality), blob: null}); }
      catch(e) { reject(e); }
    }
  });
}

// Convierte un Blob a data URL (base64).
function _blobADataURL(blob) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { reject(r.error || new Error('FileReader')); };
    r.readAsDataURL(blob);
  });
}

// Codifica un canvas a Blob JPEG (para descarga directa, sin base64).
function _canvasABlob(canvas, quality) {
  return new Promise(function(resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('toBlob devolvió null')); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    } else {
      try {
        var du = canvas.toDataURL('image/jpeg', quality);
        var bin = atob(du.split(',')[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], {type: 'image/jpeg'}));
      } catch(e) { reject(e); }
    }
  });
}

// Descarga un Blob como archivo (escritorio o respaldo en móvil)
function descargarBlob(blob, nombre) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}

// ============================================================
// EXIF GPS: inyecta la posición en los metadatos del JPEG
// ============================================================
// Construye un segmento APP1 (Exif) con un IFD0 que apunta a un IFD GPS
// con latitud/longitud (y altitud si está disponible). Big-endian (MM).
// Autónomo, sin librerías externas (la app funciona offline).
function _construirEXIFGPS(lat, lon, alt) {
  function dms(v) {
    v = Math.abs(v);
    var d = Math.floor(v);
    var mf = (v - d) * 60;
    var m = Math.floor(mf);
    var s = (mf - m) * 60;
    return {d: d, m: m, sNum: Math.round(s * 100), sDen: 100};
  }

  var hasAlt = (typeof alt === 'number' && isFinite(alt));
  var latR = dms(lat), lonR = dms(lon);
  var latRef = lat >= 0 ? 'N' : 'S';
  var lonRef = lon >= 0 ? 'E' : 'W';
  var altRef = (hasAlt && alt < 0) ? 1 : 0;

  var nEntries = hasAlt ? 7 : 5;
  // Offsets relativos al inicio del bloque TIFF
  var GPS_IFD = 26;                              // tras IFD0 (8 + 18)
  var dataRel = GPS_IFD + 2 + nEntries * 12 + 4; // inicio del área de datos
  var tiffSize = dataRel + (hasAlt ? 56 : 48);

  var totalApp1 = 2 /*FFE1*/ + 2 /*len*/ + 6 /*Exif\0\0*/ + tiffSize;
  var buf = new ArrayBuffer(totalApp1);
  var dv = new DataView(buf);
  var u8 = new Uint8Array(buf);

  u8[0] = 0xFF; u8[1] = 0xE1;
  dv.setUint16(2, 2 + 6 + tiffSize);            // longitud del segmento
  u8[4] = 0x45; u8[5] = 0x78; u8[6] = 0x69; u8[7] = 0x66; u8[8] = 0; u8[9] = 0; // "Exif\0\0"

  var T = 10;                                    // inicio del bloque TIFF
  dv.setUint16(T + 0, 0x4D4D);                   // "MM" big-endian
  dv.setUint16(T + 2, 0x002A);                   // 42
  dv.setUint32(T + 4, 8);                        // offset a IFD0

  // IFD0: una sola entrada → puntero al IFD GPS
  var ifd0 = T + 8;
  dv.setUint16(ifd0, 1);
  dv.setUint16(ifd0 + 2, 0x8825);                // GPSInfoIFDPointer
  dv.setUint16(ifd0 + 4, 4);                     // tipo LONG
  dv.setUint32(ifd0 + 6, 1);                     // count
  dv.setUint32(ifd0 + 10, GPS_IFD);              // offset al IFD GPS
  dv.setUint32(ifd0 + 14, 0);                    // siguiente IFD = 0

  // IFD GPS
  var gps = T + GPS_IFD;
  dv.setUint16(gps, nEntries);
  var e = gps + 2;
  function entry(tag, type, count, val) {
    dv.setUint16(e, tag); dv.setUint16(e + 2, type);
    dv.setUint32(e + 4, count); dv.setUint32(e + 8, val);
    e += 12;
  }
  entry(0x0000, 1, 4, 0x02030000);                       // GPSVersionID 2.3.0.0
  entry(0x0001, 2, 2, latRef.charCodeAt(0) << 24);       // LatitudeRef
  entry(0x0002, 5, 3, dataRel);                          // Latitude (offset)
  entry(0x0003, 2, 2, lonRef.charCodeAt(0) << 24);       // LongitudeRef
  entry(0x0004, 5, 3, dataRel + 24);                     // Longitude (offset)
  if (hasAlt) {
    entry(0x0005, 1, 1, altRef << 24);                   // AltitudeRef
    entry(0x0006, 5, 1, dataRel + 48);                   // Altitude (offset)
  }
  dv.setUint32(e, 0);                                     // siguiente IFD = 0

  // Área de datos: racionales (numerador, denominador)
  var dataAbs = T + dataRel;
  function rat(p, num, den) { dv.setUint32(p, num); dv.setUint32(p + 4, den); }
  rat(dataAbs, latR.d, 1); rat(dataAbs + 8, latR.m, 1); rat(dataAbs + 16, latR.sNum, latR.sDen);
  rat(dataAbs + 24, lonR.d, 1); rat(dataAbs + 32, lonR.m, 1); rat(dataAbs + 40, lonR.sNum, lonR.sDen);
  if (hasAlt) rat(dataAbs + 48, Math.round(Math.abs(alt) * 100), 100);

  return u8;
}

// Inserta el segmento Exif-GPS justo tras el SOI del JPEG. Devuelve un
// Blob nuevo; si algo falla o no hay GPS, devuelve el blob original.
function inyectarGPSenJPEG(blob, lat, lon, alt) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) {
    return Promise.resolve(blob);
  }
  var leer = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function(res, rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result); };
    r.onerror = function() { rej(r.error); };
    r.readAsArrayBuffer(blob);
  });
  return leer.then(function(ab) {
    var bytes = new Uint8Array(ab);
    if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return blob; // no es JPEG
    var app1 = _construirEXIFGPS(lat, lon, alt);
    var out = new Uint8Array(bytes.length + app1.length);
    out.set(bytes.subarray(0, 2), 0);             // SOI (FFD8)
    out.set(app1, 2);                             // APP1 Exif
    out.set(bytes.subarray(2), 2 + app1.length);  // resto del JPEG
    return new Blob([out], {type: 'image/jpeg'});
  }).catch(function() { return blob; });
}

function aceptarFoto() {
  vibrar(30);

  // Renderizar anotaciones sobre el canvas antes de exportar
  renderizarAnotaciones();

  var canvas = document.getElementById('preview-canvas');

  // Verificar db disponible
  if (!db) {
    showToast('Base de datos no disponible. Reintenta.', 'error');
    return;
  }

  // Capturar variables en closure ANTES de cualquier trabajo asíncrono
  var _fotoCodigo = fotoCodigo;
  var _camaraSubtipo = camaraSubtipo;
  var _camaraTipo = camaraTipo;
  var _gpsLat = gpsPos ? gpsPos.lat : null;
  var _gpsLon = gpsPos ? gpsPos.lon : null;
  var _gpsAlt = (gpsPos && typeof gpsPos.alt === 'number') ? gpsPos.alt : null;

  // Thumbnail proporcional al canvas real
  var thumbW = 400;
  var thumbH = Math.round(thumbW * canvas.height / canvas.width);
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  var tCtx = thumbCanvas.getContext('2d');
  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'high';
  tCtx.drawImage(canvas, 0, 0, thumbW, thumbH);

  // Thumbnail síncrono (canvas de 400px, coste despreciable): la foto debe
  // quedar registrada en fotosPagina ANTES de cualquier trabajo asíncrono.
  // Antes el push se hacía al final de una cadena de 1-3s y si el usuario
  // guardaba la ficha o cambiaba de página justo después de aceptar, la foto
  // quedaba huérfana (en IndexedDB pero fuera del registro).
  var thumbData = thumbCanvas.toDataURL('image/jpeg', 0.8);

  // --- Registro síncrono en la página ---
  if (!fotosPagina[_camaraSubtipo]) fotosPagina[_camaraSubtipo] = [];
  if (_camaraSubtipo === 'W1' || _camaraSubtipo === 'W2') {
    fotosPagina[_camaraSubtipo].push({codigo: _fotoCodigo, lat: _gpsLat, lon: _gpsLon});
    // Guardar waypoint persistente en IndexedDB
    if (_gpsLat && _gpsLon && db) {
      var prefixW = _camaraTipo === 'EI' ? 'ev' : _camaraTipo.toLowerCase();
      var _unidad = document.getElementById(prefixW + '-unidad') ? document.getElementById(prefixW + '-unidad').value : '';
      guardarEnDB('waypoints_comp', {
        id: _fotoCodigo,
        codigo: _fotoCodigo,
        waypoint: _camaraSubtipo,
        lat: _gpsLat,
        lon: _gpsLon,
        unidad: _unidad,
        tipo: _camaraTipo,
        fecha: new Date().toISOString(),
        operador: sesion ? sesion.nombre : ''
      }).catch(function(e) { console.warn('Error guardando waypoint:', e); });
    }
  } else {
    fotosPagina[_camaraSubtipo].push(_fotoCodigo);
  }

  var prefix = _camaraTipo === 'EI' ? 'ev' : _camaraTipo.toLowerCase();
  var previewGrid = document.getElementById(prefix + '-fotos-preview');
  if (previewGrid) {
    var img = document.createElement('img');
    img.src = thumbData;
    img.title = _fotoCodigo;
    img.onclick = function() { abrirLightboxFoto(this.src, _fotoCodigo); };
    previewGrid.appendChild(img);
  }
  actualizarBtnEliminarFotos(prefix);

  // El flag de reinicio de contadores se consume aquí, con la primera foto
  // realmente aceptada (antes se consumía al abrir la cámara, aunque se cancelara)
  localStorage.removeItem('rapca_contadores_reiniciados');

  // Limpiar anotaciones y cerrar inmediatamente (la UI no se congela
  // porque la codificación JPEG es asíncrona vía toBlob).
  limpiarAnotaciones();
  document.getElementById('preview-modal').classList.remove('open');

  // --- Codificación de calidad completa ---
  // UNA sola codificación (0.96) reutilizada para la descarga y la subida:
  // codificar dos JPEG de resolución completa en paralelo duplicaba el pico
  // de memoria y en móviles justos Android mataba la app al encadenar fotos.
  // Se lanza en el MISMO tick: toBlob captura el bitmap en el momento de la
  // llamada y el canvas de preview se reutiliza en la siguiente captura.
  _canvasABlob(canvas, 0.96).then(function(blob) {
    // Insertar coordenadas GPS en los metadatos EXIF
    return inyectarGPSenJPEG(blob, _gpsLat, _gpsLon, _gpsAlt);
  }).then(function(conExif) {
    descargarBlob(conExif, _fotoCodigo + '.jpg');
    // La versión de subida viaja como data URL (formato de sync.js/upload.php)
    return _blobADataURL(conExif);
  }).then(function(uploadData) {
    var esComparativa = _camaraSubtipo === 'W1' || _camaraSubtipo === 'W2';
    return guardarEnDB('fotos', {codigo: _fotoCodigo, data: thumbData, fecha: Date.now()}).then(function() {
      // Solo las fotos comparativas W1/W2 se suben a internet; las generales
      // se quedan a resolución completa en el teléfono (fotos_locales)
      if (esComparativa) {
        return guardarEnDB('subidas_pendientes', {codigo: _fotoCodigo, data: uploadData, tipo: _camaraTipo, fecha: Date.now()});
      }
      return guardarEnDB('fotos_locales', {codigo: _fotoCodigo, data: uploadData, tipo: _camaraTipo, fecha: Date.now()});
    }).then(function() { return esComparativa; });
  }).then(function(esComparativa) {
    actualizarContadorFotos();
    var conn2g = navigator.connection && navigator.connection.effectiveType &&
                 /(^|-)2g$/.test(navigator.connection.effectiveType);
    if (!esComparativa) {
      showToast('Foto ' + _fotoCodigo + ' guardada en el teléfono.', 'success');
    } else if (navigator.onLine && !conn2g) {
      showToast('Foto ' + _fotoCodigo + ' guardada. Subiendo...', 'success');
      subirFotosPendientesAuto();
    } else {
      showToast('Foto ' + _fotoCodigo + ' guardada. Se subirá con mejor cobertura.', 'info');
    }
  }).catch(function(err) {
    console.error('Error procesando foto:', err);
    showToast('Error al guardar foto ' + _fotoCodigo + ': ' + (err.message || err), 'error');
  });
}


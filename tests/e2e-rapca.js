// Cómo ejecutar:
//   1) python3 -m http.server 8899  (en la raíz del repo)
//   2) npm install playwright  (Chromium debe estar instalado)
//   3) descargar las librerías CDN a ./cdn/ (ver CDN_MAP más abajo)
//   4) node e2e-rapca.js
//
// Pruebas de uso end-to-end de RAPCA Campo con Playwright/Chromium
// Pruebas de uso end-to-end de RAPCA Campo con Playwright/Chromium
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8899/index.html';
const resultados = [];
let consoleErrors = [];
let pageErrors = [];

function ok(nombre, cond, detalle) {
  resultados.push({ nombre, pass: !!cond, detalle: detalle || '' });
  console.log((cond ? '  ✅ ' : '  ❌ ') + nombre + (detalle && !cond ? ' — ' + detalle : ''));
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--disable-popup-blocking',
      '--ignore-certificate-errors'
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 412, height: 900 },
    geolocation: { latitude: 37.90, longitude: -3.10, accuracy: 10 },
    permissions: ['geolocation'],
    locale: 'es-ES'
  });

  // Sembrar sesión local antes de cargar la app
  await context.addInitScript(() => {
    localStorage.setItem('rapca_sesion', JSON.stringify({
      token: 'local_test', email: 'test@rapca.es', nombre: 'Tester', rol: 'operador', id: 1
    }));
  });

  // Servir las librerías CDN desde disco (Chromium no llega al proxy de red)
  const fs = require('fs');
  const path = require('path');
  const CDN_MAP = {
    'leaflet@1.9.4/dist/leaflet.js': ['leaflet.js', 'application/javascript'],
    'leaflet@1.9.4/dist/leaflet.css': ['leaflet.css', 'text/css'],
    'leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js': ['mc.js', 'application/javascript'],
    'leaflet.markercluster@1.5.3/dist/MarkerCluster.css': ['mc.css', 'text/css'],
    'leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css': ['mcd.css', 'text/css'],
    'chart.js@4.4.0/dist/chart.umd.min.js': ['chart.js', 'application/javascript'],
    'xlsx@0.18.5/dist/xlsx.full.min.js': ['xlsx.js', 'application/javascript'],
    'jszip@3.10.1/dist/jszip.min.js': ['jszip.js', 'application/javascript'],
    'html2canvas@1.4.1/dist/html2canvas.min.js': ['h2c.js', 'application/javascript']
  };
  await context.route(/(unpkg\.com|cdn\.jsdelivr\.net)/, (route) => {
    const url = route.request().url();
    for (const key of Object.keys(CDN_MAP)) {
      if (url.includes(key)) {
        const [file, tipo] = CDN_MAP[key];
        return route.fulfill({
          status: 200,
          contentType: tipo,
          body: fs.readFileSync(path.join(__dirname, 'cdn', file))
        });
      }
    }
    return route.abort();
  });
  // Tiles de OSM/IGN: responder con imagen vacía para no depender de la red
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await context.route(/tile\.openstreetmap\.org|ign\.es|opentopomap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: pixel }));

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // Ignorar fallos de red esperados (backend PHP inexistente, tiles OSM, CDN)
      if (/Failed to load resource|net::|ERR_/.test(t)) return;
      consoleErrors.push(t);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  console.log('\n== 1. Carga de la app y sesión ==');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  ok('La app carga sin excepciones JS', pageErrors.length === 0, pageErrors.join(' | '));
  const loginOculto = await page.evaluate(() => document.getElementById('login-overlay').style.display === 'none');
  ok('Sesión restaurada (login oculto)', loginOculto);
  const menuActivo = await page.evaluate(() => document.getElementById('menu-page').classList.contains('active'));
  ok('Menú principal visible', menuActivo);

  console.log('\n== 2. Evaluación Ligera: crear y bloquear duplicado ==');
  await page.evaluate(() => irPagina('el'));
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('el-unidad').value = 'TEST_U1'; });
  // Seleccionar un grado de pastoreo
  await page.evaluate(() => {
    var btn = document.querySelector('#el-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="PM"]');
    if (btn) btn.click();
  });
  // Matorralización en EL (campos nuevos, iguales que en EI)
  const matEL = await page.evaluate(() => {
    var c = document.getElementById('el-mat1cob');
    if (!c) return null;
    c.value = '40';
    document.getElementById('el-mat1alt').value = '80';
    document.getElementById('el-mat1esp').value = 'Cistus sp.';
    actualizarResumenMatorral('el');
    return document.getElementById('el-mat-volumen').textContent;
  });
  ok('EL tiene campos de matorralización y calcula el volumen', matEL === '800.00 m³/ha', String(matEL));
  await page.evaluate(() => guardarEL());
  await page.waitForTimeout(500);
  let nEL = await page.evaluate(() => registros.filter(r => r.tipo === 'EL').length);
  ok('Ficha EL guardada', nEL === 1, 'hay ' + nEL);
  const matGuardado = await page.evaluate(() => {
    var r = registros.find(x => x.tipo === 'EL');
    return r.datos.matorral ? r.datos.matorral.volumen : null;
  });
  ok('El matorral de EL se guarda en la ficha', matGuardado === '800.00', String(matGuardado));

  // Intentar duplicado mismo día + unidad
  await page.evaluate(() => irPagina('el'));
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('el-unidad').value = 'TEST_U1'; });
  await page.evaluate(() => guardarEL());
  await page.waitForTimeout(400);
  nEL = await page.evaluate(() => registros.filter(r => r.tipo === 'EL').length);
  ok('Duplicado EL bloqueado (sigue habiendo 1)', nEL === 1, 'hay ' + nEL);

  console.log('\n== 3. Evaluación Intensiva: transectos individuales y ficha única ==');
  await page.evaluate(() => irPagina('menu'));
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('ev-unidad').value = 'TEST_U2'; });

  // T1: pastoreo PM en punto 1, planta con nota
  await page.evaluate(() => {
    document.querySelector('#ev-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="PM"]').click();
    document.getElementById('ev-planta1-nombre').value = 'Stipa tenacissima';
    document.getElementById('ev-planta1-n1').value = '3';
    calcMediaPlanta(1);
    document.getElementById('ev-observaciones').value = 'Observación de T1';
  });
  const tabActivaT1 = await page.evaluate(() =>
    document.querySelector('.transecto-tab[data-t="T1"]').classList.contains('active'));
  ok('Pestaña T1 marcada como activa', tabActivaT1);

  await page.evaluate(() => guardarEI());
  await page.waitForTimeout(600);
  let nEI = await page.evaluate(() => registros.filter(r => r.tipo === 'EI').length);
  ok('Ficha EI creada al guardar T1', nEI === 1, 'hay ' + nEI);
  const enT2 = await page.evaluate(() => transectoActual === 'T2');
  ok('Tras guardar T1 se avanza a T2', enT2);
  const t1Done = await page.evaluate(() =>
    document.querySelector('.transecto-tab[data-t="T1"]').classList.contains('done'));
  ok('Pestaña T1 marcada como completada (✓)', t1Done);
  const t2Activa = await page.evaluate(() =>
    document.querySelector('.transecto-tab[data-t="T2"]').classList.contains('active'));
  ok('Pestaña T2 activa con estilo distinto', t2Activa);

  // El formulario de T2 debe estar limpio (pastoreo/observaciones individuales)
  const t2Limpio = await page.evaluate(() => {
    var sel = document.querySelectorAll('#ev-pastoreo-container .pastoreo-btn.selected').length;
    var obs = document.getElementById('ev-observaciones').value;
    var planta = document.getElementById('ev-planta1-nombre').value;
    return sel === 0 && obs === '' && planta === '';
  });
  ok('T2 empieza limpio (pastoreo/observaciones/plantas propios)', t2Limpio);

  // T2: pastoreo distinto
  await page.evaluate(() => {
    document.querySelector('#ev-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="PI"]').click();
    document.getElementById('ev-observaciones').value = 'Observación de T2';
    document.getElementById('ev-herb1').value = '4';
    calcMediaHerbaceas();
  });
  await page.evaluate(() => guardarEI());
  await page.waitForTimeout(600);
  nEI = await page.evaluate(() => registros.filter(r => r.tipo === 'EI').length);
  ok('T2 se fusiona en la MISMA ficha (sigue habiendo 1 EI)', nEI === 1, 'hay ' + nEI);

  const transectosOK = await page.evaluate(() => {
    var r = registros.find(x => x.tipo === 'EI');
    var t = r.datos.transectos;
    return {
      t1p: t.T1 && t.T1.pastoreo[0],
      t2p: t.T2 && t.T2.pastoreo[0],
      t1o: t.T1 && t.T1.observaciones,
      t2o: t.T2 && t.T2.observaciones,
      t1planta: t.T1 && t.T1.plantas[0].nombre
    };
  });
  ok('T1 conserva su pastoreo (PM)', transectosOK.t1p === 'PM', JSON.stringify(transectosOK));
  ok('T2 tiene su propio pastoreo (PI)', transectosOK.t2p === 'PI');
  ok('Observaciones individuales por transecto', transectosOK.t1o === 'Observación de T1' && transectosOK.t2o === 'Observación de T2');
  ok('T1 conserva la planta con nota', transectosOK.t1planta === 'Stipa tenacissima');

  // Volver a T1 y comprobar que se restauran sus datos en el formulario
  await page.evaluate(() => cambiarTransecto('T1'));
  await page.waitForTimeout(400);
  const t1Restaurado = await page.evaluate(() => {
    var pm = document.querySelector('#ev-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="PM"]');
    return {
      pastoreo: pm && pm.classList.contains('selected'),
      obs: document.getElementById('ev-observaciones').value,
      planta: document.getElementById('ev-planta1-nombre').value
    };
  });
  ok('Al volver a T1 se restaura su pastoreo', t1Restaurado.pastoreo === true, JSON.stringify(t1Restaurado));
  ok('Al volver a T1 se restauran sus observaciones', t1Restaurado.obs === 'Observación de T1');
  ok('Al volver a T1 se restaura su planta', t1Restaurado.planta === 'Stipa tenacissima');

  console.log('\n== 4. Informe PDF de la ficha EI (transectos incluidos) ==');
  const eiId = await page.evaluate(() => registros.find(x => x.tipo === 'EI').id);
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
    page.evaluate((id) => exportarPDFRegistro(id), eiId)
  ]);
  await page.waitForTimeout(1200);
  if (popup) {
    const cuerpo = await popup.evaluate(() => document.body.innerHTML).catch(() => '');
    ok('El PDF se abre en ventana nueva', true);
    ok('El PDF incluye la sección Transecto T1', cuerpo.includes('Transecto T1'));
    ok('El PDF incluye la sección Transecto T2', cuerpo.includes('Transecto T2'));
    ok('El PDF incluye el pastoreo de T2 (PI)', cuerpo.includes('PI'));
    ok('El PDF incluye las observaciones de ambos transectos',
      cuerpo.includes('Observación de T1') && cuerpo.includes('Observación de T2'));
    await popup.close().catch(() => {});
  } else {
    ok('El PDF se abre en ventana nueva', false, 'no se abrió popup (¿fallback HTML?)');
  }

  console.log('\n== 5. Exportación CSV (una fila por transecto) ==');
  const csv = await page.evaluate(() => {
    return new Promise((resolve) => {
      window.descargarArchivo = function(contenido) { resolve(contenido); };
      exportarCSV();
      setTimeout(() => {
        try { ejecutarExportCSV(); } catch (e) { resolve('ERROR: ' + e.message); }
      }, 300);
      setTimeout(() => resolve('TIMEOUT'), 5000);
    });
  });
  const lineasCSV = String(csv).split('\r\n');
  const filasEI_T1 = lineasCSV.filter(l => l.includes('TEST_U2') && l.includes('T1')).length;
  const filasEI_T2 = lineasCSV.filter(l => l.includes('TEST_U2') && l.includes('T2')).length;
  const filasEL = lineasCSV.filter(l => l.includes('TEST_U1')).length;
  ok('CSV generado sin errores', !String(csv).startsWith('ERROR') && csv !== 'TIMEOUT', String(csv).slice(0, 120));
  ok('CSV: fila del transecto T1', filasEI_T1 === 1, 'hay ' + filasEI_T1);
  ok('CSV: fila del transecto T2', filasEI_T2 === 1, 'hay ' + filasEI_T2);
  ok('CSV: fila de la ficha EL', filasEL === 1, 'hay ' + filasEL);
  ok('CSV: pastoreo por transecto correcto',
    lineasCSV.some(l => l.includes('T1') && l.includes('PM')) &&
    lineasCSV.some(l => l.includes('T2') && l.includes('PI')));
  await page.evaluate(() => { try { cerrarModal(); } catch (e) {} });

  console.log('\n== 6. Mapa: centrado en posición real y seguimiento ==');
  const leafletCargado = await page.waitForFunction(() => typeof L !== 'undefined', { timeout: 20000 }).then(() => true).catch(() => false);
  ok('Leaflet (CDN) cargado', leafletCargado);
  // Simular una posición VIEJA y lejana en caché: el mapa NO debe centrarse en ella
  await page.evaluate(() => {
    gpsPos = { lat: 40.0, lon: -4.0, accuracy: 10, ts: Date.now() - 600000 };
  });
  await page.evaluate(() => irPagina('mapa'));
  await page.waitForTimeout(3000);
  const centro1 = await page.evaluate(() => {
    var c = mapa.getCenter();
    return { lat: c.lat, lon: c.lng, zoom: mapa.getZoom(), marker: !!gpsMapMarker, seguir: gpsMapSeguir };
  });
  ok('Mapa centrado en la posición GPS real (ignora la posición vieja en caché)',
    Math.abs(centro1.lat - 37.90) < 0.01 && Math.abs(centro1.lon + 3.10) < 0.01,
    JSON.stringify(centro1));
  ok('Marcador de posición creado', centro1.marker);
  ok('Zoom de trabajo aplicado (>=15)', centro1.zoom >= 15, 'zoom=' + centro1.zoom);

  // Fix impreciso repentino (red/wifi, ±2000m): el marcador NO debe saltar
  await context.setGeolocation({ latitude: 37.80, longitude: -3.30, accuracy: 2000 });
  await page.waitForTimeout(3000);
  const trasFixMalo = await page.evaluate(() => {
    var p = gpsMapMarker.getLatLng();
    return { lat: p.lat, lon: p.lng };
  });
  ok('Un fix impreciso (±2000m) no desplaza el marcador',
    Math.abs(trasFixMalo.lat - 37.90) < 0.01 && Math.abs(trasFixMalo.lon + 3.10) < 0.01,
    JSON.stringify(trasFixMalo));
  // Restaurar fix preciso para las siguientes pruebas
  await context.setGeolocation({ latitude: 37.90, longitude: -3.10, accuracy: 10 });
  await page.waitForTimeout(2000);

  // Simular movimiento: el mapa debe seguir
  await context.setGeolocation({ latitude: 37.95, longitude: -3.05, accuracy: 10 });
  await page.waitForTimeout(4000);
  const centro2 = await page.evaluate(() => {
    var c = mapa.getCenter();
    return { lat: c.lat, lon: c.lng };
  });
  ok('El mapa se reubica al moverse (seguimiento)',
    Math.abs(centro2.lat - 37.95) < 0.01 && Math.abs(centro2.lon + 3.05) < 0.01,
    JSON.stringify(centro2));

  // Indicador en vivo de precisión GPS visible y actualizado
  const gpsInfo = await page.evaluate(() => {
    var el = document.getElementById('map-gps-info');
    return el ? el.textContent : null;
  });
  ok('Indicador GPS en vivo muestra la precisión (±m)', !!gpsInfo && /±\d+ m/.test(gpsInfo), String(gpsInfo));

  // El tracking sigue vivo: otro movimiento vuelve a reubicar el marcador
  await context.setGeolocation({ latitude: 37.97, longitude: -3.02, accuracy: 8 });
  await page.waitForTimeout(3000);
  const centro3 = await page.evaluate(() => {
    var p = gpsMapMarker.getLatLng();
    return { lat: p.lat, lon: p.lng };
  });
  ok('La posición se sigue actualizando en tiempo real (2º movimiento)',
    Math.abs(centro3.lat - 37.97) < 0.01 && Math.abs(centro3.lon + 3.02) < 0.01,
    JSON.stringify(centro3));
  await context.setGeolocation({ latitude: 37.95, longitude: -3.05, accuracy: 10 });

  // Arrastrar el mapa desactiva el seguimiento
  await page.mouse.move(200, 400);
  await page.mouse.down();
  await page.mouse.move(300, 500, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const seguirTrasDrag = await page.evaluate(() => gpsMapSeguir);
  ok('Arrastrar el mapa pausa el seguimiento', seguirTrasDrag === false);
  await page.evaluate(() => miPosicion());
  await page.waitForTimeout(300);
  const seguirTrasBoton = await page.evaluate(() => gpsMapSeguir);
  ok('El botón 📍 reactiva el seguimiento', seguirTrasBoton === true);

  // Toggle de etiquetas de waypoints no lanza errores
  const toggleOK = await page.evaluate(() => {
    try { toggleEtiquetasWP(); toggleEtiquetasWP(); return true; } catch (e) { return String(e); }
  });
  ok('Botón 🏷️ de nombres de waypoints funciona', toggleOK === true, String(toggleOK));

  console.log('\n== 7. Borrador: persistencia al recargar ==');
  await page.evaluate(() => irPagina('menu'));
  await page.evaluate(() => irPagina('vp'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.getElementById('vp-unidad').value = 'TEST_BORRADOR';
    document.getElementById('vp-observaciones').value = 'nota temporal';
    guardarBorrador('VP');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => irPagina('vp'));
  await page.waitForTimeout(500);
  const borrador = await page.evaluate(() => ({
    unidad: document.getElementById('vp-unidad').value,
    obs: document.getElementById('vp-observaciones').value
  }));
  ok('Borrador VP restaurado tras recargar', borrador.unidad === 'TEST_BORRADOR' && borrador.obs === 'nota temporal',
    JSON.stringify(borrador));

  console.log('\n== 8. Edición de registro existente ==');
  await page.evaluate(() => irPagina('menu'));
  const elId = await page.evaluate(() => registros.find(x => x.tipo === 'EL').id);
  await page.evaluate((id) => editarRegistro(id), elId);
  await page.waitForTimeout(600);
  const editUnidad = await page.evaluate(() => document.getElementById('el-unidad').value);
  ok('Editar carga los datos del registro', editUnidad === 'TEST_U1', 'unidad=' + editUnidad);
  await page.evaluate(() => {
    document.getElementById('el-observaciones').value = 'editado';
    guardarEL();
  });
  await page.waitForTimeout(500);
  const trasEditar = await page.evaluate(() => {
    var els = registros.filter(r => r.tipo === 'EL');
    return { n: els.length, obs: els[0].datos.observaciones, enviado: els[0].enviado };
  });
  ok('La edición actualiza sin duplicar', trasEditar.n === 1 && trasEditar.obs === 'editado', JSON.stringify(trasEditar));
  ok('El registro editado queda pendiente de sincronizar', trasEditar.enviado === false);

  // El borrador VP no debe haberse contaminado por la edición
  const borradorIntacto = await page.evaluate(() => {
    var b = JSON.parse(localStorage.getItem('rapca_borrador_vp') || 'null');
    return b && b.unidad === 'TEST_BORRADOR';
  });
  ok('El borrador VP sigue intacto tras editar otro registro', borradorIntacto === true);

  console.log('\n== 8b. Edición de ficha EI: sale al panel sin contaminar ==');
  const eiId2 = await page.evaluate(() => registros.find(x => x.tipo === 'EI').id);
  await page.evaluate((id) => editarRegistro(id), eiId2);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.getElementById('ev-observaciones').value = 'T2 editada';
    guardarEI();
  });
  await page.waitForTimeout(600);
  const trasEditarEI = await page.evaluate(() => ({
    pagina: document.querySelector('.page.active').id,
    nEI: registros.filter(r => r.tipo === 'EI').length,
    obsT2: registros.find(r => r.tipo === 'EI').datos.transectos.T2.observaciones
  }));
  ok('Guardar una edición EI sale al Panel (no sigue en el formulario)', trasEditarEI.pagina === 'panel-page', JSON.stringify(trasEditarEI));
  ok('La edición EI actualiza sin duplicar', trasEditarEI.nEI === 1);
  ok('La edición EI guarda los cambios en su transecto', trasEditarEI.obsT2 === 'T2 editada');

  console.log('\n== 8c. Transectos visitados pero vacíos no se persisten ==');
  await page.evaluate(() => irPagina('menu'));
  // Empezar unidad nueva desde cero (sin retomar el borrador de la anterior)
  await page.evaluate(() => limpiarBorrador('EI'));
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.getElementById('ev-unidad').value = 'TEST_U3';
    document.querySelector('#ev-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="NP"]').click();
  });
  // Visitar T2 y volver a T1 (materializa T2 como objeto vacío)
  await page.evaluate(() => cambiarTransecto('T2'));
  await page.waitForTimeout(300);
  await page.evaluate(() => cambiarTransecto('T1'));
  await page.waitForTimeout(300);
  const t1SigueOK = await page.evaluate(() => {
    var np = document.querySelector('#ev-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="NP"]');
    return np && np.classList.contains('selected');
  });
  ok('Ida y vuelta T1→T2→T1 conserva los datos de T1', t1SigueOK);
  await page.evaluate(() => guardarEI());
  await page.waitForTimeout(500);
  const fichaU3 = await page.evaluate(() => {
    var r = registros.find(x => x.tipo === 'EI' && x.unidad === 'TEST_U3');
    return { t1: !!(r && r.datos.transectos.T1), t2: r ? r.datos.transectos.T2 : 'no-ficha' };
  });
  ok('El transecto T2 vacío se guarda como null (sin filas basura)', fichaU3.t1 === true && fichaU3.t2 === null, JSON.stringify(fichaU3));

  console.log('\n== 8d. Botón atrás vuelve al menú ==');
  await page.evaluate(() => irPagina('menu'));
  await page.evaluate(() => irPagina('galeria'));
  await page.waitForTimeout(500);
  await page.goBack();
  await page.waitForTimeout(600);
  const paginaTrasAtras = await page.evaluate(() => document.querySelector('.page.active').id);
  ok('Atrás desde galería lleva al menú (no al Panel)', paginaTrasAtras === 'menu-page', paginaTrasAtras);

  console.log('\n== 9. Informe de zona e infraestructuras (sin errores) ==');
  const informeZonaOK = await page.evaluate(() => {
    return new Promise((resolve) => {
      try {
        // Los registros de prueba no tienen zona → generarInformeZona avisa y sale
        generarInformeZona();
        resolve('sin-zona-ok');
      } catch (e) { resolve('ERROR: ' + e.message); }
    });
  });
  ok('Informe de zona no lanza excepciones', !String(informeZonaOK).startsWith('ERROR'), String(informeZonaOK));
  await page.evaluate(() => { try { cerrarModal(); } catch (e) {} });

  console.log('\n== 10. Errores de consola acumulados ==');
  ok('Sin errores JS durante toda la sesión de pruebas', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  ok('Sin errores de consola relevantes', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();

  const fallos = resultados.filter(r => !r.pass);
  console.log('\n========================================');
  console.log('RESULTADO: ' + (resultados.length - fallos.length) + '/' + resultados.length + ' pruebas OK');
  if (fallos.length) {
    console.log('FALLOS:');
    fallos.forEach(f => console.log('  ❌ ' + f.nombre + (f.detalle ? ' — ' + f.detalle : '')));
    process.exit(1);
  }
})().catch(e => { console.error('ERROR FATAL DEL TEST:', e); process.exit(2); });

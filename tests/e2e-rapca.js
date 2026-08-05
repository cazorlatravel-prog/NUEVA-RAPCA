// Cómo ejecutar:
//   1) python3 -m http.server 8899  (en la raíz del repo)
//   2) npm install playwright  (Chromium debe estar instalado)
//   3) descargar las librerías CDN a ./cdn/ (ver CDN_MAP más abajo)
//   4) node e2e-rapca.js
//
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
  // Cloudinary no está disponible en el entorno de test: fallar rápido
  await context.route(/res\.cloudinary\.com/, (route) => route.abort());
  // Backend PHP tampoco: abortar rápido en vez de dejar peticiones colgadas
  await context.route(/rapca\.app/, (route) => route.abort());
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

  console.log('\n== 2b. Ghost: waypoints de visitas anteriores (batería completa) ==');
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Helper: abre la cámara para un waypoint y devuelve el estado del ghost
  async function probarGhost(pagina, prefijo, tipo, unidad, wp) {
    await page.evaluate((p) => irPagina(p), pagina);
    await page.waitForTimeout(350);
    await page.evaluate((args) => { document.getElementById(args.prefijo + '-unidad').value = args.unidad; }, { prefijo, unidad });
    await page.evaluate((args) => abrirCamara(args.tipo, args.wp), { tipo, wp });
    await page.waitForTimeout(1500);
    const estado = await page.evaluate(() => ({
      activo: ghostingActivo,
      visible: document.getElementById('ghost-overlay').style.display === 'block'
    }));
    await page.evaluate(() => cerrarCamara());
    await page.waitForTimeout(200);
    await page.evaluate(() => irPagina('menu'));
    return estado;
  }

  // Fuente 1: thumbnail local (store 'fotos') — foto de la Visita Previa
  await page.evaluate((png) => guardarEnDB('fotos', { codigo: 'TEST_U1_VP_W1_1', data: png, fecha: Date.now() - 86400000 }), PNG1);
  const g1 = await probarGhost('el', 'el', 'EL', 'TEST_U1', 'W1');
  ok('Ghost en EL·W1 con foto VP local', g1.activo && g1.visible, JSON.stringify(g1));

  // La misma foto VP debe servir de ghost también en una Evaluación Intensa
  const g2 = await probarGhost('ei', 'ev', 'EI', 'TEST_U1', 'W1');
  ok('Ghost en EI·W1 con la misma foto VP', g2.activo && g2.visible, JSON.stringify(g2));

  // Fuente 2: subidas_pendientes — W2 de una visita anterior aún sin subir
  await page.evaluate((png) => guardarEnDB('subidas_pendientes', { codigo: 'TEST_U1_VP_W2_1', data: png, tipo: 'VP', fecha: Date.now() - 86400000 }), PNG1);
  const g3 = await probarGhost('el', 'el', 'EL', 'TEST_U1', 'W2');
  ok('Ghost en EL·W2 desde subidas pendientes', g3.activo && g3.visible, JSON.stringify(g3));

  // Fuente 3: fotos precargadas offline (campos unidad/waypoint)
  await page.evaluate((png) => guardarEnDB('fotos_precargadas', { codigo: 'TEST_U4_VP_W1_9', data: png, unidad: 'TEST_U4', waypoint: 'W1', fecha: '2026-06-01' }), PNG1);
  const g4 = await probarGhost('ei', 'ev', 'EI', 'TEST_U4', 'W1');
  ok('Ghost en EI·W1 desde fotos precargadas', g4.activo && g4.visible, JSON.stringify(g4));

  // Fuente 4: registros sincronizados → buscarFotoData por código
  await page.evaluate((png) => {
    registros.push({ id: Date.now() - 999999, tipo: 'VP', fecha: '2026-06-01', zona: '', unidad: 'TEST_U5', transecto: '',
      datos: { fotos: '', fotosComp: [{ numero: 'TEST_U5_VP_W1_1', waypoint: 'W1', lat: null, lon: null }], observaciones: '' },
      enviado: true, operador_email: 'test@rapca.es', operador_nombre: 'Tester' });
    guardarRegistros();
    // La foto solo existe indexada por código (sin campos unidad/waypoint):
    // el escaneo de precargadas no la ve, solo la vía registros+buscarFotoData
    return guardarEnDB('fotos_precargadas', { codigo: 'TEST_U5_VP_W1_1', data: png });
  }, PNG1);
  const g5 = await probarGhost('el', 'el', 'EL', 'TEST_U5', 'W1');
  ok('Ghost en EL·W1 vía registros sincronizados', g5.activo && g5.visible, JSON.stringify(g5));

  // Negativo: unidad sin visitas anteriores → sin ghost
  const g6 = await probarGhost('el', 'el', 'EL', 'TEST_SINFOTOS', 'W1');
  ok('Sin visitas anteriores no hay ghost (correcto)', !g6.activo && !g6.visible, JSON.stringify(g6));

  // Negativo: una unidad que es prefijo de otra no roba sus fotos
  const g7 = await probarGhost('el', 'el', 'EL', 'TEST_U', 'W1');
  ok('Una unidad prefijo de otra (TEST_U vs TEST_U1) no coge fotos ajenas', !g7.activo && !g7.visible, JSON.stringify(g7));

  console.log('\n== 2c. Indicador de distancia al waypoint anterior ==');
  // Waypoint de la VP a ~22m de la posición GPS simulada (37.90, -3.10)
  await page.evaluate(() => guardarEnDB('waypoints_comp', {
    id: 'TEST_U1_VP_W1_1', codigo: 'TEST_U1_VP_W1_1', waypoint: 'W1',
    lat: 37.9002, lon: -3.10, unidad: 'TEST_U1', tipo: 'VP', fecha: '2026-06-01T10:00:00'
  }));
  await page.evaluate(() => irPagina('el'));
  await page.waitForTimeout(350);
  await page.evaluate(() => { document.getElementById('el-unidad').value = 'TEST_U1'; });
  await page.evaluate(() => abrirCamara('EL', 'W1'));
  await page.waitForTimeout(2500);
  const dist = await page.evaluate(() => ({
    visible: document.getElementById('cam-distancia').style.display === 'block',
    texto: document.getElementById('cam-distancia').textContent
  }));
  ok('Indicador de distancia visible al encuadrar W1', dist.visible, JSON.stringify(dist));
  ok('Muestra la distancia real al waypoint (~22 m)', /2[0-4] m al W1/.test(dist.texto), dist.texto);
  // Capturar: el indicador desaparece y no está en el canvas de la foto
  await page.evaluate(() => capturarFoto());
  await page.waitForTimeout(3500);
  const trasCaptura = await page.evaluate(() => ({
    preview: document.getElementById('preview-modal').classList.contains('open'),
    distOculto: document.getElementById('cam-distancia').style.display === 'none'
  }));
  ok('Al capturar, el preview se abre y el indicador se oculta', trasCaptura.preview && trasCaptura.distOculto, JSON.stringify(trasCaptura));
  await page.evaluate(() => {
    document.getElementById('preview-modal').classList.remove('open');
    limpiarAnotaciones();
    irPagina('menu');
  });
  // Foto general: no debe mostrar indicador
  await page.evaluate(() => irPagina('el'));
  await page.waitForTimeout(350);
  await page.evaluate(() => { document.getElementById('el-unidad').value = 'TEST_U1'; });
  await page.evaluate(() => abrirCamara('EL', 'G'));
  await page.waitForTimeout(1200);
  const distG = await page.evaluate(() => document.getElementById('cam-distancia').style.display);
  ok('En fotos generales no aparece el indicador', distG === 'none', distG);
  await page.evaluate(() => cerrarCamara());
  await page.evaluate(() => irPagina('menu'));

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

  // Contador de testeos: 1 nota introducida → "1 / 20"
  const testeos1 = await page.evaluate(() => document.getElementById('ev-plantas-testeos').textContent);
  ok('Contador Nº testeos refleja las notas introducidas', testeos1 === '1 / 20', String(testeos1));
  // Al completar 20 notas se pone verde
  const testeos20 = await page.evaluate(() => {
    for (var i = 2; i <= 10; i++) { document.getElementById('ev-planta1-n' + i).value = '2'; }
    calcMediaPlanta(1);
    for (var i = 1; i <= 10; i++) { document.getElementById('ev-planta2-n' + i).value = '3'; }
    calcMediaPlanta(2);
    var el = document.getElementById('ev-plantas-testeos');
    return { txt: el.textContent, color: el.style.color };
  });
  ok('Contador llega a 20 / 20 y se pone verde', testeos20.txt === '20 / 20' && testeos20.color === 'rgb(39, 174, 96)', JSON.stringify(testeos20));

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
  const testeosT2 = await page.evaluate(() => document.getElementById('ev-plantas-testeos').textContent);
  ok('El contador de testeos se reinicia en T2', testeosT2 === '0 / 20', String(testeosT2));

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

  console.log('\n== 3b. Al reabrir EI pregunta: continuar o empezar nueva ==');
  await page.evaluate(() => irPagina('menu'));
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(500);
  const dialogo = await page.evaluate(() => ({
    abierto: document.getElementById('modal-overlay').classList.contains('open'),
    texto: (document.getElementById('modal-box') || document.getElementById('modal-overlay')).textContent.slice(0, 200)
  }));
  ok('Aparece el diálogo de evaluación a medias', dialogo.abierto && dialogo.texto.indexOf('TEST_U2') >= 0, JSON.stringify(dialogo));

  // Elegir CONTINUAR: restaura la unidad y los transectos del borrador
  await page.evaluate(() => continuarBorradorEI());
  await page.waitForTimeout(500);
  const trasContinuar = await page.evaluate(() => ({
    unidad: document.getElementById('ev-unidad').value,
    modal: document.getElementById('modal-overlay').classList.contains('open')
  }));
  ok('Continuar restaura la evaluación a medias', trasContinuar.unidad === 'TEST_U2' && !trasContinuar.modal, JSON.stringify(trasContinuar));

  // Reabrir y elegir EMPEZAR NUEVA: formulario en blanco y borrador eliminado
  await page.evaluate(() => irPagina('menu'));
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(500);
  const dialogo2 = await page.evaluate(() => document.getElementById('modal-overlay').classList.contains('open'));
  ok('El diálogo vuelve a aparecer mientras el borrador siga vivo', dialogo2 === true);
  await page.evaluate(() => descartarBorradorEI());
  await page.waitForTimeout(400);
  const trasDescartar = await page.evaluate(() => ({
    unidad: document.getElementById('ev-unidad').value,
    borrador: localStorage.getItem('rapca_borrador_ei')
  }));
  ok('Empezar nueva deja el formulario en blanco y borra el borrador',
    trasDescartar.unidad === '' && trasDescartar.borrador === null, JSON.stringify(trasDescartar));

  // Sin borrador ya no pregunta
  await page.evaluate(() => irPagina('menu'));
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(500);
  const dialogo3 = await page.evaluate(() => document.getElementById('modal-overlay').classList.contains('open'));
  ok('Sin evaluación a medias no aparece el diálogo', dialogo3 === false);
  await page.evaluate(() => irPagina('menu'));

  console.log('\n== 3c. Guardar EI sin terminar y continuarla después ==');
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.getElementById('ev-unidad').value = 'TEST_U6';
    document.querySelector('#ev-pastoreo-container .pastoreo-btn[data-punto="1"][data-val="PL"]').click();
    document.getElementById('ev-planta1-nombre').value = 'Ulex sp.';
    document.getElementById('ev-planta1-n1').value = '4';
    calcMediaPlanta(1);
  });
  const nEIAntes = await page.evaluate(() => registros.filter(r => r.tipo === 'EI').length);
  await page.evaluate(() => guardarEIParaDespues());
  await page.waitForTimeout(500);
  const trasPausar = await page.evaluate(() => ({
    pagina: document.querySelector('.page.active').id,
    nEI: registros.filter(r => r.tipo === 'EI').length,
    borrador: !!localStorage.getItem('rapca_borrador_ei'),
    badge: document.getElementById('badge-ei-borrador').style.display
  }));
  ok('Guardar sin terminar vuelve al menú', trasPausar.pagina === 'menu-page', JSON.stringify(trasPausar));
  ok('No crea ficha en registros (queda como borrador)', trasPausar.nEI === nEIAntes);
  ok('El borrador queda guardado', trasPausar.borrador === true);
  ok('El menú muestra el aviso "a medias" en Eval. Intensa', trasPausar.badge === 'inline-block', trasPausar.badge);

  // Reabrir: diálogo → continuar → datos restaurados
  await page.evaluate(() => irPagina('ei'));
  await page.waitForTimeout(500);
  const dialogoPausa = await page.evaluate(() => document.getElementById('modal-overlay').classList.contains('open'));
  ok('Al reabrir pregunta si continuar', dialogoPausa === true);
  await page.evaluate(() => continuarBorradorEI());
  await page.waitForTimeout(500);
  const restaurado = await page.evaluate(() => ({
    unidad: document.getElementById('ev-unidad').value,
    planta: document.getElementById('ev-planta1-nombre').value,
    nota: document.getElementById('ev-planta1-n1').value,
    pastoreo: document.querySelector('#ev-pastoreo-container .pastoreo-btn.selected[data-punto="1"]') ?
      document.querySelector('#ev-pastoreo-container .pastoreo-btn.selected[data-punto="1"]').getAttribute('data-val') : null
  }));
  ok('Al continuar se restaura todo lo que había a medias',
    restaurado.unidad === 'TEST_U6' && restaurado.planta === 'Ulex sp.' && restaurado.nota === '4' && restaurado.pastoreo === 'PL',
    JSON.stringify(restaurado));

  // Dejar limpio para el resto de secciones y comprobar que el badge se apaga
  await page.evaluate(() => { limpiarBorrador('EI'); irPagina('menu'); });
  await page.waitForTimeout(300);
  const badgeApagado = await page.evaluate(() => document.getElementById('badge-ei-borrador').style.display);
  ok('El aviso del menú se apaga al no haber nada a medias', badgeApagado === 'none', badgeApagado);

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

  // Fix impreciso repentino (red/wifi, ±2000m): el marcador NO debe saltar.
  // Primero re-cebar un fix bueno para que el filtro tenga referencia fresca
  // (el entorno de test puede espaciar los fixes más de 15s)
  await context.setGeolocation({ latitude: 37.901, longitude: -3.101, accuracy: 10 });
  await page.waitForTimeout(1500);
  await context.setGeolocation({ latitude: 37.80, longitude: -3.30, accuracy: 2000 });
  await page.waitForTimeout(2500);
  const trasFixMalo = await page.evaluate(() => {
    var p = gpsMapMarker.getLatLng();
    return { lat: p.lat, lon: p.lng };
  });
  ok('Un fix impreciso (±2000m) no desplaza el marcador',
    Math.abs(trasFixMalo.lat - 37.901) < 0.01 && Math.abs(trasFixMalo.lon + 3.101) < 0.01,
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

  console.log('\n== 6b. Gestor de waypoints: filtros y borrado ==');
  // Sembrar waypoints de 2 unidades y 2 años (además del de TEST_U1 de 2026)
  await page.evaluate(() => Promise.all([
    guardarEnDB('waypoints_comp', {id: 'WPA_1', codigo: 'WPA_EV_W1_1', waypoint: 'W1', lat: 37.91, lon: -3.11, unidad: 'WP_UNIT_A', tipo: 'EL', fecha: '2025-03-10T09:00:00'}),
    guardarEnDB('waypoints_comp', {id: 'WPA_2', codigo: 'WPA_EV_W2_1', waypoint: 'W2', lat: 37.92, lon: -3.12, unidad: 'WP_UNIT_A', tipo: 'EL', fecha: '2025-03-10T09:05:00'}),
    guardarEnDB('waypoints_comp', {id: 'WPB_1', codigo: 'WPB_VP_W1_1', waypoint: 'W1', lat: 37.93, lon: -3.13, unidad: 'WP_UNIT_B', tipo: 'VP', fecha: '2026-04-20T11:00:00'})
  ]));
  await page.evaluate(() => toggleWaypointsPanel());
  await page.waitForTimeout(600);
  const panelWP = await page.evaluate(() => ({
    abierto: document.getElementById('wp-panel').classList.contains('open'),
    total: document.getElementById('wp-panel-count').textContent,
    unidades: Array.from(document.getElementById('wp-f-unidad').options).map(o => o.value).filter(Boolean),
    anios: Array.from(document.getElementById('wp-f-anio').options).map(o => o.value).filter(Boolean)
  }));
  ok('Panel de waypoints abierto con el total', panelWP.abierto && panelWP.total === '4', JSON.stringify(panelWP));
  ok('Filtros poblados con unidades y años', panelWP.unidades.length >= 3 && panelWP.anios.indexOf('2025') >= 0 && panelWP.anios.indexOf('2026') >= 0, JSON.stringify(panelWP));

  // Filtrar por unidad A: se ven 2 de 4
  await page.evaluate(() => { document.getElementById('wp-f-unidad').value = 'WP_UNIT_A'; aplicarFiltroWaypoints(); });
  await page.waitForTimeout(500);
  const resumenA = await page.evaluate(() => document.getElementById('wp-f-resumen').textContent);
  ok('Filtro por unidad muestra 2 de 4', resumenA.indexOf('2 de 4') >= 0, resumenA);

  // Filtrar además solo W1: 1 de 4
  await page.evaluate(() => { document.getElementById('wp-f-tipo').value = 'W1'; aplicarFiltroWaypoints(); });
  await page.waitForTimeout(500);
  const resumenW1 = await page.evaluate(() => document.getElementById('wp-f-resumen').textContent);
  ok('Filtro unidad+W1 muestra 1 de 4', resumenW1.indexOf('1 de 4') >= 0, resumenW1);

  // Pedir borrado: debe abrir el modal de confirmación propio (no confirm nativo)
  await page.evaluate(() => borrarWaypointsFiltrados());
  await page.waitForTimeout(600);
  const modalConfirm = await page.evaluate(() => ({
    abierto: document.getElementById('modal-overlay').classList.contains('open'),
    texto: document.getElementById('modal-overlay').textContent
  }));
  ok('Borrar filtrados abre modal de confirmación con el recuento',
    modalConfirm.abierto && modalConfirm.texto.indexOf('1') >= 0 && modalConfirm.texto.indexOf('WP_UNIT_A') >= 0,
    modalConfirm.texto.slice(0, 120));

  // Cancelar: no borra nada
  await page.evaluate(() => cerrarModal());
  await page.waitForTimeout(400);
  const trasCancelar = await page.evaluate(() => obtenerTodosDB('waypoints_comp').then(w => w.length));
  ok('Cancelar el modal no borra ningún waypoint', trasCancelar === 4, 'quedan ' + trasCancelar);

  // Confirmar de verdad: quedan 3
  await page.evaluate(() => borrarWaypointsFiltrados());
  await page.waitForTimeout(500);
  await page.evaluate(() => confirmarBorrarWaypointsFiltrados());
  await page.waitForTimeout(700);
  const trasBorrar = await page.evaluate(() => obtenerTodosDB('waypoints_comp').then(w => w.length));
  ok('Confirmar borra solo los filtrados (quedan 3)', trasBorrar === 3, 'quedan ' + trasBorrar);

  // Borrar por año 2025: queda solo los de 2026
  await page.evaluate(() => {
    document.getElementById('wp-f-unidad').value = '';
    document.getElementById('wp-f-tipo').value = '';
    document.getElementById('wp-f-anio').value = '2025';
    aplicarFiltroWaypoints();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => borrarWaypointsFiltrados());
  await page.waitForTimeout(500);
  await page.evaluate(() => confirmarBorrarWaypointsFiltrados());
  await page.waitForTimeout(700);
  const trasBorrarAnio = await page.evaluate(() => obtenerTodosDB('waypoints_comp').then(w => w.map(x => String(x.fecha).slice(0,4))));
  ok('Borrado por año 2025 conserva solo 2026', trasBorrarAnio.length === 2 && trasBorrarAnio.every(a => a === '2026'), JSON.stringify(trasBorrarAnio));
  await page.evaluate(() => { document.getElementById('wp-f-anio').value = ''; aplicarFiltroWaypoints(); toggleWaypointsPanel(); });

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

  console.log('\n== 8e. Cartografía offline: precarga de teselas por zona ==');
  await page.evaluate(() => irPagina('precarga'));
  await page.waitForFunction(() => document.getElementById('precarga-zona').options.length > 1, { timeout: 15000 }).catch(() => {});
  const zonaPre = await page.evaluate(() => {
    var sel = document.getElementById('precarga-zona');
    var opts = Array.from(sel.options).map(o => o.value).filter(Boolean);
    if (opts.length === 0) return null;
    sel.value = opts[0];
    precargaSeleccionarZona(opts[0]);
    return opts[0];
  });
  ok('La página de precarga lista zonas con registros', !!zonaPre, String(zonaPre));
  // Seleccionar toda la zona
  await page.evaluate(() => {
    var btns = document.querySelectorAll('#precarga-unidades-lista button[data-unidad]');
    btns.forEach(b => { b.dataset.selected = 'true'; });
    precargaListarFotos(document.getElementById('precarga-zona').value);
  });
  await page.waitForTimeout(800);
  const estimacion = await page.evaluate(() => ({
    visible: document.getElementById('precarga-mapas').style.display === 'block',
    info: document.getElementById('precarga-mapas-info').textContent
  }));
  ok('Sección de cartografía visible con estimación de teselas',
    estimacion.visible && /\d+ teselas/.test(estimacion.info), JSON.stringify(estimacion));

  const tilesFallidas = [];
  const onFail = (req) => { if (/openstreetmap|ign\.es/.test(req.url())) tilesFallidas.push(req.url().slice(0, 110) + ' :: ' + ((req.failure() || {}).errorText || '?')); };
  page.on('requestfailed', onFail);
  await page.evaluate(() => precargaDescargarMapas());
  await page.waitForFunction(() => precargaMapasDescargando === false, { timeout: 60000 });
  page.off('requestfailed', onFail);
  if (tilesFallidas.length) console.log('TILES FALLIDAS (' + tilesFallidas.length + '):', tilesFallidas.slice(0, 6));
  const resultadoMapas = await page.evaluate(() => document.getElementById('precarga-progreso-texto').textContent);
  ok('Descarga de cartografía completada sin fallos',
    /Mapas: (\d+) \/ \1/.test(resultadoMapas) && resultadoMapas.indexOf('fallos') < 0, resultadoMapas);
  await page.evaluate(() => irPagina('menu'));

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

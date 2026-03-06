// ============================================================
// RAPCA Campo — dashboard.js — Dashboard con Chart.js
// ============================================================

var dashChartBar = null;
var dashChartDoughnut = null;

function renderDashboard() {
  var content = document.getElementById('dashboard-content');
  var regs = misRegistros();
  var infras = infraestructuras || [];

  var vpCount = regs.filter(function(r) { return r.tipo === 'VP'; }).length;
  var elCount = regs.filter(function(r) { return r.tipo === 'EL'; }).length;
  var eiCount = regs.filter(function(r) { return r.tipo === 'EI'; }).length;
  var unidades = [];
  regs.forEach(function(r) { if (unidades.indexOf(r.unidad) < 0) unidades.push(r.unidad); });
  var pendientes = regs.filter(function(r) { return !r.enviado; }).length;

  // Obtener zonas, provincias, municipios, PNs, operadores para filtros
  var zonas = [], provincias = [], municipios = [], pns = [], operadores = [];
  infras.forEach(function(inf) {
    if (inf.idZona && zonas.indexOf(inf.idZona) < 0) zonas.push(inf.idZona);
    if (inf.provincia && provincias.indexOf(inf.provincia) < 0) provincias.push(inf.provincia);
    if (inf.municipio && municipios.indexOf(inf.municipio) < 0) municipios.push(inf.municipio);
    if (inf.pn && pns.indexOf(inf.pn) < 0) pns.push(inf.pn);
  });
  regs.forEach(function(r) { if (r.operador_nombre && operadores.indexOf(r.operador_nombre) < 0) operadores.push(r.operador_nombre); });

  var html = '';

  // Métricas
  html += '<div class="dash-metrics">';
  html += '<div class="dash-metric"><div class="num">' + regs.length + '</div><div class="lbl">Total</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-vp)"><div class="num" style="color:var(--c-vp)">' + vpCount + '</div><div class="lbl">VP</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-el)"><div class="num" style="color:var(--c-el)">' + elCount + '</div><div class="lbl">EL</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-ei)"><div class="num" style="color:var(--c-ei)">' + eiCount + '</div><div class="lbl">EI</div></div>';
  html += '<div class="dash-metric"><div class="num">' + unidades.length + '</div><div class="lbl">Unidades</div></div>';
  html += '<div class="dash-metric" style="border-top:3px solid var(--c-tl)"><div class="num" style="color:var(--c-tl)">' + pendientes + '</div><div class="lbl">Pendientes</div></div>';
  html += '</div>';

  // Filtros
  html += '<div class="dash-filters">';
  html += '<select id="dash-f-zona" onchange="filtrarDashboard()"><option value="">Zona</option>' + zonas.map(function(z) { return '<option>' + z + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-provincia" onchange="filtrarDashboard()"><option value="">Provincia</option>' + provincias.map(function(p) { return '<option>' + p + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-municipio" onchange="filtrarDashboard()"><option value="">Municipio</option>' + municipios.map(function(m) { return '<option>' + m + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-pn" onchange="filtrarDashboard()"><option value="">PN</option>' + pns.map(function(p) { return '<option>' + p + '</option>'; }).join('') + '</select>';
  html += '<select id="dash-f-operador" onchange="filtrarDashboard()"><option value="">Operador</option>' + operadores.map(function(o) { return '<option>' + o + '</option>'; }).join('') + '</select>';
  html += '</div>';

  // Charts
  html += '<div class="dash-chart"><h3>Actividad últimos 30 días</h3><canvas id="dash-chart-bar" height="200"></canvas></div>';
  html += '<div class="dash-chart"><h3>Distribución por tipo</h3><canvas id="dash-chart-doughnut" height="200"></canvas></div>';

  // Alertas
  html += '<div class="dash-alerts">';
  if (pendientes > 0) html += '<div class="dash-alert">⚠️ ' + pendientes + ' registros pendientes de sincronizar</div>';
  // Unidades sin EI
  var sinEI = [];
  unidades.forEach(function(u) {
    var tieneEI = regs.some(function(r) { return r.unidad === u && r.tipo === 'EI'; });
    if (!tieneEI) sinEI.push(u);
  });
  if (sinEI.length > 0) html += '<div class="dash-alert">📋 ' + sinEI.length + ' unidades sin Evaluación Intensa: ' + sinEI.slice(0, 5).join(', ') + (sinEI.length > 5 ? '...' : '') + '</div>';
  html += '</div>';

  content.innerHTML = html;

  // Renderizar gráficos
  renderDashCharts(regs);
}

function renderDashCharts(regs) {
  // Gráfico de barras apiladas — últimos 30 días
  var hoy = new Date();
  var labels = [];
  var vpData = [], elData = [], eiData = [];
  for (var d = 29; d >= 0; d--) {
    var fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - d);
    var fechaStr = fecha.toISOString().split('T')[0];
    labels.push(fecha.getDate() + '/' + (fecha.getMonth() + 1));
    vpData.push(regs.filter(function(r) { return r.fecha === fechaStr && r.tipo === 'VP'; }).length);
    elData.push(regs.filter(function(r) { return r.fecha === fechaStr && r.tipo === 'EL'; }).length);
    eiData.push(regs.filter(function(r) { return r.fecha === fechaStr && r.tipo === 'EI'; }).length);
  }

  var ctxBar = document.getElementById('dash-chart-bar');
  if (ctxBar) {
    if (dashChartBar) dashChartBar.destroy();
    dashChartBar = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {label: 'VP', data: vpData, backgroundColor: '#88d8b0'},
          {label: 'EL', data: elData, backgroundColor: '#2ecc71'},
          {label: 'EI', data: eiData, backgroundColor: '#fd9853'}
        ]
      },
      options: {
        responsive: true,
        scales: {x: {stacked: true}, y: {stacked: true, beginAtZero: true}},
        plugins: {legend: {position: 'bottom'}}
      }
    });
  }

  // Doughnut
  var vpCount = regs.filter(function(r) { return r.tipo === 'VP'; }).length;
  var elCount = regs.filter(function(r) { return r.tipo === 'EL'; }).length;
  var eiCount = regs.filter(function(r) { return r.tipo === 'EI'; }).length;

  var ctxDoughnut = document.getElementById('dash-chart-doughnut');
  if (ctxDoughnut) {
    if (dashChartDoughnut) dashChartDoughnut.destroy();
    dashChartDoughnut = new Chart(ctxDoughnut, {
      type: 'doughnut',
      data: {
        labels: ['VP', 'EL', 'EI'],
        datasets: [{data: [vpCount, elCount, eiCount], backgroundColor: ['#88d8b0', '#2ecc71', '#fd9853']}]
      },
      options: {responsive: true, plugins: {legend: {position: 'bottom'}}}
    });
  }
}

function filtrarDashboard() {
  // Re-render con filtros aplicados
  var regs = misRegistros();
  var zona = document.getElementById('dash-f-zona').value;
  var operador = document.getElementById('dash-f-operador').value;

  if (zona) regs = regs.filter(function(r) { return r.zona === zona; });
  if (operador) regs = regs.filter(function(r) { return r.operador_nombre === operador; });

  renderDashCharts(regs);
}

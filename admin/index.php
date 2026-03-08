<?php
// ============================================================
// RAPCA Campo — Admin Panel
// ============================================================
require_once __DIR__ . '/../includes/auth.php';

$page = $_GET['page'] ?? 'dashboard';

// Procesar login
if ($page === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!verificarCSRF($_POST['csrf_token'] ?? '')) {
        $loginError = 'Token de seguridad inválido. Recarga la página.';
    } else {
        $result = loginAdmin($_POST['email'] ?? '', $_POST['password'] ?? '');
        if ($result['ok']) {
            header('Location: index.php?page=dashboard');
            exit;
        }
        $loginError = $result['error'];
    }
}

// Procesar logout
if ($page === 'logout') {
    cerrarSesionAdmin();
    header('Location: index.php?page=login');
    exit;
}

// Verificar sesión para páginas protegidas
if ($page !== 'login') {
    requireAdmin();
}

$adminUser = getAdminUser();
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RAPCA Admin</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
:root{--c-primary:#1a3d2e;--c-primary-light:#2d5a3d;--c-secondary:#5b8c5a}
body{background:#f5f5f0}
.navbar{background:var(--c-primary)!important}
.sidebar{background:#fff;min-height:calc(100vh - 56px);border-right:1px solid #dee2e6;padding-top:1rem}
.sidebar .nav-link{color:#333;padding:10px 20px;border-radius:0}
.sidebar .nav-link:hover,.sidebar .nav-link.active{background:var(--c-primary);color:#fff}
.sidebar .nav-link i{width:24px;text-align:center;margin-right:8px}
.stat-card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);text-align:center}
.stat-card .num{font-size:32px;font-weight:800;color:var(--c-primary)}
.stat-card .lbl{font-size:13px;color:#888;margin-top:4px}
.content-area{padding:20px}
.badge-vp{background:#88d8b0;color:#333}
.badge-el{background:#2ecc71}
.badge-ei{background:#fd9853}
#admin-map{height:500px;border-radius:12px}
</style>
</head>
<body>

<?php if ($page === 'login'): ?>
<!-- LOGIN -->
<div class="d-flex align-items-center justify-content-center" style="min-height:100vh;background:var(--c-primary)">
  <div class="card" style="width:380px;border-radius:16px">
    <div class="card-body p-4">
      <h3 class="text-center mb-1" style="color:var(--c-primary)">RAPCA Admin</h3>
      <p class="text-center text-muted small mb-4">Panel de Administración</p>
      <?php if (!empty($loginError)): ?>
        <div class="alert alert-danger py-2 small"><?= htmlspecialchars($loginError) ?></div>
      <?php endif; ?>
      <form method="POST">
        <?= csrfField() ?>
        <div class="mb-3">
          <input type="email" name="email" class="form-control" placeholder="Email" required autofocus>
        </div>
        <div class="mb-3">
          <input type="password" name="password" class="form-control" placeholder="Contraseña" required>
        </div>
        <button type="submit" class="btn w-100 text-white" style="background:var(--c-primary)">Entrar</button>
      </form>
    </div>
  </div>
</div>

<?php else: ?>
<!-- NAVBAR -->
<nav class="navbar navbar-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="index.php"><i class="fas fa-leaf me-2"></i>RAPCA Admin</a>
    <div class="d-flex align-items-center gap-3">
      <span class="text-white small"><?= htmlspecialchars($adminUser['nombre'] ?? '') ?></span>
      <a href="index.php?page=logout" class="btn btn-outline-light btn-sm"><i class="fas fa-sign-out-alt"></i></a>
    </div>
  </div>
</nav>

<div class="container-fluid">
  <div class="row">
    <!-- SIDEBAR -->
    <div class="col-md-2 sidebar d-none d-md-block">
      <nav class="nav flex-column">
        <a class="nav-link <?= $page==='dashboard'?'active':'' ?>" href="?page=dashboard"><i class="fas fa-chart-bar"></i>Dashboard</a>
        <a class="nav-link <?= $page==='usuarios'?'active':'' ?>" href="?page=usuarios"><i class="fas fa-users"></i>Usuarios</a>
        <a class="nav-link <?= $page==='registros'?'active':'' ?>" href="?page=registros"><i class="fas fa-clipboard-list"></i>Registros</a>
        <a class="nav-link <?= $page==='mapa'?'active':'' ?>" href="?page=mapa"><i class="fas fa-map"></i>Mapa</a>
        <a class="nav-link <?= $page==='infraestructuras'?'active':'' ?>" href="?page=infraestructuras"><i class="fas fa-building"></i>Infraestructuras</a>
        <a class="nav-link <?= $page==='timeline'?'active':'' ?>" href="?page=timeline"><i class="fas fa-clock"></i>Timeline</a>
        <a class="nav-link <?= $page==='comparador'?'active':'' ?>" href="?page=comparador"><i class="fas fa-columns"></i>Comparador</a>
      </nav>
    </div>

    <!-- CONTENT -->
    <div class="col-md-10 content-area">

<?php
// Cargar contenido según página
try {
    $db = getDB();
    initDB();
} catch (Exception $e) {
    error_log('RAPCA Admin DB error: ' . $e->getMessage());
    echo '<div class="alert alert-danger">Error de conexión a base de datos. Contacte al administrador.</div>';
}

switch ($page):
    case 'dashboard': ?>
      <h4 class="mb-4">Dashboard</h4>
      <?php
      $totalRegs = $db->query('SELECT COUNT(*) FROM registros_sync')->fetchColumn();
      $vpCount = $db->query("SELECT COUNT(*) FROM registros_sync WHERE tipo='VP'")->fetchColumn();
      $elCount = $db->query("SELECT COUNT(*) FROM registros_sync WHERE tipo='EL'")->fetchColumn();
      $eiCount = $db->query("SELECT COUNT(*) FROM registros_sync WHERE tipo='EI'")->fetchColumn();
      $unidades = $db->query('SELECT COUNT(DISTINCT unidad) FROM registros_sync')->fetchColumn();
      $operadores = $db->query('SELECT COUNT(DISTINCT email) FROM registros_sync')->fetchColumn();
      ?>
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-2"><div class="stat-card"><div class="num"><?= $totalRegs ?></div><div class="lbl">Total</div></div></div>
        <div class="col-6 col-md-2"><div class="stat-card" style="border-top:3px solid #88d8b0"><div class="num" style="color:#88d8b0"><?= $vpCount ?></div><div class="lbl">VP</div></div></div>
        <div class="col-6 col-md-2"><div class="stat-card" style="border-top:3px solid #2ecc71"><div class="num" style="color:#2ecc71"><?= $elCount ?></div><div class="lbl">EL</div></div></div>
        <div class="col-6 col-md-2"><div class="stat-card" style="border-top:3px solid #fd9853"><div class="num" style="color:#fd9853"><?= $eiCount ?></div><div class="lbl">EI</div></div></div>
        <div class="col-6 col-md-2"><div class="stat-card"><div class="num"><?= $unidades ?></div><div class="lbl">Unidades</div></div></div>
        <div class="col-6 col-md-2"><div class="stat-card"><div class="num"><?= $operadores ?></div><div class="lbl">Operadores</div></div></div>
      </div>
      <div class="row g-3">
        <div class="col-md-8"><div class="card p-3"><canvas id="admin-chart-bar" height="120"></canvas></div></div>
        <div class="col-md-4"><div class="card p-3"><canvas id="admin-chart-doughnut" height="200"></canvas></div></div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
      <script>
      new Chart(document.getElementById('admin-chart-doughnut'),{type:'doughnut',data:{labels:['VP','EL','EI'],datasets:[{data:[<?= "$vpCount,$elCount,$eiCount" ?>],backgroundColor:['#88d8b0','#2ecc71','#fd9853']}]},options:{plugins:{legend:{position:'bottom'}}}});
      <?php
      $act = $db->query("SELECT fecha, tipo, COUNT(*) as total FROM registros_sync WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY fecha, tipo ORDER BY fecha")->fetchAll();
      $labels = []; $vpD = []; $elD = []; $eiD = [];
      $byDate = [];
      foreach ($act as $a) {
          $byDate[$a['fecha']][$a['tipo']] = $a['total'];
      }
      for ($i = 29; $i >= 0; $i--) {
          $d = date('Y-m-d', strtotime("-$i days"));
          $labels[] = date('d/m', strtotime($d));
          $vpD[] = $byDate[$d]['VP'] ?? 0;
          $elD[] = $byDate[$d]['EL'] ?? 0;
          $eiD[] = $byDate[$d]['EI'] ?? 0;
      }
      ?>
      new Chart(document.getElementById('admin-chart-bar'),{type:'bar',data:{labels:<?= json_encode($labels, JSON_HEX_TAG | JSON_HEX_AMP) ?>,datasets:[{label:'VP',data:<?= json_encode($vpD) ?>,backgroundColor:'#88d8b0'},{label:'EL',data:<?= json_encode($elD) ?>,backgroundColor:'#2ecc71'},{label:'EI',data:<?= json_encode($eiD) ?>,backgroundColor:'#fd9853'}]},options:{responsive:true,scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}},plugins:{legend:{position:'bottom'}}}});
      </script>
      <?php break;

    case 'usuarios': ?>
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h4>Usuarios</h4>
        <button class="btn text-white" style="background:var(--c-primary)" data-bs-toggle="modal" data-bs-target="#modalUsuario"><i class="fas fa-plus me-1"></i>Crear</button>
      </div>
      <?php
      // Procesar acciones
      if ($_SERVER['REQUEST_METHOD'] === 'POST' && verificarCSRF($_POST['csrf_token'] ?? '')) {
          $action = $_POST['user_action'] ?? '';
          $uid = intval($_POST['user_id'] ?? 0);
          if ($action === 'toggle' && $uid !== $adminUser['id']) {
              $db->prepare('UPDATE usuarios SET activo = NOT activo WHERE id = ?')->execute([$uid]);
          } elseif ($action === 'delete' && $uid) {
              $db->prepare('DELETE FROM usuarios WHERE id = ? AND email != ?')->execute([$uid, ADMIN_EMAIL]);
          } elseif ($action === 'change_pass' && $uid) {
              $newPass = $_POST['new_password'] ?? '';
              if (strlen($newPass) >= 8) {
                  $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
                  $db->prepare('UPDATE usuarios SET password = ? WHERE id = ?')->execute([$hash, $uid]);
              }
          } elseif ($action === 'create') {
              $email = $_POST['new_email'] ?? '';
              $pass = $_POST['new_pass'] ?? '';
              $nombre = $_POST['new_nombre'] ?? '';
              $rol = $_POST['new_rol'] ?? 'operador';
              if (filter_var($email, FILTER_VALIDATE_EMAIL) && strlen($pass) >= 8 && $nombre) {
                  $hash = password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]);
                  try {
                      $db->prepare('INSERT INTO usuarios (email, password, nombre, rol) VALUES (?,?,?,?)')->execute([$email, $hash, $nombre, $rol]);
                  } catch (PDOException $e) {
                      // Manejar duplicados u otros errores
                      error_log('Error creando usuario: ' . $e->getMessage());
                  }
              }
          }
          header('Location: index.php?page=usuarios');
          exit;
      }
      $users = $db->query('SELECT id, email, nombre, rol, activo, creado_at FROM usuarios ORDER BY creado_at DESC')->fetchAll();
      ?>
      <div class="table-responsive">
        <table class="table table-hover bg-white rounded">
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr></thead>
          <tbody>
          <?php foreach ($users as $u): ?>
            <tr>
              <td><?= htmlspecialchars($u['nombre']) ?></td>
              <td><?= htmlspecialchars($u['email']) ?></td>
              <td><span class="badge bg-<?= $u['rol']==='admin'?'dark':'success' ?>"><?= $u['rol'] ?></span></td>
              <td><span class="badge bg-<?= $u['activo']?'success':'secondary' ?>"><?= $u['activo']?'Activo':'Inactivo' ?></span></td>
              <td class="small text-muted"><?= $u['creado_at'] ?></td>
              <td>
                <form method="POST" class="d-inline"><?= csrfField() ?><input type="hidden" name="user_action" value="toggle"><input type="hidden" name="user_id" value="<?= $u['id'] ?>"><button class="btn btn-sm btn-outline-secondary" title="Toggle"><i class="fas fa-<?= $u['activo']?'pause':'play' ?>"></i></button></form>
                <button class="btn btn-sm btn-outline-primary" onclick="cambiarPass(<?= $u['id'] ?>)" title="Contraseña"><i class="fas fa-key"></i></button>
                <?php if ($u['email'] !== ADMIN_EMAIL): ?>
                <form method="POST" class="d-inline" onsubmit="return confirm('¿Eliminar usuario?')"><?= csrfField() ?><input type="hidden" name="user_action" value="delete"><input type="hidden" name="user_id" value="<?= $u['id'] ?>"><button class="btn btn-sm btn-outline-danger" title="Eliminar"><i class="fas fa-trash"></i></button></form>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>

      <!-- Modal Crear -->
      <div class="modal fade" id="modalUsuario"><div class="modal-dialog"><div class="modal-content"><form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="user_action" value="create">
        <div class="modal-header"><h5>Crear Usuario</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Nombre</label><input type="text" name="new_nombre" class="form-control" required></div>
          <div class="mb-3"><label class="form-label">Email</label><input type="email" name="new_email" class="form-control" required></div>
          <div class="mb-3"><label class="form-label">Contraseña (mín 8)</label><input type="password" name="new_pass" class="form-control" minlength="8" required></div>
          <div class="mb-3"><label class="form-label">Rol</label><select name="new_rol" class="form-select"><option value="operador">Operador</option><option value="admin">Admin</option></select></div>
        </div>
        <div class="modal-footer"><button type="submit" class="btn text-white" style="background:var(--c-primary)">Crear</button></div>
      </form></div></div></div>

      <script>
      function cambiarPass(id){
        var p=prompt('Nueva contraseña (mín 8 caracteres):');
        if(!p||p.length<8){alert('Contraseña inválida');return;}
        var f=document.createElement('form');f.method='POST';f.innerHTML='<?= csrfField() ?><input type="hidden" name="user_action" value="change_pass"><input type="hidden" name="user_id" value="'+id+'"><input type="hidden" name="new_password" value="'+p+'">';
        document.body.appendChild(f);f.submit();
      }
      </script>
      <?php break;

    case 'registros': ?>
      <h4 class="mb-4">Registros</h4>
      <?php
      $filtroTipo = $_GET['tipo'] ?? '';
      $filtroOp = $_GET['operador'] ?? '';
      $pagina = max(1, intval($_GET['p'] ?? 1));
      $porPagina = 20;
      $offset = ($pagina - 1) * $porPagina;

      $where = '1=1';
      $params = [];
      if ($filtroTipo) { $where .= ' AND tipo = ?'; $params[] = $filtroTipo; }
      if ($filtroOp) { $where .= ' AND email = ?'; $params[] = $filtroOp; }

      $countStmt = $db->prepare("SELECT COUNT(*) FROM registros_sync WHERE $where");
      $countStmt->execute($params);
      $total = $countStmt->fetchColumn();

      $stmt = $db->prepare("SELECT * FROM registros_sync WHERE $where ORDER BY fecha DESC LIMIT $porPagina OFFSET $offset");
      $stmt->execute($params);
      $regs = $stmt->fetchAll();

      $ops = $db->query('SELECT DISTINCT email FROM registros_sync ORDER BY email')->fetchAll(PDO::FETCH_COLUMN);
      ?>
      <div class="d-flex gap-2 mb-3">
        <select class="form-select form-select-sm" style="width:auto" onchange="location='?page=registros&tipo='+this.value">
          <option value="">Todos</option>
          <option value="VP" <?= $filtroTipo==='VP'?'selected':'' ?>>VP</option>
          <option value="EL" <?= $filtroTipo==='EL'?'selected':'' ?>>EL</option>
          <option value="EI" <?= $filtroTipo==='EI'?'selected':'' ?>>EI</option>
        </select>
        <select class="form-select form-select-sm" style="width:auto" onchange="location='?page=registros&operador='+this.value">
          <option value="">Operadores</option>
          <?php foreach($ops as $o): ?><option value="<?= htmlspecialchars($o) ?>" <?= $filtroOp===$o?'selected':'' ?>><?= htmlspecialchars($o) ?></option><?php endforeach; ?>
        </select>
        <span class="align-self-center small text-muted"><?= $total ?> registros</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover bg-white rounded">
          <thead><tr><th>Tipo</th><th>Unidad</th><th>Zona</th><th>Fecha</th><th>Transecto</th><th>Operador</th><th>Coords</th></tr></thead>
          <tbody>
          <?php foreach($regs as $r): ?>
          <tr style="cursor:pointer" onclick="location='?page=registro&id=<?= $r['id'] ?>'">
            <td><span class="badge badge-<?= strtolower(htmlspecialchars($r['tipo'])) ?>"><?= htmlspecialchars($r['tipo']) ?></span></td>
            <td><strong><?= htmlspecialchars($r['unidad']) ?></strong></td>
            <td><?= htmlspecialchars($r['zona']) ?></td>
            <td><?= htmlspecialchars($r['fecha'] ?? '') ?></td>
            <td><?= htmlspecialchars($r['transecto']) ?></td>
            <td class="small"><?= htmlspecialchars($r['email']) ?></td>
            <td class="small"><?= $r['lat'] ? round($r['lat'],4).','.round($r['lon'],4) : '—' ?></td>
          </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <?php if ($total > $porPagina): ?>
      <nav><ul class="pagination pagination-sm">
        <?php for($p=1; $p<=ceil($total/$porPagina); $p++): ?>
        <li class="page-item <?= $p===$pagina?'active':'' ?>"><a class="page-link" href="?page=registros&p=<?= $p ?>&tipo=<?= $filtroTipo ?>&operador=<?= $filtroOp ?>"><?= $p ?></a></li>
        <?php endfor; ?>
      </ul></nav>
      <?php endif; ?>
      <?php break;

    case 'registro': ?>
      <?php
      $id = intval($_GET['id'] ?? 0);
      $r = $db->prepare('SELECT * FROM registros_sync WHERE id = ?');
      $r->execute([$id]);
      $r = $r->fetch();
      if (!$r) { echo '<div class="alert alert-warning">Registro no encontrado</div>'; break; }
      $datos = json_decode($r['datos'], true) ?: [];
      ?>
      <a href="?page=registros" class="btn btn-sm btn-outline-secondary mb-3"><i class="fas fa-arrow-left me-1"></i>Volver</a>
      <div class="card p-4">
        <h4><span class="badge badge-<?= strtolower($r['tipo']) ?>"><?= $r['tipo'] ?></span> <?= htmlspecialchars($r['unidad']) ?></h4>
        <table class="table mt-3">
          <tr><th>Fecha</th><td><?= htmlspecialchars($r['fecha'] ?? '') ?></td><th>Zona</th><td><?= htmlspecialchars($r['zona']) ?></td></tr>
          <tr><th>Transecto</th><td><?= htmlspecialchars($r['transecto']) ?></td><th>Operador</th><td><?= htmlspecialchars($r['email']) ?></td></tr>
          <tr><th>Coordenadas</th><td colspan="3"><?= $r['lat'] ? htmlspecialchars($r['lat']).', '.htmlspecialchars($r['lon']) : '—' ?></td></tr>
        </table>
        <?php if (!empty($datos['pastoreo'])): ?>
        <h5>Pastoreo</h5>
        <p><?= implode(', ', array_map('htmlspecialchars', $datos['pastoreo'])) ?></p>
        <?php endif; ?>
        <?php if (!empty($datos['observaciones'])): ?>
        <h5>Observaciones</h5>
        <p><?= htmlspecialchars($datos['observaciones']) ?></p>
        <?php endif; ?>
        <?php if (!empty($datos['plantas'])): ?>
        <h5>Plantas</h5>
        <table class="table table-sm"><thead><tr><th>Especie</th><th>Notas</th><th>Media</th></tr></thead><tbody>
        <?php foreach($datos['plantas'] as $pl): ?>
        <tr><td><em><?= htmlspecialchars($pl['nombre'] ?? '') ?></em></td><td><?= implode(', ', array_map('htmlspecialchars', $pl['notas'] ?? [])) ?></td><td><strong><?= htmlspecialchars($pl['media'] ?? '—') ?></strong></td></tr>
        <?php endforeach; ?>
        </tbody></table>
        <?php endif; ?>
        <?php if (!empty($datos['matorral'])): ?>
        <h5>Matorralización</h5>
        <p>Volumen: <strong><?= htmlspecialchars($datos['matorral']['volumen'] ?? '—') ?> m³/ha</strong></p>
        <?php endif; ?>
      </div>
      <?php break;

    case 'mapa': ?>
      <h4 class="mb-4">Mapa</h4>
      <div id="admin-map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
      <script>
      var map=L.map('admin-map').setView([37.78,-3.79],10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
      var markers=L.markerClusterGroup();
      <?php
      $regs = $db->query('SELECT tipo,unidad,fecha,email,lat,lon FROM registros_sync WHERE lat IS NOT NULL')->fetchAll();
      $colores = ['VP'=>'#88d8b0','EL'=>'#2ecc71','EI'=>'#fd9853'];
      foreach($regs as $r): if(!$r['lat']) continue; ?>
      markers.addLayer(L.circleMarker([<?= floatval($r['lat']) ?>,<?= floatval($r['lon']) ?>],{radius:8,fillColor:'<?= $colores[$r['tipo']]??'#888' ?>',color:'#fff',weight:2,fillOpacity:.9}).bindPopup('<b><?= htmlspecialchars($r['tipo']) ?></b><br><?= htmlspecialchars($r['unidad']) ?><br><?= htmlspecialchars($r['fecha'] ?? '') ?>'));
      <?php endforeach; ?>
      map.addLayer(markers);
      <?php if(count($regs)>0): ?>try{map.fitBounds(markers.getBounds().pad(.1))}catch(e){}<?php endif; ?>
      </script>
      <?php break;

    case 'infraestructuras': ?>
      <h4 class="mb-4">Infraestructuras</h4>
      <?php
      $infras = $db->query('SELECT * FROM infraestructuras ORDER BY idUnidad')->fetchAll();
      ?>
      <div class="table-responsive">
        <table class="table table-hover bg-white rounded">
          <thead><tr><th>Unidad</th><th>Nombre</th><th>Zona</th><th>Provincia</th><th>Municipio</th><th>PN</th></tr></thead>
          <tbody>
          <?php foreach($infras as $inf): ?>
          <tr><td><strong><?= htmlspecialchars($inf['idUnidad']) ?></strong></td><td><?= htmlspecialchars($inf['nombre']) ?></td><td><?= htmlspecialchars($inf['idZona']) ?></td><td><?= htmlspecialchars($inf['provincia']) ?></td><td><?= htmlspecialchars($inf['municipio']) ?></td><td><?= htmlspecialchars($inf['pn']) ?></td></tr>
          <?php endforeach; ?>
          <?php if(empty($infras)): ?><tr><td colspan="6" class="text-center text-muted py-4">Sin infraestructuras</td></tr><?php endif; ?>
          </tbody>
        </table>
      </div>
      <?php break;

    case 'timeline': ?>
      <h4 class="mb-4">Timeline</h4>
      <?php
      $regs = $db->query('SELECT * FROM registros_sync ORDER BY fecha DESC, creado_at DESC LIMIT 50')->fetchAll();
      ?>
      <div class="list-group">
      <?php foreach($regs as $r):
        $datos = json_decode($r['datos'], true) ?: [];
      ?>
        <div class="list-group-item">
          <div class="d-flex gap-2 align-items-center">
            <span class="badge badge-<?= strtolower($r['tipo']) ?>"><?= $r['tipo'] ?></span>
            <strong><?= htmlspecialchars($r['unidad']) ?></strong>
            <?php if($r['transecto']): ?><small class="text-muted"><?= $r['transecto'] ?></small><?php endif; ?>
            <small class="text-muted ms-auto"><?= $r['fecha'] ?></small>
          </div>
          <small class="text-muted"><?= htmlspecialchars($r['email']) ?></small>
          <?php if(!empty($datos['observaciones'])): ?><p class="mb-0 mt-1 small"><?= htmlspecialchars(substr($datos['observaciones'],0,100)) ?></p><?php endif; ?>
        </div>
      <?php endforeach; ?>
      </div>
      <?php break;

    case 'comparador': ?>
      <h4 class="mb-4">Comparador de Fotos</h4>
      <p class="text-muted">El comparador de fotos está disponible en la aplicación PWA para uso con fotos locales y de Cloudinary.</p>
      <?php break;

endswitch; ?>

    </div><!-- /col -->
  </div><!-- /row -->
</div>
<?php endif; ?>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>

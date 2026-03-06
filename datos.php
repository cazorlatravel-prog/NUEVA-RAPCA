<?php
// ============================================================
// RAPCA Campo — datos.php — Gestión de registros
// ============================================================
require_once __DIR__ . '/config.php';
setCORS();
header('Content-Type: application/json');

try { initDB(); } catch (Exception $e) {}

$token = getToken();
$user = validarToken($token);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);
$accion = $input['accion'] ?? $_GET['accion'] ?? '';

switch ($accion) {
    case 'upsert':
        if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

        $registro_id = $input['registro_id'] ?? 0;
        $email = $input['email'] ?? $user['email'];
        $tipo = $input['tipo'] ?? '';
        $fecha = $input['fecha'] ?? null;
        $zona = $input['zona'] ?? '';
        $unidad = $input['unidad'] ?? '';
        $transecto = $input['transecto'] ?? '';
        $datos = $input['datos'] ?? '{}';
        $lat = $input['lat'] ?? null;
        $lon = $input['lon'] ?? null;

        if (!$registro_id || !$tipo) {
            jsonResponse(['ok' => false, 'error' => 'Datos incompletos'], 400);
        }

        $db = getDB();
        $stmt = $db->prepare('INSERT INTO registros_sync (registro_id, email, tipo, fecha, zona, unidad, transecto, datos, lat, lon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE tipo=VALUES(tipo), fecha=VALUES(fecha), zona=VALUES(zona), unidad=VALUES(unidad),
            transecto=VALUES(transecto), datos=VALUES(datos), lat=VALUES(lat), lon=VALUES(lon)');
        $stmt->execute([$registro_id, $email, $tipo, $fecha, $zona, $unidad, $transecto, $datos, $lat, $lon]);

        jsonResponse(['ok' => true]);
        break;

    case 'listar':
        if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

        $db = getDB();
        if ($user['rol'] === 'admin') {
            $stmt = $db->query('SELECT * FROM registros_sync ORDER BY fecha DESC, creado_at DESC');
        } else {
            $stmt = $db->prepare('SELECT * FROM registros_sync WHERE email = ? ORDER BY fecha DESC, creado_at DESC');
            $stmt->execute([$user['email']]);
        }

        jsonResponse(['ok' => true, 'registros' => $stmt->fetchAll()]);
        break;

    case 'eliminar':
        if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

        $id = intval($input['id'] ?? 0);
        $db = getDB();

        if ($user['rol'] === 'admin') {
            $db->prepare('DELETE FROM registros_sync WHERE id = ?')->execute([$id]);
        } else {
            $db->prepare('DELETE FROM registros_sync WHERE id = ? AND email = ?')->execute([$id, $user['email']]);
        }

        jsonResponse(['ok' => true]);
        break;

    case 'stats':
        if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

        $db = getDB();
        $stats = [];

        $stmt = $db->query('SELECT tipo, COUNT(*) as total FROM registros_sync GROUP BY tipo');
        $stats['por_tipo'] = $stmt->fetchAll();

        $stmt = $db->query('SELECT COUNT(DISTINCT unidad) as total FROM registros_sync');
        $stats['unidades'] = $stmt->fetch()['total'];

        $stmt = $db->query('SELECT COUNT(DISTINCT email) as total FROM registros_sync');
        $stats['operadores'] = $stmt->fetch()['total'];

        $stmt = $db->query('SELECT fecha, tipo, COUNT(*) as total FROM registros_sync WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY fecha, tipo ORDER BY fecha');
        $stats['actividad_30d'] = $stmt->fetchAll();

        jsonResponse(['ok' => true, 'stats' => $stats]);
        break;

    default:
        jsonResponse(['error' => 'Acción no válida'], 400);
}

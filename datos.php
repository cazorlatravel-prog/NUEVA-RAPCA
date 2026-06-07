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

        $registro_id = intval($input['registro_id'] ?? 0);
        // Solo admin puede especificar email de otro operador
        $email = ($user['rol'] === 'admin') ? ($input['email'] ?? $user['email']) : $user['email'];
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

        // Validar tipo contra lista permitida (coherente con fotos/upload)
        if (!in_array($tipo, ['VP', 'EL', 'EI'], true)) {
            jsonResponse(['ok' => false, 'error' => 'Tipo no válido'], 400);
        }

        // Validar que 'datos' sea JSON bien formado (evita basura/inyección almacenada)
        if (!is_string($datos) || json_decode($datos, true) === null) {
            jsonResponse(['ok' => false, 'error' => 'Datos con formato inválido'], 400);
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
            $stmt = $db->query('SELECT r.*, u.nombre as operador_nombre FROM registros_sync r LEFT JOIN usuarios u ON r.email = u.email ORDER BY r.fecha DESC, r.creado_at DESC');
        } else {
            $stmt = $db->prepare('SELECT r.*, u.nombre as operador_nombre FROM registros_sync r LEFT JOIN usuarios u ON r.email = u.email WHERE r.email = ? ORDER BY r.fecha DESC, r.creado_at DESC');
            $stmt->execute([$user['email']]);
        }

        jsonResponse(['ok' => true, 'registros' => $stmt->fetchAll()]);
        break;

    case 'eliminar':
        if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

        $id = intval($input['id'] ?? 0);
        $registro_id = intval($input['registro_id'] ?? 0);
        $db = getDB();

        if ($registro_id) {
            // Buscar por registro_id (id local del cliente)
            if ($user['rol'] === 'admin') {
                $db->prepare('DELETE FROM registros_sync WHERE registro_id = ?')->execute([$registro_id]);
            } else {
                $db->prepare('DELETE FROM registros_sync WHERE registro_id = ? AND email = ?')->execute([$registro_id, $user['email']]);
            }
        } elseif ($id) {
            // Buscar por id (PK del servidor)
            if ($user['rol'] === 'admin') {
                $db->prepare('DELETE FROM registros_sync WHERE id = ?')->execute([$id]);
            } else {
                $db->prepare('DELETE FROM registros_sync WHERE id = ? AND email = ?')->execute([$id, $user['email']]);
            }
        }

        jsonResponse(['ok' => true]);
        break;

    case 'borrar_todo':
        if (!$user || $user['rol'] !== 'admin') jsonResponse(['ok' => false, 'error' => 'Solo administradores'], 403);

        $confirmacion = $input['confirmacion'] ?? '';
        if ($confirmacion !== 'BORRAR') jsonResponse(['ok' => false, 'error' => 'Confirmación requerida'], 400);

        $db = getDB();

        // Contar registros antes de borrar
        $count = $db->query('SELECT COUNT(*) as total FROM registros_sync')->fetch()['total'];

        // Borrar todos los registros
        $db->exec('DELETE FROM registros_sync');

        // Borrar fotos locales del servidor
        $uploadsDir = __DIR__ . '/uploads/rapca';
        if (is_dir($uploadsDir)) {
            $it = new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS);
            $files = new RecursiveIteratorIterator($it, RecursiveIteratorIterator::CHILD_FIRST);
            foreach ($files as $file) {
                if ($file->isDir()) rmdir($file->getRealPath());
                else unlink($file->getRealPath());
            }
        }

        jsonResponse(['ok' => true, 'borrados' => intval($count)]);
        break;

    case 'stats':
        if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

        $db = getDB();
        $stats = [];
        $isAdmin = $user['rol'] === 'admin';

        if ($isAdmin) {
            $stmt = $db->query('SELECT tipo, COUNT(*) as total FROM registros_sync GROUP BY tipo');
            $stats['por_tipo'] = $stmt->fetchAll();

            $stmt = $db->query('SELECT COUNT(DISTINCT unidad) as total FROM registros_sync');
            $stats['unidades'] = $stmt->fetch()['total'];

            $stmt = $db->query('SELECT COUNT(DISTINCT email) as total FROM registros_sync');
            $stats['operadores'] = $stmt->fetch()['total'];

            $stmt = $db->query('SELECT fecha, tipo, COUNT(*) as total FROM registros_sync WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY fecha, tipo ORDER BY fecha');
            $stats['actividad_30d'] = $stmt->fetchAll();
        } else {
            $stmt = $db->prepare('SELECT tipo, COUNT(*) as total FROM registros_sync WHERE email = ? GROUP BY tipo');
            $stmt->execute([$user['email']]);
            $stats['por_tipo'] = $stmt->fetchAll();

            $stmt = $db->prepare('SELECT COUNT(DISTINCT unidad) as total FROM registros_sync WHERE email = ?');
            $stmt->execute([$user['email']]);
            $stats['unidades'] = $stmt->fetch()['total'];

            $stats['operadores'] = 1;

            $stmt = $db->prepare('SELECT fecha, tipo, COUNT(*) as total FROM registros_sync WHERE email = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY fecha, tipo ORDER BY fecha');
            $stmt->execute([$user['email']]);
            $stats['actividad_30d'] = $stmt->fetchAll();
        }

        jsonResponse(['ok' => true, 'stats' => $stats]);
        break;

    default:
        jsonResponse(['error' => 'Acción no válida'], 400);
}

<?php
// ============================================================
// RAPCA Campo — auth.php — Autenticación API
// ============================================================
require_once __DIR__ . '/config.php';
setCORS();
header('Content-Type: application/json');

try { initDB(); } catch (Exception $e) {}

$input = json_decode(file_get_contents('php://input'), true);
$accion = $input['accion'] ?? $_GET['accion'] ?? '';

switch ($accion) {
    case 'login':
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';

        if (!$email || !$password) {
            jsonResponse(['ok' => false, 'error' => 'Email y contraseña requeridos'], 400);
        }

        // Rate limiting por IP
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        if (!checkRateLimit('login_' . $ip)) {
            jsonResponse(['ok' => false, 'error' => 'Demasiados intentos. Espera 15 minutos.'], 429);
        }

        $db = getDB();
        $stmt = $db->prepare('SELECT id, email, password, nombre, rol, activo FROM usuarios WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            jsonResponse(['ok' => false, 'error' => 'Usuario no encontrado'], 401);
        }

        // Verificar contraseña: soporta bcrypt y texto plano (migración)
        $passOk = false;
        if (password_verify($password, $user['password'])) {
            $passOk = true;
            // Rehashear si el coste es antiguo
            if (password_needs_rehash($user['password'], PASSWORD_BCRYPT, ['cost' => 12])) {
                $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
                $db->prepare('UPDATE usuarios SET password = ? WHERE id = ?')->execute([$newHash, $user['id']]);
            }
        } elseif ($user['password'] === $password) {
            // Contraseña en texto plano (creada manualmente en BD) — migrar a bcrypt
            $passOk = true;
            $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $db->prepare('UPDATE usuarios SET password = ? WHERE id = ?')->execute([$newHash, $user['id']]);
        }

        if (!$passOk) {
            jsonResponse(['ok' => false, 'error' => 'Contraseña incorrecta'], 401);
        }

        if (!$user['activo']) {
            jsonResponse(['ok' => false, 'error' => 'Cuenta desactivada'], 403);
        }

        // Generar token
        $token = bin2hex(random_bytes(32));
        $db->prepare('INSERT INTO sesiones (usuario_id, token) VALUES (?, ?)')->execute([$user['id'], $token]);

        jsonResponse([
            'ok' => true,
            'token' => $token,
            'email' => $user['email'],
            'nombre' => $user['nombre'],
            'rol' => $user['rol'],
            'id' => $user['id']
        ]);
        break;

    case 'logout':
        $token = getToken();
        if ($token) {
            $db = getDB();
            $db->prepare('UPDATE sesiones SET activo = 0 WHERE token = ?')->execute([$token]);
        }
        jsonResponse(['ok' => true]);
        break;

    case 'verificar':
        $token = getToken();
        $user = validarToken($token);
        if ($user) {
            jsonResponse(['ok' => true, 'email' => $user['email'], 'nombre' => $user['nombre'], 'rol' => $user['rol'], 'id' => $user['id']]);
        } else {
            jsonResponse(['ok' => false, 'error' => 'Token inválido'], 401);
        }
        break;

    case 'crear_usuario':
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }

        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        $nombre = $input['nombre'] ?? '';
        $rol = $input['rol'] ?? 'operador';

        if (!$email || strlen($password) < 8 || !$nombre) {
            jsonResponse(['ok' => false, 'error' => 'Datos inválidos (contraseña mín 8 caracteres)'], 400);
        }

        if (!in_array($rol, ['admin', 'operador'])) $rol = 'operador';

        $db = getDB();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        try {
            $db->prepare('INSERT INTO usuarios (email, password, nombre, rol) VALUES (?, ?, ?, ?)')->execute([$email, $hash, $nombre, $rol]);
            jsonResponse(['ok' => true, 'id' => $db->lastInsertId()]);
        } catch (PDOException $e) {
            jsonResponse(['ok' => false, 'error' => 'El email ya existe'], 409);
        }
        break;

    case 'listar_usuarios':
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }

        $db = getDB();
        $stmt = $db->query('SELECT id, email, nombre, rol, activo, creado_at FROM usuarios ORDER BY creado_at DESC');
        jsonResponse(['ok' => true, 'usuarios' => $stmt->fetchAll()]);
        break;

    case 'toggle_usuario':
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }

        $id = intval($input['id'] ?? 0);
        $db = getDB();
        $db->prepare('UPDATE usuarios SET activo = NOT activo WHERE id = ?')->execute([$id]);
        jsonResponse(['ok' => true]);
        break;

    case 'cambiar_password':
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }

        $id = intval($input['id'] ?? 0);
        $password = $input['password'] ?? '';
        if (strlen($password) < 8) {
            jsonResponse(['ok' => false, 'error' => 'Contraseña mínimo 8 caracteres'], 400);
        }

        $db = getDB();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare('UPDATE usuarios SET password = ? WHERE id = ?')->execute([$hash, $id]);
        jsonResponse(['ok' => true]);
        break;

    case 'eliminar_usuario':
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }

        $id = intval($input['id'] ?? 0);
        $db = getDB();
        $db->prepare('DELETE FROM usuarios WHERE id = ? AND email != ?')->execute([$id, ADMIN_EMAIL]);
        jsonResponse(['ok' => true]);
        break;

    default:
        jsonResponse(['error' => 'Acción no válida'], 400);
}

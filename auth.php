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
    case 'reset_rate_limit':
        // Solo admin puede resetear rate limits
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }
        if (is_dir(RATE_LIMIT_DIR)) {
            $files = glob(RATE_LIMIT_DIR . '/*.json');
            foreach ($files as $f) unlink($f);
        }
        jsonResponse(['ok' => true, 'msg' => 'Rate limits reseteados']);
        break;

    case 'reset_admin':
        // Solo admin puede resetear contraseña admin
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }
        $db = getDB();
        $hash = password_hash(ADMIN_PASS_DEFAULT, PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare('UPDATE usuarios SET password = ?, activo = 1 WHERE email = ?')->execute([$hash, ADMIN_EMAIL]);
        if (is_dir(RATE_LIMIT_DIR)) {
            $files = glob(RATE_LIMIT_DIR . '/*.json');
            foreach ($files as $f) unlink($f);
        }
        jsonResponse(['ok' => true, 'msg' => 'Admin reseteado con contraseña por defecto']);
        break;

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
            jsonResponse(['ok' => false, 'error' => 'Credenciales incorrectas'], 401);
        }

        // Verificar cuenta activa antes de password (evitar rehash de cuentas desactivadas)
        if (!$user['activo']) {
            jsonResponse(['ok' => false, 'error' => 'Cuenta desactivada'], 403);
        }

        // Verificar contraseña solo con bcrypt
        if (!password_verify($password, $user['password'])) {
            jsonResponse(['ok' => false, 'error' => 'Credenciales incorrectas'], 401);
        }

        // Rehashear si el coste es antiguo
        if (password_needs_rehash($user['password'], PASSWORD_BCRYPT, ['cost' => 12])) {
            $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $db->prepare('UPDATE usuarios SET password = ? WHERE id = ?')->execute([$newHash, $user['id']]);
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

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || !$nombre) {
            jsonResponse(['ok' => false, 'error' => 'Datos inválidos (email válido, contraseña mín 8 caracteres, nombre requerido)'], 400);
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
        // Proteger la cuenta de admin raíz: solo ella misma puede desactivarse
        $st = $db->prepare('SELECT email FROM usuarios WHERE id = ?');
        $st->execute([$id]);
        $objetivo = $st->fetchColumn();
        if ($objetivo === ADMIN_EMAIL && $admin['email'] !== ADMIN_EMAIL) {
            jsonResponse(['ok' => false, 'error' => 'No puedes desactivar al administrador principal'], 403);
        }
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

    case 'editar_usuario':
        $token = getToken();
        $admin = validarToken($token);
        if (!$admin || $admin['rol'] !== 'admin') {
            jsonResponse(['ok' => false, 'error' => 'No autorizado'], 403);
        }

        $id = intval($input['id'] ?? 0);
        if (!$id) jsonResponse(['ok' => false, 'error' => 'ID requerido'], 400);

        $db = getDB();
        // Proteger la cuenta de admin raíz: solo ella misma puede editarse
        $st = $db->prepare('SELECT email FROM usuarios WHERE id = ?');
        $st->execute([$id]);
        $objetivo = $st->fetchColumn();
        if ($objetivo === ADMIN_EMAIL && $admin['email'] !== ADMIN_EMAIL) {
            jsonResponse(['ok' => false, 'error' => 'No puedes editar al administrador principal'], 403);
        }

        $campos = [];
        $valores = [];

        if (!empty($input['nombre'])) {
            $campos[] = 'nombre = ?';
            $valores[] = trim($input['nombre']);
        }
        if (!empty($input['email'])) {
            if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
                jsonResponse(['ok' => false, 'error' => 'Email no válido'], 400);
            }
            $campos[] = 'email = ?';
            $valores[] = trim($input['email']);
        }
        if (!empty($input['password'])) {
            if (strlen($input['password']) < 8) {
                jsonResponse(['ok' => false, 'error' => 'Contraseña mínimo 8 caracteres'], 400);
            }
            $campos[] = 'password = ?';
            $valores[] = password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        }

        if (empty($campos)) {
            jsonResponse(['ok' => false, 'error' => 'Nada que actualizar'], 400);
        }

        $valores[] = $id;
        try {
            $db->prepare('UPDATE usuarios SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute($valores);
            jsonResponse(['ok' => true]);
        } catch (PDOException $e) {
            jsonResponse(['ok' => false, 'error' => 'El email ya existe'], 409);
        }
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

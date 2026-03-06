<?php
// ============================================================
// RAPCA Campo — includes/auth.php — Auth para panel admin PHP
// ============================================================
require_once __DIR__ . '/../config.php';

// Configurar sesión segura
ini_set('session.use_strict_mode', 1);
ini_set('session.use_only_cookies', 1);

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

// CSRF
function generarCSRF() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verificarCSRF($token) {
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

function csrfField() {
    return '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(generarCSRF()) . '">';
}

// Verificar timeouts
function verificarSesionAdmin() {
    if (!isset($_SESSION['admin_user'])) return false;

    $now = time();

    // Timeout absoluto: 8 horas
    if (isset($_SESSION['login_time']) && ($now - $_SESSION['login_time']) > SESSION_TIMEOUT_ABSOLUTE) {
        cerrarSesionAdmin();
        return false;
    }

    // Timeout inactividad: 2 horas
    if (isset($_SESSION['last_activity']) && ($now - $_SESSION['last_activity']) > SESSION_TIMEOUT_IDLE) {
        cerrarSesionAdmin();
        return false;
    }

    $_SESSION['last_activity'] = $now;
    return true;
}

function loginAdmin($email, $password) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    if (!checkRateLimit('admin_login_' . $ip)) {
        return ['ok' => false, 'error' => 'Demasiados intentos. Espera 15 minutos.'];
    }

    try {
        $db = getDB();
        initDB();
        $stmt = $db->prepare('SELECT id, email, password, nombre, rol, activo FROM usuarios WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password'])) {
            return ['ok' => false, 'error' => 'Credenciales incorrectas'];
        }

        if (!$user['activo']) {
            return ['ok' => false, 'error' => 'Cuenta desactivada'];
        }

        if ($user['rol'] !== 'admin') {
            return ['ok' => false, 'error' => 'Acceso solo para administradores'];
        }

        // Regenerar ID de sesión
        session_regenerate_id(true);

        $_SESSION['admin_user'] = [
            'id' => $user['id'],
            'email' => $user['email'],
            'nombre' => $user['nombre'],
            'rol' => $user['rol']
        ];
        $_SESSION['login_time'] = time();
        $_SESSION['last_activity'] = time();

        return ['ok' => true];
    } catch (Exception $e) {
        return ['ok' => false, 'error' => 'Error de conexión'];
    }
}

function cerrarSesionAdmin() {
    // Invalidar tokens API del usuario
    if (isset($_SESSION['admin_user'])) {
        try {
            $db = getDB();
            $db->prepare('UPDATE sesiones SET activo = 0 WHERE usuario_id = ?')->execute([$_SESSION['admin_user']['id']]);
        } catch (Exception $e) {}
    }

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }
    session_destroy();
}

function requireAdmin() {
    if (!verificarSesionAdmin()) {
        header('Location: index.php?page=login');
        exit;
    }
}

function getAdminUser() {
    return $_SESSION['admin_user'] ?? null;
}

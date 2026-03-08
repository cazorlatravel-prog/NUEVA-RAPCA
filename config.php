<?php
// ============================================================
// RAPCA Campo — config.php — Configuración
// ============================================================

// Cargar .env si existe
function loadEnv($path) {
    if (!file_exists($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        list($key, $val) = explode('=', $line, 2);
        $key = trim($key);
        $val = trim($val);
        if (!getenv($key)) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
        }
    }
}

// Buscar .env en el directorio actual o un nivel arriba
if (file_exists(__DIR__ . '/.env')) {
    loadEnv(__DIR__ . '/.env');
} elseif (file_exists(dirname(__DIR__) . '/.env')) {
    loadEnv(dirname(__DIR__) . '/.env');
}

// Base de datos MySQL
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'u919343704_rapcanueva');
define('DB_USER', getenv('DB_USER') ?: 'u919343704_rapcanueva');
define('DB_PASS', getenv('DB_PASS') ?: 'Gallito9431%');

// Cloudinary
define('CLOUDINARY_CLOUD', getenv('CLOUDINARY_CLOUD_NAME') ?: 'drnqs1jwl');
define('CLOUDINARY_KEY', getenv('CLOUDINARY_API_KEY') ?: '587983846793923');
define('CLOUDINARY_SECRET', getenv('CLOUDINARY_API_SECRET') ?: '');

// URL de la app
define('APP_URL', getenv('APP_URL') ?: 'https://rapca.app');

// CORS orígenes permitidos
define('CORS_ORIGINS', serialize([
    'https://rapca.app',
    'https://www.rapca.app',
    'http://localhost',
    'http://localhost:8080'
]));

// Admin por defecto
define('ADMIN_EMAIL', 'rapcajaen@gmail.com');
define('ADMIN_PASS_DEFAULT', 'Gallito9431%');

// Rate limiting
define('RATE_LIMIT_MAX', 5);
define('RATE_LIMIT_WINDOW', 900); // 15 minutos en segundos
define('RATE_LIMIT_DIR', __DIR__ . '/tmp/rate_limits');

// Sesiones
define('SESSION_TIMEOUT_ABSOLUTE', 28800); // 8 horas
define('SESSION_TIMEOUT_IDLE', 7200); // 2 horas

// Conexión PDO
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error de conexión a base de datos']);
            exit;
        }
    }
    return $pdo;
}

// CORS headers
function setCORS() {
    $origins = unserialize(CORS_ORIGINS);
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $origins)) {
        header("Access-Control-Allow-Origin: $origin");
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// Rate limiting basado en archivos
function checkRateLimit($key) {
    if (!is_dir(RATE_LIMIT_DIR)) {
        mkdir(RATE_LIMIT_DIR, 0755, true);
    }
    $file = RATE_LIMIT_DIR . '/' . md5($key) . '.json';
    $now = time();
    $attempts = [];

    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (is_array($data)) {
            $attempts = array_filter($data, function($t) use ($now) {
                return ($now - $t) < RATE_LIMIT_WINDOW;
            });
        }
    }

    if (count($attempts) >= RATE_LIMIT_MAX) {
        return false;
    }

    $attempts[] = $now;
    file_put_contents($file, json_encode(array_values($attempts)));
    return true;
}

// Validar token de sesión (expira en 8 horas)
function validarToken($token) {
    if (!$token) return null;
    try {
        $db = getDB();
        // Limpiar sesiones antiguas (> 24h) periódicamente
        $db->exec('DELETE FROM sesiones WHERE creado_at < NOW() - INTERVAL 24 HOUR');
        // Token válido si activo y creado en las últimas 8 horas
        $stmt = $db->prepare('SELECT u.id, u.email, u.nombre, u.rol FROM sesiones s JOIN usuarios u ON s.usuario_id = u.id WHERE s.token = ? AND s.activo = 1 AND s.creado_at > NOW() - INTERVAL 8 HOUR');
        $stmt->execute([$token]);
        return $stmt->fetch();
    } catch (Exception $e) {
        return null;
    }
}

// Obtener token del header
function getToken() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
        return $matches[1];
    }
    return null;
}

// JSON response
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP);
    exit;
}

// Crear tablas si no existen
function initDB() {
    $db = getDB();
    $db->exec("
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            nombre VARCHAR(255) NOT NULL,
            rol ENUM('admin','operador') DEFAULT 'operador',
            activo TINYINT(1) DEFAULT 1,
            creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS sesiones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            token VARCHAR(64) UNIQUE NOT NULL,
            activo TINYINT(1) DEFAULT 1,
            creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS registros_sync (
            id INT AUTO_INCREMENT PRIMARY KEY,
            registro_id BIGINT NOT NULL,
            email VARCHAR(255) NOT NULL,
            tipo VARCHAR(10) NOT NULL,
            fecha DATE,
            zona VARCHAR(20),
            unidad VARCHAR(20),
            transecto VARCHAR(5),
            datos JSON,
            lat DECIMAL(10,6),
            lon DECIMAL(10,6),
            creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            actualizado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_registro (registro_id, email),
            INDEX idx_email (email),
            INDEX idx_tipo (tipo),
            INDEX idx_fecha (fecha),
            INDEX idx_unidad (unidad)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS infraestructuras (
            id INT AUTO_INCREMENT PRIMARY KEY,
            provincia VARCHAR(100),
            idZona VARCHAR(20),
            idUnidad VARCHAR(20),
            codInfoca VARCHAR(50),
            nombre VARCHAR(255),
            superficie VARCHAR(50),
            pagoMaximo VARCHAR(50),
            municipio VARCHAR(100),
            pn VARCHAR(100),
            contrato VARCHAR(100),
            vegetacion TEXT,
            pendiente VARCHAR(50),
            distancia VARCHAR(50),
            datos_extra JSON,
            creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS fallos_subida (
            id INT AUTO_INCREMENT PRIMARY KEY,
            operador VARCHAR(255),
            fallos INT,
            detalle TEXT,
            creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Admin por defecto
    $stmt = $db->prepare('SELECT id FROM usuarios WHERE email = ?');
    $stmt->execute([ADMIN_EMAIL]);
    if (!$stmt->fetch()) {
        $hash = password_hash(ADMIN_PASS_DEFAULT, PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare('INSERT INTO usuarios (email, password, nombre, rol) VALUES (?, ?, ?, ?)')->execute([ADMIN_EMAIL, $hash, 'Administrador', 'admin']);
    }
}

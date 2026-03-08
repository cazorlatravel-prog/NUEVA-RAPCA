-- ============================================================
-- RAPCA Campo — Schema SQL para u919343704_rapcanueva
-- Ejecutar en phpMyAdmin o línea de comandos MySQL
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    rol ENUM('admin','operador') DEFAULT 'operador',
    activo TINYINT(1) DEFAULT 1,
    creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla de sesiones (tokens de autenticación)
CREATE TABLE IF NOT EXISTS sesiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_token_activo (token, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla de registros sincronizados (VP, EL, EI)
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

-- Tabla de infraestructuras (unidades de campo)
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
    creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_zona_unidad (idZona, idUnidad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla de log de fallos de subida de fotos
CREATE TABLE IF NOT EXISTS fallos_subida (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operador VARCHAR(255),
    fallos INT,
    detalle TEXT,
    creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- Insertar admin por defecto (contraseña: Gallito9431%)
-- El hash se genera automáticamente desde la app PHP, pero aquí va uno precalculado
-- La app lo creará automáticamente si no existe al primer uso

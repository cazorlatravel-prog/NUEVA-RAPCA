<?php
// ============================================================
// RAPCA Campo — upload.php — Subida de fotos a Cloudinary
// ============================================================
require_once __DIR__ . '/config.php';
setCORS();
header('Content-Type: application/json');

$token = getToken();
$user = validarToken($token);
if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

$input = json_decode(file_get_contents('php://input'), true);
$codigo = $input['codigo'] ?? '';
$tipo = $input['tipo'] ?? 'VP';
$imagen = $input['imagen'] ?? '';

if (!$codigo || !$imagen) {
    jsonResponse(['ok' => false, 'error' => 'Código e imagen requeridos'], 400);
}

// Validar tipo contra lista permitida
if (!in_array($tipo, ['VP', 'EL', 'EI'], true)) {
    jsonResponse(['ok' => false, 'error' => 'Tipo no válido'], 400);
}

// Sanitizar codigo - solo alfanuméricos, guiones y guiones bajos
if (!preg_match('/^[a-zA-Z0-9_-]+$/', $codigo)) {
    jsonResponse(['ok' => false, 'error' => 'Código contiene caracteres no permitidos'], 400);
}

// Limitar tamaño del base64 (max ~10MB encoded = ~7.5MB imagen)
if (strlen($imagen) > 10 * 1024 * 1024) {
    jsonResponse(['ok' => false, 'error' => 'Imagen demasiado grande (máx 7.5MB)'], 400);
}

// Extraer unidad del código (ej: 23AJE01_VP_1 -> 23AJE01)
$parts = explode('_', $codigo);
$unidad = preg_replace('/[^a-zA-Z0-9_-]/', '', $parts[0] ?? 'sin_unidad');

// Carpeta en Cloudinary: rapca/{tipo}/{unidad}/{codigo}
$folder = "rapca/{$tipo}/{$unidad}";

// Decodificar base64 a archivo temporal
$imageData = preg_replace('#^data:image/\w+;base64,#i', '', $imagen);
$imageData = base64_decode($imageData);

if ($imageData === false) {
    jsonResponse(['ok' => false, 'error' => 'Imagen inválida'], 400);
}

// Validar que el contenido sea realmente una imagen
$imageInfo = @getimagesizefromstring($imageData);
if ($imageInfo === false) {
    jsonResponse(['ok' => false, 'error' => 'El archivo no es una imagen válida'], 400);
}

// Guardar siempre una copia local como respaldo
$uploadDir = __DIR__ . '/uploads/' . $folder;
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
$localPath = $uploadDir . '/' . basename($codigo) . '.jpg';
file_put_contents($localPath, $imageData);
$localUrl = '/uploads/' . $folder . '/' . basename($codigo) . '.jpg';

if (!CLOUDINARY_CLOUD || !CLOUDINARY_KEY || !CLOUDINARY_SECRET) {
    jsonResponse(['ok' => true, 'url' => $localUrl, 'modo' => 'local', 'aviso' => 'Cloudinary no configurado. Foto guardada solo en servidor local.']);
}

// Subir a Cloudinary usando multipart/form-data (método correcto)
$timestamp = time();
$params = [
    'folder' => $folder,
    'public_id' => $codigo,
    'timestamp' => (string)$timestamp,
    'overwrite' => 'true'
];

// Generar firma
ksort($params);
$signStr = '';
foreach ($params as $k => $v) $signStr .= "$k=$v&";
$signStr = rtrim($signStr, '&') . CLOUDINARY_SECRET;
$signature = sha1($signStr);

// Escribir imagen a archivo temporal para upload multipart
$tmpFile = tempnam(sys_get_temp_dir(), 'rapca_');
file_put_contents($tmpFile, $imageData);

$postFields = $params;
$postFields['file'] = new CURLFile($tmpFile, 'image/jpeg', $codigo . '.jpg');
$postFields['api_key'] = CLOUDINARY_KEY;
$postFields['signature'] = $signature;

$ch = curl_init("https://api.cloudinary.com/v1_1/" . CLOUDINARY_CLOUD . "/image/upload");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postFields,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 120
]);

$response = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Limpiar archivo temporal
@unlink($tmpFile);

if ($httpCode >= 200 && $httpCode < 300) {
    $result = json_decode($response, true);
    jsonResponse([
        'ok' => true,
        'url' => $result['secure_url'] ?? '',
        'public_id' => $result['public_id'] ?? '',
        'modo' => 'cloudinary'
    ]);
} else {
    // Log del fallo
    $errorDetail = $curlError ?: "HTTP $httpCode: $response";
    try {
        $db = getDB();
        $db->prepare('INSERT INTO fallos_subida (operador, fallos, detalle) VALUES (?, 1, ?)')->execute([$user['email'], $errorDetail]);
    } catch (Exception $e) {}

    // Devolver éxito parcial: la foto está en local aunque Cloudinary falló
    error_log('Cloudinary upload error: ' . $errorDetail);
    jsonResponse([
        'ok' => true,
        'url' => $localUrl,
        'modo' => 'local_fallback',
        'aviso' => 'Cloudinary no disponible. Foto guardada en servidor local.'
    ]);
}

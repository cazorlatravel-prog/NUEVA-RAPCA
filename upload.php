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

// Extraer unidad del código (ej: 23AJE01_VP_1 -> 23AJE01)
$parts = explode('_', $codigo);
$unidad = $parts[0] ?? 'sin_unidad';

// Carpeta en Cloudinary: rapca/{tipo}/{unidad}/{codigo}
$folder = "rapca/{$tipo}/{$unidad}";

if (!CLOUDINARY_CLOUD || !CLOUDINARY_KEY || !CLOUDINARY_SECRET) {
    // Sin Cloudinary configurado, guardar localmente
    $uploadDir = __DIR__ . '/uploads/' . $folder;
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    // Decodificar base64
    $imageData = preg_replace('#^data:image/\w+;base64,#i', '', $imagen);
    $imageData = base64_decode($imageData);

    if ($imageData === false) {
        jsonResponse(['ok' => false, 'error' => 'Imagen inválida'], 400);
    }

    $filePath = $uploadDir . '/' . $codigo . '.jpg';
    file_put_contents($filePath, $imageData);

    jsonResponse(['ok' => true, 'url' => '/uploads/' . $folder . '/' . $codigo . '.jpg', 'modo' => 'local']);
}

// Subir a Cloudinary
$timestamp = time();
$params = [
    'folder' => $folder,
    'public_id' => $codigo,
    'timestamp' => $timestamp,
    'overwrite' => 'true'
];

// Generar firma
ksort($params);
$signStr = '';
foreach ($params as $k => $v) $signStr .= "$k=$v&";
$signStr = rtrim($signStr, '&') . CLOUDINARY_SECRET;
$signature = sha1($signStr);

$postData = $params;
$postData['file'] = $imagen;
$postData['api_key'] = CLOUDINARY_KEY;
$postData['signature'] = $signature;

$ch = curl_init("https://api.cloudinary.com/v1_1/" . CLOUDINARY_CLOUD . "/image/upload");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($postData),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode >= 200 && $httpCode < 300) {
    $result = json_decode($response, true);
    jsonResponse(['ok' => true, 'url' => $result['secure_url'] ?? '', 'public_id' => $result['public_id'] ?? '']);
} else {
    // Log del fallo
    $db = getDB();
    $db->prepare('INSERT INTO fallos_subida (operador, fallos, detalle) VALUES (?, 1, ?)')->execute([$user['email'], "HTTP $httpCode: $response"]);
    jsonResponse(['ok' => false, 'error' => 'Error al subir a Cloudinary', 'http_code' => $httpCode], 500);
}

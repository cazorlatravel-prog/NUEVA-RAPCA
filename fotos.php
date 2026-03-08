<?php
// ============================================================
// RAPCA Campo — fotos.php — Listado y descarga de fotos para precarga offline
// ============================================================
require_once __DIR__ . '/config.php';
setCORS();
header('Content-Type: application/json');

try { initDB(); } catch (Exception $e) {}

$token = getToken();
$user = validarToken($token);
if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

$accion = $_GET['accion'] ?? '';

// Construir URL de Cloudinary para una foto
function cloudinaryUrl($tipo, $unidad, $codigo, $transformacion = '') {
    $cloud = CLOUDINARY_CLOUD;
    if (!$cloud) return null;
    $base = "https://res.cloudinary.com/{$cloud}/image/upload";
    if ($transformacion) $base .= "/{$transformacion}";
    return "{$base}/rapca/{$tipo}/{$unidad}/{$codigo}.jpg";
}

// Descargar imagen desde URL y convertir a base64
function descargarComoBase64($url, $maxWidth = 600) {
    // Para URLs de Cloudinary, usar transformación directa
    $ctx = stream_context_create([
        'http' => ['timeout' => 20, 'ignore_errors' => true],
        'ssl' => ['verify_peer' => true]
    ]);
    $data = @file_get_contents($url, false, $ctx);
    if (!$data || strlen($data) < 100) return null;

    // Si Cloudinary ya redimensionó, solo convertir a base64
    if (strpos($url, 'res.cloudinary.com') !== false) {
        return 'data:image/jpeg;base64,' . base64_encode($data);
    }

    // Para archivos locales, redimensionar
    $img = @imagecreatefromstring($data);
    if (!$img) return null;

    $origW = imagesx($img);
    $origH = imagesy($img);

    if ($origW > $maxWidth) {
        $thumbW = $maxWidth;
        $thumbH = intval($origH * ($thumbW / $origW));
        $thumb = imagecreatetruecolor($thumbW, $thumbH);
        imagecopyresampled($thumb, $img, 0, 0, 0, 0, $thumbW, $thumbH, $origW, $origH);
        imagedestroy($img);
        $img = $thumb;
    }

    ob_start();
    imagejpeg($img, null, 70);
    $jpegData = ob_get_clean();
    imagedestroy($img);

    return 'data:image/jpeg;base64,' . base64_encode($jpegData);
}

switch ($accion) {
    // Listar zonas/unidades con fotos disponibles para precargar
    case 'zonas':
        $db = getDB();
        $stmt = $db->query('SELECT DISTINCT zona, unidad, COUNT(*) as registros FROM registros_sync GROUP BY zona, unidad ORDER BY zona, unidad');
        $zonas = [];
        foreach ($stmt->fetchAll() as $row) {
            $zona = $row['zona'] ?: 'Sin zona';
            if (!isset($zonas[$zona])) $zonas[$zona] = [];
            $zonas[$zona][] = ['unidad' => $row['unidad'], 'registros' => intval($row['registros'])];
        }
        jsonResponse(['ok' => true, 'zonas' => $zonas]);
        break;

    // Listar fotos disponibles para una zona o unidad
    case 'listar':
        $zona = preg_replace('/[^a-zA-Z0-9]/', '', $_GET['zona'] ?? '');
        $unidad = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['unidad'] ?? '');

        if (!$zona && !$unidad) {
            jsonResponse(['ok' => false, 'error' => 'Zona o unidad requerida'], 400);
        }

        $db = getDB();

        if ($unidad) {
            $stmt = $db->prepare('SELECT registro_id, tipo, fecha, unidad, datos FROM registros_sync WHERE unidad = ? ORDER BY fecha DESC');
            $stmt->execute([$unidad]);
        } else {
            $stmt = $db->prepare('SELECT registro_id, tipo, fecha, unidad, datos FROM registros_sync WHERE zona = ? ORDER BY fecha DESC');
            $stmt->execute([$zona]);
        }

        $fotos = [];
        $vistas = []; // para evitar duplicados
        $rows = $stmt->fetchAll();
        foreach ($rows as $row) {
            $datos = json_decode($row['datos'], true);
            if (!$datos) continue;

            // Fotos comparativas (W1/W2)
            if (!empty($datos['fotosComp'])) {
                foreach ($datos['fotosComp'] as $fc) {
                    $codigo = $fc['numero'] ?? '';
                    if (!$codigo || isset($vistas[$codigo])) continue;
                    $vistas[$codigo] = true;
                    $fotos[] = [
                        'codigo' => $codigo,
                        'tipo' => $row['tipo'],
                        'fecha' => $row['fecha'],
                        'unidad' => $row['unidad'],
                        'waypoint' => $fc['waypoint'] ?? '',
                        'lat' => $fc['lat'] ?? null,
                        'lon' => $fc['lon'] ?? null
                    ];
                }
            }

            // Fotos generales
            if (!empty($datos['fotos'])) {
                $codigosFotos = array_map('trim', explode(',', $datos['fotos']));
                foreach ($codigosFotos as $codigo) {
                    if (!$codigo || isset($vistas[$codigo])) continue;
                    $vistas[$codigo] = true;
                    $fotos[] = [
                        'codigo' => $codigo,
                        'tipo' => $row['tipo'],
                        'fecha' => $row['fecha'],
                        'unidad' => $row['unidad'],
                        'waypoint' => 'G',
                        'lat' => null,
                        'lon' => null
                    ];
                }
            }
        }

        jsonResponse(['ok' => true, 'fotos' => $fotos, 'total' => count($fotos)]);
        break;

    // Descargar lote de fotos (máximo 5 por petición)
    case 'descargar_lote':
        $input = json_decode(file_get_contents('php://input'), true);
        $lista = $input['fotos'] ?? [];

        if (count($lista) > 5) {
            $lista = array_slice($lista, 0, 5);
        }

        $resultados = [];
        foreach ($lista as $item) {
            $codigo = preg_replace('/[^a-zA-Z0-9_-]/', '', $item['codigo'] ?? '');
            $tipo = preg_replace('/[^A-Z]/', '', $item['tipo'] ?? '');
            $unidad = preg_replace('/[^a-zA-Z0-9_-]/', '', $item['unidad'] ?? '');

            if (!$codigo || !$tipo || !$unidad) continue;

            $base64 = null;

            // Intentar primero desde Cloudinary (con transformación de tamaño para ahorrar ancho de banda)
            $cloudUrl = cloudinaryUrl($tipo, $unidad, $codigo, 'w_600,q_70');
            if ($cloudUrl) {
                $base64 = descargarComoBase64($cloudUrl, 9999); // ya viene redimensionada
            }

            // Fallback: archivo local en el servidor
            if (!$base64) {
                $localPath = __DIR__ . '/uploads/rapca/' . $tipo . '/' . $unidad . '/' . basename($codigo) . '.jpg';
                if (file_exists($localPath)) {
                    $base64 = descargarComoBase64('file://' . $localPath);
                }
            }

            if (!$base64) continue;

            $resultados[] = [
                'codigo' => $codigo,
                'tipo' => $tipo,
                'unidad' => $unidad,
                'waypoint' => $item['waypoint'] ?? '',
                'fecha' => $item['fecha'] ?? '',
                'lat' => $item['lat'] ?? null,
                'lon' => $item['lon'] ?? null,
                'data' => $base64
            ];
        }

        jsonResponse(['ok' => true, 'fotos' => $resultados]);
        break;

    default:
        jsonResponse(['error' => 'Acción no válida'], 400);
}

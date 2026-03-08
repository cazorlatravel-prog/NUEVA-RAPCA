<?php
// ============================================================
// RAPCA Campo — notificar.php — Log de fallos y notificaciones
// ============================================================
require_once __DIR__ . '/config.php';
setCORS();
header('Content-Type: application/json');

$token = getToken();
$user = validarToken($token);
if (!$user) jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);

$input = json_decode(file_get_contents('php://input'), true);
$tipo = $input['tipo'] ?? '';

switch ($tipo) {
    case 'fallo_subida':
        $fallos = intval($input['fallos'] ?? 0);
        $operador = htmlspecialchars($user['email'], ENT_QUOTES, 'UTF-8');

        try {
            $db = getDB();
            $db->prepare('INSERT INTO fallos_subida (operador, fallos, detalle) VALUES (?, ?, ?)')->execute([
                $operador,
                $fallos,
                'Fallo reportado desde PWA: ' . $fallos . ' fotos'
            ]);
        } catch (Exception $e) {
            // Log a archivo si la BD falla
            $logDir = __DIR__ . '/tmp/logs';
            if (!is_dir($logDir)) mkdir($logDir, 0755, true);
            file_put_contents(
                $logDir . '/fallos_subida.log',
                date('Y-m-d H:i:s') . " | $operador | $fallos fallos\n",
                FILE_APPEND
            );
        }

        // Email al admin (si configurado)
        $adminEmail = ADMIN_EMAIL;
        if ($adminEmail && function_exists('mail')) {
            $subject = "RAPCA: Fallo de subida de fotos";
            $message = "Operador: $operador\nFallos: $fallos\nFecha: " . date('Y-m-d H:i:s');
            $headers = "From: noreply@rapca.com\r\nContent-Type: text/plain; charset=UTF-8";
            @mail($adminEmail, $subject, $message, $headers);
        }

        jsonResponse(['ok' => true, 'mensaje' => 'Fallo registrado']);
        break;

    default:
        jsonResponse(['error' => 'Tipo de notificación no válido'], 400);
}

<?php
// Korte deellinks voor de Warmtepomp Tekentafel.
//
//   POST share.php          body: versleuteld project (binair)  →  {"id": "..."}
//   GET  share.php?id=...                                       →  het versleutelde project (binair), of 404
//
// De browser comprimeert en versleutelt het project (AES-GCM) voordat het hierheen gaat. De sleutel staat alleen in
// de link achter het #, en dat deel stuurt een browser nooit mee. Deze server bewaart dus alleen onleesbare bytes.
// Instellingen: zie config.example.php. Tabel: schema.sql.
declare(strict_types=1);

function out(int $code, $body = null, string $type = 'application/json'): void
{
  http_response_code($code);
  header('Content-Type: ' . $type);
  if ($body !== null) echo $type === 'application/json' ? json_encode($body) : $body;
  exit();
}

$cfgFile = null;
foreach ([dirname(__DIR__, 2) . '/wpt-config.php', __DIR__ . '/config.php'] as $f) {
  if (is_file($f)) {
    $cfgFile = $f;
    break;
  }
}
if (!$cfgFile) out(503, ['error' => 'niet ingesteld']);
$C = require $cfgFile;
$C += ['origins' => [], 'maxBytes' => 262144, 'perHour' => 30, 'days' => 400, 'salt' => ''];

// CORS: alleen de eigen sites
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $C['origins'], true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Access-Control-Max-Age: 86400');
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') out(204);

try {
  $db = new PDO($C['dsn'], $C['user'] ?? null, $C['pass'] ?? null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
} catch (Throwable $e) {
  error_log('wpt share: ' . $e->getMessage());
  out(503, ['error' => 'database niet bereikbaar']);
}

if ($method === 'GET') {
  $id = (string) ($_GET['id'] ?? '');
  if (!preg_match('/^[A-Za-z0-9_-]{6,16}$/', $id)) out(400, ['error' => 'ongeldige link']);
  $q = $db->prepare('SELECT data, used FROM wpt_share WHERE id = ?');
  $q->execute([$id]);
  $row = $q->fetch(PDO::FETCH_ASSOC);
  if (!$row) out(404, ['error' => 'niet gevonden']);
  // at most one write per day per link
  if (strtotime($row['used']) < time() - 86400) {
    $db->prepare('UPDATE wpt_share SET used = NOW() WHERE id = ?')->execute([$id]);
  }
  header('Cache-Control: private, max-age=3600');
  out(200, $row['data'], 'application/octet-stream');
}

if ($method !== 'POST') out(405, ['error' => 'alleen GET en POST']);

$len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len > $C['maxBytes']) out(413, ['error' => 'project te groot']);
$data = file_get_contents('php://input', false, null, 0, $C['maxBytes'] + 1);
// 12 bytes IV + 16 bytes tag + content
if ($data === false || strlen($data) < 40) out(400, ['error' => 'leeg']);
if (strlen($data) > $C['maxBytes']) out(413, ['error' => 'project te groot']);

$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$who = substr(hash_hmac('sha256', $ip, (string) $C['salt']), 0, 16);
$q = $db->prepare('SELECT COUNT(*) FROM wpt_share WHERE who = ? AND created > NOW() - INTERVAL 1 HOUR');
$q->execute([$who]);
if ((int) $q->fetchColumn() >= $C['perHour']) out(429, ['error' => 'te veel links, probeer het over een uur opnieuw']);

$ins = $db->prepare('INSERT INTO wpt_share (id, data, created, used, who) VALUES (?, ?, NOW(), NOW(), ?)');
$id = null;
for ($try = 0; $try < 5 && !$id; $try++) {
  $cand = rtrim(strtr(base64_encode(random_bytes(6)), '+/', '-_'), '='); // 8 characters
  try {
    $ins->bindValue(1, $cand);
    $ins->bindValue(2, $data, PDO::PARAM_LOB);
    $ins->bindValue(3, $who);
    $ins->execute();
    $id = $cand;
  } catch (PDOException $e) {
    if ($e->getCode() !== '23000') throw $e; // only retry on a duplicate id
  }
}
if (!$id) out(503, ['error' => 'probeer het opnieuw']);

// housekeeping, now and then: forget the IP hashes after a day, remove links nobody opened for a long time
if (random_int(1, 20) === 1) {
  $db->exec("UPDATE wpt_share SET who = '' WHERE who <> '' AND created < NOW() - INTERVAL 1 DAY");
  $db->prepare('DELETE FROM wpt_share WHERE used < NOW() - INTERVAL ? DAY')->execute([(int) $C['days']]);
}

out(201, ['id' => $id]);

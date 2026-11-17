<?php
// "Mail sturen" in het venster Over: stuurt de browser door naar mailto: met het adres uit de config op de server.
// Zo staat het adres niet in de repo en niet in de HTML van de site; alleen wie klikt, ziet het in het eigen mailprogramma.
declare(strict_types=1);

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

$cfgFile = null;
foreach ([dirname(__DIR__, 2) . '/wpt-config.php', __DIR__ . '/config.php'] as $f) {
  if (is_file($f)) {
    $cfgFile = $f;
    break;
  }
}
$C = $cfgFile ? require $cfgFile : [];
$to = is_array($C) ? trim((string) ($C['mail'] ?? '')) : '';

if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
  http_response_code(404);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Er is (nog) geen e-mailadres ingesteld. Meld je vraag of idee op GitHub:\nhttps://github.com/MellotronScratch/warmteverlies-tekentafel/issues\n";
  exit();
}

header('Location: mailto:' . $to . '?subject=' . rawurlencode('Warmtepomp Tekentafel'), true, 302);

<?php
// Leest de instellingen voor share.php en mail.php: liefst wpt-config.php boven de webroot, anders config.php in deze
// map (zie config.example.php). Geeft null als er geen instellingen zijn. Dit bestand is via het web niet op te vragen
// (api/.htaccess); de scripts laden het met require.
declare(strict_types=1);

function wpt_config(): ?array
{
  foreach ([dirname(__DIR__, 2) . '/wpt-config.php', __DIR__ . '/config.php'] as $f) {
    if (is_file($f)) {
      $c = require $f;
      return is_array($c) ? $c : null;
    }
  }
  return null;
}

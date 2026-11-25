<?php
// Voorbeeld van de instellingen voor api/share.php.
//
// Kopieer dit bestand op de server naar config.php (in deze map) of, liever, naar wpt-config.php in de map BOVEN
// de webroot, zodat het nooit via het web op te vragen is. Vul daar het echte wachtwoord in.
// config.php en wpt-config.php staan in .gitignore en worden bij het uitrollen niet overschreven: zet nooit een
// wachtwoord in dit voorbeeldbestand of ergens anders in de repo.
return [
  // database (MySQL of MariaDB); de tabel maak je met api/schema.sql
  'dsn' => 'mysql:host=localhost;dbname=DATABASENAAM;charset=utf8mb4',
  'user' => 'GEBRUIKER',
  'pass' => 'WACHTWOORD',

  // lange willekeurige tekst, voor de hash van IP-adressen (rate limit); bijvoorbeeld: openssl rand -hex 32
  'salt' => 'VERANDER-MIJ',

  // websites die de API mogen gebruiken (CORS)
  'origins' => [
    'https://warmtepomptekentafel.nl',
    'https://www.warmtepomptekentafel.nl',
    'https://mellotronscratch.github.io',
    'http://localhost:8000',
  ],

  'maxBytes' => 262144, // grootste project in bytes (versleuteld en gecomprimeerd); een huis is een paar kB
  'perHour' => 30, // nieuwe links per uur per IP-adres
  'perDay' => 2000, // nieuwe links per dag voor iedereen samen (tegen het volspammen van de database)
  'days' => 400, // een link die zo lang niet is geopend, wordt verwijderd

  // adres voor "Mail sturen" in het venster Over (api/mail.php stuurt de bezoeker door naar mailto:); leeg = geen adres
  'mail' => '',
];

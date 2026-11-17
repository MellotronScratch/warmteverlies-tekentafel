-- Tabel voor korte deellinks (api/share.php). Eenmalig draaien in de database van de hosting (MySQL of MariaDB),
-- bijvoorbeeld via phpMyAdmin → SQL.
--
-- data: het project, in de browser gecomprimeerd en versleuteld (AES-GCM). De sleutel staat alleen in de link,
--       achter het #, en komt nooit op de server. De server kan de projecten dus niet lezen.
-- who:  een verkorte, gezouten hash van het IP-adres, alleen om het aantal nieuwe links per uur te beperken.
--       Wordt na een dag leeggemaakt.
-- used: laatste keer geopend; links die lang niet zijn gebruikt worden opgeruimd.

CREATE TABLE IF NOT EXISTS wpt_share (
  id      VARCHAR(16)  NOT NULL,
  data    MEDIUMBLOB   NOT NULL,
  created DATETIME     NOT NULL,
  used    DATETIME     NOT NULL,
  who     CHAR(16)     NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY by_used (used),
  KEY by_who (who, created)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

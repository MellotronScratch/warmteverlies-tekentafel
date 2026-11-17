# Bijdragen en zelf aanpassen

Dit document is voor wie de Warmtepomp Tekentafel zelf wil draaien, aanpassen of verbeteren. Wil je de app alleen gebruiken, open dan [warmtepomptekentafel.nl](https://warmtepomptekentafel.nl/) en lees de [handleiding](README.md#handleiding).

## Lokaal draaien

De app is een gewone webpagina zonder installatie of build-stap. Browsers laden de gegevens in `data/` niet als je `index.html` direct opent, dus je hebt een eenvoudige webserver nodig:

```sh
cd warmteverlies-tekentafel
python3 -m http.server
```

Open daarna http://localhost:8000. In VS Code kan het ook met de extensie _Live Server_. Het voorbeeldproject laat meteen zien hoe alles werkt.

Lokaal bewaart de app projecten in de opslag van je browser, net als online. Een korte deellink maken lukt lokaal niet (die heeft de server nodig); de app maakt dan de lange link.

## Hoe het in elkaar zit

- `index.html`, `css/app.css` en de scripts in `js/`. Het zijn gewone scripts zonder modules of bundler: ze delen de globale scope en worden op volgorde geladen. Code die bij het laden meteen iets uitvoert, mag alleen functies uit eerdere bestanden gebruiken.
  - `js/analytics.js`: anonieme bezoekersstatistiek (GoatCounter). `js/data.js` laadt `data/*.json`; `js/core.js` bevat de toestand van de app, het voorbeeldproject en `normalizeProject` (migratie van opgeslagen projecten).
  - `js/geometry.js`, `js/calc.js`: geometrie, laagopbouw en het warmteverlies per ruimte.
  - `js/render.js`, `js/interaction.js`, `js/underlay.js`: tekening (SVG, ook 2,5D), muis- en toetsenbordbediening en de onderlegger.
  - `js/panel.js`, `js/views.js`: het paneel rechts met de tabbladen.
  - `js/emitters.js`, `js/sizing.js`, `js/hydraulics.js`, `js/schema.js`: afgifte, radiatoradvies en stooklijn, leidingnet en schema.
  - `js/heatpumps.js`, `js/annual.js`: warmtepompkeuze, verbeteradviezen, warm tapwater en jaarverbruik.
  - `js/report.js`, `js/io.js`, `js/storage.js`, `js/share.js`, `js/about.js`, `js/main.js`: rapport, import en export, opslaan, delen, het venster _Over_ en het opstarten.
- `data/*.json`: tabellen die je zonder programmeren kunt aanpassen. Elk bestand heeft een `toelichting`; het overzicht staat in de [rekenmethode](docs/rekenmethode.md).
- `docs/*.md` en `README.md`: de handleiding. Bij het uitrollen zet `tools/handleiding.mjs` ze om naar [warmtepomptekentafel.nl/handleiding](https://warmtepomptekentafel.nl/handleiding/), met een `sitemap.xml`.
- `api/`: het PHP-script voor korte deellinks, met `schema.sql` voor de database. Wachtwoorden staan alleen op de server (zie `api/config.example.php`), nooit in de repo.
- `.github/workflows/deploy.yml`: zet de site na elke push naar `main` op de hosting.

## Gegevens aanpassen

Warmtepompen, isolatiematerialen, leidingen, radiatoren, vloerverwarming, thermostaatkranen, appendages, ventilatoren, netbeheerkosten en het klimaat staan in `data/*.json`. Voeg een item toe door een blok te kopiëren en de waarden aan te passen, en zet de bron erbij. Verander de sleutels (`id`'s) van bestaande items liever niet: projecten verwijzen ernaar. Moet het toch, vang de oude sleutel dan op in `normalizeProject` in `js/core.js`.

## Een bijdrage sturen

Maak een fork, breng je wijziging aan en stuur een _pull request_. Een paar afspraken:

- Geen build-stap: gewone HTML, CSS en JavaScript, zonder bundler of frameworks.
- Tabellen die gebruikers zelf willen beheren, horen in `data/*.json`, met een `toelichting` en de bron van de gegevens.
- Oude projectbestanden moeten blijven werken (`normalizeProject`).
- Teksten in de app en de handleiding zijn in begrijpelijk Nederlands. Beschrijf een nieuwe functie op de bijbehorende pagina in `docs/`.
- Controleer of het voorbeeldproject nog op 5,24 kW totaal uitkomt.
- Code wordt opgemaakt met [Prettier](https://prettier.io) (`.prettierrc.json`).

Twijfel je of iets past, open dan eerst een [issue](https://github.com/MellotronScratch/warmteverlies-tekentafel/issues) om het te bespreken.

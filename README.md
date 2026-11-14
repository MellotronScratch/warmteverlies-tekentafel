# Warmteverlies Tekentafel

Teken de plattegrond van je woning en zie direct het warmteverlies per ruimte. Daarnaast rekent de app de afgifte van radiatoren en vloerverwarming door en laat zien welke warmtepomp past.

**[Open de app →](https://mellotronscratch.github.io/warmteverlies-tekentafel/)**

![Schermafbeelding van de Warmteverlies Tekentafel](docs/screenshot.png)

## Wat het doet

- **Tekenen**: ruimtes als rechthoek of veelhoek, binnenwanden trekken die een ruimte in tweeën delen, meerdere verdiepingen met een andere verdieping als lichtgrijze ondergrond, trappenhuizen en vides die doorlopen.
- **Wanddelen**: splits een wand in delen met elk een eigen constructie. De app herkent aan welke ruimte een wand grenst. Een wand tussen twee ruimtes heeft aan beide kanten dezelfde constructie en deuren.
- **2,5D-weergave**: bekijk de verdiepingen gestapeld en van opzij. Klik een vloer of wand aan om hem te bewerken.
- **Warmtebeeld**: kleur elk vlak van groen tot rood naar zijn warmteverlies per m².
- **Woonoppervlak**: zonder meterkast en technische ruimtes, en onder een schuin dak alleen het deel boven 1,5 m.
- **Constructies**: opbouw in lagen (R = d / λ) met luchtspouwen, geventileerde spouwen en stijlen of regels volgens NEN-EN-ISO 6946, of direct een U-waarde.
- **Schuine daken**: zadeldak en lessenaarsdak met muurplaathoogte en vlak plafond (hanenbalk), inclusief juiste wand- en dakoppervlakken en inhoud.
- **Ventilatie en infiltratie**: systeem A, C of D met WTW, overstroom tussen ruimtes en infiltratie uit qv10.
- **Afgifte**: radiatoren (vermogen zelf invullen of afleiden uit type, hoogte en lengte), convectoren (ook met ventilatoren), fancoils en vloerverwarming bij je eigen aanvoer- en retourtemperatuur. Met controle van de aansluitleiding (de getekende leiding naar het element) en de minimaal nodige aanvoertemperatuur.
- **Verbeteradviezen** en **warmtepompkeuze**: vergelijk warmtepompen met het warmteverlies bij −10 °C (dekt het maximale vermogen het verlies?) en bij +10 °C (kan hij ver genoeg terugregelen, of gaat hij pendelen?). Per warmtepomp zie je vanaf welke buitentemperatuur hij pendelt. De lijst is gesorteerd op beide.
- **Export**: JSON, CSV en [heatlossjs](https://github.com/trystanLea/heatlossjs).

## Handleiding

1. **[Aan de slag](docs/gebruik.md)**: online of lokaal draaien, de tabbladen, lagen en ondergrond, het rapport en opslaan.
2. **[Ruimtes en wanden tekenen](docs/tekenen.md)**: onderlegger, ruimtes en binnenwanden, binnenmaat of buitenmaat, wanden splitsen, ramen en deuren, 2,5D-weergave en warmtebeeld.
3. **[Wat grenst waaraan](docs/grenzen.md)**: wat er achter een wand, vloer of plafond ligt, buren, gedeelde wanden, open verbindingen en verwarmingszones.
4. **[Daken, vides en verdiepingen](docs/daken-en-verdiepingen.md)**: vides en trappenhuizen, schuine daken, knieschot, dakramen en dakkapellen, kruipruimte en kelder.
5. **[Constructies en isolatiewaarde](docs/constructies.md)**: U-waarde invullen of opbouwen in lagen, en koppelen aan wanden.
6. **[Ventilatie en infiltratie](docs/ventilatie.md)**: systeem A, C of D, luchtstromen tussen ruimtes en qv10.
7. **[Radiatoren, convectoren en vloerverwarming](docs/afgifte.md)**: vermogen en omrekening, ventilatoren (boosters), radiatoradvies en vloerverwarming.
8. **[Stooklijn, leidingen en warmtepomp](docs/installatie.md)**: stooklijn, debiet, systeeminhoud, leidingnet en indexcircuit, thermostaatkranen, appendages en warmtepompkeuze.
9. **[Rekenmethode, woonoppervlak en gegevens](docs/rekenmethode.md)**: hoe er gerekend wordt, het woonoppervlak en de tabellen in `data/`.

Elke pagina heeft bovenaan en onderaan links naar de vorige en volgende pagina. GitHub toont rechtsboven bij elke pagina ook een inhoudsopgave van de koppen.

## Snel beginnen

Open de [app](https://mellotronscratch.github.io/warmteverlies-tekentafel/), of draai hem lokaal met een eenvoudige webserver (zie [Aan de slag](docs/gebruik.md)):

```sh
cd warmteverlies-tekentafel
python3 -m http.server
```

en open http://localhost:8000. Het voorbeeldproject laat meteen zien hoe alles werkt.

## Privacy en statistiek

Je projecten, tekeningen en onderleggers blijven in je eigen browser. De app stuurt ze nergens naartoe.

De site op GitHub Pages telt anoniem bezoeken met [GoatCounter](https://www.goatcounter.com): zonder cookies en zonder persoonsgegevens. Daarnaast telt hij hoe vaak een paar functies worden gebruikt: het rapport, het schema van het leidingnet, exporteren (JSON, CSV, heatlossjs) en het plaatsen van een onderlegger. Daarbij gaat alleen de naam van de functie mee, nooit de inhoud van een project. Er wordt niets geteld als je de app lokaal draait, als je browser "Do Not Track" aan heeft staan, of als je onder **Project → Statistiek** het vinkje uitzet.

## Licentie

[MIT](LICENSE)

[← Overzicht](../README.md) · Vorige: [Stooklijn, leidingen en warmtepomp](installatie.md)

# Rekenmethode, woonoppervlak en gegevens

## Rekenmethode

Vereenvoudigde methode op basis van NEN-EN 12831 / ISSO 51:

- transmissie: A × (U + ΔU) × Δθ
- ventilatie: 0,335 × q × (θi − θtoevoer)
- infiltratie: 0,335 × qi × (θi − θe)

Grond rekent met een vaste vervangende temperatuur. Opwarmtoeslag en de exacte correctiefactoren uit ISSO 51 zitten er niet in. **Controleer de uitkomst voordat je erop dimensioneert.**

## Woonoppervlak

Onder **Resultaten** staat het woonoppervlak van het huis, totaal en per verdieping. Dat is ongeveer de gebruiksoppervlakte uit NEN 2580, die je ook in een verkoopadvertentie of een energielabel ziet:

- Alleen ruimtes waar je woont tellen mee. Een meterkast, technische ruimte, CV-ruimte, koof, kruipruimte of onverwarmde ruimte telt niet mee. De app herkent die aan de naam. Klopt dat niet, zet dan bij de ruimte **Telt mee voor woonoppervlak** aan of uit.
- Onder een schuin dak telt alleen het deel waar het minstens 1,5 m hoog is. Bij de ruimte zie je hoeveel dat is, bijvoorbeeld *11,7 van 21,5 m²*.
- Een vide of trappenhuis telt één keer mee, op de verdieping waar hij begint.

Er wordt gemeten binnen de getekende wanden. Teken je op buitenmaat, dan komt het woonoppervlak dus wat hoger uit. Dakkapellen tellen niet extra mee.

## Gegevens aanpassen (map `data/`)

De tabellen waar de app mee rekent, staan als JSON in de map `data/`. Je kunt ze aanpassen zonder de code aan te raken. Elk bestand begint met een `toelichting` die uitlegt wat de velden betekenen.

| Bestand | Inhoud |
|---|---|
| [`warmtepompen.json`](../data/warmtepompen.json) | Standaardlijst warmtepompen: minimaal en maximaal vermogen bij een paar buitentemperaturen (35 °C aanvoer), en optioneel `minInhoud` (minimale systeeminhoud in liter), `restopvoerhoogte` (kPa), `minDebiet` (l/h), `punten55` (vermogen bij 55 °C aanvoer) en `koelen` (koelvermogen). De lijst bevat R290-warmtepompen van Itho Daalderop, Vaillant, WeHeat, NIBE, Viessmann, Bosch en Stiebel Eltron, met de waarden uit de installatiehandleidingen en datasheets van de fabrikant. Bij elke warmtepomp staat de bron, en welke waarden geschat zijn. |
| [`materialen.json`](../data/materialen.json) | Materialen voor de laagopbouw van constructies (λ-waarde, vaste R of luchtspouw). Geldt voor nieuwe projecten. |
| [`leidingen.json`](../data/leidingen.json) | Leidingtypes (koper, alupex, staal) met per buitendiameter de binnendiameter. |
| [`radiatoren.json`](../data/radiatoren.json) | Paneeltypes (T10 t/m T33) met vermogen en waterinhoud per meter bij 600 mm hoogte. |
| [`vloerverwarming.json`](../data/vloerverwarming.json) | Vloerafwerkingen (warmteweerstand) en de afgiftecoëfficiënt per hart-op-hartafstand. |
| [`thermostaatkranen.json`](../data/thermostaatkranen.json) | Thermostaatkranen met de kv-waarde per voorinstelling, of het instelbereik van een debietbegrenzer (Heimeier Eclipse en Eclipse 300, Jaga Gampper Vario DP). |
| [`appendages.json`](../data/appendages.json) | Appendages in de hoofdleiding (vuilfilter, afsluiter, driewegklep, …) met een typische kv-waarde. |
| [`ventilatoren.json`](../data/ventilatoren.json) | Ventilatoren voor boosters (luchtdebiet en toerental) en de ijking van de ventilatorberekening. |
| [`klimaat.json`](../data/klimaat.json) | Uren per jaar per buitentemperatuur (KNMI De Bilt, 2011–2025), voor het jaarverbruik. |
| [`netbeheer.json`](../data/netbeheer.json) | Vaste kosten per jaar van de gasaansluiting per netbeheerder (inclusief btw), voor de kostenvergelijking met gas. Elk jaar bijwerken. |

Verander de sleutels en id's van bestaande regels niet, want projecten verwijzen ernaar. Voeg je een regel toe, geef die dan een nieuwe, unieke id. Na een wijziging ververs je de pagina. Is een bestand geen geldige JSON meer, dan meldt de app dat bij het opstarten.

De warmtepomplijst kun je in de app ook downloaden, aanvullen en als eigen lijst weer importeren. Die eigen lijst staat dan alleen in je browser. Bijdragen met fabrieksgegevens zijn welkom; vermeld de bron.

---

[← Overzicht](../README.md) · Vorige: [Stooklijn, leidingen en warmtepomp](installatie.md)

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

## Verbeteradviezen

Onder **Resultaten** staan verbeteradviezen: constructies aan de buitenkant, aan de grond of aan een onverwarmde ruimte met een slechtere U-waarde dan de drempel. Per soort (ramen, wanden, vloeren, daken) stel je de drempel en de nieuwe U-waarde zelf in. Vink je een maatregel aan, dan rekent de warmtepompkeuze met het lagere warmteverlies.

- Bij een wand kijkt de app naar de laagopbouw. Zit er een luchtspouw in, dan luidt het advies *Spouw vullen*. Is de muur massief, of is de spouw al gevuld of alleen een geventileerde ruimte achter gevelbekleding, dan luidt het *Gevel isoleren aan de buiten- of binnenkant*. Heeft de wand alleen een U-waarde zonder opbouw, dan staat er *Gevel of spouw na-isoleren*.
- Constructies met minder dan 0,5 m² aan de buitenkant krijgen geen advies. Zulke stukjes ontstaan vaak doordat een ruimte in de tekening een centimeter buiten de gevel of buiten de verdieping eronder uitsteekt; isoleren is daar geen zinnige maatregel.

## Gegevens waar de app mee rekent

Naast wat je zelf invult, rekent de app met een aantal vaste tabellen:

- **Warmtepompen**: minimaal en maximaal vermogen bij een paar buitentemperaturen, en waar bekend de minimale systeeminhoud, de restopvoerhoogte, het minimale debiet en de COP. Het gaat om R290-warmtepompen van onder meer Itho Daalderop, Vaillant, WeHeat, NIBE, Viessmann, Bosch en Stiebel Eltron, met waarden uit de installatiehandleidingen en datasheets. Bij elke warmtepomp staat de bron, en welke waarden geschat zijn.
- **Materialen** voor de laagopbouw van constructies: λ-waarde, vaste R of luchtspouw.
- **Leidingen**: koper, alupex en staal, met per maat de binnendiameter.
- **Radiatoren**: paneeltypes T10 tot en met T33, met vermogen en waterinhoud per meter.
- **Vloerverwarming**: vloerafwerkingen en de afgifte per hart-op-hartafstand.
- **Thermostaatkranen**: de kv-waarde per voorinstelling, of het instelbereik van een debietbegrenzer, uit de datasheets van de fabrikanten.
- **Appendages** in de hoofdleiding, zoals een vuilfilter of driewegklep, met een typische kv-waarde.
- **Ventilatoren** voor boosters: luchtdebiet en toerental.
- **Klimaat**: hoeveel uur per jaar het elke buitentemperatuur is, uit de KNMI-metingen in De Bilt van 2011 tot en met 2025.
- **Netbeheerkosten** voor gas per netbeheerder, voor 2026.
- **Energieprijzen**: de gemiddelde stroom- en gasprijs voor consumenten van het CBS (leveringstarief plus energiebelasting, inclusief btw), elke maand bijgewerkt.

De warmtepomplijst kun je in de app downloaden, aanvullen en als eigen lijst weer importeren (**Warmtepomp → Warmtepomp kiezen**). Die eigen lijst staat dan alleen in je browser. Mist er een warmtepomp, radiator, kraan of ventilator, of klopt een waarde niet? [Meld het](../README.md#fouten-suggesties-en-bijdragen) met de gegevens en de bron van de fabrikant.


---

[← Overzicht](../README.md) · Vorige: [Stooklijn, leidingen en warmtepomp](installatie.md)

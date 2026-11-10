# Warmteverlies Tekentafel

Teken de plattegrond van je woning en zie direct het warmteverlies per ruimte. Daarnaast rekent de app de afgifte van radiatoren en vloerverwarming door en laat zien welke warmtepomp past.

**[Open de app →](https://GEBRUIKERSNAAM.github.io/warmteverlies-tekentafel/)**

![Schermafbeelding van de Warmteverlies Tekentafel](docs/screenshot.png)

## Wat het doet

- **Tekenen**: ruimtes als rechthoek of veelhoek, meerdere verdiepingen met de verdieping eronder als ondergrond, trappenhuizen en vides die doorlopen.
- **Wanddelen**: splits een wand in delen met elk een eigen constructie. De app herkent aan welke ruimte een wand grenst.
- **Constructies**: opbouw in lagen (R = d / λ) met luchtspouwen, geventileerde spouwen en stijlen of regels volgens NEN-EN-ISO 6946, of direct een U-waarde.
- **Schuine daken**: zadeldak en lessenaarsdak met knieschot en hanenbalk, inclusief juiste wand- en dakoppervlakken en inhoud.
- **Ventilatie en infiltratie**: systeem A, C of D met WTW, overstroom tussen ruimtes en infiltratie uit qv10.
- **Afgifte**: radiatoren, convectoren, fancoils (met boosters) en vloerverwarming bij je eigen aanvoer- en retourtemperatuur. Met controle van de aansluitleiding en de minimaal nodige aanvoertemperatuur.
- **Verbeteradviezen** en **warmtepompkeuze**: vergelijk warmtepompen met het warmteverlies bij −10 °C en +10 °C.
- **Export**: JSON, CSV en [heatlossjs](https://github.com/trystanLea/heatlossjs).

## Gebruik

Open `index.html` in een browser of gebruik de link hierboven. Je hoeft niets te installeren en er is geen server nodig.

Projecten worden in je browser opgeslagen (localStorage). Exporteer regelmatig een `.json` als reservekopie, want bij het wissen van browsergegevens ben je ze kwijt.

## Rekenmethode

Vereenvoudigde methode op basis van NEN-EN 12831 / ISSO 51:

- transmissie: A × (U + ΔU) × Δθ
- ventilatie: 0,335 × q × (θi − θtoevoer)
- infiltratie: 0,335 × qi × (θi − θe)

Grond rekent met een vaste vervangende temperatuur. Opwarmtoeslag en de exacte correctiefactoren uit ISSO 51 zitten er niet in. **Controleer de uitkomst voordat je erop dimensioneert.**

## Warmtepomplijst

De standaardlijst staat in `index.html` (blok `hp-default`). In de app kun je hem downloaden, aanvullen en weer importeren. Bijdragen met fabrieksgegevens zijn welkom; vermeld de bron.

## Licentie

[MIT](LICENSE)

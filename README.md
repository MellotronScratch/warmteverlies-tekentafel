# Warmteverlies Tekentafel

Teken de plattegrond van je woning en zie direct het warmteverlies per ruimte. Daarnaast rekent de app de afgifte van radiatoren en vloerverwarming door en laat zien welke warmtepomp past.

**[Open de app →](https://mellotronscratch.github.io/warmteverlies-tekentafel/)**

![Schermafbeelding van de Warmteverlies Tekentafel](docs/screenshot.png)

## Wat het doet

- **Tekenen**: ruimtes als rechthoek of veelhoek, binnenwanden trekken die een ruimte in tweeën delen, meerdere verdiepingen met de verdieping eronder als ondergrond, trappenhuizen en vides die doorlopen.
- **Wanddelen**: splits een wand in delen met elk een eigen constructie. De app herkent aan welke ruimte een wand grenst. Een wand tussen twee ruimtes heeft aan beide kanten dezelfde constructie en deuren.
- **2,5D-weergave**: bekijk de verdiepingen gestapeld en van opzij. Klik een vloer of wand aan om hem te bewerken.
- **Constructies**: opbouw in lagen (R = d / λ) met luchtspouwen, geventileerde spouwen en stijlen of regels volgens NEN-EN-ISO 6946, of direct een U-waarde.
- **Schuine daken**: zadeldak en lessenaarsdak met knieschot en hanenbalk, inclusief juiste wand- en dakoppervlakken en inhoud.
- **Ventilatie en infiltratie**: systeem A, C of D met WTW, overstroom tussen ruimtes en infiltratie uit qv10.
- **Afgifte**: radiatoren (vermogen zelf invullen of afleiden uit type, hoogte en lengte), convectoren, fancoils (met boosters) en vloerverwarming bij je eigen aanvoer- en retourtemperatuur. Met controle van de aansluitleiding en de minimaal nodige aanvoertemperatuur.
- **Verbeteradviezen** en **warmtepompkeuze**: vergelijk warmtepompen met het warmteverlies bij −10 °C en +10 °C.
- **Export**: JSON, CSV en [heatlossjs](https://github.com/trystanLea/heatlossjs).

## Gebruik

Open `index.html` in een browser of gebruik de link hierboven. Je hoeft niets te installeren en er is geen server nodig.

Projecten worden in je browser opgeslagen (localStorage). Exporteer regelmatig een `.json` als reservekopie, want bij het wissen van browsergegevens ben je ze kwijt.

## Wanden intekenen

Je tekent geen losse muren, maar **ruimtes**. Elke zijde van een ruimte is een wand.

1. Kies **Rechthoek** (`R`) en sleep een ruimte, of kies **Veelhoek** (`P`) en klik de hoekpunten. Sluit een veelhoek door op het eerste punt te klikken, te dubbelklikken of op Enter te drukken.
2. Punten klikken vast op het raster (standaard 5 cm, in te stellen onder **Project → Tekenen**) en op hoeken van andere ruimtes. Houd Alt ingedrukt om niet vast te klikken.
3. Met **Selecteer** (`V`) sleep je hoekpunten of een hele ruimte. Dubbelklik op een wand om er een hoekpunt bij te zetten.
4. Klik een ruimte aan en vul in het paneel de naam, ontwerptemperatuur en hoogte in.

### Eerst de omtrek, dan de binnenwanden

Je kunt ook eerst de hele verdieping als één vlak tekenen en dat daarna opdelen:

1. Teken de buitenomtrek met **Rechthoek** of **Veelhoek** en stel de buitenwanden, ramen, vloer en plafond in.
2. Kies **Wand** (`W`). Klik op de rand van de ruimte waar de binnenwand begint. Zet eventueel knikpunten binnen de ruimte voor een wand met een hoek, en klik op de rand waar hij eindigt.
3. Er verschijnt een venster *Ruimte splitsen?*. Het deel dat een nieuwe ruimte wordt, is gemarkeerd. Geef het een naam en kies **Splitsen** (of Enter). Met Esc of **Annuleren** gebeurt er niets.

Beide delen nemen over wat al bij de oorspronkelijke ruimte was ingesteld:

- De **buitenwanden** houden per stuk hun constructie, wat erachter ligt en hun splitsingen. Ramen en deuren gaan mee met het langste deel van het wanddeel waarin ze zaten.
- Temperatuur, hoogte, vloer, plafond en dak blijven gelijk.
- Toevoer en afzuiging worden naar oppervlak verdeeld. Radiatoren en vloerverwarming gaan mee met het deel waarin hun midden ligt.
- De **nieuwe wand** krijgt de eerste wandconstructie die *aan beide kanten binnen* is, en staat op *Automatisch*. Hij grenst dus aan de andere ruimte.

De twee delen delen dezelfde lijn, net als bij hart-op-hart tekenen. Ongedaan maken kan met Ctrl+Z.

### Vides en trappenhuizen

Een vide of trappenhuis teken je op de laagste verdieping. Kies bij de ruimte *Soort ruimte: Vide* (of *Trappenhuis*) en bij **Loopt door tot** de hoogste verdieping. Op de verdiepingen erboven staat de vide dan gearceerd.

Teken je op zo'n hogere verdieping een ruimte die over de vide heen valt, dan knipt de app het stuk binnen de vide eruit. Andersom gaat het ook: laat je een bestaande ruimte later doorlopen, dan worden de ruimtes erboven op dezelfde manier geknipt.

- De nieuwe wanden langs de vide worden binnenwanden. Is daar geen muur, maar bijvoorbeeld een balustrade, kies dan bij dat wanddeel **Open verbinding (geen wand)**.
- Ligt de vide helemaal binnen de nieuwe ruimte, dan zou er een gat in de ruimte komen. Dat kan niet, dus de app maakt er twee delen van, met een open verbinding ertussen.
- Valt de ruimte helemaal binnen de vide, dan wordt hij niet toegevoegd.

### Binnenmaat of buitenmaat?

De muurdikte wordt niet getekend. De getekende lijn is de rand van de ruimte zelf:

- wandoppervlak = lengte van de lijn × hoogte, min ramen en deuren;
- vloer- en plafondoppervlak = het oppervlak binnen de lijnen;
- luchtvolume = vloeroppervlak × hoogte.

Teken daarom **op binnenmaat**, of hart-op-hart als je snel wilt werken. Dat laatste geeft iets te grote oppervlakken. Op binnenmaat mis je aan de buitenkant wat oppervlak bij de hoeken. Daar is de koudebrugtoeslag ΔU voor (standaard +0,1 W/m²K op de buitenschil). Buitenmaat raden we af: dan tel je de muurdikte mee in vloer, plafond en volume, en valt het verlies te hoog uit.

Op binnenmaat zit tussen twee ruimtes een gat ter dikte van de binnenwand. De app ziet twee evenwijdige wanden toch als één gedeelde wand zolang ze minder dan **Max. wanddikte aangrenzing** uit elkaar liggen (standaard 0,35 m, onder **Project → Tekenen**). Is een tussenmuur dikker, bijvoorbeeld een oude dragende muur, zet die waarde dan hoger.

### Uit welke wanden bestaat een ruimte?

Klik een ruimte aan. Onder **Wanden** staat dan elk wanddeel met zijn lengte, constructie en wat erachter ligt. Ga je met de muis over een regel, dan licht die wand op in de tekening. Klik je erop, dan bewerk je dat wanddeel. Dat werkt hetzelfde als wanneer je de wand in de tekening aanklikt.

### Wat ligt er achter de wand?

Klik een wand aan om hem te bewerken. Onder **Grenst aan** staat standaard *Automatisch (uit tekening)*: de app kijkt dan in de tekening of er een andere ruimte tegenaan ligt en rekent met de temperatuur van die ruimte. Ligt er niets tegenaan, dan rekent hij met de buitentemperatuur. Je kunt het ook zelf kiezen: buiten, grond / kruipruimte, onverwarmde ruimte, buurwoning of een ruimte met een vaste temperatuur.

### Gedeelde wanden

Een wand tussen twee ruimtes hoort bij allebei. Kies je voor zo'n wand een andere constructie, dan krijgt het stuk aan de andere kant dezelfde. De app splitst de wand van de buurruimte daarvoor zo nodig op de grens. Het gedeelde stuk licht in de buurruimte gestippeld op.

Grenst een wanddeel aan meer dan één ruimte, of maar voor een deel aan een andere ruimte? Kies dan **Splitsen op de grens**. Dan wordt het gedeelde stuk een apart wanddeel. Een raam of deur die je in een gedeeld wanddeel zet, verschijnt ook in de andere ruimte. Andere maten en verwijderen gaan aan beide kanten mee. Staan de constructies aan beide kanten nog verschillend, bijvoorbeeld in een ouder project, dan kun je ze met **Constructie gelijk trekken** gelijk maken.

### Wand splitsen

Bestaat een wand uit verschillende delen, bijvoorbeeld een stuk buitenmuur en een stuk binnenwand, of een geïsoleerd en een ongeïsoleerd deel? Gebruik dan **Splits** (`S`) en klik op de plek waar de wand verandert. Je kunt de splitsing ook op een exacte afstand vanaf de hoek invullen. Elk deel krijgt een eigen constructie en een eigen **Grenst aan**.

### Ramen en deuren

Klik het wanddeel aan en kies **+ Raam of deur**. Vul de breedte, hoogte en constructie in. Het oppervlak gaat automatisch van de wand af.

Een nieuw raam staat in het midden van het wanddeel. Wil je het verplaatsen, sleep het dan in de plattegrond over de muur. Tijdens het slepen zie je de afstand tot beide uiteinden. Je kunt de plek ook precies invullen bij **Begint op** (in meter vanaf de hoek waar de wand begint). Een raam of deur blijft binnen zijn eigen wanddeel. Met **Onderkant** geef je aan hoe hoog het raam boven de vloer begint. Standaard staat een deur (vanaf 1,9 m hoog) op de vloer en begint een raam op 0,9 m. Voor de berekening maken de plek en de hoogte niet uit, maar in de tekening en de 2,5D-weergave staat het raam dan wel goed. Komt het raam boven de wand uit, dan waarschuwt de app.

**Binnendeuren**: een deur in een wand tussen twee ruimtes rekent met de temperatuur van de ruimte erachter, niet met buiten. Zet je een opening in een gedeeld wanddeel, dan wordt het automatisch een *Binnendeur, niet geïsoleerd* (U ≈ 2,2 W/m²K, indicatief), en die verschijnt in beide ruimtes. Bestaande projecten krijgen die constructie er één keer bij.

Vul bij breedte en hoogte de **buitenmaat van het kozijn** in (het gat in de muur), niet de dagmaat. Gebruik daarbij de **Uw** van het hele raam, dus glas en kozijn samen, en niet de Ug van alleen het glas.

### Open verbinding: geen wand tussen twee ruimtes

Soms is de scheiding tussen twee ruimtes geen muur, bijvoorbeeld waar de hal overgaat in de trapvide, of tussen een keuken en een woonkamer zonder tussenwand. Kies dan bij het wanddeel onder **Grenst aan** voor **Open verbinding (geen wand)**. Dan gebeurt er het volgende:

- Dat stuk telt niet mee voor de warmte die van de ene naar de andere ruimte gaat, en het heeft geen constructie nodig.
- De andere ruimte krijgt hier vanzelf ook een open verbinding.
- In de tekening is het een stippellijn, en in de 2,5D-weergave staat er geen muur.
- Hebben de twee ruimtes een andere temperatuur, dan waarschuwt de app. Bij een open verbinding is de temperatuur in de praktijk ongeveer gelijk.
- Lucht stroomt er vrij. Geef onder **Ventilatie** de overstroom op als de ene ruimte lucht toevoert en de andere afzuigt.

Trek je met **Wand** een nieuwe scheiding, dan kies je in het venster meteen of het een binnenwand of een open verbinding wordt.

### 2,5D-weergave

Met de knop **2,5D** rechtsonder, of de toets `D`, zie je de woning schuin van boven. De verdiepingen tot en met de gekozen verdieping staan op elkaar. Wanden hebben de kleur van hun constructie, en ramen en deuren zijn oranje. Om te draaien en te kantelen sleep je met ingedrukt scrollwiel, of met Shift + slepen. De weergave draait dan om het punt waar je begon met slepen. Gewoon slepen schuift, en scrollen zoomt rond de muis. Klik een vloer of wand aan om hem in het paneel te bewerken. Tekenen doe je in de plattegrond: kies je een tekengereedschap, dan schakelt de app daar vanzelf naar terug.

## Radiatorvermogen

Klik een radiator aan. De lengte verander je door een uiteinde in de tekening te slepen, of door hem in te vullen bij **Lengte** (mm). Dat werkt ook voor convectoren en fancoils. Onder **Vermogen bepalen** kies je:

- **Zelf invullen**: het vermogen bij 75/65/20 °C van de typeplaat of uit de catalogus. Bij convectoren en fancoils kan alleen dit, want hun vermogen hangt te veel af van de bouwvorm.
- **Een paneeltype** (T10, T11, T20, T21, T22 of T33): vul de hoogte en lengte in mm in. De app schat het vermogen met een vuistregel: het vermogen per meter bij 600 mm hoogte, maal (hoogte / 600)^0,9, maal de lengte. Een T22 van 600 × 1000 mm geeft zo 1700 W. Reken op ongeveer ±10 %. Ken je merk en model, neem dan de waarde uit de tabel van de fabrikant.

## Isolatiewaarde bepalen

De isolatiewaarde leg je vast in een **constructie**, die je daarna aan wanden koppelt. Een constructie gebruik je op zoveel wanden als je wilt. Pas je hem aan, dan verandert de berekening overal mee.

### 1. Constructie maken

Ga naar het tabblad **Constructies** en kies bij *Wand* **+ Wand**. Geef hem een herkenbare naam, bijvoorbeeld "Spouwmuur 1975 na-geïsoleerd", en kies een kleur. Die kleur zie je terug in de tekening.

Bij **Invoer** kies je hoe je de isolatiewaarde opgeeft.

**U-waarde invullen.** Ken je de U-waarde of Rc al, uit een bouwtekening, energielabel, productblad of [ubakus.de](https://www.ubakus.de/u-wert-rechner/), vul hem dan direct in. U en Rc rekenen automatisch in elkaar om. Voor ramen en deuren is dit de gebruikelijke manier. Neem de Uw van het hele raam (glas met kozijn) van de leverancier. Het voorbeeldproject rekent voor HR++ glas in een houten kozijn met U = 1,8.

**Opbouw in lagen.** Weet je waar de muur uit bestaat, bouw hem dan op uit lagen, **van binnen naar buiten**. Voeg per laag een materiaal en de dikte in mm toe. De app rekent per laag R = d / λ uit en telt alles op tot de Rc en de U-waarde. Een spouwmuur ziet er bijvoorbeeld zo uit:

| Laag | Materiaal | Dikte |
|---|---|---|
| 1 | Kalkzandsteen | 100 mm |
| 2 | Isolatie (bijv. PIR-isolatieplaat of glaswol) | 60 mm |
| 3 | Luchtspouw, zwak geventileerd | 40 mm |
| 4 | Baksteen | 100 mm |

Een paar dingen om op te letten:

- **Luchtspouw**: kies of de spouw niet, zwak of sterk geventileerd is. Een gewone spouwmuur met open stootvoegen is meestal *zwak geventileerd*. Bij een sterk geventileerde spouw, zoals achter een geventileerde gevelbekleding, tellen de spouw en alles daarbuiten niet mee. Zo schrijft NEN-EN-ISO 6946 het voor.
- **Stijlen of regels**: zit de isolatie tussen houten stijlen, kies dan bij die laag **+ stijlen, regels of metal studs in deze laag** en vul het aandeel hout in, bijvoorbeeld 10 %. De app rekent dan met het gemiddelde van de boven- en ondergrens.
- **Metal stud (gipswanden)**: bouw de wand op als gipskartonplaat, isolatie en gipskartonplaat. Voeg aan de isolatielaag stijlen toe met het materiaal *Staal (metal stud-profiel)* en een aandeel van ongeveer 0,1 %. Dat hoort bij een profiel van 0,6 mm dik op 600 mm hart-op-hart. Het staal geleidt zo goed dat de Rc daardoor ongeveer een kwart lager uitvalt. Neem de uitkomst als schatting: NEN-EN-ISO 6946 is niet bedoeld voor metaal dat door de isolatie heen loopt.
- **Materialen**: onderaan het tabblad staat de materialenlijst met indicatieve λ-waarden. Pas ze aan of voeg materialen toe. Neem voor isolatie liefst de λD van het productblad.
- **Binnenwanden**: vink *Aan beide kanten binnen* aan. Dan geldt aan beide kanten de binnen-overgangsweerstand.

De doorsnede bovenaan de kaart toont het temperatuurverloop door de wand bij de ontwerptemperatuur. Lagen die niet meetellen worden lichter weergegeven.

### 2. Constructie koppelen aan een wand

Klik in de tekening een wand of wanddeel aan en kies onder **Constructie** de juiste opbouw. Nieuwe ruimtes krijgen standaard de eerste wandconstructie uit de lijst. Loop dus na of elke wand de goede heeft. Ontbreekt er ergens een constructie, dan zie je bij de ruimte *⚠ constructie ontbreekt*.

Onder **Verlies van dit deel** zie je direct wat dit wanddeel aan warmte verliest: oppervlak × (U + ΔU) × temperatuurverschil. Vloer, plafond en dak stel je op dezelfde manier in bij de ruimte zelf, onder *Vloer* en *Dak en plafond*.

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

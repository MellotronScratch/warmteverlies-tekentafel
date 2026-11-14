[← Overzicht](../README.md) · Vorige: [Wat grenst waaraan](grenzen.md) · Volgende: [Constructies en isolatiewaarde](constructies.md)

# Daken, vides en verdiepingen

## Vides en trappenhuizen

Een vide of trappenhuis teken je op de laagste verdieping. Kies bij de ruimte *Soort ruimte: Vide* (of *Trappenhuis*) en bij **Loopt door tot** de hoogste verdieping. Op de verdiepingen erboven staat de vide dan gearceerd.

**Bovenkant van een vide.** Ligt er geen ruimte meer boven de vide, omdat hij doorloopt tot onder het dak, dan heeft hij geen plafond maar het dak. De app neemt dan het dak over van de ruimte met een schuin dak ernaast (bijvoorbeeld de zolder): dezelfde constructie en helling, en een dakvlak van vloeroppervlak ÷ cos(helling). De wanden van de vide lopen dan ook schuin mee tot onder dat dak, in de 2,5D-weergave en in de berekening. De hoogte van de vide doet er dan niet meer toe. Grenzen er meer van zulke ruimtes aan, dan kies je welke. Staat er geen ruimte met een schuin dak naast, dan is het een plat dak en kies je de dakconstructie. Eindigt de vide onder een andere ruimte, dan heeft hij gewoon een plafond.

Klik je op een hogere verdieping de vide aan, dan blijf je op die verdieping en zie je de ruimte in het paneel. Voor de wanden ga je naar de verdieping waar de vide begint.

Teken je op zo'n hogere verdieping een ruimte die over de vide heen valt, dan knipt de app het stuk binnen de vide eruit. Andersom gaat het ook: laat je een bestaande ruimte later doorlopen, dan worden de ruimtes erboven op dezelfde manier geknipt.

- De nieuwe wanden langs de vide worden binnenwanden. Is daar geen muur, maar bijvoorbeeld een balustrade, kies dan bij dat wanddeel **Open verbinding (geen wand)** (zie [Open verbinding](grenzen.md#open-verbinding-geen-wand-tussen-twee-ruimtes)).
- Ligt de vide helemaal binnen de nieuwe ruimte, dan zou er een gat in de ruimte komen. Dat kan niet, dus de app maakt er twee delen van, met een open verbinding ertussen.
- Valt de ruimte helemaal binnen de vide, dan wordt hij niet toegevoegd.

**De trap tekenen**: staat een ruimte op *Trappenhuis*, dan kies je in het ruimtepaneel de vorm van de trap: **recht**, **kwartslag** (gaat de hoek om, met spillen in de hoek) of **halve draai** (met een bordes). Daarnaast kies je bij welke wand hij begint, langs welke kant hij loopt en hoe breed hij is. In de plattegrond zie je dan de treden met een pijl naar boven. In de 2,5D-weergave staat per verdieping een trap van vloer tot vloer. De app gaat uit van een rechthoekig trapgat. De trap is alleen voor het beeld en telt niet mee in de berekening.

## Schuine daken

Kies bij een ruimte onder *Dak en plafond* een **Zadeldak** of **Lessenaarsdak**, en vul de dakhelling en de **hoogte van de muurplaat** in: de hoogte boven de vloer waar het schuine dak begint, meestal de bovenkant van de gevelmuur. Teken je de ruimte tot een laag wandje op zolder, vul dan de hoogte van dat wandje in. De nokhoogte rekent de app zelf uit met de breedte van de ruimte. Standaard loopt het dak door tot in de nok, met een punt.

Heeft de zolder een vlak plafond, bijvoorbeeld een zoldervloer of hanenbalk, vink dan **Vlak plafond** aan en vul de **Plafondhoogte** in. Alleen het stuk boven die hoogte wordt dan vlak. Komt de nok niet hoger dan het plafond, dan blijft het gewoon een punt. Projecten van voor deze wijziging houden hun vlakke plafond op de hoogte die al was ingevuld.

## Knieschot

Een knieschot is een laag schot onder de schuine kap, bijvoorbeeld op een kwart van de lengte van het spant. Er zit vaak een plaat of luikje in, met bergruimte erachter. Vink bij de ruimte onder *Dak en plafond* **Knieschot** aan en vul de hoogte in. De app laat zien op welke afstand van de gevel het knieschot staat, en tekent het als stippellijn.

Het knieschot is een aanvulling op de tekening en telt niet mee in de berekening: de bergruimte erachter ligt binnen de geïsoleerde schil. De ruimte rekent dus gewoon als één geheel tot aan de gevels.

Wil je de zolder opdelen in kamers, trek dan met **Wand** een lijn van knieschot naar knieschot. De lijn klikt vast op de stippellijnen. De wand staat alleen tussen de knieschotten. Daarachter, in de bergruimte, deelt een open verbinding (stippellijn, geen wand) de zolder verder op tot de gevel.

## Dakramen en dakkapellen

Bij een ruimte met een schuin dak staat onder het dakvlak **Dakramen en dakkapellen**:

- **+ Dakraam**: breedte, lengte langs de helling, constructie (bijvoorbeeld de Uw van het dakraam) en op welk dakvlak. Het oppervlak gaat van het dakvlak af.
- **+ Dakkapel**: breedte, hoogte van de voorkant en het dakvlak, met constructies voor de wanden en het platte dak, en een raam in de voorkant. De app rekent de voorkant, de twee driehoekige zijwangen en het platte dak uit. De diepte volgt uit de hoogte en de dakhelling. Het stuk schuin dak waar de dakkapel staat, gaat eraf, en de inhoud van de ruimte wordt groter.

Waar ze zitten, geef je aan met **Midden langs de nok** en **vanaf de goot**: langs de helling tot de onderkant van een dakraam, of horizontaal tot de voorkant van een dakkapel. Laat je die leeg, dan verdeelt de app ze gelijkmatig over het dakvlak. In de plattegrond staan ze als stippellijn. In de 2,5D-weergave zie je de dakramen in het schuine dakvlak, en de dakkapellen met voorkant, raam, zijwangen en plat dak. De plek telt niet mee in de berekening.

## Kruipruimte en kelder

Onder **Project → Verdiepingen** voeg je met **+ Kruipruimte** of **+ Kelder** een verdieping toe onder de laagste. Ruimtes die je daar tekent, zijn **onverwarmd**: ze tellen niet mee in het warmteverlies. Hun temperatuur (standaard 10 °C voor een kruipruimte en 12 °C voor een kelder) geldt voor de vloer erboven, als die op *Automatisch* staat. Waar niets getekend is, rekent de vloer met de grond. Je kunt er ook leidingen, de warmtepomp of het boilervat tekenen, met stijgleidingen naar boven.

Een verdieping verwijder je onder **Project → Verdiepingen** met ✕. Alles wat erop staat (ruimtes, leidingen en eventueel de warmtepomp) gaat mee, en ongedaan maken kan. Liep een trappenhuis of vide door tot die verdieping, dan stopt hij een verdieping lager.

Elke ruimte kun je met het vinkje **Verwarmde ruimte** ook zelf op onverwarmd zetten, bijvoorbeeld een berging of garage.

---

[← Overzicht](../README.md) · Vorige: [Wat grenst waaraan](grenzen.md) · Volgende: [Constructies en isolatiewaarde](constructies.md)

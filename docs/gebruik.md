[← Overzicht](../README.md) · Volgende: [Ruimtes en wanden tekenen](tekenen.md)

# Aan de slag

Gebruik de [online versie](https://warmtepomptekentafel.nl/), of draai de app op je eigen computer. Installeren hoeft niet, maar je hebt wel een eenvoudige webserver nodig. De app laadt zijn gegevens uit de map `data/`, en browsers laden zulke bestanden niet als je `index.html` direct opent. Bijvoorbeeld:

```sh
cd warmteverlies-tekentafel
python3 -m http.server
```

Open daarna http://localhost:8000. In VS Code kan het ook met de extensie *Live Server*.

De kolom rechts met de eigenschappen maak je breder of smaller door de rand aan de linkerkant te verslepen. Dubbelklik op die rand zet hem terug op de standaardbreedte. Je browser onthoudt de breedte.

Met **Over** onderaan de gereedschapsbalk links open je een venster met links naar deze handleiding en naar de pagina waar je een fout meldt of een idee deelt.

Het paneel heeft zes tabbladen:
- **Selectie**: wat je in de tekening hebt aangeklikt.
- **Constructies**: wanden, ramen, vloeren en daken met hun U-waarde.
- **Ventilatie**: ventilatie en infiltratie.
- **Installatie**: afgifte, stooklijn, warmtepomp, systeeminhoud, leidingnet, thermostaatkranen en appendages.
- **Resultaten**: het warmteverlies per ruimte, het woonoppervlak en de verbeteradviezen.
- **Project**: verdiepingen, rekenwaarden en je projecten.

Met **Lagen** boven de tekening zet je leidingen en warmtepomp, radiatoren en vloerverwarming, luchtstromen, trappen en de onderlegger aan of uit. Zo werk je rustiger aan de ruimtes en wanden. Kies je een gereedschap voor iets wat uit staat, zoals *Leiding*, dan komt die laag vanzelf terug.

<img src="img/lagen.png" width="600" alt="Het menu Lagen boven de tekening">

Met **Ondergrond** kies je welke verdieping lichtgrijs onder de tekening staat, met de omtrek van de ruimtes en de leidingen. Standaard is dat de verdieping eronder, maar je kunt ook een andere kiezen, bijvoorbeeld de zolder terwijl je de 1e verdieping tekent. Je kunt ook de kruipruimte kiezen. De keuze geldt per verdieping en je browser onthoudt hem. Toets `O` zet de ondergrond aan of uit. Op de lijnen van de ondergrond kun je snappen.

<img src="img/ondergrond.png" width="600" alt="Het menu Ondergrond met de verdiepingen">

Staat iets op de verkeerde verdieping, zoals een leiding, een ruimte of de warmtepomp, kies dan in het paneel bij **Verdieping** de juiste. Radiatoren en vloerverwarming gaan met hun ruimte mee. De warmtepomp kun je ook aanklikken en verslepen.

Met **Rapport (PDF)** bovenaan *Resultaten* maak je een rapport van het hele project. Het bevat de uitgangspunten, de plattegronden per verdieping (een trappenhuis met de treden en een pijl naar boven, ook op de verdiepingen erboven, en een vide gearceerd), het warmteverlies per ruimte met de berekening, de constructies met hun laagopbouw, de afgifte en de stooklijn, het leidingnet met schema en inregeladvies, de verbeteradviezen en de warmtepomp. Bij de warmtepomp staan de gekozen warmtepomp en de geschikte alternatieven, zodat je daar later nog uit kunt kiezen. Kies **Afdrukken of bewaren als PDF** en daarna in het printvenster *Opslaan als PDF*.

<img src="img/rapport.png" width="640" alt="Voorbeeld van het rapport">

Projecten worden in je browser opgeslagen (localStorage). Exporteer regelmatig een `.json` als reservekopie, want bij het wissen van browsergegevens ben je ze kwijt.

Met de keuzelijst bovenaan, naast de naam van de app, wissel je van project. Onderaan die lijst staan ook **+ Leeg project** en **Importeren (.json)…**, om een opgeslagen project te openen. Dezelfde knoppen staan onder *Project*.

### Delen via een link

Onder **Project → Delen via een link** maak je met **Link maken** een korte link naar een kopie van het project. Hij staat meteen op je klembord. Zo laat je je berekening zien op een forum, of stuur je hem naar een installateur of iemand die meekijkt.

- Je browser comprimeert en **versleutelt** het project voordat het naar de server van warmtepomptekentafel.nl gaat. De sleutel staat alleen in de link, achter het `#`, en dat deel stuurt een browser nooit mee. De server bewaart dus alleen onleesbare gegevens: zonder de link kan niemand het project lezen, ook de beheerder van de site niet.
- Een link die meer dan een jaar niet is geopend, wordt verwijderd.
- Wil je helemaal niets op een server, kies dan **Lange link zonder server**. Dan zit het hele project gecomprimeerd in de link zelf, achter `#p=`. Een gemiddeld huis geeft een link van een paar duizend tekens; knipt een forum of chat-app hem af, stuur dan het `.json`-bestand. Is de server voor korte links niet bereikbaar, dan maakt de app vanzelf zo'n lange link.
- Wie de link opent, krijgt een **kopie** in de eigen browser. Wat die persoon verandert, komt niet bij jou terecht. Open je dezelfde link nog eens, dan opent de app de kopie die er al was.
- Een onderlegger (afbeelding) gaat niet mee.
- Iedereen met de link ziet alles in het project, ook de naam. Haal daar je adres uit als je dat niet wilt delen.

---

[← Overzicht](../README.md) · Volgende: [Ruimtes en wanden tekenen](tekenen.md)

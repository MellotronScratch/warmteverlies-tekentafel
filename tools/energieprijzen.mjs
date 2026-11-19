// Haalt de gemiddelde energietarieven voor consumenten op bij het CBS (open data, tabel 85592NED) en schrijft de
// stroom- en gasprijs van de nieuwste maand naar data/energieprijzen.json: variabel leveringstarief plus energiebelasting,
// inclusief btw. Draait elke maand via .github/workflows/energieprijzen.yml; met de hand: node tools/energieprijzen.mjs
// Geen afhankelijkheden: Node 18 of nieuwer (fetch zit erin).
import fs from 'node:fs';

const API =
  'https://opendata.cbs.nl/ODataApi/odata/85592NED/TypedDataSet?$filter=' +
  encodeURIComponent("Btw eq 'A048944' and substringof('MM',Perioden)") + // inclusief btw, per maand
  '&$select=Perioden,VariabelLeveringstariefContractprijs_3,Energiebelasting_6,OpslagDuurzameEnergieODE_5,' +
  'VariabelLeveringstariefContractprijs_9,Energiebelasting_14,OpslagDuurzameEnergieODE_13';
const OUT = new URL('../data/energieprijzen.json', import.meta.url);
const MAANDEN = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december'
];

const res = await fetch(API);
if (!res.ok) throw new Error(`CBS gaf ${res.status} ${res.statusText}`);
const rows = (await res.json()).value
  .filter(r => r.VariabelLeveringstariefContractprijs_3 != null && r.VariabelLeveringstariefContractprijs_9 != null)
  .sort((a, b) => a.Perioden.localeCompare(b.Perioden));
if (!rows.length) throw new Error('Geen maandcijfers van het CBS gevonden');
const r = rows[rows.length - 1],
  jaar = +r.Perioden.slice(0, 4),
  mnd = +r.Perioden.slice(6, 8);
const rond = (v, d) => Math.round(v * 10 ** d) / 10 ** d,
  stroom = {
    levering: r.VariabelLeveringstariefContractprijs_9,
    belasting: r.Energiebelasting_14 + (r.OpslagDuurzameEnergieODE_13 || 0)
  },
  gas = {
    levering: r.VariabelLeveringstariefContractprijs_3,
    belasting: r.Energiebelasting_6 + (r.OpslagDuurzameEnergieODE_5 || 0)
  };
const data = {
  versie: 1,
  maand: `${jaar}-${String(mnd).padStart(2, '0')}`,
  maandNaam: `${MAANDEN[mnd - 1]} ${jaar}`,
  toelichting:
    'Gemiddelde prijs per kWh stroom en per m³ gas voor consumenten met een vast of variabel contract: het variabele leveringstarief plus de energiebelasting, inclusief btw. Vaste kosten (vastrecht, transport, vermindering energiebelasting) zitten er niet in. Bron: CBS, Gemiddelde energietarieven voor consumenten (tabel 85592NED). De app gebruikt deze prijzen tenzij je in een project zelf een prijs invult. Dit bestand wordt elke maand bijgewerkt door tools/energieprijzen.mjs; met de hand aanpassen kan, maar wordt bij de volgende update overschreven.',
  bron: 'https://www.cbs.nl/nl-nl/cijfers/detail/85592NED',
  stroom: rond(stroom.levering + stroom.belasting, 4),
  gas: rond(gas.levering + gas.belasting, 4),
  detail: {
    stroom: { levering: rond(stroom.levering, 4), belasting: rond(stroom.belasting, 5) },
    gas: { levering: rond(gas.levering, 4), belasting: rond(gas.belasting, 5) }
  }
};
const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '',
  txt = JSON.stringify(data, null, 2) + '\n';
if (old === txt) console.log(`Ongewijzigd: ${data.maandNaam}`);
else {
  fs.writeFileSync(OUT, txt);
  console.log(`Bijgewerkt: ${data.maandNaam}, stroom € ${data.stroom} per kWh, gas € ${data.gas} per m³`);
}

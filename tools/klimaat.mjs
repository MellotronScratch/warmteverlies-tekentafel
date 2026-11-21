// Maakt data/klimaat.json: per KNMI-weerstation hoeveel uur per jaar het buiten een bepaalde temperatuur is (per hele
// graad, gemiddeld over de jaren), en per postcode (4 cijfers) het dichtstbijzijnde station.
// Bronnen: KNMI uurgegevens (daggegevens.knmi.nl) en de postcodegebieden van het CBS via PDOK (postcode4 2023).
// Draaien: node tools/klimaat.mjs [map voor de downloads]. Een tweede keer gebruikt hij de downloads uit die map.
// Geen afhankelijkheden: Node 18 of nieuwer. Ongeveer 550 downloads; reken op een kwartier.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JAREN = [2011, 2025];
// stations op land of aan de kust met uurtemperaturen; meetpalen in zee en op dammen doen niet mee
const STATIONS = {
  215: 'Voorschoten',
  235: 'De Kooy (Den Helder)',
  240: 'Schiphol',
  249: 'Berkhout',
  251: 'Hoorn (Terschelling)',
  260: 'De Bilt',
  267: 'Stavoren',
  269: 'Lelystad',
  270: 'Leeuwarden',
  273: 'Marknesse',
  275: 'Deelen (Arnhem)',
  277: 'Lauwersoog',
  278: 'Heino',
  279: 'Hoogeveen',
  280: 'Eelde (Groningen)',
  283: 'Hupsel',
  286: 'Nieuw Beerta',
  290: 'Twenthe',
  310: 'Vlissingen',
  319: 'Westdorpe',
  323: 'Wilhelminadorp',
  330: 'Hoek van Holland',
  340: 'Woensdrecht',
  344: 'Rotterdam',
  348: 'Cabauw',
  350: 'Gilze-Rijen',
  356: 'Herwijnen',
  370: 'Eindhoven',
  375: 'Volkel',
  377: 'Ell',
  380: 'Maastricht',
  391: 'Arcen'
};
const MIN_JAREN = 10; // een station met minder volledige jaren telt niet mee
const CACHE = process.argv[2] || path.join(os.tmpdir(), 'wpt-klimaat');
const OUT = new URL('../data/klimaat.json', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });

async function cached(file, get) {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return fs.readFileSync(f, 'utf8');
  for (let i = 0; i < 4; i++) {
    try {
      const txt = await get();
      if (txt) {
        fs.writeFileSync(f, txt);
        return txt;
      }
    } catch (e) {
      // try again
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Download mislukt: ' + file);
}
// a few at a time
async function pool(jobs, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < jobs.length) await fn(jobs[i++]);
    })
  );
}

// 1. KNMI: one request per station per year (a bigger one is refused)
const meta = {},
  H = {};
const jobs = [];
for (const s of Object.keys(STATIONS)) for (let y = JAREN[0]; y <= JAREN[1]; y++) jobs.push([s, y]);
await pool(jobs, 4, async ([s, y]) => {
  const txt = await cached(`${s}_${y}.txt`, async () => {
    const r = await fetch('https://www.daggegevens.knmi.nl/klimatologie/uurgegevens', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `start=${y}010101&end=${y}123124&vars=T&stns=${s}`
    });
    const x = await r.text();
    return x.startsWith('#') ? x : null;
  });
  for (const l of txt.split('\n')) {
    const m = l.match(/^# (\d{3})\s+([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s+/);
    if (m) {
      meta[m[1]] = { lon: +m[2], lat: +m[3] };
      continue;
    }
    if (l.startsWith('#') || !l.trim()) continue;
    const p = l.split(',').map(v => v.trim());
    if (p.length < 4 || p[3] === '' || p[0] !== s) continue;
    const Y = ((H[s] ??= {})[y] ??= { n: 0, b: {} }),
      t = Math.round(+p[3] / 10);
    Y.n++;
    Y.b[t] = (Y.b[t] || 0) + 1;
  }
});
const stations = {};
for (const s of Object.keys(STATIONS)) {
  const ys = Object.entries(H[s] || {}).filter(([, v]) => v.n > 8000); // years with at least 8000 of the 8760 hours
  if (ys.length < MIN_JAREN || !meta[s]) {
    console.log(`${STATIONS[s]} (${s}) doet niet mee: ${ys.length} volledige jaren`);
    continue;
  }
  const tot = {};
  ys.forEach(([, v]) => {
    for (const [k, c] of Object.entries(v.b)) tot[k] = (tot[k] || 0) + (c * 8766) / v.n; // missing hours: scaled up
  });
  const uren = {};
  Object.keys(tot)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach(k => (uren[k] = Math.round((tot[k] / ys.length) * 10) / 10));
  const gd = Object.entries(uren).reduce((a, [k, h]) => a + (Math.max(0, 18 - +k) * h) / 24, 0);
  stations[s] = {
    naam: STATIONS[s],
    lat: meta[s].lat,
    lon: meta[s].lon,
    jaren: `${ys[0][0]}–${ys[ys.length - 1][0]}`,
    graaddagen: Math.round(gd),
    uren
  };
}

// 2. postcodes: middle of each postcode area (CBS postcode4 via PDOK), nearest station
const pcs = [];
for (let start = 0; ; start += 1000) {
  const j = JSON.parse(
    await cached(`pc4_${start}.json`, async () => {
      const r = await fetch(
        'https://service.pdok.nl/cbs/postcode4/2023/wfs/v1_0?service=WFS&version=2.0.0&request=GetFeature' +
          `&typeNames=postcode4:postcode4&count=1000&startIndex=${start}&outputFormat=application/json` +
          '&srsName=EPSG:4326&propertyName=postcode,geom'
      );
      return r.ok ? await r.text() : null;
    })
  );
  for (const ft of j.features) {
    const g = ft.geometry,
      polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let A = 0,
      X = 0,
      Y = 0;
    for (const p of polys) {
      const r = p[0];
      for (let i = 0; i < r.length - 1; i++) {
        const [x0, y0] = r[i],
          [x1, y1] = r[i + 1],
          c = x0 * y1 - x1 * y0;
        A += c;
        X += (x0 + x1) * c;
        Y += (y0 + y1) * c;
      }
    }
    pcs.push({ pc: +ft.properties.postcode, lon: X / (3 * A), lat: Y / (3 * A) });
  }
  if (j.features.length < 1000) break;
}
pcs.sort((a, b) => a.pc - b.pc);
const k = Math.cos((52.2 * Math.PI) / 180); // a degree of longitude is shorter than a degree of latitude
const postcodes = []; // [first postcode, station]: from this postcode on, up to the next entry
for (const p of pcs) {
  let best = null,
    bd = Infinity;
  for (const [s, o] of Object.entries(stations)) {
    const d = Math.hypot((p.lon - o.lon) * k, p.lat - o.lat);
    if (d < bd) {
      bd = d;
      best = +s;
    }
  }
  if (!postcodes.length || postcodes[postcodes.length - 1][1] !== best) postcodes.push([p.pc, best]);
}

const data = {
  versie: 2,
  toelichting:
    'Hoeveel uur per jaar het buiten een bepaalde temperatuur is, voor het jaarverbruik (bin-methode). Per weerstation van het KNMI en per graad Celsius (afgerond) het gemiddelde aantal uren per jaar; graaddagen ter informatie (basis 18 °C). Postcodes: [eerste postcode, station], vanaf die postcode tot de volgende regel is dat station het dichtstbij (middelpunt van het postcodegebied, CBS 2023). De app kiest het station bij de postcode van het project; zonder postcode De Bilt. Gemaakt met tools/klimaat.mjs. Wil je een ander station of een andere periode, pas dan de uren aan (samen ongeveer 8766 uur).',
  bron: `KNMI uurgegevens ${JAREN[0]}–${JAREN[1]}; postcodegebieden CBS via PDOK`,
  standaard: '260',
  stations,
  postcodes
};
const txt = JSON.stringify(data, null, 2).replace(/\[\s+(\d+),\s+(\d+)\s+\]/g, '[$1, $2]') + '\n';
fs.writeFileSync(OUT, txt);
console.log(`${Object.keys(stations).length} stations, ${pcs.length} postcodes in ${postcodes.length} reeksen`);

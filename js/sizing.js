// Stooklijn (aanvoertemperatuur tegen buitentemperatuur) en radiatoradvies bij een tekort.
'use strict';
/* ---------- heating curve ----------
   Per buitentemperatuur: het warmteverlies van elke ruimte neemt evenredig af met (θi − θe). De app zoekt per ruimte de laagste
   aanvoertemperatuur waarbij de afgifte dat verlies nog dekt (neededSupply, bij de ingestelde ΔT tussen aanvoer en retour).
   De hoogste daarvan is de stooklijn; de ruimte die dat bepaalt, is de maatgevende ruimte. */
const CURVE_TOP = 15; // °C buiten: het voetpunt van de stooklijn
function heatingCurve() {
  const S = P.settings,
    c = calcAll(),
    dT = Math.max(0.5, S.twSup - S.twRet),
    tMax = Math.max(30, +S.tMax || 55), // a heat pump cannot go higher than this
    rooms = c.per.filter(x => x.c.total > 0);
  const pts = [];
  let missing = rooms.filter(x => !(x.room.emitters || []).length).map(x => x.room);
  for (let t = Math.floor(S.te); t <= CURVE_TOP; t++) {
    let best = null,
      lim = null;
    const short = [];
    rooms.forEach(x => {
      const r = x.room;
      if (!(r.emitters || []).length || r.temp <= S.te) return;
      const need = (x.c.total * Math.max(0, r.temp - t)) / (r.temp - S.te);
      if (need <= 0) return;
      const ns = neededSupply(r, need);
      if (ns == null) return;
      // above the maximum of the heat pump: this room stays too cold, by this much
      if (ns === Infinity || ns > tMax + 1e-6) {
        short.push({ room: r, W: need - roomEmit(r, tMax, tMax - dT) });
        return;
      }
      if (best == null || ns > best) {
        best = ns;
        lim = r;
      }
    });
    pts.push({ t, ts: short.length ? tMax : best, room: short.length ? null : lim, short });
  }
  const design = pts[0],
    foot = pts[pts.length - 1];
  return { pts, design, foot, missing, dT, tMax };
}

function curveHtml() {
  const S = P.settings,
    K = heatingCurve(),
    D = K.design;
  let h = `<div class="sec"><h3>Stooklijn</h3>`;
  if (!D || D.ts == null)
    return (
      h +
      `<p class="note">Teken eerst radiatoren of vloerverwarming in de ruimtes. Daarna rekent de app uit welke aanvoertemperatuur bij elke buitentemperatuur nodig is.</p></div>`
    );
  const pts = K.pts.filter(p => p.ts != null),
    F = pts[pts.length - 1] || D,
    slope = (D.ts - F.ts) / Math.max(1, F.t - D.t);
  // chart
  const W = 380,
    H = 220,
    ml = 40,
    mr = 14,
    mt = 14,
    mb = 32,
    x0 = D.t,
    x1 = CURVE_TOP;
  const yMax = Math.ceil(Math.max(D.ts, S.twSup) / 5) * 5 + 5,
    yMin = Math.floor(Math.min(20, F.ts) / 5) * 5;
  const xs = t => ml + ((t - x0) / (x1 - x0)) * (W - ml - mr),
    ys = v => H - mb - ((v - yMin) / (yMax - yMin)) * (H - mt - mb);
  let o = '';
  const yStep = yMax - yMin > 40 ? 10 : 5;
  for (let v = yMin; v <= yMax + 1e-9; v += yStep)
    o += `<line x1="${ml}" x2="${W - mr}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)" stroke-width="1"/><text x="${ml - 6}" y="${ys(v) + 3.5}" text-anchor="end">${v}</text>`;
  for (let t = Math.ceil(x0 / 5) * 5; t <= x1; t += 5)
    o += `<text x="${xs(t)}" y="${H - mb + 15}" text-anchor="middle">${t > 0 ? '+' : ''}${t}</text>`;
  o += `<text x="${(ml + W - mr) / 2}" y="${H - 4}" text-anchor="middle">buitentemperatuur °C</text><text x="${ml - 6}" y="${mt - 4}" text-anchor="end">°C</text>`;
  // the setting in the project (supply temperature) as a reference
  o += `<line x1="${ml}" x2="${W - mr}" y1="${ys(S.twSup)}" y2="${ys(S.twSup)}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1.2"/><text x="${W - mr}" y="${ys(S.twSup) - 5}" text-anchor="end" style="fill:var(--muted)">ingesteld ${nv(S.twSup, 0)} °C</text>`;
  // straight line through both ends (what you set on the heat pump) and the calculated curve
  o += `<line x1="${xs(D.t)}" y1="${ys(D.ts)}" x2="${xs(F.t)}" y2="${ys(F.ts)}" stroke="var(--c-hp)" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  o += `<polyline points="${pts.map(p => xs(p.t).toFixed(1) + ',' + ys(p.ts).toFixed(1)).join(' ')}" fill="none" stroke="var(--c-loss)" stroke-width="2.5"/>`;
  [D, F].forEach(
    p =>
      (o += `<circle cx="${xs(p.t)}" cy="${ys(p.ts)}" r="4" fill="var(--surface)" stroke="var(--c-hp)" stroke-width="2"/><text x="${xs(p.t) + (p === D ? 8 : -8)}" y="${ys(p.ts) - 8}" text-anchor="${p === D ? 'start' : 'end'}">${fmt(p.ts, 1)} °C</text>`)
  );
  const limits = [...new Set(pts.map(p => p.room && p.room.name))].filter(Boolean);
  const diff = S.twSup - D.ts;
  h += `<div class="chartleg"><span><i style="background:var(--c-loss)"></i>nodig</span><span><i style="background:repeating-linear-gradient(90deg,var(--c-hp) 0 6px,transparent 6px 9px)"></i>stooklijn om in te stellen</span></div>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stooklijn: aanvoertemperatuur tegen buitentemperatuur">${o}</svg></div>
    <div class="det">Eindpunt: bij ${nv(D.t, 0)} °C buiten ${fmt(D.ts, 1)} °C aanvoer<br>Voetpunt: bij +${CURVE_TOP} °C buiten ${fmt(F.ts, 1)} °C aanvoer<br>Helling: ${fmt(slope, 2)} K aanvoer per K buiten (ΔT aanvoer/retour ${nv(K.dT, 1)} K)</div>
    ${limits.length ? `<p class="note">Maatgevend: ${limits.map(esc).join(', ')}. Die ruimte heeft bij die buitentemperatuur de hoogste aanvoertemperatuur nodig. Vergroot je daar de afgifte, dan kan de hele stooklijn omlaag.</p>` : ''}
    ${
      D.short.length
        ? `<div class="warnbox">Ook bij de maximale aanvoer van ${nv(K.tMax, 0)} °C blijft het bij ${nv(D.t, 0)} °C buiten te koud in: ${D.short
            .slice()
            .sort((a, b) => b.W - a.W)
            .map(
              x =>
                `<button class="crumb" data-act="selroom" data-r="${x.room.id}">${esc(x.room.name)}</button> (tekort ${fmtW(x.W)} W)`
            )
            .join(
              ', '
            )}. Daar is meer afgifte nodig; bij de ruimte staat welke radiator erbij of in de plaats kan. De stooklijn hierboven gaat niet hoger dan ${nv(K.tMax, 0)} °C.</div>`
        : ''
    }
    ${
      !D.short.length && diff > 1
        ? `<p class="note">De aanvoertemperatuur in het project staat op ${nv(S.twSup, 0)} °C, maar ${fmt(D.ts, 1)} °C is bij ${nv(D.t, 0)} °C genoeg. Een warmtepomp werkt grofweg 2 à 3 % zuiniger per graad lagere aanvoer.</p>`
        : !D.short.length && diff < -1 && D.room
          ? `<p class="note" style="color:var(--warn)">⚠ Bij de ingestelde ${nv(S.twSup, 0)} °C aanvoer is de afgifte in ${esc(D.room.name)} niet genoeg: daar is ${fmt(D.ts, 1)} °C nodig.</p>`
          : ''
    }
    <div class="fields">${numField('f-s-tmax', 'set.tMax', 'Maximale aanvoer warmtepomp', '°C', K.tMax, 0)}</div>
    ${K.missing.length ? `<p class="note" style="color:var(--warn)">⚠ Zonder afgifte, dus niet meegenomen: ${K.missing.map(r => esc(r.name)).join(', ')}.</p>` : ''}
    <p class="note">Stel op de warmtepomp de rechte lijn in: het eindpunt bij de laagste buitentemperatuur en het voetpunt bij +${CURVE_TOP} °C. Fabrikanten noemen dat ook wel stooklijn, weerafhankelijke regeling of heating curve. Daarna regel je de lijn in de praktijk bij: is het overal net warm genoeg, zet hem dan stapjes lager. De berekening gaat uit van één aanvoertemperatuur voor het hele huis. Vloerverwarming met een eigen mengregeling heeft een eigen, lagere lijn.</p></div>`;
  return h;
}

/* ---------- radiator advice ----------
   Bij een tekort in een ruimte: welk nominaal vermogen (75/65/20) erbij moet om het verlies te dekken bij de ingestelde
   aanvoer- en retourtemperatuur, en welke paneelradiatoren uit data/radiatoren.json dat leveren. */
const ADV_HEIGHTS = [400, 500, 600, 900]; // mm
const ADV_TYPES = ['T21', 'T22', 'T33'];
const radLenFor = (type, h, pNom) => {
  const per = RAD_TYPES[type] ? RAD_TYPES[type][0] * Math.pow(h / 600, 0.9) : 0;
  if (!(per > 0)) return null;
  const mm = Math.max(400, Math.ceil(((pNom / per) * 1000) / 100) * 100);
  return mm <= 3000 ? mm : null;
};
function radAdvice(room, need) {
  const S = P.settings,
    have = roomEmit(room),
    short = need - have;
  if (!(short > 1)) return null;
  const lm = lmtd(S.twSup, S.twRet, room.temp);
  if (lm <= 0) return { short, impossible: true };
  const f = Math.pow(lm / lmtd(75, 65, 20), 1.3),
    nomExtra = short / f;
  // replacing: everything except underfloor heating and fancoils is replaced by one panel radiator
  const keep = (room.emitters || [])
      .filter(e => e.kind === 'vv' || e.kind === 'fan')
      .reduce((a, e) => a + emOutput(e, room), 0),
    nomAll = Math.max(0, need - keep) / f;
  const table = nom =>
    ADV_TYPES.filter(t => RAD_TYPES[t]).map(t => ({ t, lens: ADV_HEIGHTS.map(h => radLenFor(t, h, nom)) }));
  // boosters on the radiators and convectors that do not have them yet
  const boostable = (room.emitters || []).filter(e => (e.kind === 'rad' || e.kind === 'conv') && !e.boost),
    boostGain = boostable.reduce(
      (a, e) => a + emOutput({ ...e, boost: true, boostPct: 40 }, room) - emOutput(e, room),
      0
    );
  return {
    short,
    f,
    nomExtra,
    nomAll,
    add: table(nomExtra),
    replace: table(nomAll),
    boostGain,
    nRad: boostable.length
  };
}
function radAdviceHtml(room, need) {
  const A = radAdvice(room, need),
    S = P.settings;
  if (!A) return '';
  if (A.impossible)
    return `<div class="card"><b>Advies</b><p class="note">Met een aanvoertemperatuur van ${nv(S.twSup, 0)} °C kan geen radiator deze ruimte van ${nv(room.temp, 1)} °C verwarmen. Verhoog de aanvoertemperatuur.</p></div>`;
  const tbl = rows =>
    `<div class="tablewrap"><table class="calc"><thead><tr><th>Type</th>${ADV_HEIGHTS.map(h => `<th>${h} hoog</th>`).join('')}</tr></thead><tbody>${rows
      .map(r => `<tr><td>${esc(r.t)}</td>${r.lens.map(l => `<td>${l ? fmtW(l) : '–'}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
  const hasRad = (room.emitters || []).some(e => e.kind === 'rad' || e.kind === 'conv');
  return `<div class="card"><b>Advies: ${fmtW(A.short)} W tekort bij ${nv(S.twSup, 0)}/${nv(S.twRet, 0)} °C</b>
    <p class="note">Daarvoor is ${fmtW(A.nomExtra)} W extra nodig, gerekend bij 75/65/20 °C zoals in de catalogus. Bij ${nv(S.twSup, 0)} °C geeft een radiator maar ${fmtW(A.f * 100)} % van dat vermogen.</p>
    <p class="note"><b>Bijplaatsen</b>: minimale lengte in mm van een extra paneelradiator:</p>${tbl(A.add)}
    ${
      hasRad
        ? `<p class="note"><b>Vervangen</b> door één radiator voor de hele ruimte (vloerverwarming en fancoils blijven), minimaal ${fmtW(A.nomAll)} W bij 75/65/20 °C:</p>${tbl(A.replace)}`
        : ''
    }
    ${
      A.nRad
        ? `<p class="note"><b>Boosters</b> (ventilatoren onder de radiator) op ${A.nRad > 1 ? 'de ' + A.nRad + ' radiatoren' : 'de radiator'} geven bij 40 % meerafgifte ongeveer ${fmtW(A.boostGain)} W extra: ${A.boostGain >= A.short ? '<b>genoeg</b> om het tekort te dekken.' : 'niet genoeg voor het hele tekort.'}</p>`
        : ''
    }
    <p class="note">Lengtes zijn afgerond op 100 mm en komen uit de vuistregel in <code>data/radiatoren.json</code> (±10 %). Kies uiteindelijk in de tabel van de fabrikant. Een lagere aanvoertemperatuur vraagt meer radiator; zie de stooklijn bij Resultaten.</p></div>`;
}
function shortageSummaryHtml(c) {
  const S = P.settings,
    list = c.per.filter(x => x.c.total > 0 && (x.room.emitters || []).length && roomEmit(x.room) < x.c.total - 1);
  if (!list.length) return '';
  return `<p class="note" style="color:var(--warn)">⚠ Tekort bij ${nv(S.twSup, 0)}/${nv(S.twRet, 0)} °C in ${list
    .map(x => `<button class="crumb" data-act="selroom" data-r="${x.room.id}">${esc(x.room.name)}</button>`)
    .join(', ')}. Bij elke ruimte staat welke radiator erbij of in de plaats kan.</p>`;
}

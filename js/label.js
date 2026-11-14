// Energielabel (indicatie): het jaarverbruik benaderd met een maandberekening en omgerekend naar primaire fossiele
// energie per m² woonoppervlak, zoals het label sinds 2021 (NTA 8800, EP2) werkt. Gegevens en aannames: data/energielabel.json.
// Het officiële label komt van een EP-adviseur; dit is een schatting om maatregelen te vergelijken.
'use strict';
const LABEL_COL = {
  'A++++': '#00703C',
  'A+++': '#00843D',
  'A++': '#1A9A3F',
  'A+': '#3BAA35',
  A: '#5DB346',
  B: '#A6C83A',
  C: '#F2E21B',
  D: '#F7B417',
  E: '#EE7D21',
  F: '#E5401F',
  G: '#D7191C'
};
const LABEL_DARK = new Set(['C', 'D']); // dark text on these
const EL_HEAT = { wp: 'Warmtepomp', hybride: 'Hybride warmtepomp', ketel: 'Cv-ketel (gas)' };
const EL_DHW = { wp: 'Warmtepomp + boiler', ketel: 'Cv-ketel (combi)', elek: 'Elektrische boiler' };

// compass direction (degrees clockwise from north) of a direction in the drawing (x to the right, y down)
const azOf = (dx, dy) => ((((Math.atan2(dx, -dy) * 180) / Math.PI - (+P.settings.north || 0)) % 360) + 360) % 360;
const AZ_NAMES = ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'];
const azName = az => AZ_NAMES[Math.round(az / 45) % 8];

// solar radiation in month m (kWh/m²) on a surface facing az, tilted (90 = vertical, 0 = horizontal)
function solarAt(m, az, tilt) {
  const K = EL.klimaat,
    v = [K.zonNoord, K.zonOost, K.zonZuid, K.zonWest],
    q = az / 90,
    i = Math.floor(q) % 4,
    f = q - Math.floor(q),
    vert = v[i][m] * (1 - f) + v[(i + 1) % 4][m] * f,
    k = Math.max(0, Math.min(90, tilt)) / 90;
  return K.zonHorizontaal[m] * (1 - k) + vert * k;
}
const gOf = con => {
  const U = con && Number.isFinite(con.U) ? con.U : 1.8;
  const row = EL.zon.gWaarde.find(([u]) => U >= u);
  return row ? row[1] : 0.6;
};
const isDoor = (label, con) => {
  const n = (label || '') + ' ' + ((con && con.name) || '');
  return /deur/i.test(n) && !/glas|schuif|tuin|terras|balkon/i.test(n);
};
// roof windows and dormer windows of a room, with the direction their slope faces
function roofWindows(room) {
  const R = roofOf(room),
    rf = room.roof;
  if (!R || rf.adj !== 'buiten') return [];
  const nS = R.type === 'zadel' ? 2 : 1,
    out = [];
  (rf.items || []).forEach(it => {
    const n = Math.min(nS - 1, it.slope | 0),
      down = R.type === 'zadel' ? n === 0 : R.lowMin, // the slope falls towards −v
      az = azOf(down ? -R.v.x : R.v.x, down ? -R.v.y : R.v.y);
    if (it.kind === 'raam') out.push({ A: Math.max(0, it.w * it.h), con: conById(it.cid), az, tilt: rf.pitch });
    else out.push({ A: Math.max(0, Math.min(it.winw * it.winh, it.w * it.hf)), con: conById(it.wincid), az, tilt: 90 });
  });
  return out.filter(w => w.A > 0);
}
const scopAuto = () => Math.max(2.2, Math.min(5, 4 - 0.055 * ((+P.settings.twSup || 35) - 35)));
const labelOf = ep => {
  const g = EL.labelgrenzen;
  for (const [l, max] of g) if (max == null || ep <= max + 1e-9) return l;
  return g[g.length - 1][0];
};

// the yearly energy use; save = W less heat loss at the design temperature (the ticked improvement measures)
function energyCalc(save) {
  const S = P.settings,
    E = EL,
    K = E.klimaat,
    O = E.opwekking,
    ti = E.binnentemperatuur,
    rooms = P.rooms.filter(r => r.heated !== false);
  let Htr = 0;
  const wins = [];
  rooms.forEach(r => {
    const c = calcRoom(r),
      d = r.temp - S.te;
    c.lines.forEach(l => {
      // only what leaves the house: outside, ground and unheated spaces (the neighbours count as equally warm)
      if (d > 0 && DU_TYPES.has(l.type) && l.phi > 0) Htr += l.phi / d;
      if (l.group === 'open' && l.type === 'buiten' && !l.ri && Number.isInteger(l.w) && l.A > 0) {
        const con = conById(l.cid);
        if (isDoor(l.label, con)) return;
        const e = edge(r, l.w);
        wins.push({ A: l.A, con, az: azOf(e.nx, e.ny), tilt: 90 });
      }
    });
    roofWindows(r).forEach(w => wins.push(w));
  });
  if (save > 0) Htr = Math.max(0, Htr - save / (ti - S.te));
  let Ag = P.rooms.reduce((a, r) => a + livingArea(r), 0);
  if (!(Ag > 1)) Ag = infTotal().Ag;
  // ventilation over the whole house: the larger of supply and extract; nothing entered → a standard amount
  const sup = rooms.reduce((a, r) => a + (+r.sup || 0), 0),
    ext = rooms.reduce((a, r) => a + (+r.ext || 0), 0),
    ventDefault = Math.max(sup, ext) < 1,
    qv = ventDefault ? E.ventilatieStandaard * 3.6 * Ag : Math.max(sup, ext),
    Hve = RHOC * qv * (S.ventSys === 'D' ? 1 - S.eta : 1),
    qi = S.infMode === 'qv10' ? infTotal().q : (S.nInf || 0) * rooms.reduce((a, r) => a + roomVolume(r), 0),
    Hinf = RHOC * qi,
    H = Htr + Hve + Hinf;
  const phiInt = E.interneWarmte.perWoning + E.interneWarmte.perM2 * Ag,
    Fsol = E.zon.glasfractie * E.zon.beschaduwing * E.zon.invalshoek,
    tau = H > 0 ? (E.warmtecapaciteit * Ag * 1000) / 3600 / H : 0,
    a = 1 + tau / 15;
  const months = K.dagen.map((dg, m) => {
    const h = dg * 24,
      loss = Math.max(0, (H * (ti - K.buitentemperatuur[m]) * h) / 1000),
      sol = wins.reduce((s, w) => s + w.A * gOf(w.con) * Fsol * solarAt(m, w.az, w.tilt), 0),
      gain = (phiInt * h) / 1000 + sol,
      y = loss > 0 ? gain / loss : Infinity,
      eta = !(loss > 0) ? 0 : Math.abs(y - 1) < 1e-6 ? a / (a + 1) : (1 - Math.pow(y, a)) / (1 - Math.pow(y, a + 1));
    return { loss, sol, gain, eta, need: Math.max(0, loss - eta * gain) };
  });
  const sum = k => months.reduce((s, x) => s + x[k], 0),
    QH = sum('need') / O.afgifteRendement,
    persons = Math.max(1, Math.min(5, 1 + (Ag - 30) / 35)),
    QW = persons * E.tapwater.kWhPerPersoon;
  const scop = S.elScop > 0 ? S.elScop : scopAuto(),
    eff = S.elEff > 0 ? S.elEff : O.ketelRendement,
    share = S.elHeat === 'wp' ? 1 : S.elHeat === 'hybride' ? O.hybrideAandeelWarmtepomp : 0;
  const eHeat = (share * QH) / scop,
    gHeat = ((1 - share) * QH) / eff,
    eDhw =
      S.elDhw === 'wp' ? QW / O.tapwaterWarmtepompCop : S.elDhw === 'elek' ? QW / O.tapwaterElektrischRendement : 0,
    gDhw = S.elDhw === 'ketel' ? QW / O.tapwaterKetelRendement : 0,
    aux =
      Ag *
      (E.hulpenergie.pompPerM2 +
        (S.ventSys === 'C' ? E.hulpenergie.ventilatorC : S.ventSys === 'D' ? E.hulpenergie.ventilatorD : 0)),
    pv = Math.max(0, +S.elPv || 0) * E.zonnepanelenKwhPerKwp,
    elec = eHeat + eDhw + aux,
    gas = gHeat + gDhw,
    prim = E.primaireFactor.elektriciteit * (elec - pv) + E.primaireFactor.gas * gas,
    ep = prim / Ag;
  return {
    Ag,
    H,
    Htr,
    Hve,
    Hinf,
    ventDefault,
    qv,
    wins,
    months,
    loss: sum('loss'),
    gain: sum('gain'),
    sol: sum('sol'),
    use: sum('loss') - sum('need'),
    QH,
    QW,
    persons,
    scop,
    eff,
    eHeat,
    gHeat,
    eDhw,
    gDhw,
    aux,
    pv,
    elec,
    gas,
    prim,
    ep,
    label: labelOf(ep)
  };
}

const labelBadge = (l, big) =>
  `<span class="elbadge${big ? ' big' : ''}" style="background:${LABEL_COL[l]};color:${LABEL_DARK.has(l) ? '#1A1A1A' : '#fff'}">${l}</span>`;
// the familiar scale of coloured bars, with arrows at the estimate now and after the ticked measures
function labelScaleHtml(R, R2) {
  const g = EL.labelgrenzen;
  return `<div class="elscale" role="img" aria-label="Energielabel ${R.label}${R2 ? ', na maatregelen ' + R2.label : ''}">${g
    .map(([l, max], i) => {
      const lo = i ? g[i - 1][1] : null,
        range = max == null ? `> ${lo}` : lo == null ? `≤ ${max}` : `${lo}–${max}`,
        marks = [
          R.label === l ? `<span class="elmark">◀ nu ${fmtW(R.ep)}</span>` : '',
          R2 && R2.label === l ? `<span class="elmark after">◀ na maatregelen ${fmtW(R2.ep)}</span>` : ''
        ].join('');
      return `<div class="elrow"><span class="elbar" style="width:${34 + i * 5.5}%;background:${LABEL_COL[l]};color:${LABEL_DARK.has(l) ? '#1A1A1A' : '#fff'}"><b>${l}</b><small>${range}</small></span>${marks}</div>`;
    })
    .join('')}</div>`;
}
// small plan of the lowest heated floor with a north arrow, to check the orientation
function compassSvg() {
  const fl = P.floors.find(f => !f.below && P.rooms.some(r => r.floorId === f.id)) || P.floors[0],
    rs = P.rooms.filter(r => r.floorId === fl.id);
  const W = 132,
    pad = 22;
  let s = '';
  if (rs.length) {
    const ps = rs.flatMap(r => r.pts),
      x0 = Math.min(...ps.map(p => p.x)),
      x1 = Math.max(...ps.map(p => p.x)),
      y0 = Math.min(...ps.map(p => p.y)),
      y1 = Math.max(...ps.map(p => p.y)),
      k = (W - 2 * pad) / Math.max(x1 - x0, y1 - y0, 0.1),
      ox = (W - (x1 - x0) * k) / 2,
      oy = (W - (y1 - y0) * k) / 2;
    s += rs
      .map(
        r =>
          `<polygon points="${r.pts.map(p => `${(ox + (p.x - x0) * k).toFixed(1)},${(oy + (p.y - y0) * k).toFixed(1)}`).join(' ')}" fill="var(--room)" stroke="var(--wall)" stroke-width="1"/>`
      )
      .join('');
  }
  const n = +P.settings.north || 0;
  s += `<g transform="translate(${W / 2},${W / 2}) rotate(${n})"><line x1="0" y1="${W / 2 - 4}" x2="0" y2="${-W / 2 + 16}" stroke="var(--ink)" stroke-width="1.4" stroke-opacity=".5"/><path d="M0 ${-W / 2 + 6}L-6 ${-W / 2 + 18}L6 ${-W / 2 + 18}Z" fill="var(--heat)"/><text x="0" y="${-W / 2 + 30}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--heat)">N</text></g>`;
  return `<svg class="elcompass" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" role="img" aria-label="Plattegrond met de noordpijl">${s}</svg>`;
}

function labelHtml(c) {
  if (!EL || c.total <= 0) return '';
  const S = P.settings,
    save = adviceSaving(c),
    R = energyCalc(0),
    R2 = save > 0 ? energyCalc(save) : null,
    E = EL,
    kWh = v => fmtW(v) + ' kWh';
  const opt = (o, cur) =>
    Object.entries(o)
      .map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`)
      .join('');
  let h = `<div class="sec"><h3>Energielabel (indicatie)</h3>
    <div class="elhead">${labelBadge(R.label, true)}<div><b>${fmtW(R.ep)} kWh/m² per jaar</b><span class="note">primaire fossiele energie, ${fmt(R.Ag, 1)} m² woonoppervlak${R2 ? ` · na de aangevinkte maatregelen ${labelBadge(R2.label)} ${fmtW(R2.ep)} kWh/m²` : ''}</span></div></div>
    ${labelScaleHtml(R, R2)}
    <p class="note">Een schatting van het label zoals een EP-adviseur het uitrekent (NTA 8800): het energiegebruik van een jaar voor verwarming, warm tapwater, pompen en ventilatoren, min wat zonnepanelen opwekken, omgerekend naar primaire fossiele energie per m². Elektriciteit telt ${nv(E.primaireFactor.elektriciteit, 2)} keer zo zwaar als gas. Het echte label kan een stap afwijken: de NTA 8800 rekent op een aantal punten met vaste standaardwaarden. Gebruik het vooral om maatregelen te vergelijken; vink hierboven verbeteradviezen aan om het effect te zien.</p>`;
  if (R.ventDefault)
    h += `<div class="warnbox">Er is geen ventilatie ingevuld. Het label rekent daarom met ${nv(E.ventilatieStandaard, 2)} dm³/s per m² (${fmtW(R.qv)} m³/h)${S.ventSys === 'D' ? ` met WTW-rendement ${nv(S.eta, 2)}` : ''}. Vul onder <button class="crumb" data-act="gotab" data-tab="vent">Ventilatie</button> de debieten per ruimte in voor een betere schatting.</div>`;
  h += `<div class="fields"><label class="f" for="f-s-elheat">Verwarming<select class="in" id="f-s-elheat" data-f="set.elHeat">${opt(EL_HEAT, S.elHeat)}</select></label>
    ${S.elHeat !== 'ketel' ? numField('f-s-elscop', 'set.elScop', 'SCOP warmtepomp', '0 = auto', S.elScop > 0 ? S.elScop : R.scop, 2) : ''}${S.elHeat !== 'wp' ? numField('f-s-eleff', 'set.elEff', 'Rendement cv-ketel', '0–1', R.eff, 2) : ''}
    <label class="f" for="f-s-eldhw">Warm tapwater<select class="in" id="f-s-eldhw" data-f="set.elDhw">${opt(EL_DHW, S.elDhw)}</select></label>
    ${numField('f-s-elpv', 'set.elPv', 'Zonnepanelen', 'kWp', S.elPv || 0, 2)}</div>
    ${S.elHeat !== 'ketel' ? `<p class="note">${S.elScop > 0 ? `Je hebt een eigen SCOP ingevuld. Met 0 rekent de app weer met ${fmt(scopAuto(), 2)}, passend bij een aanvoertemperatuur van ${nv(S.twSup, 0)} °C.` : `De SCOP (het rendement over het hele stookseizoen) volgt uit je aanvoertemperatuur van ${nv(S.twSup, 0)} °C. Weet je de SCOP van je warmtepomp (bij 35 of 55 °C, gemiddeld klimaat), vul die dan in.`}${S.elHeat === 'hybride' ? ` Bij een hybride warmtepomp levert de warmtepomp ongeveer ${fmtW(E.opwekking.hybrideAandeelWarmtepomp * 100)}% van de warmte en de ketel de rest.` : ''} Zonnepanelen: het totale piekvermogen in kWp (aantal panelen × wattpiek ÷ 1000); de app rekent met ${fmtW(E.zonnepanelenKwhPerKwp)} kWh per kWp per jaar.</p>` : ''}
    <div class="elnorth">${compassSvg()}<div>${numField('f-s-north', 'set.north', 'Noorden', '° met de klok mee vanaf boven', S.north || 0, 0)}<p class="note">Waar het noorden ligt ten opzichte van je tekening: 0 als boven het noorden is, 90 als het noorden rechts ligt. Daarmee rekent de app hoeveel zon er door elk raam binnenkomt.</p></div></div>`;
  // breakdown
  const rows = [
    [
      'Warmteverlies over het jaar',
      kWh(R.loss),
      `verliesfactor ${fmt(R.H, 0)} W/K: schil ${fmt(R.Htr, 0)}, ventilatie ${fmt(R.Hve, 0)}, infiltratie ${fmt(R.Hinf, 0)}`
    ],
    [
      'Nuttige winst van zon en interne warmte',
      '− ' + kWh(R.use),
      `zon door de ramen ${kWh(R.sol)}, mensen en apparaten ${kWh(R.gain - R.sol)}; niet alles is nuttig`
    ],
    ['Warmtebehoefte verwarming', kWh(R.QH), `${fmtW(R.QH / R.Ag)} kWh/m², inclusief verlies bij de afgifte`],
    ['Warm tapwater', kWh(R.QW), `${fmt(R.persons, 1)} bewoners (volgt uit het woonoppervlak)`],
    [
      'Elektriciteit',
      kWh(R.elec),
      [
        R.eHeat > 0 ? `verwarming ${kWh(R.eHeat)}` : '',
        R.eDhw > 0 ? `tapwater ${kWh(R.eDhw)}` : '',
        `pompen en ventilatoren ${kWh(R.aux)}`
      ]
        .filter(Boolean)
        .join(', ')
    ],
    R.gas > 0 ? ['Gas', `${fmtW(R.gas / E.gasKwhPerM3)} m³`, `${kWh(R.gas)}`] : null,
    R.pv > 0 ? ['Zonnepanelen', '− ' + kWh(R.pv), `${nv(S.elPv, 2)} kWp`] : null,
    ['Primaire fossiele energie', kWh(R.prim), `${fmtW(R.ep)} kWh/m² → label ${R.label}`]
  ].filter(Boolean);
  h += `<div class="tablewrap"><table class="calc kv eltab"><tbody>${rows.map(([a, b, n]) => `<tr><td>${a}<small>${n}</small></td><td>${b}</td></tr>`).join('')}</tbody></table></div>`;
  const byDir = {};
  R.wins.forEach(w => {
    const k = (w.tilt < 80 ? 'dakraam ' : '') + azName(w.az);
    byDir[k] = (byDir[k] || 0) + w.A;
  });
  const dirs = Object.entries(byDir).sort((a, b) => b[1] - a[1]);
  if (dirs.length)
    h += `<p class="note">Ramen voor de zon: ${dirs.map(([k, A]) => `${k} ${fmt(A, 1)} m²`).join(', ')}.</p>`;
  return h + `</div>`;
}

// Afgifte (radiatoren, convectoren, vloerverwarming), leidingen en systeeminhoud.
'use strict';
/* ---------- heat emitters and their connection pipes ---------- */
const EM_KINDS = { rad: 'Radiator', conv: 'Convector', fan: 'Fancoil', vv: 'Vloerverwarming' };
const EM_N = { rad: 1.3, conv: 1.4, fan: 1.0, vv: 1.0 };
const EM_NOM = { rad: [75, 65, 20], conv: [75, 65, 20], fan: [35, 30, 20] }; // conditions the stated output refers to
/* ---------- supply/return difference and flow ----------
   Without a set flow, the return temperature from the settings applies and the flow follows from it.
   With a set flow (l/h), the difference follows from the design heat load: ΔT = Φ / (1,163 × q). A higher flow gives a
   smaller ΔT, a higher return and mean water temperature and so more output from the emitters. */
// heat loss of the rooms that are heated by an emitter, in the room itself or elsewhere in its heating zone
const designLoad = () =>
  calcAll().per.reduce((a, x) => {
    const z = zoneOf(x.room);
    return a + ((z ? z.ems.length : (x.room.emitters || []).length) ? Math.max(0, x.c.total) : 0);
  }, 0);
let _dtMemo = null;
function sysDT() {
  const S = P.settings;
  if (!(+S.flow > 0)) return Math.max(0.5, S.twSup - S.twRet);
  if (_dtMemo == null) {
    _dtMemo = Math.min(S.twSup - 15, Math.max(0.5, designLoad() / (1.163 * S.flow)));
    Promise.resolve().then(() => (_dtMemo = null));
  }
  return Math.max(0.5, _dtMemo);
}
const tRet = () => P.settings.twSup - sysDT();
// flow of the whole system at the design load (l/h)
const sysFlow = () => (+P.settings.flow > 0 ? +P.settings.flow : designLoad() / (1.163 * sysDT()));
// rule of thumb for steel panel radiators: output per metre length at 75/65/20 °C (EN 442) for a height of 600 mm,
// scaled with (height/600)^0.9. Within ±10 % of common brands; the manufacturer's table is always better.
const radP = (t, h, l) =>
  RAD_TYPES[t]
    ? Math.round((RAD_TYPES[t][0] * Math.pow(Math.max(100, h) / 600, 0.9) * Math.max(0, l)) / 1000 / 10) * 10
    : 0;
// change the length of a radiator/convector line: the start stays, the end moves along the same direction
function setEmLen(em, mm) {
  const L = emLen(em),
    ux = L > 1e-6 ? (em.b.x - em.a.x) / L : 1,
    uy = L > 1e-6 ? (em.b.y - em.a.y) / L : 0;
  em.b = { x: r3(em.a.x + (ux * mm) / 1000), y: r3(em.a.y + (uy * mm) / 1000) };
}
function syncRad(em) {
  if (em.kind === 'rad' && RAD_TYPES[em.rt]) em.p = radP(em.rt, em.rh, em.rl);
}
// older projects used threaded gas pipe sizes for steel: map them to the steel tube with the nearest bore
const OLD_STEEL = { '3/8"': '15', '1/2"': '18', '3/4"': '22', '1"': '28', '1 1/4"': '35' };
// "32×3 mm" for (alu)pex, "22×1 mm" for copper, "22×1,2 mm" for steel
function dnLabel(mat, dn) {
  const m = PIPES[mat] || PIPES.koper,
    d = m.d[dn];
  return dn + '×' + nv((+dn - d) / 2, 1) + ' mm';
} // outside diameter × wall
const pipeLpm = (mat, dn) => {
  const d = (PIPES[mat] || PIPES.koper).d[dn] || 13;
  return (Math.PI * d * d) / 4000;
}; // litres of water per metre of pipe
const pipeLen = pp => pp.pts.reduce((a, p, i) => (i ? a + dist(pp.pts[i - 1], p) : a), 0);
// water content (litres), indicative: panel radiators per metre at 600 mm high; otherwise per kW of rated output
function emVolume(em) {
  if (em.kind === 'vv') return vvLoop(em) * pipeLpm('pex', '16');
  if (em.kind === 'rad' && RAD_TYPES[em.rt]) return RAD_L[em.rt] * (em.rh / 600) * (em.rl / 1000);
  if (em.kind === 'conv') return Math.max(0, emLen(em) - 0.15) * 2 * (em.loops || 1) * pipeLpm('koper', '15'); // loop(s) of 15 mm copper through the fins
  return (Math.max(0, em.p) / 1000) * (em.kind === 'rad' ? 3.4 : 0.5);
}
function systemVolume() {
  const S = P.settings;
  let rad = 0,
    vv = 0;
  P.rooms.forEach(r =>
    (r.emitters || []).forEach(em => {
      const v = emVolume(em);
      if (em.kind === 'vv') vv += v;
      else rad += v;
    })
  );
  const pipes = (P.pipes || []).reduce((a, x) => a + (pipeLen(x) + x.extra) * 2 * pipeLpm(x.mat, x.dn), 0);
  return { pipes, rad, vv, hp: S.hpVol, buf: S.bufVol, total: pipes + rad + vv + S.hpVol + S.bufVol };
}
function pipeCapacity(mat, dn) {
  const d = ((PIPES[mat] || PIPES.koper).d[dn] || 13) / 1000,
    dT = sysDT();
  return ((V_OK * Math.PI * d * d) / 4) * 1000 * 4.19 * dT;
} // kW at 0,5 m/s
function viewPipe(pp) {
  const len = pipeLen(pp),
    tot = len + pp.extra,
    vol = tot * 2 * pipeLpm(pp.mat, pp.dn),
    cap = pipeCapacity(pp.mat, pp.dn),
    need = calcAll().total / 1000,
    S = P.settings;
  return `<div class="sec"><button class="crumb" data-act="desel">← Alle ruimtes</button><input class="title" id="f-pipe-name" data-f="pipe.name" value="${esc(pp.name)}" aria-label="Naam leiding"></div>
  <div class="fields">${floorSelect('f-pipe-fl', 'pipe.floorId', pp.floorId)}</div>
  <div class="fields"><label class="f" for="f-pipe-mat">Materiaal<select class="in" id="f-pipe-mat" data-f="pipe.mat">${Object.entries(
    PIPES
  )
    .map(([k, v]) => `<option value="${k}" ${pp.mat === k ? 'selected' : ''}>${v.label}</option>`)
    .join('')}</select></label>
    <label class="f" for="f-pipe-dn">Diameter<select class="in" id="f-pipe-dn" data-f="pipe.dn">${Object.keys(
      PIPES[pp.mat].d
    )
      .map(
        d =>
          `<option value="${esc(d)}" ${pp.dn === d ? 'selected' : ''}>${esc(dnLabel(pp.mat, d))} (inwendig ${nv(PIPES[pp.mat].d[d], 1)} mm)</option>`
      )
      .join('')}</select></label>
    ${numField('f-pipe-x', 'pipe.extra', 'Extra lengte', 'm', pp.extra, 1)}</div>
  ${netPipeHtml(pp)}
  <div class="det">Getekend ${fmt(len)} m + extra ${fmt(pp.extra)} m = ${fmt(tot)} m<br>Inhoud aanvoer + retour: <b>${fmt(vol, 1)} liter</b><br>Draagt bij ${nv(V_OK, 1)} m/s ongeveer ${fmt(cap, 1)} kW (ΔT ${fmt(sysDT(), 1)} K)</div>
  ${cap < need ? `<p class="note" style="color:var(--warn)">⚠ Is dit de hoofdleiding, dan is hij te klein voor het hele huis (${fmt(need, 2)} kW): het water stroomt dan sneller dan ${nv(V_OK, 1)} m/s.</p>` : ''}
  <p class="note">Eén lijn staat voor aanvoer én retour. Vul bij <i>Extra lengte</i> stijgleidingen naar een andere verdieping in, en stukken die je niet tekent. Koppelingen en bochten tellen niet mee. De inhoud gaat mee in de systeeminhoud onder <button class="crumb" data-act="gotab" data-tab="inst">Installatie</button>.</p>
  <p class="note">Hoekpunt verslepen: sleep het. Klik op een + om een punt toe te voegen, en dubbelklik op een punt om het weg te halen.</p>
  <div class="row"><button class="btn danger" data-act="delpipe">Leiding verwijderen</button></div>`;
}
function volumeHtml() {
  if (!hpList) return '';
  const S = P.settings,
    v = systemVolume(),
    hp = hpList.find(h => h.id === hpSel);
  const max7 = hp ? hpAt(hp, 7, 'max') : 0,
    req = hp ? (+hp.minInhoud > 0 ? +hp.minInhoud : S.minVolL * max7) : 0,
    ok = v.total >= req;
  const row = (l, x) => `<tr><td>${l}</td><td>${fmt(x, 1)} l</td></tr>`;
  return `<div class="sec"><h3>Systeeminhoud</h3>
    <div class="tablewrap"><table class="calc"><tbody>${row('Leidingen (getekend, aanvoer + retour)', v.pipes)}${row('Radiatoren, convectoren en fancoils', v.rad)}${row('Vloerverwarming (lussen 16×2)', v.vv)}${row('Warmtepomp', v.hp)}${v.buf > 0 ? row('Schakelvat', v.buf) : ''}<tr class="sum"><td>Totaal</td><td>${fmt(v.total, 0)} l</td></tr></tbody></table></div>
    <div class="fields">${numField('f-s-hpvol', 'set.hpVol', 'Inhoud warmtepomp', 'l', S.hpVol, 1)}${numField('f-s-buf', 'set.bufVol', 'Schakelvat (extra inhoud)', 'l', S.bufVol, 0)}${numField('f-s-minv', 'set.minVolL', 'Vuistregel minimaal', 'l per kW', S.minVolL, 1)}</div>
    ${
      hp
        ? `<div class="kcard"><div class="kh"><span>Nodig voor ${esc(hp.merk)} ${esc(hp.model)}</span><b>${fmt(req, 0)} l</b></div>
      <div class="row">${ok ? `<span class="chip ok">✓ voldoende inhoud (${fmt(v.total, 0)} l)</span>` : `<span class="chip bad">⚠ ${fmt(req - v.total, 0)} l te weinig: overweeg een schakelvat</span>`}</div>
      <span class="note">${+hp.minInhoud > 0 ? 'Minimale inhoud volgens de opgave in de warmtepomplijst.' : `Vuistregel: ${nv(S.minVolL, 1)} l per kW maximaal vermogen bij +7 °C (${fmt(max7, 1)} kW). Kijk in de installatiehandleiding voor de echte eis.`}</span></div>`
        : '<p class="note">Kies hierboven een warmtepomp om de inhoud te beoordelen.</p>'
    }
    <p class="note">Een warmtepomp heeft genoeg water in het systeem nodig om te kunnen ontdooien en niet te vaak aan en uit te gaan. Tel alleen kringen mee die altijd open staan. Hebben radiatoren thermostaatkranen of heeft de vloerverwarming ruimteregeling, dan is de werkelijke inhoud lager. Is de inhoud te klein, dan vergroot een <b>schakelvat</b> de systeeminhoud. Een <b>buffervat</b> tussen aanvoer en retour (hydraulische scheiding) is iets anders: dat heb je nodig als de warmtepomp meer water moet rondpompen dan het afgiftesysteem aankan, of bij meerdere pompgroepen, zoals vloerverwarming met een eigen mengpomp. Dat volgt niet uit de inhoud maar uit het debiet. Overleg het met de installateur.</p>
    <p class="note">Indicatieve inhoud: paneelradiatoren per meter (bij 600 mm hoog: T11 3 l, T22 5,8 l, T33 8,5 l), andere radiatoren 3,4 l per kW, convectoren een of meer lussen koperbuis 15 mm over de lengte min 15 cm (een lus is twee buizen), fancoils 0,5 l per kW. Aansluitleidingen naar de radiatoren tellen alleen mee als je ze tekent.</p></div>`;
}
const V_OK = 0.5,
  V_MAX = 0.8; // m/s in connection pipes
function lmtd(ts, tr, ti) {
  if (ts <= ti || tr <= ti) return 0;
  if (Math.abs(ts - tr) < 1e-6) return ts - ti;
  return (ts - tr) / Math.log((ts - ti) / (tr - ti));
}
const emArea = em => (em.kind === 'vv' && em.pts ? Math.abs(polyArea(em.pts)) : 0);
const emLen = em => (em.a && em.b ? dist(em.a, em.b) : 0);
const emMid = em => (em.kind === 'vv' ? centroid(em.pts) : { x: (em.a.x + em.b.x) / 2, y: (em.a.y + em.b.y) / 2 });
function emOutput(em, room, ts, tr) {
  const S = P.settings;
  if (ts == null) {
    ts = S.twSup;
    tr = tRet();
  }
  const ti = room.temp,
    dt = lmtd(ts, tr, ti);
  if (dt <= 0) return 0;
  if (em.kind === 'vv') {
    const R = (VV_COVER[em.cover] || VV_COVER.tegels)[1],
      row = VV_KH[em.spacing] || VV_KH[15];
    const x = Math.min(3, Math.max(0, R / 0.05)),
      i = Math.min(2, Math.floor(x));
    const kh = row[i] + (row[i + 1] - row[i]) * (x - i);
    const qmax = 8.92 * Math.pow(Math.max(0, 29 - ti), 1.1); // floor surface at most 29 °C
    return Math.min(kh * dt, qmax) * emArea(em);
  }
  const nom = EM_NOM[em.kind] || EM_NOM.rad;
  const boost = em.boost && (em.kind === 'rad' || em.kind === 'conv') ? 1 + (em.boostPct || 0) / 100 : 1;
  return Math.max(0, em.p) * Math.pow(dt / lmtd(nom[0], nom[1], nom[2]), em.n || EM_N[em.kind] || 1.3) * boost;
}
// the pipe an emitter hangs on, taken from the drawn network (null: not connected)
function emPipe(em, N) {
  if (!(P.pipes || []).length) return null;
  N = N || network();
  const o = N.ems.find(x => x.em === em);
  if (!o || !o.node) return null;
  const e =
    (o.reach && o.node.parent) ||
    o.node.adj
      .filter(x => x.pp)
      .sort((a, b) => (PIPES[a.pp.mat]?.d[a.pp.dn] || 99) - (PIPES[b.pp.mat]?.d[b.pp.dn] || 99))[0];
  return e && e.pp ? e.pp : null;
}
// water flow and velocity in the connecting pipe; state 'los' when no pipe is drawn to the emitter
function pipeCheck(em, W, N) {
  const dT = sysDT();
  const Q = W / (4190 * dT) / 1000, // m³/s
    pp = emPipe(em, N);
  if (!pp) return { lh: Q * 3.6e6, v: 0, pmax: 0, di: 0, state: 'los', pp: null };
  const mat = PIPES[pp.mat] || PIPES.koper;
  const di = (mat.d[pp.dn] || 13) / 1000,
    Ar = (Math.PI * di * di) / 4;
  const v = Q / Ar;
  return {
    lh: Q * 3.6e6,
    v,
    pmax: V_OK * Ar * 1000 * 4190 * dT,
    di: di * 1000,
    pp,
    state: v <= V_OK ? 'ok' : v <= V_MAX ? 'krap' : 'te klein'
  };
}
const pipeBad = pc => pc.state === 'krap' || pc.state === 'te klein';
function roomEmit(room, ts, tr) {
  return (room.emitters || []).reduce((a, e) => a + emOutput(e, room, ts, tr), 0);
}
/* ---------- heating zones ----------
   Heated rooms joined by an open connection (no wall, for example a kitchen open to the living room, or a hall open to the
   stairwell) share their warmth. For the emitters they count as one zone: the heat loss of all rooms together against the
   output of all radiators and floor heating in them. ISSO 51 also allows open-connected rooms to be taken as one room. */
let _zoneKey = '',
  _zones = null;
function heatZones() {
  const key = JSON.stringify(
    P.rooms.map(r => [r.id, r.floorId, r.spanTo, r.heated, r.pts, r.walls.map(w => [w.cuts, w.segs.map(s => s.adj)])])
  );
  if (key === _zoneKey && _zones) return _zones;
  const heated = P.rooms.filter(r => r.heated !== false),
    up = {};
  heated.forEach(r => (up[r.id] = r.id));
  const find = id => (up[id] === id ? id : (up[id] = find(up[id])));
  heated.forEach(r =>
    r.walls.forEach((w, i) => {
      if (!w.segs.some(s => s.adj === 'open')) return;
      w.segs.forEach((s, j) => {
        if (s.adj !== 'open') return;
        // only when the other side is open as well: a stairwell running through several floors can touch rooms
        // that have an ordinary wall there
        partnersOf(r, i, j).forEach(p => {
          const back = p.o.walls[p.k] && p.o.walls[p.k].segs[p.jj];
          if (up[p.o.id] == null || !back || back.adj !== 'open') return; // an unheated room is not part of a zone
          up[find(p.o.id)] = find(r.id);
        });
      });
    })
  );
  const groups = {};
  heated.forEach(r => (groups[find(r.id)] = groups[find(r.id)] || []).push(r));
  const map = new Map();
  Object.values(groups).forEach(rooms => {
    const ems = rooms.flatMap(r => (r.emitters || []).map(em => ({ em, room: r })));
    // the room with the most (nominal) output leads, its name first; without emitters the largest room.
    // Nominal, not at the design temperatures: those depend on the flow, which depends on the zones.
    const out = r => (r.emitters || []).reduce((a, e) => a + (e.kind === 'vv' ? emArea(e) * 60 : +e.p || 0), 0),
      lead = rooms.slice().sort((a, b) => out(b) - out(a) || Math.abs(polyArea(b.pts)) - Math.abs(polyArea(a.pts)))[0];
    const z = {
      id: lead.id,
      rooms,
      ems,
      lead,
      multi: rooms.length > 1,
      name: [lead, ...rooms.filter(r => r !== lead)].map(r => r.name).join(' + ')
    };
    rooms.forEach(r => map.set(r.id, z));
  });
  _zoneKey = key;
  _zones = map;
  return map;
}
const zoneOf = room => heatZones().get(room.id) || null;
// all zones, in the order of their first room
const zoneList = () => [...new Set(P.rooms.map(r => zoneOf(r)).filter(Boolean))];
const zoneNeed = z => z.rooms.reduce((a, r) => a + Math.max(0, calcRoom(r).total), 0);
const zoneEmit = (z, ts, tr) => z.ems.reduce((a, x) => a + emOutput(x.em, x.room, ts, tr), 0);
// lowest supply temperature at which the emitters of a zone cover its heat loss
function zoneNeededSupply(z, need, dT) {
  dT = dT || sysDT();
  if (!z.ems.length || need <= 0) return null;
  let lo = Math.max(...z.rooms.map(r => r.temp)) + dT + 0.05,
    hi = 90;
  if (zoneEmit(z, hi, hi - dT) < need) return Infinity;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    if (zoneEmit(z, m, m - dT) >= need) hi = m;
    else lo = m;
  }
  return hi;
}
// crumbs to the rooms of a zone
const zoneLinks = z =>
  z.rooms.map(r => `<button class="crumb" data-act="selroom" data-r="${r.id}">${esc(r.name)}</button>`).join(' + ');

// lowest supply temperature (same ΔT as the design) at which the room's emitters cover its heat loss
function neededSupply(room, need, dT) {
  dT = dT || sysDT();
  if (!(room.emitters || []).length || need <= 0) return null;
  let lo = room.temp + dT + 0.05,
    hi = 90;
  if (roomEmit(room, hi, hi - dT) < need) return Infinity;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    if (roomEmit(room, m, m - dT) >= need) hi = m;
    else lo = m;
  }
  return hi;
}
const vvLoop = em => emArea(em) / ((+em.spacing || 15) / 100) + 10; // pipe in the floor plus ~2×5 m to the manifold
function pointInPoly(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function shiftEm(em, dx, dy) {
  const e = clone(em);
  const m = p => ({ x: r3(p.x + dx), y: r3(p.y + dy) });
  if (e.a) e.a = m(e.a);
  if (e.b) e.b = m(e.b);
  if (e.pts) e.pts = e.pts.map(m);
  return e;
}
function addEmitter(kind, geom) {
  const mid = kind === 'vv' ? centroid(geom.pts) : { x: (geom.a.x + geom.b.x) / 2, y: (geom.a.y + geom.b.y) / 2 };
  const room = curRooms().find(r => pointInPoly(mid, r.pts));
  if (!room) {
    toast('Teken het afgifte-element binnen een ruimte.');
    renderCanvas();
    return;
  }
  pushUndo();
  room.emitters = room.emitters || [];
  const n = room.emitters.length + 1;
  const em =
    kind === 'vv'
      ? {
          id: rid(),
          kind: 'vv',
          name: 'Vloerverwarming' + (n > 1 ? ' ' + n : ''),
          pts: geom.pts,
          spacing: 15,
          cover: 'tegels',
          p: 0,
          n: 1,
          pipe: { mat: 'pex', dn: '16' }
        }
      : {
          id: rid(),
          kind: 'rad',
          name: 'Radiator ' + n,
          a: geom.a,
          b: geom.b,
          p: Math.round(emLen(geom) * 100) * 10,
          n: 1.3,
          pipe: { mat: 'koper', dn: '15' }
        };
  room.emitters.push(em);
  sel = { t: 'em', r: room.id, e: em.id };
  tab = 'sel';
  markDirty();
  renderAll();
  toast(
    kind === 'vv'
      ? `Vloerverwarming toegevoegd aan ${room.name}.`
      : `${em.name} toegevoegd aan ${room.name}. Vul het vermogen van de typeplaat in.`
  );
}
function selEm() {
  const r = selRoom();
  return r && sel.t === 'em' ? (r.emitters || []).find(x => x.id === sel.e) : null;
}
// the minimum flow of the chosen heat pump (from the list), if known
function hpMinFlow() {
  const hp = typeof hpList !== 'undefined' && hpList && hpList.find(x => x.id === hpSel);
  return hp && +hp.minDebiet > 0 ? { hp, q: +hp.minDebiet } : null;
}
function flowWarnHtml() {
  const m = hpMinFlow(),
    q = sysFlow();
  if (!m || !(q > 0) || q >= m.q) return '';
  return `<div class="warnbox">Het debiet (${fmtW(q)} l/h) is lager dan het minimale debiet van de ${esc(m.hp.merk)} ${esc(m.hp.model)} (${fmtW(m.q)} l/h). Dan gaat de warmtepomp pendelen of in storing. Stel het debiet in op minstens ${fmtW(m.q)} l/h: de ΔT wordt kleiner en de radiatoren geven meer af. Kan het afgiftesysteem dat debiet niet aan (te veel drukverlies), dan is een buffervat tussen aanvoer en retour nodig, zodat de warmtepomp zijn eigen debiet kan rondpompen.</div>`;
}
function twFieldsHtml() {
  const S = P.settings,
    fixed = +S.flow > 0,
    q = sysFlow();
  return `<div class="card"><b>Afgiftesysteem</b><div class="fields">${numField('f-tw-s', 'set.twSup', 'Aanvoertemperatuur', '°C', S.twSup, 1)}${fixed ? '' : numField('f-tw-r', 'set.twRet', 'Retourtemperatuur', '°C', S.twRet, 1)}${numField('f-tw-q', 'set.flow', 'Debiet warmtepomp', 'l/h', fixed ? S.flow : 0, 0)}</div>
  <div class="det">${fixed ? `Debiet ${fmtW(S.flow)} l/h → ΔT ${fmt(sysDT(), 1)} K → retour ${fmt(tRet(), 1)} °C` : `ΔT ${fmt(sysDT(), 1)} K → debiet ${q > 0 ? fmtW(q) : '–'} l/h`} bij een ontwerpvermogen van ${fmt(designLoad() / 1000, 2)} kW</div>
  ${flowWarnHtml()}
  <p class="note">Alle afgiftevermogens worden bij deze temperaturen berekend. Geldt voor het hele project. Vul je een debiet in (bijvoorbeeld wat de warmtepomp minimaal rondpompt), dan volgt de retourtemperatuur daaruit: ΔT = vermogen / (1,163 × debiet). Een hoger debiet geeft een hogere gemiddelde watertemperatuur en dus meer afgifte, maar ook meer drukverlies in de leidingen. 0 = het debiet volgt uit de retourtemperatuur.</p></div>`;
}
function pipeChip(pc) {
  return pc.state === 'ok'
    ? `<span class="chip ok">✓ ${fmt(pc.v, 2)} m/s: leiding is ruim genoeg</span>`
    : pc.state === 'krap'
      ? `<span class="chip bad">⚠ ${fmt(pc.v, 2)} m/s: krap, kans op geluid en drukval</span>`
      : `<span class="chip bad">⚠ ${fmt(pc.v, 2)} m/s: leiding te klein</span>`;
}
function roomEmitHtml(room, c) {
  c = c || calcRoom(room);
  const S = P.settings,
    ems = room.emitters || [],
    z = zoneOf(room);
  const fillBtn = `<div class="row"><button class="btn small" data-act="vvfill" data-r="${room.id}">Vloerverwarming in de hele ruimte</button></div>`;
  const multi = z && z.multi,
    others = multi ? z.ems.filter(x => x.room !== room) : [];
  if (!ems.length && !others.length)
    return `<h3>Afgifte</h3><p class="note">Nog geen afgifte in deze ruimte. Teken een radiator met <b>Radiator</b> (A) of vloerverwarming met <b>Vloerverw.</b> (H).</p>${radAdviceHtml(room, multi ? zoneNeed(z) : c.total)}${fillBtn}`;
  const emit = multi ? zoneEmit(z) : roomEmit(room),
    need = multi ? zoneNeed(z) : c.total,
    ns = multi ? zoneNeededSupply(z, need) : neededSupply(room, need),
    ok = emit >= need - 1;
  const row = (em, r) => {
    const o = emOutput(em, r),
      pc = pipeCheck(em, o);
    return `<button class="linkrow" data-act="selem" data-r="${r.id}" data-e="${em.id}"><span>${esc(em.name)} <span class="note">· ${EM_KINDS[em.kind]}${em.boost ? ' met boosters' : ''}${r !== room ? ' · in ' + esc(r.name) : ''}${pipeBad(pc) ? ' · ⚠ leiding ' + pc.state : pc.state === 'los' && (P.pipes || []).length ? ' · niet aangesloten' : ''}</span></span><span>${fmt(o / 1000, 2)} kW</span></button>`;
  };
  return `<h3>Afgifte</h3>${
    multi
      ? `<p class="note">${ems.length ? '' : `${esc(room.name)} heeft geen eigen afgifte, maar wordt verwarmd via ${others.length ? [...new Set(others.map(x => x.room.name))].map(esc).join(' en ') : 'de ruimtes ernaast'}. `}Deze ruimte is open verbonden met ${z.rooms
          .filter(r => r !== room)
          .map(r => `<button class="crumb" data-act="selroom" data-r="${r.id}">${esc(r.name)}</button>`)
          .join(
            ', '
          )}: samen één verwarmingszone. De afgifte van alle ruimtes in de zone telt samen tegen het warmteverlies van de hele zone.</p>`
      : ''
  }<div class="kcard"><div class="kh"><span>${multi ? 'Afgifte zone' : 'Afgifte'} bij ${nv(S.twSup, 1)}/${fmt(tRet(), 1)} °C</span><b>${fmt(emit / 1000, 2)} kW</b></div>
    <div class="seglegend"><span style="--c:transparent">warmteverlies ${multi ? 'zone ' : ''}${fmt(need / 1000, 2)} kW${multi ? ` (deze ruimte ${fmt(c.total / 1000, 2)})` : ''}</span></div>
    <div class="row">${ok ? `<span class="chip ok">✓ voldoende${need > 0 ? ` (${fmtW((emit / need) * 100)}%)` : ''}</span>` : `<span class="chip bad">⚠ tekort ${fmt((need - emit) / 1000, 2)} kW</span>`}</div>
    <span class="note">${ns == null ? '' : ns === Infinity ? 'Ook bij 90 °C aanvoer niet voldoende: meer of grotere afgifte nodig.' : `Minimaal nodige aanvoertemperatuur ${multi ? 'in deze zone' : 'in deze ruimte'}: ${fmt(ns, 1)} °C (bij ΔT ${fmt(sysDT(), 1)} K).`}</span></div>
    ${ems.map(em => row(em, room)).join('')}${others.map(x => row(x.em, x.room)).join('')}
    ${radAdviceHtml(room, need, multi ? emit - roomEmit(room) : 0)}${fillBtn}${twFieldsHtml()}`;
}
// how the stated output (75/65/20, fancoil 35/30/20) is converted to the design temperatures
function convHtml(em, room, out) {
  const S = P.settings,
    nom = EM_NOM[em.kind] || EM_NOM.rad,
    n = em.n || EM_N[em.kind] || 1.3,
    d0 = lmtd(nom[0], nom[1], nom[2]),
    d1 = lmtd(S.twSup, tRet(), room.temp),
    f = d0 > 0 ? Math.pow(d1 / d0, n) : 0,
    boost = em.boost && (em.kind === 'rad' || em.kind === 'conv') ? 1 + (em.boostPct || 0) / 100 : 1;
  return `<div class="det">Omrekening: ${fmtW(em.p)} W bij ${nom[0]}/${nom[1]}/${nom[2]} °C × (${fmt(d1, 1)} K / ${fmt(d0, 1)} K)^${nv(n, 2)}${boost !== 1 ? ` × ${nv(boost, 2)} (boosters)` : ''}<br><b>= ${fmtW(out)} W bij ${nv(S.twSup, 1)}/${fmt(tRet(), 1)}/${nv(room.temp, 1)} °C</b> (${fmtW(f * boost * 100)}% van het opgegeven vermogen)</div>
  <p class="note">K is het gemiddelde temperatuurverschil tussen water en lucht (logaritmisch). Bij lage aanvoertemperaturen geeft een radiator maar een klein deel van zijn vermogen bij 75/65 °C af: bij 35/30 °C ongeveer een zesde.</p>`;
}
function viewEm(room, em) {
  const S = P.settings,
    out = emOutput(em, room),
    pc = pipeCheck(em, out),
    isV = em.kind === 'vv';
  const kinds = (isV ? ['vv'] : ['rad', 'conv', 'fan'])
    .map(k => `<option value="${k}" ${em.kind === k ? 'selected' : ''}>${EM_KINDS[k]}</option>`)
    .join('');
  let h = `<div class="sec"><button class="crumb" data-act="selroom" data-r="${room.id}">← ${esc(room.name)}</button><input class="title" id="f-em-name" data-f="em.name" value="${esc(em.name)}" aria-label="Naam"></div>
  <div class="kcard"><div class="kh"><span>Afgifte bij ${nv(S.twSup, 1)}/${fmt(tRet(), 1)} °C</span><b>${fmt(out / 1000, 2)} kW</b></div>
    <div class="seglegend"><span style="--c:transparent">${fmtW(pc.lh)} l/h water</span><span style="--c:transparent">inhoud ca. ${fmt(emVolume(em), 1)} l</span><span style="--c:transparent">ruimte ${nv(room.temp, 1)} °C</span></div></div>
  ${isV ? '' : convHtml(em, room, out)}
  ${netEmHtml(em)}
  ${
    em.kind === 'rad' || em.kind === 'conv'
      ? `<label class="f" for="f-em-trv">Thermostaatkraan<select class="in" id="f-em-trv" data-f="em.trv"><option value="" ${em.trv && TRV.kranen[em.trv] ? '' : 'selected'}>Zoals voor het hele huis (${esc((TRV.kranen[S.trv] || TRV.kranen.onbekend || {}).naam || '')})</option>${Object.entries(
          TRV.kranen
        )
          .map(([k, x]) => `<option value="${k}" ${em.trv === k ? 'selected' : ''}>${esc(x.naam)}</option>`)
          .join('')}</select></label>`
      : ''
  }
  <div class="fields"><label class="f" for="f-em-kind">Soort<select class="in" id="f-em-kind" data-f="em.kind" ${isV ? 'disabled' : ''}>${kinds}</select></label>`;
  if (!isV) {
    const nom = EM_NOM[em.kind],
      byType = em.kind === 'rad' && RAD_TYPES[em.rt];
    h += `</div>`;
    if (em.kind === 'rad')
      h += `<label class="f" for="f-em-rt">Vermogen bepalen<select class="in" id="f-em-rt" data-f="em.rt"><option value="" ${byType ? '' : 'selected'}>Zelf invullen (typeplaat of catalogus)</option>${Object.entries(
        RAD_TYPES
      )
        .map(([k, v]) => `<option value="${k}" ${em.rt === k ? 'selected' : ''}>${v[1]}</option>`)
        .join('')}</select></label>`;
    if (byType)
      h += `<div class="fields">${numField('f-em-rh', 'em.rh', 'Hoogte', 'mm', em.rh, 0)}${numField('f-em-rl', 'em.rl', 'Lengte', 'mm', em.rl, 0)}</div>${Math.abs(em.rl - emLen(em) * 1000) > 5 ? `<p class="note">In de tekening is deze radiator ${fmt(emLen(em))} m lang. Vul de lengte opnieuw in of sleep een uiteinde om ze gelijk te maken.</p>` : ''}
      ${em.rh < 250 ? `<div class="warnbox">Een hoogte van ${fmtW(em.rh)} mm is ongebruikelijk laag voor een paneelradiator (meestal 300 tot 900 mm). Klopt de hoogte, of zijn hoogte en lengte verwisseld?</div>` : ''}
      ${em.rh > 1000 ? `<p class="note">Bij een hoge, smalle radiator wijkt het vermogen vaak meer af van deze vuistregel. Neem liever het vermogen uit de tabel van de fabrikant (kies <i>Zelf invullen</i>).</p>` : ''}
      <div class="det">${esc(em.rt)}: ${fmtW(RAD_TYPES[em.rt][0])} W/m bij 600 mm hoog<br>× (${fmtW(em.rh)}/600)^0,9 × ${fmt(em.rl / 1000, 2)} m<br><b>= ${fmtW(em.p)} W bij 75/65/20 °C</b></div>
      <div class="fields">${numField('f-em-n', 'em.n', 'Exponent n', '–', em.n, 2)}</div>
      <p class="note">Indicatief voor stalen paneelradiatoren, ongeveer ±10 %. Weet je merk en model, kies dan <i>Zelf invullen</i> en neem de waarde uit de tabel van de fabrikant. Een andere lengte, ingevuld of door een uiteinde in de tekening te slepen, past het vermogen meteen aan.</p>`;
    else
      h += `<div class="fields">${numField('f-em-p', 'em.p', `Vermogen bij ${nom[0]}/${nom[1]}/${nom[2]} °C`, 'W', em.p, 0) + numField('f-em-n', 'em.n', 'Exponent n', '–', em.n, 2)}</div>
    <div class="fields">${numField('f-em-len', 'em.len', 'Lengte', 'mm', Math.round(emLen(em) * 1000), 0)}${
      em.kind === 'conv'
        ? `<label class="f" for="f-em-loops">Aantal lussen<select class="in" id="f-em-loops" data-f="em.loops">${[
            [1, '1 (enkel)'],
            [2, '2 (dubbel)'],
            [3, '3'],
            [4, '4']
          ]
            .map(([v, l]) => `<option value="${v}" ${(em.loops || 1) === v ? 'selected' : ''}>${l}</option>`)
            .join('')}</select></label>`
        : ''
    }${''}</div>
    <p class="note">${em.kind === 'conv' ? 'Bij convectoren hangt het vermogen sterk af van de bouwhoogte, de lamellen en de inbouw (vloerput, omkasting). Neem de waarde uit de catalogus van de fabrikant bij 75/65/20 °C. ' : em.kind === 'rad' ? 'Vul het vermogen van de typeplaat of uit de documentatie in (EN 442, 75/65/20 °C), of laat het afleiden uit type, hoogte en lengte. ' : 'Vul het vermogen uit de documentatie in (fancoils worden meestal bij 35 °C opgegeven). '}De app rekent het om naar ${nv(S.twSup, 1)}/${fmt(tRet(), 1)} °C met exponent n (radiator 1,3, convector 1,4, fancoil 1,0). De lengte verander je hier of door een uiteinde in de tekening te slepen; het vermogen blijft dan wat je hebt ingevuld.</p>`;
    h += `${
      em.kind === 'rad' || em.kind === 'conv'
        ? `<div class="card"><label class="chk"><input type="checkbox" id="f-em-boost" data-f="em.boost" ${em.boost ? 'checked' : ''}> Voorzien van boosters (ventilatoren)</label>
      ${
        em.boost
          ? `<div class="fields">${numField('f-em-bp', 'em.boostPct', 'Meerafgifte door boosters', '%', em.boostPct, 0)}</div>
      <p class="note">Zonder boosters ${fmt(emOutput({ ...em, boost: false }, room) / 1000, 2)} kW, met boosters ${fmt(out / 1000, 2)} kW. Fabrikanten noemen bij lage watertemperatuur 30 tot 100% meer afgifte, afhankelijk van radiatortype en aantal ventilatoren. 40% is een voorzichtige waarde; gebruik bij voorkeur de opgave van de fabrikant.</p>`
          : ''
      }</div>`
        : ''
    }`;
  } else
    h += `<label class="f" for="f-em-sp">Hart-op-hart<select class="in" id="f-em-sp" data-f="em.spacing">${[10, 15, 20].map(v => `<option value="${v}" ${+em.spacing === v ? 'selected' : ''}>${v} cm</option>`).join('')}</select></label>
    <label class="f" for="f-em-cov">Vloerafwerking<select class="in" id="f-em-cov" data-f="em.cover">${Object.entries(
      VV_COVER
    )
      .map(([k, [l, R]]) => `<option value="${k}" ${em.cover === k ? 'selected' : ''}>${l} (R ${nv(R, 2)})</option>`)
      .join('')}</select></label></div>
    <p class="note">Oppervlak ${fmt(emArea(em), 1)} m² · ${fmtW(emArea(em) > 0 ? out / emArea(em) : 0)} W/m² · leiding ca. ${fmtW(vvLoop(em))} m${vvLoop(em) > 100 ? ' <b style="color:var(--warn)">⚠ meer dan 100 m: verdeel over twee groepen</b>' : ''}. Indicatieve afgifte volgens EN 1264 (dekvloer ca. 45 mm), begrensd op een vloertemperatuur van 29 °C.</p>
    <p class="note">Vorm aanpassen: sleep een hoekpunt, klik op een + halverwege een zijde om een hoekpunt toe te voegen, en dubbelklik op een hoekpunt om het weg te halen.</p>`;
  h += `<div class="sec"><h3>Aansluitleiding</h3>${
    pc.pp
      ? `<button class="linkrow" data-act="selpipe" data-p="${pc.pp.id}"><span>${esc(pc.pp.name)} <span class="note">· ${esc((PIPES[pc.pp.mat] || PIPES.koper).label)} ${esc(dnLabel(pc.pp.mat, pc.pp.dn))}</span></span><span>›</span></button>
    <div class="row">${pipeChip(pc)}</div>
    <p class="note">De aansluitleiding is de getekende leiding waar dit element aan hangt. Waterdebiet ${fmtW(pc.lh)} l/h bij ΔT ${fmt(sysDT(), 1)} K. Deze leiding transporteert bij ${nv(V_OK, 1)} m/s ongeveer ${fmt(pc.pmax / 1000, 2)} kW. Boven ${nv(V_OK, 1)} m/s nemen geluid en drukval toe; boven ${nv(V_MAX, 1)} m/s is de leiding te klein. Een andere maat kies je bij de leiding zelf.</p>`
      : `<p class="note">Nog geen leiding aangesloten. Teken met <b>Leiding</b> (L) een leiding die eindigt bij dit element (binnen ${nv(ATTACH * 100, 0)} cm). Daarna kiest de app de aansluitleiding zelf en rekent hij debiet, snelheid en drukverlies uit. Waterdebiet nu: ${fmtW(pc.lh)} l/h.</p>`
  }</div>
  ${twFieldsHtml()}
  <div class="row"><button class="btn danger" data-act="delem">Verwijderen</button></div>`;
  return h;
}
function emitOverviewHtml(c) {
  const S = P.settings,
    N = (P.pipes || []).length ? network() : null;
  let maxNs = 0,
    any = false,
    pipes = 0;
  const rows = zoneList()
    .map(z => {
      const need = zoneNeed(z),
        lab = z.multi
          ? zoneLinks(z)
          : `<button class="crumb" data-act="selroom" data-r="${z.lead.id}">${esc(z.lead.name)}</button>`;
      if (!z.ems.length)
        return `<tr><td>${lab}</td><td>${fmt(need / 1000, 2)}</td><td>–</td><td colspan="2" style="font-family:var(--font-body);color:var(--muted)">geen afgifte</td></tr>`;
      any = true;
      const e = zoneEmit(z),
        ns = zoneNeededSupply(z, need);
      if (ns === Infinity) maxNs = Infinity;
      else if (ns != null) maxNs = Math.max(maxNs, ns);
      z.ems.forEach(x => {
        if (pipeBad(pipeCheck(x.em, emOutput(x.em, x.room), N))) pipes++;
      });
      const ok = e >= need - 1;
      return `<tr class="${ok ? '' : 'miss'}"><td>${lab}${z.multi ? '<small>open verbonden: één zone</small>' : ''}</td><td>${fmt(need / 1000, 2)}</td><td>${fmt(e / 1000, 2)}</td><td>${ok ? '✓' : '⚠ ' + fmt((need - e) / 1000, 2)}</td><td>${ns == null ? '–' : ns === Infinity ? '> 90' : fmt(ns, 0)}</td></tr>`;
    })
    .join('');
  return `<div class="sec"><h3>Afgifte</h3>${twFieldsHtml()}
    ${
      any
        ? `<div class="kcard"><div class="kh"><span>Minimaal nodige aanvoertemperatuur</span><b>${maxNs === Infinity ? '> 90' : fmt(maxNs, 0)} °C</b></div>
      <span class="note">De ruimte met de zwaarste vraag bepaalt de aanvoertemperatuur van de hele installatie. Ruimtes die open met elkaar verbonden zijn (geen wand ertussen), rekenen samen als één zone. Ruimtes zonder afgifte, ook niet in hun zone, tellen niet mee.${pipes ? ` <b style="color:var(--warn)">⚠ ${pipes} aansluitleiding${pipes > 1 ? 'en zijn' : ' is'} krap of te klein.</b>` : ''}</span></div>`
        : ''
    }
    <div class="tablewrap"><table class="calc"><thead><tr><th>Ruimte</th><th>Verlies kW</th><th>Afgifte kW</th><th>Status</th><th>Aanvoer °C</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

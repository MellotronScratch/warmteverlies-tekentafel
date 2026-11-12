// Leidingnet als netwerk: van de warmtepomp via de leidingen naar de radiatoren, convectoren en vloerverwarming.
// Daaruit: debiet per leidingstuk, drukverlies, het indexcircuit (de route met het grootste drukverlies) en inregeladvies.
'use strict';
/* ---------- hydraulics ----------
   - Knooppunten: hoekpunten van leidingen (afgerond op 1 cm). Een leiding die eindigt óp een andere leiding maakt daar een T-stuk.
   - Stijgleidingen: een hoekpunt op dezelfde plek op twee opeenvolgende verdiepingen wordt verbonden met een verticaal stuk.
   - Een afgifte-element hangt aan het dichtstbijzijnde knooppunt binnen ATTACH m (radiator: langs de lijn, vloerverwarming: rand of binnen).
   - De warmtepomp (P.hpPos) hangt aan het dichtstbijzijnde knooppunt binnen ATTACH m. Vanaf daar wordt het net als boom afgelopen.
   - Debiet per element: het aandeel van het element in het warmteverlies van zijn ruimte, bij de ΔT tussen aanvoer en retour.
   - Drukverlies: Darcy-Weisbach (Swamee-Jain), water van ~35 °C, aanvoer + retour, met een opslag voor bochten en koppelingen. */
const ATTACH = 0.3; // m
const WATER = { rho: 994, nu: 0.72e-6 }; // kg/m³, m²/s bij ~35 °C
const ROUGH = { koper: 0.0015e-3, pex: 0.007e-3, staal: 0.045e-3 }; // wandruwheid in m
const EM_DP = { rad: 3, conv: 3, fan: 10 }; // kPa over element + kraan, indicatief
const VV_MANIFOLD_DP = 2; // kPa over de verdeler

const nodeKey = (f, p) => f + '|' + Math.round(p.x * 100) + '|' + Math.round(p.y * 100);
const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const lhOf = (W, dT) => W / (1.163 * Math.max(0.5, dT)); // l/h bij vermogen W en ΔT K

// drukverlies (kPa) over L meter leiding (enkel) met binnendiameter d (mm), debiet q (l/h); ×2 voor aanvoer + retour als both
function pipeDp(mat, dmm, L, lh, both) {
  if (!(lh > 0) || !(L > 0)) return { dp: 0, v: 0 };
  const d = dmm / 1000,
    A = (Math.PI * d * d) / 4,
    v = lh / 3.6e6 / A,
    Re = (v * d) / WATER.nu,
    eps = ROUGH[mat] || ROUGH.koper;
  const lam = Re < 2300 ? 64 / Re : 0.25 / Math.pow(Math.log10(eps / (3.7 * d) + 5.74 / Math.pow(Re, 0.9)), 2);
  return { dp: ((((lam * L) / d) * WATER.rho * v * v) / 2 / 1000) * (both ? 2 : 1), v };
}

// distance from point p to an emitter (where a pipe can connect)
function emDist(em, p) {
  if (em.kind === 'vv') {
    if (pointInPoly(p, em.pts)) return 0;
    let d = Infinity;
    em.pts.forEach((a, i) => {
      const b = em.pts[(i + 1) % em.pts.length],
        h = onSeg(p, a, b, Infinity);
      if (h) d = Math.min(d, dist(p, h.q));
    });
    return d;
  }
  const h = onSeg(p, em.a, em.b, Infinity);
  return h ? dist(p, h.q) : Math.min(dist(p, em.a), dist(p, em.b));
}

function buildNetwork() {
  const S = P.settings,
    dT = Math.max(0.5, S.twSup - S.twRet),
    el = floorElev(),
    fit = 1 + Math.max(0, +S.fitPct || 0) / 100;
  const nodes = new Map(),
    edges = [];
  const node = (f, p) => {
    const k = nodeKey(f, p);
    if (!nodes.has(k)) nodes.set(k, { k, f, x: p.x, y: p.y, adj: [], ems: [] });
    return nodes.get(k);
  };
  const pipes = P.pipes || [];
  // pipe segments, split where another pipe's point lies on them (T-junction)
  pipes.forEach(pp => {
    let first = true;
    for (let i = 1; i < pp.pts.length; i++) {
      const a = pp.pts[i - 1],
        b = pp.pts[i],
        cuts = [
          { t: 0, p: a },
          { t: 1, p: b }
        ];
      pipes.forEach(o => {
        if (o.floorId !== pp.floorId) return;
        o.pts.forEach(q => {
          const h = onSeg(q, a, b, 0.02);
          if (h && h.t > 1e-4 && h.t < 1 - 1e-4) cuts.push({ t: h.t, p: q });
        });
      });
      cuts.sort((x, y) => x.t - y.t);
      for (let c = 1; c < cuts.length; c++) {
        if (cuts[c].t - cuts[c - 1].t < 1e-6) continue;
        const n0 = node(pp.floorId, cuts[c - 1].p),
          n1 = node(pp.floorId, cuts[c].p);
        if (n0 === n1) continue;
        edges.push({ a: n0, b: n1, pp, L: dist(cuts[c - 1].p, cuts[c].p) + (first ? pp.extra : 0), vert: false });
        first = false;
      }
    }
  });
  // risers: the same point on two consecutive floors
  const fidx = id => floorIdx(id);
  [...nodes.values()].forEach(n => {
    const up = P.floors[fidx(n.f) + 1];
    if (!up) return;
    const m = nodes.get(nodeKey(up.id, n));
    if (m) {
      // the riser runs from the floor of one storey to the next; the pipe material is that of a pipe at the lower point
      const pp = (edges.find(e => e.a === n || e.b === n) || {}).pp;
      edges.push({ a: n, b: m, pp, L: Math.max(0, (el[up.id] || 0) - (el[n.f] || 0)), vert: true });
    }
  });
  edges.forEach(e => {
    e.a.adj.push(e);
    e.b.adj.push(e);
  });
  const nearest = (f, distFn) => {
    let best = null,
      bd = ATTACH;
    nodes.forEach(n => {
      if (n.f !== f) return;
      const d = distFn(n);
      if (d <= bd) {
        bd = d;
        best = n;
      }
    });
    return best;
  };
  // emitters and their design flow: their share of the heat loss of the room
  const ems = [];
  P.rooms.forEach(r => {
    const list = (r.emitters || []).filter(em => em.kind === 'vv' || (em.a && em.b));
    if (!list.length) return;
    const outs = list.map(em => emOutput(em, r)),
      sum = outs.reduce((a, x) => a + x, 0),
      need = Math.max(0, calcRoom(r).total);
    list.forEach((em, i) => {
      const W = sum > 0 ? (need * outs[i]) / sum : 0,
        n = nearest(r.floorId, nd => emDist(em, nd));
      const o = { em, room: r, node: n, W, lh: lhOf(W, dT), reach: false };
      if (n) n.ems.push(o);
      ems.push(o);
    });
  });
  const hp = P.hpPos;
  const root = hp ? nearest(hp.floorId, nd => dist(nd, hp)) : null;
  // walk the tree from the heat pump
  let loops = 0;
  const order = [];
  if (root) {
    root.parent = null;
    root.depth = 0;
    const seen = new Set([root]),
      used = new Set(),
      q = [root];
    while (q.length) {
      const n = q.shift();
      order.push(n);
      n.adj.forEach(e => {
        if (used.has(e)) return;
        used.add(e);
        const m = e.a === n ? e.b : e.a;
        if (seen.has(m)) {
          loops++;
          return;
        }
        seen.add(m);
        m.parent = e;
        m.up = n;
        e.down = m;
        e.inTree = true;
        q.push(m);
      });
    }
  }
  // flow per edge (from the far end back to the heat pump)
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    n.lh =
      n.ems.reduce((a, o) => a + o.lh, 0) +
      n.adj.filter(e => e.inTree && e.down !== n && e.down).reduce((a, e) => a + e.down.lh, 0);
    if (n.parent) n.parent.lh = n.lh;
  }
  // pressure drop per edge and accumulated from the heat pump
  edges.forEach(e => {
    if (!e.inTree) return;
    const mat = e.pp ? e.pp.mat : 'koper',
      dn = e.pp ? e.pp.dn : '22',
      dmm = (PIPES[mat] || PIPES.koper).d[dn] || 20,
      r = pipeDp(mat, dmm, e.L * fit, e.lh, true);
    e.dp = r.dp;
    e.v = r.v;
  });
  order.forEach(n => (n.cum = n.parent ? n.up.cum + n.parent.dp : 0));
  ems.forEach(o => {
    o.reach = !!(o.node && order.includes(o.node));
    if (o.em.kind === 'vv') {
      // floor heating: parallel groups of at most 100 m pipe, each carrying its share of the flow
      const loop = vvLoop(o.em),
        groups = Math.max(1, Math.ceil(loop / 100));
      o.groups = groups;
      o.dpEm =
        pipeDp('pex', (PIPES.pex && PIPES.pex.d['16']) || 12, (loop / groups) * fit, o.lh / groups, false).dp +
        VV_MANIFOLD_DP;
    } else o.dpEm = EM_DP[o.em.kind] || 3;
    o.dpPath = o.reach ? o.node.cum : NaN;
    o.dpTot = o.reach ? o.dpPath + o.dpEm : NaN;
  });
  const reached = ems.filter(o => o.reach && o.lh > 0),
    index = reached.reduce((b, o) => (!b || o.dpTot > b.dpTot ? o : b), null);
  // edges of the index circuit
  const indexEdges = new Set();
  if (index) for (let n = index.node; n && n.parent; n = n.up) indexEdges.add(n.parent);
  return {
    hp,
    root,
    nodes,
    edges,
    ems,
    loops,
    index,
    indexEdges,
    total: reached.reduce((a, o) => a + o.lh, 0),
    dT,
    loose: edges.filter(e => !e.inTree).length
  };
}

// one network per render; rebuilt when something changes
let _net = null,
  _netKey = '';
function network() {
  const key =
    JSON.stringify([
      P.pipes,
      P.hpPos,
      P.settings.twSup,
      P.settings.twRet,
      P.settings.fitPct,
      P.rooms.map(r => [r.id, r.floorId, r.emitters, r.temp])
    ]) + calcAll().total;
  if (key !== _netKey) {
    _netKey = key;
    _net = buildNetwork();
  }
  return _net;
}

/* ---------- panels ---------- */
function viewHp() {
  const N = network();
  return `<div class="sec"><button class="crumb" data-act="desel">← Alle ruimtes</button><h2>Warmtepomp</h2>
    <p class="note">Het beginpunt van het leidingnet: de warmtepomp of de plek waar de leidingen van het buitendeel binnenkomen. Sleep het blokje om het te verplaatsen.</p></div>
  <div class="fields">${floorSelect('f-hp-fl', 'hp.floorId', P.hpPos.floorId)}</div>
  <div class="det">${N.root ? `Aangesloten op het leidingnet · ${fmtW(N.total)} l/h${N.index ? ` · indexcircuit ${fmt(N.index.dpTot, 1)} kPa` : ''}` : 'Nog niet aangesloten: laat een leiding hier beginnen.'}</div>
  <div class="row"><button class="btn danger" data-act="delhp">Warmtepomp weghalen</button></div>`;
}
function vState(v) {
  return v > V_MAX ? 'bad' : v > V_OK ? 'warn' : 'ok';
}
function netEmHtml(em) {
  if (!(P.pipes || []).length) return '';
  const N = network(),
    o = N.ems.find(x => x.em === em);
  if (!o) return '';
  if (!o.node)
    return `<p class="note">Niet aangesloten op het leidingnet: laat een leiding eindigen bij dit element (binnen ${nv(ATTACH * 100, 0)} cm).</p>`;
  if (!o.reach) return `<p class="note">Aangesloten op een leiding, maar die is niet verbonden met de warmtepomp.</p>`;
  const extra = N.index ? N.index.dpTot - o.dpTot : 0;
  return `<div class="det">Leidingnet: ${fmtW(o.lh)} l/h · drukverlies tot de warmtepomp ${fmt(o.dpPath, 1)} kPa + ${o.groups ? (o.groups > 1 ? o.groups + ' groepen vloerverwarming' : 'vloerverwarming') : 'element'} ${fmt(o.dpEm, 1)} kPa = ${fmt(o.dpTot, 1)} kPa${
    N.index && N.index.em === em
      ? '<br><b>Dit is het indexcircuit.</b>'
      : extra > 0.05
        ? `<br>Inregelen: ${fmt(extra, 1)} kPa extra weerstand (voorinstelling kraan)`
        : ''
  }</div>`;
}
function netPipeHtml(pp) {
  const N = network(),
    es = N.edges.filter(e => e.pp === pp && !e.vert);
  if (!N.root)
    return '<p class="note">Plaats de warmtepomp met <b>Warmtepomp</b> (K) om debiet en drukverlies te zien.</p>';
  const tr = es.filter(e => e.inTree);
  if (!tr.length) return '<p class="note">Deze leiding is niet verbonden met de warmtepomp.</p>';
  const maxQ = Math.max(...tr.map(e => e.lh)),
    maxV = Math.max(...tr.map(e => e.v)),
    dp = tr.reduce((a, e) => a + e.dp, 0),
    st = vState(maxV);
  return `<div class="det">Debiet tot ${fmtW(maxQ)} l/h · snelheid tot ${fmt(maxV, 2)} m/s · drukverlies ${fmt(dp, 2)} kPa (aanvoer + retour)</div>${
    st === 'ok'
      ? ''
      : `<p class="note" style="color:var(--warn)">⚠ ${st === 'bad' ? 'Te hoge snelheid' : 'Vrij hoge snelheid'}: kies een grotere diameter (richtwaarde tot ${nv(V_OK, 1)} m/s).</p>`
  }`;
}
function networkHtml() {
  if (!(P.pipes || []).length && !P.hpPos) return '';
  const N = network(),
    S = P.settings;
  let h = `<div class="sec"><h3>Leidingnet en indexcircuit</h3>`;
  if (!N.hp)
    return (
      h +
      `<p class="note">Plaats de warmtepomp in de tekening met <b>Warmtepomp</b> (K). Daarna rekent de app het debiet en drukverlies van het leidingnet uit.</p></div>`
    );
  if (!N.root)
    return (
      h +
      `<p class="note" style="color:var(--warn)">⚠ De warmtepomp is niet verbonden met een leiding. Laat een leiding beginnen bij de warmtepomp (binnen ${nv(ATTACH * 100, 0)} cm).</p></div>`
    );
  const reached = N.ems.filter(o => o.reach),
    loose = N.ems.filter(o => !o.reach),
    fast = N.edges.filter(e => e.inTree && e.v > V_OK);
  h += `<div class="kcard"><div class="kh"><span>Indexcircuit</span><b>${N.index ? fmt(N.index.dpTot, 1) + ' kPa' : '–'}</b></div>
    <span class="note">${N.index ? `Naar ${esc(N.index.em.name)} in ${esc(N.index.room.name)}: leidingen ${fmt(N.index.dpPath, 1)} kPa + element ${fmt(N.index.dpEm, 1)} kPa. Dit is het drukverlies dat de pomp moet overwinnen bij ${fmtW(N.total)} l/h (ΔT ${nv(N.dT, 1)} K).` : 'Nog geen aangesloten afgifte met een warmteverlies.'}</span>
    ${(() => {
      const hp = hpList && hpList.find(x => x.id === hpSel);
      if (!hp || !(+hp.restopvoerhoogte > 0) || !N.index) return '';
      const ok = +hp.restopvoerhoogte >= N.index.dpTot;
      return `<div class="row">${ok ? `<span class="chip ok">✓ ${esc(hp.merk)} ${esc(hp.model)} levert ${fmt(+hp.restopvoerhoogte, 0)} kPa</span>` : `<span class="chip bad">⚠ ${esc(hp.merk)} ${esc(hp.model)} levert maar ${fmt(+hp.restopvoerhoogte, 0)} kPa</span>`}</div>`;
    })()}</div>`;
  if (N.loops)
    h += `<p class="note" style="color:var(--warn)">⚠ Het leidingnet bevat een rondgaande verbinding (lus). De app rekent met een boom en slaat ${N.loops} verbinding(en) over.</p>`;
  if (loose.length)
    h += `<p class="note" style="color:var(--warn)">⚠ Niet aangesloten: ${loose.map(o => esc(o.room.name) + ' · ' + esc(o.em.name)).join(', ')}.</p>`;
  if (fast.length)
    h += `<p class="note" style="color:var(--warn)">⚠ ${fast.length} leidingstuk(ken) boven ${nv(V_OK, 1)} m/s: ${[...new Set(fast.map(e => (e.pp ? e.pp.name : 'stijgleiding')))].map(esc).join(', ')}.</p>`;
  if (reached.length) {
    h += `<div class="tablewrap"><table class="calc"><thead><tr><th>Element</th><th>l/h</th><th>Δp kPa</th><th>Inregelen</th></tr></thead><tbody>`;
    reached
      .slice()
      .sort((a, b) => b.dpTot - a.dpTot)
      .forEach(o => {
        const extra = N.index ? N.index.dpTot - o.dpTot : 0;
        h += `<tr><td><button class="crumb" data-act="selem" data-r="${o.room.id}" data-e="${o.em.id}">${esc(o.em.name)}</button><small>${esc(o.room.name)}</small></td><td>${fmtW(o.lh)}</td><td>${fmt(o.dpTot, 1)}</td><td>${N.index && N.index.em === o.em ? 'index' : '+' + fmt(extra, 1) + ' kPa'}</td></tr>`;
      });
    h += `</tbody></table></div>`;
  }
  h += `<div class="fields">${numField('f-s-fit', 'set.fitPct', 'Opslag bochten en koppelingen', '%', S.fitPct, 0)}</div>
    <p class="note">Debiet per element: zijn aandeel in het warmteverlies van de ruimte bij ΔT ${nv(N.dT, 1)} K. Drukverlies van de leidingen met Darcy-Weisbach (water van 35 °C, aanvoer + retour), plus de opslag voor bochten en koppelingen. Per element rekent de app indicatief ${nv(EM_DP.rad, 0)} kPa voor radiator of convector met kraan, ${nv(EM_DP.fan, 0)} kPa voor een fancoil, en bij vloerverwarming de lussen van 16×2 (verdeeld over groepen van hoogstens 100 m) plus ${nv(VV_MANIFOLD_DP, 0)} kPa voor de verdeler. Bij <i>Inregelen</i> staat hoeveel extra weerstand een element nodig heeft om niet meer water te krijgen dan het indexcircuit.</p>
    <p class="note">Stijgleidingen: laat leidingen op twee verdiepingen op precies hetzelfde punt eindigen. Dan worden ze verticaal verbonden. Het indexcircuit licht oranje op in de plattegrond.</p></div>`;
  return h;
}

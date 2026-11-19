// Leidingnet als netwerk: van de warmtepomp via de leidingen naar de radiatoren, convectoren en vloerverwarming.
// Daaruit: debiet per leidingstuk, drukverlies, het indexcircuit (de route met het grootste drukverlies) en inregeladvies.
'use strict';
/* ---------- hydraulics ----------
   - Knooppunten: hoekpunten van leidingen (afgerond op 1 cm). Een leiding die eindigt óp een andere leiding maakt daar een T-stuk.
   - Elke leiding ligt op een hoogte boven zijn vloer (langs de vloer, langs het plafond of op eigen hoogte).
   - Stijgleidingen (P.risers): een verticaal stuk op één plek van de ene verdieping naar de andere. Alle leidingpunten binnen
     RISER_TOL op die verdiepingen zijn erop aangesloten, ook een leiding die er langs loopt (T-stuk).
   - Leidingen op verschillende hoogte die op dezelfde plek samenkomen, worden verticaal verbonden. Ligt een leiding hoger dan
     een radiator of de warmtepomp, dan telt het stuk omlaag mee.
   - Een afgifte-element hangt aan het dichtstbijzijnde knooppunt binnen ATTACH m (radiator: langs de lijn, vloerverwarming: rand of binnen).
   - De warmtepomp (P.hpPos) hangt aan het dichtstbijzijnde knooppunt binnen ATTACH m. Vanaf daar wordt het net als boom afgelopen.
   - Debiet per element: het aandeel van het element in het warmteverlies van zijn ruimte, bij de ΔT tussen aanvoer en retour.
   - Drukverlies: Darcy-Weisbach (Swamee-Jain), water van ~35 °C, aanvoer + retour, met een opslag voor bochten en koppelingen. */
const ATTACH = 0.3; // m
const WATER = { rho: 994, nu: 0.72e-6 }; // kg/m³, m²/s bij ~35 °C
const ROUGH = { koper: 0.0015e-3, pex: 0.007e-3, staal: 0.045e-3 }; // wandruwheid in m
const EM_DP = { rad: 3, conv: 3, fan: 10 }; // kPa over element + kraan, indicatief
const VV_MANIFOLD_DP = 2; // kPa over de verdeler
const RISER_TOL = 0.05; // m: een leidingpunt zo dicht bij een stijgleiding is erop aangesloten
const EM_Z = 0.1; // m boven de vloer: waar een radiator of convector is aangesloten

const nodeKey = (f, p) => f + '|' + Math.round(p.x * 100) + '|' + Math.round(p.y * 100);
const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const lhOf = (W, dT) => W / (1.163 * Math.max(0.5, dT)); // l/h bij vermogen W en ΔT K
const kvDp = (lh, kv) => (kv > 0 ? 100 * Math.pow(lh / 1000 / kv, 2) : 0); // kPa over een kv bij lh l/h

// the thermostatic valve of a radiator or convector: its own choice, otherwise the one for the whole house
const trvOf = em =>
  em.kind === 'rad' || em.kind === 'conv'
    ? TRV.kranen[em.trv] || TRV.kranen[P.settings.trv] || TRV.kranen.onbekend || null
    : null;
// flow limiter: minimum differential pressure at a flow. 'dpStappen' [[up to l/h, kPa], …], or the older
// dpMin with dpMinHoog above debietHoog l/h
function trvDpMin(v, lh) {
  const st = Array.isArray(v.dpStappen) ? v.dpStappen : [];
  if (st.length) return (st.find(s => lh <= s[0]) || st[st.length - 1])[1];
  return lh > v.debietHoog && v.dpMinHoog ? v.dpMinHoog : v.dpMin;
}
// the same as text: "10 kPa (15 kPa boven 130 l/h)"
function trvDpText(v) {
  const st = Array.isArray(v.dpStappen) ? v.dpStappen : [];
  if (st.length > 1)
    return `${nv(st[0][1], 0)} kPa (${st
      .slice(1)
      .map((s, i) => `${nv(s[1], 0)} kPa boven ${nv(st[i][0], 0)} l/h`)
      .join(', ')})`;
  if (st.length) return `${nv(st[0][1], 0)} kPa`;
  return `${nv(v.dpMin, 0)} kPa${v.dpMinHoog > v.dpMin && v.debietHoog ? ` (${nv(v.dpMinHoog, 0)} kPa boven ${nv(v.debietHoog, 0)} l/h)` : ''}`;
}
// the preset that gives an element its design flow, when the index circuit sets the pressure
function presetFor(o, index) {
  const v = o.trv;
  if (!v || !index) return null;
  if (v.soort === 'hand') {
    // a manual valve stays fully open; the lockshield (voetventiel) adds the resistance this circuit has too little
    const extra = index.dpTot - o.dpTot;
    if (o === index || !(extra > 0.05)) return { kind: 'voet', open: true, index: o === index };
    return { kind: 'voet', extra, kvNeed: o.lh / 1000 / Math.sqrt(extra / 100) };
  }
  const avail = index.dpTot - o.dpPath - TRV.lichaam; // kPa left for the valve
  if (v.soort === 'debiet') {
    const noisy = avail > v.dpMax;
    // fixed settings (for example Danfoss RA-DV): the smallest setting that lets the design flow through
    if (Array.isArray(v.standen) && v.standen.length) {
      const st = v.standen,
        last = st[st.length - 1],
        pick = st.find(x => x[1] >= o.lh - 0.5) || last;
      return {
        kind: 'debiet',
        s: pick[1],
        stand: pick[0],
        over: o.lh > last[1] + 0.5,
        under: o.lh < st[0][1],
        noisy,
        avail
      };
    }
    const s = Math.max(v.min, Math.min(v.max, Math.round(o.lh / 5) * 5));
    return { kind: 'debiet', s, over: o.lh > v.max + 0.5, under: o.lh < v.min, noisy, avail };
  }
  if (v.soort !== 'kv' || !(v.standen || []).length) return null;
  const st = v.standen,
    last = st[st.length - 1];
  if (o === index || !(avail > 0)) return { kind: 'kv', s: last[0], kv: last[1], index: o === index, avail };
  const kvNeed = o.lh / 1000 / Math.sqrt(avail / 100);
  let best = st[0];
  st.forEach(x => {
    if (Math.abs(Math.log(x[1] / kvNeed)) < Math.abs(Math.log(best[1] / kvNeed))) best = x;
  });
  return {
    kind: 'kv',
    s: best[0],
    kv: best[1],
    kvNeed,
    pct: (best[1] / kvNeed) * 100, // flow at this preset compared with the design flow
    low: kvNeed < st[0][1] * 0.9,
    avail
  };
}
// short text for tables: the preset, or the extra resistance for a valve without presets
function presetText(o, N) {
  if (o.preset && o.preset.kind === 'voet')
    return o.preset.open
      ? 'voetventiel open'
      : `voetventiel kv ${nv(o.preset.kvNeed, 2)} (+${fmt(o.preset.extra, 1)} kPa)`;
  if (N.index && N.index.em === o.em && (!o.preset || o.preset.kind !== 'debiet'))
    return o.preset ? 'index · ' + o.preset.s : 'index';
  if (o.preset && o.preset.kind === 'kv') return 'stand ' + o.preset.s;
  if (o.preset && o.preset.kind === 'debiet')
    return (o.preset.stand != null ? 'stand ' + o.preset.stand + ' · ' : '') + fmtW(o.preset.s) + ' l/h';
  const extra = N.index ? N.index.dpTot - o.dpTot : 0;
  return '+' + fmt(extra, 1) + ' kPa';
}

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
    dT = sysDT(),
    el = floorElev(),
    fit = 1 + Math.max(0, +S.fitPct || 0) / 100;
  const nodes = new Map(),
    edges = [];
  // a node is a point on a floor at a height above that floor (m)
  const node = (f, p, z) => {
    const k = nodeKey(f, p) + '|' + Math.round((z || 0) * 100);
    if (!nodes.has(k)) nodes.set(k, { k, f, x: p.x, y: p.y, z: z || 0, adj: [], ems: [] });
    return nodes.get(k);
  };
  const pipes = P.pipes || [],
    risers = (P.risers || []).filter(rs => floorIdx(rs.from) >= 0 && floorIdx(rs.to) > floorIdx(rs.from)),
    onRiser = (rs, f) => floorIdx(f) >= floorIdx(rs.from) && floorIdx(f) <= floorIdx(rs.to);
  // pipe segments, split where another pipe's point or a riser lies on them (T-junction)
  pipes.forEach(pp => {
    let first = true;
    const z = pipeZ(pp);
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
      risers.forEach(rs => {
        if (!onRiser(rs, pp.floorId)) return;
        const h = onSeg(rs, a, b, RISER_TOL);
        if (h && h.t > 1e-4 && h.t < 1 - 1e-4) cuts.push({ t: h.t, p: { x: rs.x, y: rs.y } });
      });
      cuts.sort((x, y) => x.t - y.t);
      for (let c = 1; c < cuts.length; c++) {
        if (cuts[c].t - cuts[c - 1].t < 1e-6) continue;
        const n0 = node(pp.floorId, cuts[c - 1].p, z),
          n1 = node(pp.floorId, cuts[c].p, z);
        if (n0 === n1) continue;
        edges.push({ a: n0, b: n1, pp, L: dist(cuts[c - 1].p, cuts[c].p) + (first ? pp.extra : 0), vert: false });
        first = false;
      }
    }
  });
  // the pipe at a node: a horizontal one, otherwise the vertical piece it hangs on
  const pipeAt = n =>
    (edges.find(e => (e.a === n || e.b === n) && !e.vert) || edges.find(e => (e.a === n || e.b === n) && e.pp) || {})
      .pp;
  // vertical pieces: from bottom to top along the nodes in one place, in order of height
  const chain = (list, ppOf) => {
    list.sort((x, y) => x.abs - y.abs);
    for (let i = 1; i < list.length; i++) {
      const lo = list[i - 1],
        hi = list[i];
      edges.push({ a: lo.n, b: hi.n, pp: ppOf(lo.n, hi.n), L: Math.max(0, hi.abs - lo.abs), vert: true });
    }
  };
  const abs = n => (el[n.f] || 0) + n.z,
    inRiser = new Set();
  // risers: every node on their floors within a few centimetres of them
  risers.forEach(rs =>
    [rs.from, rs.to].forEach(f => {
      if (![...nodes.values()].some(n => n.f === f && dist(n, rs) <= RISER_TOL)) node(f, rs, 0);
    })
  );
  const riserInfo = risers.map(rs => {
    const list = [];
    nodes.forEach(n => {
      if (onRiser(rs, n.f) && dist(n, rs) <= RISER_TOL) {
        inRiser.add(n);
        list.push({ n, abs: abs(n) });
      }
    });
    chain(list, () => rs);
    const lo = list.length ? list[0].abs : el[rs.from] || 0,
      hiN = list.length ? list[list.length - 1] : null;
    // length from the lowest to the highest pipe on it; an end without a pipe counts from or to the floor there
    const bot = list.some(x => x.n.f === rs.from) ? lo : el[rs.from] || 0,
      top = hiN && hiN.n.f === rs.to ? hiN.abs : el[rs.to] || 0;
    return { rs, L: Math.max(0, top - bot), nodes: list.map(x => x.n), bot, top };
  });
  // within one floor: pipes at different heights that meet in the same place
  const groups = new Map();
  nodes.forEach(n => {
    if (inRiser.has(n)) return;
    const k = nodeKey(n.f, n);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ n, abs: abs(n) });
  });
  groups.forEach(list => list.length > 1 && chain(list, (lo, hi) => pipeAt(hi) || pipeAt(lo)));
  // a drop from a pipe higher up to where an emitter or the heat pump connects
  const drop = (n, z) => {
    if (!n || n.z <= z + 0.05) return n;
    const m = node(n.f, n, z);
    if (!m.adj.length && !edges.some(e => e.a === m || e.b === m))
      edges.push({ a: n, b: m, pp: pipeAt(n), L: n.z - z, vert: true });
    return m;
  };
  // the nearest node on a floor; of nodes in the same place, the lowest
  const nearest = (f, distFn) => {
    let best = null,
      bd = ATTACH;
    nodes.forEach(n => {
      if (n.f !== f) return;
      const d = distFn(n);
      if (d < bd - 1e-6 || (d <= bd + 1e-6 && best && n.z < best.z)) {
        bd = Math.min(bd, d);
        best = n;
      }
    });
    return best;
  };
  // the nodes of each pipe, for emitters linked to a pipe
  const ofPipe = new Map();
  edges.forEach(e => {
    if (e.vert || !e.pp) return;
    if (!ofPipe.has(e.pp.id)) ofPipe.set(e.pp.id, new Set());
    ofPipe.get(e.pp.id).add(e.a).add(e.b);
  });
  const attach = (em, r) => {
    const own = em.link && ofPipe.get(em.link),
      n = own ? nearest(r.floorId, nd => (own.has(nd) ? emDist(em, nd) : Infinity)) : null;
    return n || nearest(r.floorId, nd => emDist(em, nd));
  };
  // emitters and their design flow: their share of the heat loss of their heating zone (rooms joined by open connections)
  const ems = [];
  zoneList().forEach(z => {
    const list = z.ems.filter(x => x.em.kind === 'vv' || (x.em.a && x.em.b));
    if (!list.length) return;
    const outs = list.map(x => emOutput(x.em, x.room)),
      sum = outs.reduce((a, x) => a + x, 0),
      need = zoneNeed(z);
    list.forEach(({ em, room: r }, i) => {
      const W = sum > 0 ? (need * outs[i]) / sum : 0,
        n = drop(attach(em, r), em.kind === 'vv' ? 0 : EM_Z);
      const o = { em, room: r, node: n, W, lh: lhOf(W, dT), reach: false };
      if (n) n.ems.push(o);
      ems.push(o);
    });
  });
  const hp = P.hpPos;
  const root = hp
    ? drop(
        nearest(hp.floorId, nd => dist(nd, hp)),
        0
      )
    : null;
  edges.forEach(e => {
    e.a.adj.push(e);
    e.b.adj.push(e);
  });
  // walk the tree from the heat pump
  let loops = 0;
  const order = [],
    loopEdges = [];
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
          loopEdges.push(e);
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
    } else {
      // radiator or convector: radiator and return fitting, plus the thermostatic valve fully open (or its minimum)
      const v = (o.trv = trvOf(o.em));
      o.dpEm = !v
        ? EM_DP[o.em.kind] || 3
        : v.soort === 'kv' && (v.standen || []).length
          ? TRV.lichaam + kvDp(o.lh, v.standen[v.standen.length - 1][1])
          : v.soort === 'debiet'
            ? TRV.lichaam + trvDpMin(v, o.lh)
            : v.soort === 'hand'
              ? TRV.lichaam + kvDp(o.lh, +v.kv || 1.5)
              : +v.dp || EM_DP[o.em.kind] || 3;
    }
    o.dpPath = o.reach ? o.node.cum : NaN;
    o.dpTot = o.reach ? o.dpPath + o.dpEm : NaN;
  });
  const reached = ems.filter(o => o.reach && o.lh > 0),
    index = reached.reduce((b, o) => (!b || o.dpTot > b.dpTot ? o : b), null);
  // edges of the index circuit
  const indexEdges = new Set();
  if (index) for (let n = index.node; n && n.parent; n = n.up) indexEdges.add(n.parent);
  reached.forEach(o => (o.preset = presetFor(o, index)));
  // appendages in the main pipe: all water flows through them
  const total = reached.reduce((a, o) => a + o.lh, 0),
    fittings = (P.fittings || []).map(f => ({ f, dp: f.n * kvDp(total, f.kv) })),
    dpFit = fittings.reduce((a, x) => a + x.dp, 0);
  return {
    hp,
    root,
    nodes,
    edges,
    ems,
    loops,
    loopEdges,
    index,
    indexEdges,
    total,
    fittings,
    dpFit,
    risers: riserInfo,
    dpPump: (index ? index.dpTot : 0) + dpFit, // what the pump has to deliver
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
      P.risers,
      P.hpPos,
      P.settings.twSup,
      P.settings.twRet,
      P.settings.flow,
      hpSel,
      P.settings.fitPct,
      P.settings.trv,
      P.fittings,
      P.rooms.map(r => [r.id, r.floorId, r.emitters, r.temp]),
      zoneList().map(z => z.rooms.map(r => r.id).join(','))
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
  <div class="det">${N.root ? `Aangesloten op het leidingnet · ${fmtW(N.total)} l/h${N.index ? ` · indexcircuit ${fmt(N.index.dpTot, 1)} kPa${N.dpFit > 0.05 ? ` + appendages ${fmt(N.dpFit, 1)} kPa` : ''}` : ''}` : 'Nog niet aangesloten: laat een leiding hier beginnen.'}</div>
  <div class="row">${N.root ? '<button class="btn" data-act="schema">Schema van het leidingnet</button>' : ''}<button class="btn danger" data-act="delhp">Warmtepomp weghalen</button></div>`;
}
function netEmHtml(em) {
  if (!(P.pipes || []).length) return '';
  const N = network(),
    o = N.ems.find(x => x.em === em);
  if (!o) return '';
  if (!o.node)
    return `<p class="note">Niet aangesloten op het leidingnet: laat een leiding eindigen bij dit element (binnen ${nv(ATTACH * 100, 0)} cm).</p>`;
  if (!o.reach) return `<p class="note">Aangesloten op een leiding, maar die is niet verbonden met de warmtepomp.</p>`;
  const extra = N.index ? N.index.dpTot - o.dpTot : 0,
    pr = o.preset,
    vn = o.trv ? esc(o.trv.naam) : '';
  let tune = '';
  if (pr && pr.kind === 'voet')
    tune = pr.index
      ? `<br><b>Dit is het indexcircuit:</b> handkraan en voetventiel helemaal open.`
      : pr.open
        ? '<br>Handkraan en voetventiel helemaal open.'
        : `<br>Handkraan helemaal open. Inregelen met het <b>voetventiel</b>: ${fmt(pr.extra, 1)} kPa extra weerstand, dat is een kv van ongeveer <b>${nv(pr.kvNeed, 2)}</b>. Hoeveel slagen dicht dat is, staat in de datasheet van het voetventiel.`;
  else if (pr && pr.kind === 'kv')
    tune = pr.index
      ? `<br><b>Dit is het indexcircuit:</b> ${vn} helemaal open, stand ${esc(pr.s)}.`
      : `<br>Voorinstelling ${vn}: <b>stand ${esc(pr.s)}</b> (kv ${nv(pr.kv, 3)}, nodig ${nv(pr.kvNeed, 3)}; ongeveer ${fmtW(pr.pct)}% van het ontwerpdebiet)${pr.low ? `<br><span style="color:var(--warn)">⚠ Zelfs stand ${esc(o.trv.standen[0][0])} laat nog te veel water door. Knijp de retourkoppeling iets dicht of kies een kraan met een kleinere kv.</span>` : ''}`;
  else if (pr && pr.kind === 'debiet')
    tune = `<br>${vn}: <b>${pr.stand != null ? `stand ${esc(String(pr.stand))} (tot ${fmtW(pr.s)} l/h)` : `instellen op ${fmtW(pr.s)} l/h`}</b>${N.index && N.index.em === em ? ' · dit is het indexcircuit' : ''}${pr.over ? `<br><span style="color:var(--warn)">⚠ Het ontwerpdebiet (${fmtW(o.lh)} l/h) is meer dan de kraan aankan (${fmtW(o.trv.max)} l/h).</span>` : ''}${pr.noisy ? `<br><span style="color:var(--warn)">⚠ Er staat ${fmt(pr.avail, 0)} kPa over de kraan, meer dan ${fmtW(o.trv.dpMax)} kPa: kans op geluid.</span>` : ''}`;
  if (tune)
    return `<div class="det">Leidingnet: ${fmtW(o.lh)} l/h · drukverlies tot de warmtepomp ${fmt(o.dpPath, 1)} kPa + radiator en kraan ${fmt(o.dpEm, 1)} kPa = ${fmt(o.dpTot, 1)} kPa${tune}</div>`;
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
    es = N.edges.filter(e => e.pp === pp);
  if (!N.root)
    return '<p class="note">Plaats de warmtepomp met <b>Warmtepomp</b> (K) om debiet en drukverlies te zien.</p>';
  const tr = es.filter(e => e.inTree);
  if (!tr.length) return '<p class="note">Deze leiding is niet verbonden met de warmtepomp.</p>';
  const maxQ = Math.max(...tr.map(e => e.lh)),
    maxV = Math.max(...tr.map(e => e.v)),
    dp = tr.reduce((a, e) => a + e.dp, 0),
    st = vState(maxV, pp);
  return `<div class="det">Debiet tot ${fmtW(maxQ)} l/h · snelheid tot ${fmt(maxV, 2)} m/s · drukverlies ${fmt(dp, 2)} kPa (aanvoer + retour)</div>${
    st === 'ok'
      ? ''
      : st === 'warn'
        ? `<p class="note" style="color:var(--warn)">⚠ Stromingsgeluid: boven ${nv(V_OK, 1)} m/s hoor je het water in een zichtbare leiding. Kies een grotere diameter, of vink <i>Weggewerkt</i> aan als de leiding in de vloer, een muur of een koof zit.</p>`
        : pipeHidden(pp)
          ? `<p class="note" style="color:var(--warn)">⚠ Te klein: boven ${nv(V_MAX, 1)} m/s loopt het drukverlies snel op. Je hoort het niet, want de leiding is weggewerkt, maar de pomp moet harder werken en de radiatoren verderop krijgen minder water. Kies een grotere diameter als dat kan.</p>`
          : `<p class="note" style="color:var(--warn)">⚠ Te klein: boven ${nv(V_MAX, 1)} m/s geeft de leiding stromingsgeluid en loopt het drukverlies snel op. Kies een grotere diameter.</p>`
  }`;
}
function networkHtml(rep) {
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
    small = N.edges.filter(e => e.inTree && vState(e.v, e.pp) === 'bad'),
    noisy = N.edges.filter(e => e.inTree && vState(e.v, e.pp) === 'warn'),
    pipeNames = es => [...new Set(es.map(e => (e.pp ? e.pp.name : 'leiding')))].map(esc).join(', ');
  h += `<div class="kcard"><div class="kh"><span>${N.dpFit > 0.05 ? 'Indexcircuit + appendages' : 'Indexcircuit'}</span><b>${N.index ? fmt(N.dpPump, 1) + ' kPa' : '–'}</b></div>
    <div class="row"><button class="btn small" data-act="schema">Schema van het leidingnet</button>${N.index ? '<button class="btn small" data-act="inregel">Inregelstaat (afdrukken)</button>' : ''}</div>
    <span class="note">${N.index ? `Naar ${esc(N.index.em.name)} in ${esc(N.index.room.name)}: leidingen ${fmt(N.index.dpPath, 1)} kPa + element ${fmt(N.index.dpEm, 1)} kPa${N.dpFit > 0.05 ? ` + appendages bij de warmtepomp ${fmt(N.dpFit, 1)} kPa` : ''}. Dit is het drukverlies dat de pomp moet overwinnen bij ${fmtW(N.total)} l/h (ΔT ${nv(N.dT, 1)} K).` : 'Nog geen aangesloten afgifte met een warmteverlies.'}</span>
    ${(() => {
      const hp = hpList && hpList.find(x => x.id === hpSel);
      if (!hp || !(+hp.restopvoerhoogte > 0) || !N.index) return '';
      const ok = +hp.restopvoerhoogte >= N.dpPump;
      return `<div class="row">${ok ? `<span class="chip ok">✓ ${esc(hp.merk)} ${esc(hp.model)} levert ${fmt(+hp.restopvoerhoogte, 0)} kPa</span>` : `<span class="chip bad">⚠ ${esc(hp.merk)} ${esc(hp.model)} levert maar ${fmt(+hp.restopvoerhoogte, 0)} kPa</span>`}</div>`;
    })()}</div>`;
  if (N.loops)
    h += `<p class="note" style="color:var(--warn)">⚠ Het leidingnet bevat een rondgaande verbinding (lus). De app rekent met een boom en slaat ${N.loops} verbinding(en) over.</p>`;
  if (loose.length)
    h += `<p class="note" style="color:var(--warn)">⚠ Niet aangesloten: ${loose.map(o => esc(o.room.name) + ' · ' + esc(o.em.name)).join(', ')}.</p>`;
  if (small.length)
    h += `<p class="note" style="color:var(--warn)">⚠ Te klein, boven ${nv(V_MAX, 1)} m/s (veel drukverlies${small.some(e => !pipeHidden(e.pp)) ? ', en stromingsgeluid waar de leiding zichtbaar is' : ''}): ${pipeNames(small)}.</p>`;
  if (noisy.length)
    h += `<p class="note" style="color:var(--warn)">⚠ Stromingsgeluid, ${nv(V_OK, 1)} tot ${nv(V_MAX, 1)} m/s in een zichtbare leiding: ${pipeNames(noisy)}. Zit zo'n leiding in de vloer, een muur of een koof, vink dan <i>Weggewerkt</i> aan bij die leiding.</p>`;
  if (reached.length) {
    h += `<div class="tablewrap"><table class="calc"><thead><tr><th>Element</th><th>l/h</th><th>Δp kPa</th><th>Inregelen</th></tr></thead><tbody>`;
    reached
      .slice()
      .sort((a, b) => b.dpTot - a.dpTot)
      .forEach(o => {
        h += `<tr><td><button class="crumb" data-act="selem" data-r="${o.room.id}" data-e="${o.em.id}">${esc(o.em.name)}</button><small>${esc(o.room.name)}${o.trv && o.em.trv ? ' · ' + esc(o.trv.naam) : ''}</small></td><td>${fmtW(o.lh)}</td><td>${fmt(o.dpTot, 1)}</td><td>${presetText(o, N)}</td></tr>`;
      });
    h += `</tbody></table></div>`;
  }
  h +=
    (rep
      ? `<p class="note">Thermostaatkranen: ${esc((TRV.kranen[S.trv] || TRV.kranen.onbekend || {}).naam || '')}.</p>`
      : trvHtml(N)) + fittingsHtml(N, rep);
  h += `<div class="fields">${numField('f-s-fit', 'set.fitPct', 'Opslag bochten en koppelingen', '%', S.fitPct, 0)}</div>
    <p class="note">Debiet per element: zijn aandeel in het warmteverlies van de ruimte bij ΔT ${nv(N.dT, 1)} K. Drukverlies van de leidingen met Darcy-Weisbach (water van 35 °C, aanvoer + retour), plus de opslag voor bochten en koppelingen. Per element rekent de app ${['kv', 'debiet', 'hand'].includes((TRV.kranen[S.trv] || {}).soort) ? `voor radiator of convector ${nv(TRV.lichaam, 1)} kPa voor radiator en retourkoppeling plus de thermostaatkraan (helemaal open, of het minimum van een debietbegrenzer)` : `indicatief ${nv(EM_DP.rad, 0)} kPa voor radiator of convector met kraan`}, ${nv(EM_DP.fan, 0)} kPa voor een fancoil, en bij vloerverwarming de lussen van 16×2 (verdeeld over groepen van hoogstens 100 m) plus ${nv(VV_MANIFOLD_DP, 0)} kPa voor de verdeler. Bij <i>Inregelen</i> staat de voorinstelling van de kraan, of, als die niet bekend is, hoeveel extra weerstand een element nodig heeft om niet meer water te krijgen dan het indexcircuit.</p>
    <p class="note">Stijgleidingen: laat een leiding beginnen of eindigen op het punt van een leiding op de verdieping erboven of eronder, of kies bij een leiding <i>Stijgleiding bij het eindpunt</i>. Het indexcircuit licht oranje op in de plattegrond.</p></div>`;
  return h;
}

// thermostatic valves: the type for the whole house (a radiator can have its own in its panel)
function trvHtml(N) {
  const S = P.settings,
    cur = TRV.kranen[S.trv] ? S.trv : 'onbekend',
    v = TRV.kranen[cur],
    own = N.ems.filter(o => o.em.trv && TRV.kranen[o.em.trv]).length;
  return `<div class="sec"><h3>Thermostaatkranen</h3><label class="f" for="f-s-trv">Kranen in het hele huis<select class="in" id="f-s-trv" data-f="set.trv">${Object.entries(
    TRV.kranen
  )
    .map(([k, x]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(x.naam)}</option>`)
    .join('')}</select></label>
    <p class="note">${
      v && v.soort === 'hand'
        ? `Gewone radiatorkranen zonder thermostaat. Bij een warmtepomp werkt dat goed: zet de kranen helemaal open en laat de stooklijn de temperatuur regelen. Alleen kranen open zetten is niet genoeg, want dan krijgt de radiator met de kortste route het meeste water en de radiator met de hoogste weerstand te weinig. Regel daarom de verdeling met de <b>voetventielen</b> (aan de andere kant van de radiator): bij <i>Inregelen</i> staat per radiator hoeveel extra weerstand het voetventiel moet geven, als kv-waarde. Een kamer reageert niet vanzelf op zon of veel mensen; die stuur je met de hand bij. Draai een kraan liever niet helemaal dicht: in een koude kamer slaat vocht neer op muren en ramen, en als veel kranen dicht staan, krijgt de warmtepomp te weinig water en gaat hij pendelen. Wil je een kamer koeler, draai de kraan dan een stukje dicht en zet de kamer in de app op die lagere temperatuur. Thermostaatkranen met een voorinstelling of debietbegrenzers maken inregelen makkelijker en regelen per kamer, maar nodig zijn ze niet.`
        : !v || v.soort === 'vast'
          ? `Zonder bekende kraan rekent de app met ${nv(v ? v.dp : 3, 0)} kPa over radiator en kraan, en staat bij <i>Inregelen</i> hoeveel extra weerstand een radiator nodig heeft. Kies je kraan, dan rekent de app de voorinstelling uit.`
          : v.soort === 'kv'
            ? `De app rekent per radiator uit welke stand de kraan nodig heeft om het ontwerpdebiet te krijgen, als de kraan van het indexcircuit helemaal open staat. De kv-waarden per stand komen uit de datasheet (${esc(v.bron || '')}). Zet daarna de thermostaatkop terug; de voorinstelling blijft staan.`
            : `Deze kraan begrenst zelf het debiet: je stelt per radiator het debiet in l/h in, en de kraan houdt dat vast, ook als andere kranen dichtgaan. ${Array.isArray(v.standen) && v.standen.length ? `Standen ${v.standen.map(s => `${esc(String(s[0]))}: ${nv(s[1], 0)}`).join(', ')} l/h; de app kiest de kleinste stand die genoeg doorlaat.` : `Instelbereik ${nv(v.min, 0)} tot ${nv(v.max, 0)} l/h.`} Hij heeft minstens ${trvDpText(v)} nodig; dat telt mee in het indexcircuit.`
    }${own ? ` ${own} element(en) hebben een eigen kraan, gekozen bij het element zelf.` : ''}</p></div>`;
}
// appendages in the main pipe at the heat pump
function fittingsHtml(N, rep) {
  const list = N.fittings || [];
  let h = `<div class="sec"><h3>Appendages bij de warmtepomp</h3>`;
  if (rep)
    return list.length
      ? h +
          `<p class="note">${list.map(x => `${x.f.n} × ${esc((FITTINGS[x.f.type] || {}).naam || x.f.type)} (kv ${nv(x.f.kv, 1)}): ${fmt(x.dp, 1)} kPa`).join(' · ')}</p></div>`
      : '';
  h += list
    .map(
      ({ f, dp }) =>
        `<div class="card fitrow"><label class="f" for="f-fit-${f.id}-t">Onderdeel<select class="in" id="f-fit-${f.id}-t" data-f="fit.${f.id}.type">${Object.entries(
          FITTINGS
        )
          .map(([k, x]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${esc(x.naam)}</option>`)
          .join(
            ''
          )}</select></label>${numField('f-fit-' + f.id + '-n', 'fit.' + f.id + '.n', 'Aantal', '×', f.n, 0)}${numField('f-fit-' + f.id + '-kv', 'fit.' + f.id + '.kv', 'kv', 'm³/h', f.kv, 1)}<span class="fitdp">${fmt(dp, 1)} kPa</span><button class="btn small" data-act="delfit" data-f="${f.id}" aria-label="Verwijder ${esc((FITTINGS[f.type] || {}).naam || 'onderdeel')}">✕</button></div>`
    )
    .join('');
  h += `<div class="row"><button class="btn small" data-act="addfit">+ Appendage</button>${list.length ? `<span class="note">Samen ${fmt(N.dpFit, 1)} kPa bij ${fmtW(N.total)} l/h</span>` : ''}</div>
    <p class="note">Onderdelen in de hoofdleiding waar al het water doorheen gaat, zoals een vuilfilter, afsluiters, een terugslagklep of de driewegklep voor tapwater. Hun drukverlies (debiet ÷ kv)² telt op bij het indexcircuit, en dat moet de pomp samen leveren. De kv staat in de datasheet van het onderdeel; de voorgestelde waarde is een typische waarde voor 1 inch. Een afsluiter die helemaal open staat, telt bijna niet.</p></div>`;
  return h;
}

// Berekening: laagopbouw (NEN-EN-ISO 6946), daken, transmissie, ventilatie en infiltratie per ruimte.
'use strict';
/* ---------- layer build-up (NEN-EN-ISO 6946, simplified) ---------- */
function airR(d, kind) {
  const t = AIR[kind === 'dak' ? 'up' : kind === 'vloer' ? 'down' : 'h'];
  d = Math.max(0, Math.min(300, d || 0));
  for (let i = 1; i < t.length; i++) {
    if (d <= t[i][0]) {
      const [d0, r0] = t[i - 1],
        [d1, r1] = t[i];
      return r0 + ((r1 - r0) * (d - d0)) / (d1 - d0);
    }
  }
  return t[t.length - 1][1];
}
function calcLayers(c, p) {
  p = p || P;
  const mat = id => p.materials.find(m => m.id === id);
  const rs = RS[c.kind] || RS.wand;
  const rsi = rs[0];
  let rse = c.inner ? rsi : rs[1];
  const L = c.layers || [];
  const vi = L.findIndex(l => {
    const m = mat(l.mid);
    return m && m.type === 'spouw' && l.vent !== 'niet';
  });
  const mode = vi >= 0 ? L[vi].vent : '';
  let cut = L.length;
  if (mode === 'sterk') {
    cut = vi;
    rse = rsi;
  }
  const Rm = (m, l) => {
    if (!m) return 0;
    if (m.type === 'lambda') return m.lambda > 0 ? l.d / 1000 / m.lambda : 0;
    if (m.type === 'R') return m.R || 0;
    return airR(l.d, c.kind);
  };
  const rows = L.map((l, i) => {
    const m = mat(l.mid);
    let rp = Rm(m, l);
    if (mode === 'zwak' && i === vi) rp /= 2;
    let rm = null,
      f = 0;
    if (l.mix && m && m.type === 'lambda') {
      const mm = mat(l.mix.mid);
      if (mm && mm.type === 'lambda') {
        rm = Rm(mm, l);
        f = Math.max(0, Math.min(100, l.mix.pct)) / 100;
      }
    }
    const req = rm == null || f === 0 ? rp : 1 / ((1 - f) / (rp || 1e-9) + f / (rm || 1e-9));
    return { rp, rm, f, req, active: i < cut };
  });
  if (mode === 'zwak') {
    const outer = rows.filter((r, i) => i > vi);
    const s = outer.reduce((a, r) => a + r.req, 0);
    if (s > 0.15) {
      const k = 0.15 / s;
      outer.forEach(r => {
        r.rp *= k;
        r.req *= k;
        if (r.rm != null) r.rm *= k;
      });
    }
  }
  const act = rows.filter(r => r.active);
  const Rlo = rsi + rse + act.reduce((a, r) => a + r.req, 0);
  const M = act.filter(r => r.rm != null && r.f > 0).slice(0, 6);
  let Rup = Rlo;
  if (M.length) {
    const base = rsi + rse + act.filter(r => !M.includes(r)).reduce((a, r) => a + r.rp, 0);
    let inv = 0;
    for (let b = 0; b < 1 << M.length; b++) {
      let fr = 1,
        R = base;
      M.forEach((r, k) => {
        if (b & (1 << k)) {
          fr *= r.f;
          R += r.rm;
        } else {
          fr *= 1 - r.f;
          R += r.rp;
        }
      });
      inv += fr / R;
    }
    Rup = 1 / inv;
  }
  const RT = M.length ? (Rup + Rlo) / 2 : Rlo;
  return {
    rsi,
    rse,
    RT,
    Rc: RT - rsi - rse,
    U: RT > 0 ? 1 / RT : NaN,
    Rup,
    Rlo,
    mixed: M.length > 0,
    mode,
    cut,
    layers: rows.map(r => ({ r: r.req, active: r.active }))
  };
}
function syncU(c, p) {
  if (c.mode === 'lagen' && c.layers.length) {
    const r = calcLayers(c, p);
    if (Number.isFinite(r.U) && r.U > 0) c.U = Math.round(r.U * 10000) / 10000;
  }
}
const matById = id => P.materials.find(m => m.id === id);

/* ---------- calculation ---------- */
function adjTemp(type, custom) {
  const S = P.settings;
  switch (type) {
    case 'buiten':
      return S.te;
    case 'grond':
      return S.tGround;
    case 'onverwarmd':
      return S.tUnheated;
    case 'buurwoning':
      return S.tNeighbour;
    case 'temp':
      return custom;
    default:
      return S.te;
  }
}
/* ---------- 2.5D: roof shape per room ----------
   z(p) = height of the ceiling/roof underside above the floor at plan point p.
   Ridge runs parallel to a chosen wall; s = coordinate perpendicular to the ridge.
   zadel: z = nok − k·|s − s_ridge|, eaves at the outer s of the room at knee height
   lessenaar: z rises from knee height at the low side
   room.height acts as a flat ceiling (hanenbalk) that caps z. */
const ROOF_TYPES = { plat: 'Plat plafond', zadel: 'Zadeldak', lessenaar: 'Lessenaarsdak' };
function roofOf(room) {
  const r = room.roof;
  if (!r || r.type === 'plat' || room.pts.length < 3) return null;
  const n = room.pts.length,
    ei = Math.max(0, Math.min(n - 1, r.edge | 0)),
    e = edge(room, ei);
  if (e.L < 1e-6) return null;
  const v = { x: -e.uy, y: e.ux },
    sOf = p => p.x * v.x + p.y * v.y,
    ss = room.pts.map(sOf),
    smin = Math.min(...ss),
    smax = Math.max(...ss);
  const k = Math.tan((Math.max(1, Math.min(80, +r.pitch || 45)) * Math.PI) / 180),
    knee = Math.max(0, +r.knee || 0),
    cap = r.flat ? room.height : Infinity; // flat ceiling (collar beam) or open to the ridge
  const base = { v, sOf, smin, smax, k, knee, cap, cosA: 1 / Math.sqrt(1 + k * k), u: { x: e.ux, y: e.uy } };
  if (r.type === 'zadel') {
    const sr = (smin + smax) / 2,
      nok = knee + k * (sr - smin);
    const wc = nok > cap ? (nok - cap) / k : 0;
    return {
      ...base,
      type: 'zadel',
      sr,
      nok,
      wc,
      crit: [sr, sr - wc, sr + wc, sr - nok / k, sr + nok / k],
      z: s => Math.max(0, Math.min(cap, nok - k * Math.abs(s - sr)))
    };
  }
  const lowMin = r.low !== 'max',
    nok = knee + k * (smax - smin);
  const sc = lowMin ? smin + (cap - knee) / k : smax - (cap - knee) / k;
  return {
    ...base,
    type: 'lessenaar',
    lowMin,
    nok,
    sc,
    crit: [sc, lowMin ? smin - knee / k : smax + knee / k],
    z: s => Math.max(0, Math.min(cap, lowMin ? knee + k * (s - smin) : knee + k * (smax - s)))
  };
}
// A vide or stairwell that runs up under a sloped roof (see videTop): the walls follow the roof of the room it takes
// that roof from, measured from the vide's own floor. Same shape as roofOf, only shifted in height; null otherwise.
function videRoof(room) {
  const vt = videTop(room);
  if (!vt || !vt.R) return null;
  const el = floorElev(),
    R = vt.R,
    dz = (el[vt.src.floorId] || 0) - (el[room.floorId] || 0);
  return { ...R, vide: true, nok: R.nok + dz, cap: R.cap + dz, z: s => dz + R.z(s) };
}
// the roof the walls of a room run up to: its own sloped roof, or that of a vide; null = flat at room.height
const wallRoof = room => roofOf(room) || videRoof(room);
// cut a polygon into strips at the kinks of a roof, so the height is linear within each strip
function roofStrips(pts, R) {
  const out = [];
  let cur = pts;
  [...R.crit]
    .sort((a, b) => a - b)
    .forEach(c => {
      if (!cur.length) return;
      const lo = clipS(cur, R.sOf, c, true);
      if (lo.length) out.push(lo);
      cur = clipS(cur, R.sOf, c, false);
    });
  if (cur.length) out.push(cur);
  return out;
}
// wall area between t0 and t1 along edge e: exact for piecewise-linear heights
function wallArea(room, e, t0, t1, R) {
  if (t1 <= t0) return 0;
  if (R === undefined) R = wallRoof(room);
  if (!R) return (t1 - t0) * room.height;
  const sa = R.sOf(e.a),
    ds = e.ux * R.v.x + e.uy * R.v.y,
    zt = t => R.z(sa + ds * t);
  if (Math.abs(ds) < 1e-9) return (t1 - t0) * zt(t0);
  const ts = [t0, t1, ...R.crit.map(c => (c - sa) / ds).filter(t => t > t0 && t < t1)].sort((a, b) => a - b);
  let A = 0;
  for (let i = 1; i < ts.length; i++) A += ((zt(ts[i - 1]) + zt(ts[i])) / 2) * (ts[i] - ts[i - 1]);
  return A;
}
// keep the part of a polygon on one side of the line s = c (Sutherland–Hodgman; area stays correct for concave shapes)
function clipS(pts, sOf, c, keepBelow) {
  const out = [],
    inn = p => (keepBelow ? sOf(p) <= c + 1e-9 : sOf(p) >= c - 1e-9);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      ia = inn(a),
      ib = inn(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const sa = sOf(a),
        sb = sOf(b),
        t = (c - sa) / (sb - sa);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out.length >= 3 ? out : [];
}
// horizontal regions of the top: sloped roof planes and the flat ceiling, each with projected area and mean height
function roofParts(room) {
  const R = roofOf(room);
  if (!R) return null;
  const pts = room.pts,
    sOf = R.sOf;
  const reg = (poly, kind) => {
    const A = Math.abs(polyArea(poly));
    if (A < 1e-6) return null;
    const c = centroid(poly);
    return { kind, A, z: R.z(sOf(c)), poly };
  };
  const out = [];
  if (R.type === 'zadel') {
    const lo = R.sr - R.wc,
      hi = R.sr + R.wc;
    out.push(reg(clipS(pts, sOf, lo, true), 'slope'), reg(clipS(pts, sOf, hi, false), 'slope'));
    if (R.wc > 0) out.push(reg(clipS(clipS(pts, sOf, lo, false), sOf, hi, true), 'cap'));
  } else {
    const inside = R.sc > R.smin && R.sc < R.smax;
    if (!inside && ((R.lowMin && R.sc >= R.smax) || (!R.lowMin && R.sc <= R.smin))) out.push(reg(pts, 'slope'));
    else if (!inside) out.push(reg(pts, 'cap'));
    else {
      out.push(reg(clipS(pts, sOf, R.sc, R.lowMin), 'slope'), reg(clipS(pts, sOf, R.sc, !R.lowMin), 'cap'));
    }
  }
  return { R, parts: out.filter(Boolean) };
}
/* ---------- knee walls (knieschotten) under a sloped roof ----------
   room.roof.kneeOn / kneeH: a low partition under the slope at height kneeH (often with a hatch, storage behind it).
   Only for the drawing: a dashed line in the plan, a panel in 2.5D, and a place to start and end walls. The space behind
   lies inside the insulated envelope, so the calculation does not change. */
function kneeLines(room) {
  const r = room.roof,
    R = roofOf(room);
  if (!R || !r.kneeOn || !(r.kneeH > R.knee + 0.01) || r.kneeH >= Math.min(R.cap, R.nok) - 0.05) return { R, cs: [] };
  const d = (r.kneeH - R.knee) / R.k; // horizontal distance from the outer wall
  const cs =
    R.type === 'zadel'
      ? [
          { c: R.smin + d, keepBelow: false },
          { c: R.smax - d, keepBelow: true }
        ]
      : [R.lowMin ? { c: R.smin + d, keepBelow: false } : { c: R.smax - d, keepBelow: true }];
  return { R, d, cs: cs.filter(x => x.c > R.smin + 1e-3 && x.c < R.smax - 1e-3) };
}
// the plan segments of the knee walls (for drawing and snapping)
const kneeSegs = room => {
  const K = kneeLines(room);
  return K.cs.map(k => lineAcross(room, K.R, k.c)).filter(Boolean);
};
// horizontal depth of a dormer: from its front to where its flat roof meets the slope
const dormerDepth = (room, it) => {
  const R = roofOf(room);
  return R ? Math.max(0, it.hf) / R.k : 0;
};
// where roof windows and dormers sit, in the plan and in height (z above the floor of the room).
// it.u = centre along the ridge (m from the start of the roof), it.d = distance from the eave:
// along the slope to the bottom of a roof window, horizontally to the front of a dormer. Both optional (automatic).
function slopeFrame(R, n) {
  if (R.type === 'zadel') {
    const wc = R.wc || 0;
    return n === 0 ? { se: R.smin, dir: 1, st: R.sr - wc } : { se: R.smax, dir: -1, st: R.sr + wc };
  }
  const inside = R.sc > R.smin && R.sc < R.smax;
  return R.lowMin
    ? { se: R.smin, dir: 1, st: inside ? R.sc : R.smax }
    : { se: R.smax, dir: -1, st: inside ? R.sc : R.smin };
}
function roofItemGeom(room) {
  const R = roofOf(room),
    items = (room.roof && room.roof.items) || [];
  if (!R || !items.length) return [];
  const us = room.pts.map(p => p.x * R.u.x + p.y * R.u.y),
    umin = Math.min(...us),
    umax = Math.max(...us),
    nS = R.type === 'zadel' ? 2 : 1;
  const W = (s, u) => ({ x: R.v.x * s + R.u.x * u, y: R.v.y * s + R.u.y * u });
  const out = [];
  for (let n = 0; n < nS; n++) {
    const F = slopeFrame(R, n),
      span = Math.abs(F.st - F.se),
      mine = items.filter(it => Math.min(nS - 1, it.slope | 0) === n);
    mine.forEach((it, k) => {
      const uc = Number.isFinite(it.u) ? umin + it.u : umin + ((k + 0.5) * (umax - umin)) / mine.length,
        u0 = uc - it.w / 2,
        u1 = uc + it.w / 2,
        g = { it, uc: uc - umin, polys: [], plan: [] };
      if (it.kind === 'raam') {
        const len = span / R.cosA,
          d = Number.isFinite(it.d) ? it.d : Math.max(0, (len - it.h) / 2),
          sa = F.se + F.dir * d * R.cosA,
          sb = F.se + F.dir * (d + it.h) * R.cosA;
        g.d = d;
        const q = [W(sa, u0), W(sa, u1), W(sb, u1), W(sb, u0)];
        g.polys.push({ kind: 'glass', pts: q.map((p, i) => ({ ...p, z: R.z(i < 2 ? sa : sb) })) });
        g.plan = q;
      } else {
        const D = Math.max(0, it.hf) / R.k,
          f = Number.isFinite(it.d) ? it.d : Math.max(0.1, (span - D) * 0.35),
          sf = F.se + F.dir * f,
          sb = sf + F.dir * D,
          zb = R.z(sf),
          zt = zb + it.hf;
        g.d = f;
        const P0 = W(sf, u0),
          P1 = W(sf, u1),
          B0 = W(sb, u0),
          B1 = W(sb, u1);
        g.polys.push({
          kind: 'wall',
          pts: [
            { ...P0, z: zb },
            { ...P1, z: zb },
            { ...P1, z: zt },
            { ...P0, z: zt }
          ]
        });
        const ww = Math.min(it.winw, it.w - 0.1),
          wh = Math.min(it.winh, it.hf - 0.1);
        if (ww > 0 && wh > 0) {
          const a = uc - ww / 2,
            b = uc + ww / 2,
            z0 = zb + (it.hf - wh) / 2;
          g.polys.push({
            kind: 'glass',
            pts: [
              { ...W(sf, a), z: z0 },
              { ...W(sf, b), z: z0 },
              { ...W(sf, b), z: z0 + wh },
              { ...W(sf, a), z: z0 + wh }
            ]
          });
        }
        g.polys.push({
          kind: 'wall',
          pts: [
            { ...P0, z: zb },
            { ...P0, z: zt },
            { ...B0, z: zt }
          ]
        });
        g.polys.push({
          kind: 'wall',
          pts: [
            { ...P1, z: zb },
            { ...P1, z: zt },
            { ...B1, z: zt }
          ]
        });
        g.polys.push({
          kind: 'roof',
          pts: [
            { ...P0, z: zt },
            { ...P1, z: zt },
            { ...B1, z: zt },
            { ...B0, z: zt }
          ]
        });
        g.plan = [P0, P1, B1, B0];
      }
      out.push(g);
    });
  }
  return out;
}
function roomVolume(room) {
  const rp = roofParts(room);
  const Af = Math.abs(polyArea(room.pts));
  if (!rp) {
    const V = videRoof(room);
    // a vide under a sloped roof: the height is linear within each strip, so area × height at its centre is exact
    return V
      ? roofStrips(room.pts, V).reduce((a, q) => a + Math.abs(polyArea(q)) * V.z(V.sOf(centroid(q))), 0)
      : Af * room.height;
  }
  // dormers add a wedge of ½ · w · D · hf
  const extra = (room.roof.items || [])
    .filter(it => it.kind === 'kapel')
    .reduce((a, it) => a + 0.5 * it.w * dormerDepth(room, it) * it.hf, 0);
  return rp.parts.reduce((a, p) => a + p.A * p.z, 0) + extra;
}
// wall pieces of one segment: per neighbouring room (auto) and the rest, each with length and real area
function wallParts(room, i, s0, s1, nb, R) {
  if (spans(room)) return wallPartsSpan(room, i, s0, s1, nb, R);
  const e = edge(room, i),
    parts = [],
    all = [];
  nb.forEach(n => {
    const iv = n.ivs.map(v => [Math.max(s0, v[0]), Math.min(s1, v[1])]).filter(v => v[1] - v[0] > 1e-6);
    const len = iv.reduce((a, v) => a + v[1] - v[0], 0);
    if (len > 0.005) {
      parts.push({ room: n.room, len, A: iv.reduce((a, v) => a + wallArea(room, e, v[0], v[1], R), 0) });
      all.push(...iv);
    }
  });
  let cur = s0,
    rl = 0,
    ra = 0;
  mergeIv(all).forEach(v => {
    if (v[0] > cur) {
      rl += v[0] - cur;
      ra += wallArea(room, e, cur, v[0], R);
    }
    cur = Math.max(cur, v[1]);
  });
  if (s1 > cur) {
    rl += s1 - cur;
    ra += wallArea(room, e, cur, s1, R);
  }
  if (rl > 0.005) parts.push({ room: null, len: rl, A: ra });
  return parts;
}
function wallPartsSpan(room, i, s0, s1, nb, R) {
  const e = edge(room, i),
    gross = wallArea(room, e, s0, s1, R),
    parts = [];
  let sum = 0;
  nb.forEach(n => {
    const iv = n.ivs.map(v => [Math.max(s0, v[0]), Math.min(s1, v[1])]).filter(v => v[1] - v[0] > 1e-6);
    const len = iv.reduce((a, v) => a + v[1] - v[0], 0);
    if (len > 0.005) {
      const A = len * Math.min(n.room.height, room.height);
      parts.push({ room: n.room, len, A });
      sum += A;
    }
  });
  if (sum > gross && sum > 0) {
    const k = gross / sum;
    parts.forEach(p => (p.A *= k));
    sum = gross;
  }
  if (gross - sum > 0.005) parts.push({ room: null, len: s1 - s0, A: gross - sum });
  return parts;
}
function transLines(room) {
  const S = P.settings,
    ti = room.temp,
    lines = [],
    R = wallRoof(room);
  let missing = 0;
  const push = o => {
    const c = o.con;
    const U = c ? c.U : NaN;
    const Ueff = Number.isFinite(U) ? U + (DU_TYPES.has(o.type) ? S.dU : 0) : NaN;
    const dT = ti - o.t;
    const phi = o.A * Ueff * dT;
    if (!c && o.A > 0.0001) missing++;
    lines.push({
      label: o.label,
      sub: o.sub,
      A: o.A,
      U,
      Ueff,
      dT,
      phi: Number.isFinite(phi) ? phi : 0,
      miss: !c,
      type: o.type,
      w: o.w,
      s: o.s,
      group: o.group,
      cid: c ? c.id : '',
      nb: o.nb || null,
      t: o.t,
      ri: o.ri || false
    });
  };
  room.pts.forEach((_, i) => {
    const w = room.walls[i];
    const b = bounds(room, i);
    const nb = neighbourIntervals(room, i);
    w.segs.forEach((sg, j) => {
      const s0 = b[j],
        s1 = b[j + 1],
        len = s1 - s0;
      if (len <= 1e-4 || sg.adj === 'open') return; // open connection: no wall, no loss
      const con = conById(sg.cid);
      const nm = 'Wand ' + (i + 1) + (w.segs.length > 1 ? LET[j] || j : '');
      // a window or door loses heat to whatever lies behind it at its own place: outside, or the room next door (an inner door)
      const lay = sg.adj === 'auto' ? opLayout(room, i, j) : [];
      const target = o => {
        if (sg.adj !== 'auto')
          return { t: adjTemp(sg.adj, sg.adjT), type: sg.adj, key: 'adj', lab: ADJ[sg.adj].toLowerCase() };
        const it = lay.find(x => x.o === o),
          tc = it ? (it.t0 + it.t1) / 2 : (s0 + s1) / 2,
          n = nb.find(n => n.ivs.some(v => tc >= v[0] - 1e-6 && tc <= v[1] + 1e-6));
        return n
          ? { t: n.room.temp, type: 'ruimte', key: n.room.id, lab: n.room.name }
          : { t: S.te, type: 'buiten', key: 'buiten', lab: 'buiten' };
      };
      const opA = {};
      sg.openings.forEach(o => {
        const A = Math.max(0, o.w * o.h),
          tg = target(o);
        opA[tg.key] = (opA[tg.key] || 0) + A;
        push({
          label: nm + ' · ' + (o.name || 'Opening'),
          sub: ((conById(o.cid) || {}).name || 'geen constructie') + ' → ' + tg.lab,
          A,
          con: conById(o.cid),
          t: tg.t,
          type: tg.type,
          w: i,
          s: j,
          group: 'open'
        });
      });
      let parts = [];
      if (sg.adj === 'auto')
        parts = wallParts(room, i, s0, s1, nb, R).map(p =>
          p.room
            ? { len: p.len, A: p.A, t: p.room.temp, type: 'ruimte', lab: p.room.name, key: p.room.id }
            : { len: p.len, A: p.A, t: S.te, type: 'buiten', lab: 'buiten', key: 'buiten' }
        );
      else
        parts.push({
          len,
          A: wallArea(room, edge(room, i), s0, s1, R),
          t: adjTemp(sg.adj, sg.adjT),
          type: sg.adj,
          lab: ADJ[sg.adj].toLowerCase(),
          key: 'adj'
        });
      // the opening comes off the wall part it sits in; whatever does not fit there comes off the rest of the wall
      let rem = 0;
      Object.entries(opA).forEach(([k, A]) => {
        const p = parts.find(x => x.key === k);
        const d = p ? Math.min(p.A, A) : 0;
        if (p) p.A -= d;
        rem += A - d;
      });
      for (const p of parts) {
        const d = Math.min(p.A, rem);
        p.A -= d;
        rem -= d;
      }
      parts.forEach(p =>
        push({
          label: nm,
          sub: (con ? con.name : 'geen constructie') + ' → ' + p.lab,
          A: p.A,
          con,
          t: p.t,
          type: p.type,
          w: i,
          s: j,
          group: 'wall'
        })
      );
    });
  });
  const Af = Math.abs(polyArea(room.pts));
  const topLine = (k, lab, A, extra, poly) => {
    const s = room[k];
    if (!s || A < 1e-4) return;
    const con = conById(s.cid),
      cn = (con || {}).name || 'geen constructie';
    if (s.adj === 'auto' && k !== 'roof') {
      // what lies below / above follows from the drawing of the storey below / above
      const nb = surfNeighbours(room, k, poly || room.pts);
      // with nothing drawn: ground under the lowest storey, the unheated space under the ridge above a flat ceiling under a sloped roof, otherwise outside
      // under the lowest storey, or above a crawl space / basement where nothing is drawn: the ground
      const belowF = P.floors[levelsOf(room)[0] - 1],
        rest = k === 'floor' ? (nb && !(belowF && belowF.below) ? 'buiten' : 'grond') : poly ? 'onverwarmd' : 'buiten',
        restLab =
          ADJ[rest].toLowerCase() +
          (nb && k === 'floor' ? ' (niets eronder)' : nb && rest === 'buiten' ? ' (niets erboven)' : '');
      const list = nb || [],
        sum = list.reduce((a, n) => a + n.A, 0),
        f = sum > A ? A / sum : 1;
      list.forEach(n =>
        push({
          label: lab,
          sub: cn + ' → ' + n.room.name + (extra || ''),
          A: n.A * f,
          con,
          t: n.room.temp,
          type: 'ruimte',
          group: k,
          nb: n.room.id
        })
      );
      // the part with nothing above / below (a flat roof, an overhang) may have its own construction
      const conOut = rest !== 'grond' && s.cidOut ? conById(s.cidOut) || con : con,
        cnOut = (conOut || {}).name || 'geen constructie';
      if (A - sum * f > 0.01)
        push({
          label: lab,
          sub: cnOut + ' → ' + restLab + (extra || ''),
          A: A - sum * f,
          con: conOut,
          t: adjTemp(rest),
          type: rest,
          group: k
        });
      return;
    }
    push({
      label: lab,
      sub: cn + ' → ' + ADJ[s.adj].toLowerCase() + (extra || ''),
      A,
      con,
      t: adjTemp(s.adj, s.t),
      type: s.adj,
      group: k
    });
  };
  topLine('floor', 'Vloer', Af);
  const rp = roofParts(room);
  const vt = !rp ? videTop(room) : null;
  if (vt && vt.src) {
    // a vide up to the roof: the same roof as the sloped room next to it, so the surface is the floor area / cos(pitch)
    const sr = vt.src.roof,
      con = conById(sr.cid);
    push({
      label: 'Dak (zoals ' + vt.src.name + ')',
      sub:
        ((con || {}).name || 'geen constructie') +
        ' → ' +
        ADJ[sr.adj].toLowerCase() +
        ` · ${fmt(Af, 1)} m² horizontaal, helling ${nv(sr.pitch, 0)}°`,
      A: Af / vt.R.cosA,
      con,
      t: adjTemp(sr.adj, sr.t),
      type: sr.adj,
      group: 'roof'
    });
  } else if (vt) {
    // a vide up to a flat roof
    const con = conById(room.ceil.cid);
    push({
      label: 'Dak',
      sub: ((con || {}).name || 'geen constructie') + ' → buiten (plat dak)',
      A: Af,
      con,
      t: S.te,
      type: 'buiten',
      group: 'ceil'
    });
  } else if (!rp) topLine('ceil', 'Plafond / dak', Af);
  else {
    const slopes = rp.parts.filter(p => p.kind === 'slope'),
      cap = rp.parts.filter(p => p.kind === 'cap').reduce((a, p) => a + p.A, 0);
    // roof windows and dormers take their area out of the slope they sit in
    const rf = room.roof,
      tR = adjTemp(rf.adj, rf.t),
      items = rf.items || [];
    slopes.forEach((p, n) => {
      const lab = slopes.length > 1 ? `Dakvlak ${n + 1}` : 'Dakvlak',
        mine = items.filter(it => Math.min(slopes.length - 1, it.slope | 0) === n);
      let off = 0;
      mine.forEach(it => {
        if (it.kind === 'raam') {
          const A = Math.max(0, it.w * it.h),
            con = conById(it.cid);
          off += A;
          push({
            label: lab + ' · ' + (it.name || 'Dakraam'),
            sub: ((con || {}).name || 'geen constructie') + ' → ' + ADJ[rf.adj].toLowerCase(),
            A,
            con,
            t: tR,
            type: rf.adj,
            group: 'open',
            ri: true
          });
        } else {
          // dormer: front wall w × hf with a window, two triangular cheeks, a flat roof w × D; D follows from the pitch
          const D = dormerDepth(room, it),
            win = Math.max(0, Math.min(it.winw * it.winh, it.w * it.hf)),
            cw = conById(it.cidW),
            cr = conById(it.cidR),
            cg = conById(it.wincid),
            nm = (it.name || 'Dakkapel') + ' · ';
          off += (it.w * D) / rp.R.cosA;
          const ln = (part, A, con, group) =>
            A > 1e-4 &&
            push({
              label: lab + ' · ' + nm + part,
              sub: ((con || {}).name || 'geen constructie') + ' → ' + ADJ[rf.adj].toLowerCase(),
              A,
              con,
              t: tR,
              type: rf.adj,
              group,
              ri: true
            });
          ln('voorkant', it.w * it.hf - win, cw, 'roof');
          ln('raam', win, cg, 'open');
          ln('zijwangen', D * it.hf, cw, 'roof');
          ln('plat dak', it.w * D, cr, 'roof');
        }
      });
      topLine(
        'roof',
        lab,
        Math.max(0, p.A / rp.R.cosA - off),
        ` · ${fmt(p.A, 1)} m² horizontaal, helling ${nv(rf.pitch, 0)}°${off > 0 ? `, min ${fmt(off, 1)} m² voor dakramen en dakkapellen` : ''}`
      );
    });
    const capPolys = rp.parts.filter(p => p.kind === 'cap');
    capPolys.forEach(p => topLine('ceil', 'Vlak plafond', p.A, '', p.poly));
  }
  return { lines, missing, Af };
}
const envOf = t => t.lines.filter(l => l.type === 'buiten').reduce((a, l) => a + l.A, 0);
function supplyTemp() {
  const S = P.settings;
  return S.ventSys === 'D' ? S.te + S.eta * (S.tRet - S.te) : S.te;
}
function infTotal() {
  const S = P.settings;
  const Ag = P.rooms.filter(r => r.heated !== false).reduce((a, r) => a + Math.abs(polyArea(r.pts)), 0);
  return { Ag, q: 0.46 * S.qv10 * Ag * S.fInf * 3.6 };
} // m³/h
function calcRoom(room) {
  const S = P.settings,
    ti = room.temp;
  if (room.heated === false) {
    // unheated (crawl space, basement): not part of the heat demand; neighbours use its temperature
    const Af = Math.abs(polyArea(room.pts));
    return {
      lines: [],
      trans: 0,
      vent: 0,
      inf: 0,
      total: 0,
      Af,
      V: roomVolume(room),
      missing: 0,
      env: 0,
      qi: 0,
      ts: supplyTemp(),
      qo: 0,
      phiS: 0,
      phiO: 0,
      tin: [],
      air: airBalance(room),
      unheated: true
    };
  }
  const t = transLines(room);
  const { lines, missing, Af } = t;
  const V = roomVolume(room);
  const trans = lines.reduce((a, l) => a + l.phi, 0);
  // ventilation: supply air at supply temperature; transfer air from other rooms at their temperature;
  // whatever is still missing to cover extract + outgoing transfer comes from "the rest of the house" at tRet
  const ts = supplyTemp(),
    air = airBalance(room);
  const phiS = RHOC * room.sup * (ti - ts);
  const tin = air.tin.map(t => ({ ...t, phi: RHOC * t.q * (ti - t.room.temp) }));
  const qo = air.rest,
    phiO = RHOC * qo * (ti - S.tRet) + tin.reduce((a, t) => a + t.phi, 0);
  // infiltration: qv10 → qi = 0,46 · qv10 · Ag · f, spread over rooms by area of envelope to outside
  const env = envOf(t);
  let qi;
  if (S.infMode === 'qv10') {
    const tot = infTotal();
    const envAll = P.rooms.reduce((a, r) => a + (r === room ? env : r.heated === false ? 0 : envOf(transLines(r))), 0);
    qi = envAll > 0 ? (tot.q * env) / envAll : tot.Ag > 0 ? (tot.q * Af) / tot.Ag : 0;
  } else qi = (S.nInf || 0) * V;
  const inf = RHOC * qi * (ti - S.te),
    vent = phiS + phiO;
  return { lines, trans, vent, inf, total: trans + vent + inf, Af, V, missing, env, qi, ts, qo, phiS, phiO, tin, air };
}
// breakdown for the bars: opaque fabric, glazing/doors, air (ventilation + infiltration)
function brk(c) {
  let fab = 0,
    gla = 0;
  c.lines.forEach(l => {
    if (l.group === 'open') gla += Math.max(0, l.phi);
    else fab += Math.max(0, l.phi);
  });
  return { fab, gla, air: Math.max(0, c.vent) + Math.max(0, c.inf) };
}
function segHtml(c, legend) {
  const b = brk(c),
    t = b.fab + b.gla + b.air;
  if (t <= 0) return '';
  const parts = [
    ['fab', '--seg-fabric', 'Schil'],
    ['gla', '--seg-glass', 'Ramen en deuren'],
    ['air', '--seg-air', 'Lucht']
  ];
  return (
    `<div class="segbar" role="img" aria-label="Schil ${fmt(b.fab / 1000, 2)} kW, ramen ${fmt(b.gla / 1000, 2)} kW, lucht ${fmt(b.air / 1000, 2)} kW">${parts.map(([k, col]) => (b[k] > 0 ? `<i style="flex:${b[k] / t} 0 0;background:var(${col})"></i>` : '')).join('')}</div>` +
    (legend
      ? `<div class="seglegend">${parts.map(([k, col, lab]) => `<span style="--c:var(${col})">${lab} ${fmt(b[k] / 1000, 2)}</span>`).join('')}</div>`
      : '')
  );
}
/* ---------- air flows between rooms ----------
   Per room: room.flowTo = the room the air flows over to (via a door gap, grille or open connection). The amount follows
   by itself: what is left after the room's own extraction, including what flows in from other rooms. Manual transfers
   (P.transfers, advanced) are counted as well. */
let _flowKey = '',
  _flows = [];
function airFlows() {
  const key = JSON.stringify([P.rooms.map(r => [r.id, r.sup, r.ext, r.flowTo]), P.transfers]);
  if (key === _flowKey) return _flows;
  const manual = (P.transfers || []).filter(t => t.from !== t.to && t.q > 0 && getRoom(t.from) && getRoom(t.to));
  const auto = P.rooms
    .filter(r => r.flowTo && r.flowTo !== r.id && getRoom(r.flowTo))
    .map(r => ({ id: 'auto-' + r.id, from: r.id, to: r.flowTo, q: 0, auto: true }));
  // repeat so a chain (bedroom → landing → bathroom) settles; a loop stops after a fixed number of rounds
  for (let k = 0; k < P.rooms.length + 2; k++) {
    let changed = false;
    auto.forEach(t => {
      const r = getRoom(t.from),
        inn =
          r.sup +
          manual.filter(x => x.to === r.id).reduce((a, x) => a + x.q, 0) +
          auto.filter(x => x.to === r.id).reduce((a, x) => a + x.q, 0),
        out = r.ext + manual.filter(x => x.from === r.id).reduce((a, x) => a + x.q, 0),
        q = Math.max(0, Math.round((inn - out) * 10) / 10);
      if (q !== t.q) {
        t.q = q;
        changed = true;
      }
    });
    if (!changed) break;
  }
  _flowKey = key;
  _flows = manual.concat(auto.filter(t => t.q > 0));
  return _flows;
}
function airBalance(room) {
  const tr = airFlows();
  const tin = tr
    .filter(t => t.to === room.id)
    .map(t => ({ id: t.id, q: t.q, room: getRoom(t.from) }))
    .filter(t => t.room);
  const tout = tr
    .filter(t => t.from === room.id)
    .map(t => ({ id: t.id, q: t.q, room: getRoom(t.to) }))
    .filter(t => t.room);
  const qin = tin.reduce((a, t) => a + t.q, 0),
    qout = tout.reduce((a, t) => a + t.q, 0);
  const inn = room.sup + qin,
    out = room.ext + qout;
  return { tin, tout, qin, qout, inn, out, rest: Math.max(0, out - inn), surplus: Math.max(0, inn - out) };
}
function calcAll() {
  const per = P.rooms.map(r => ({ room: r, c: calcRoom(r) }));
  return { per, total: per.reduce((a, x) => a + x.c.total, 0) };
}

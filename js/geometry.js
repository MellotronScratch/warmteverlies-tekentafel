// Geometrie: wanden, aangrenzende ruimtes, gedeelde wanden, ramen en deuren, vloeren en plafonds.
'use strict';
/* ---------- geometry ---------- */
const getRoom = id => P.rooms.find(r => r.id === id);
const conById = id => P.constructions.find(c => c.id === id);
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function centroid(pts) {
  const A = polyArea(pts);
  if (Math.abs(A) < 1e-9) {
    let x = 0,
      y = 0;
    pts.forEach(p => {
      x += p.x;
      y += p.y;
    });
    return { x: x / pts.length, y: y / pts.length };
  }
  let cx = 0,
    cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
function edge(room, i) {
  const n = room.pts.length;
  const a = room.pts[i],
    b = room.pts[(i + 1) % n];
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  const sg = polyArea(room.pts) >= 0 ? 1 : -1;
  const ux = L ? dx / L : 0,
    uy = L ? dy / L : 0;
  return { a, b, L, ux, uy, nx: sg * uy, ny: -sg * ux };
} // n = outward normal
function bounds(room, i) {
  const L = edge(room, i).L;
  const w = room.walls[i];
  return [0, ...w.cuts.map(c => Math.max(0, Math.min(c, L))), L];
}
function mergeIv(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const v of iv) {
    const l = out[out.length - 1];
    if (l && v[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], v[1]);
    else out.push([v[0], v[1]]);
  }
  return out;
}
function neighbourIntervals(room, i) {
  const e = edge(room, i);
  if (e.L < 1e-6) return [];
  const maxT = Math.max(0.02, P.settings.maxWall);
  const res = [];
  for (const o of P.rooms) {
    if (o.id === room.id || !levelsMeet(room, o)) continue;
    const ivs = [];
    for (let k = 0; k < o.pts.length; k++) {
      const f = edge(o, k);
      if (f.L < 1e-6) continue;
      if (Math.abs(e.ux * f.uy - e.uy * f.ux) > 0.01) continue;
      const da = (f.a.x - e.a.x) * e.nx + (f.a.y - e.a.y) * e.ny,
        db = (f.b.x - e.a.x) * e.nx + (f.b.y - e.a.y) * e.ny;
      if (da < -0.02 || da > maxT + 0.001 || Math.abs(da - db) > 0.02) continue;
      let t0 = (f.a.x - e.a.x) * e.ux + (f.a.y - e.a.y) * e.uy,
        t1 = (f.b.x - e.a.x) * e.ux + (f.b.y - e.a.y) * e.uy;
      if (t0 > t1) [t0, t1] = [t1, t0];
      t0 = Math.max(0, t0);
      t1 = Math.min(e.L, t1);
      if (t1 - t0 > 0.01) ivs.push([t0, t1]);
    }
    if (ivs.length) res.push({ room: o, ivs: mergeIv(ivs) });
  }
  return res;
}
function normalizeWalls(room) {
  room.walls.forEach((w, i) => {
    const L = edge(room, i).L;
    for (let c = w.cuts.length - 1; c >= 0; c--) {
      if (w.cuts[c] >= L - 0.01 || w.cuts[c] <= 0.01) {
        const keep = c;
        const merged = w.segs[keep].openings.concat(w.segs[keep + 1].openings);
        w.cuts.splice(c, 1);
        w.segs.splice(keep + 1, 1);
        w.segs[keep].openings = merged;
      }
    }
  });
}

/* ---------- shared walls: the piece of wall between two rooms has the same properties on both sides ---------- */
// pieces of other rooms' walls that lie against [s0,s1] of wall i: t0..t1 along this wall, u0..u1 along wall k of room o
function sharedParts(room, i, s0, s1) {
  const e = edge(room, i);
  if (e.L < 1e-6) return [];
  const maxT = Math.max(0.02, P.settings.maxWall);
  const res = [];
  for (const o of P.rooms) {
    if (o.id === room.id || !levelsMeet(room, o)) continue;
    for (let k = 0; k < o.pts.length; k++) {
      const f = edge(o, k);
      if (f.L < 1e-6 || Math.abs(e.ux * f.uy - e.uy * f.ux) > 0.01) continue;
      const da = (f.a.x - e.a.x) * e.nx + (f.a.y - e.a.y) * e.ny,
        db = (f.b.x - e.a.x) * e.nx + (f.b.y - e.a.y) * e.ny;
      if (da < -0.02 || da > maxT + 0.001 || Math.abs(da - db) > 0.02) continue;
      let ta = (f.a.x - e.a.x) * e.ux + (f.a.y - e.a.y) * e.uy,
        tb = (f.b.x - e.a.x) * e.ux + (f.b.y - e.a.y) * e.uy;
      if (ta > tb) [ta, tb] = [tb, ta];
      const lo = Math.max(s0, ta),
        hi = Math.min(s1, tb);
      if (hi - lo <= 0.01) continue;
      const u = t => (e.a.x + e.ux * t - f.a.x) * f.ux + (e.a.y + e.uy * t - f.a.y) * f.uy;
      let u0 = u(lo),
        u1 = u(hi);
      if (u0 > u1) [u0, u1] = [u1, u0];
      res.push({ o, k, t0: lo, t1: hi, u0: Math.max(0, u0), u1: Math.min(f.L, u1) });
    }
  }
  return res;
}
function cutAt(r, i, t) {
  const w = r.walls[i],
    L = edge(r, i).L;
  if (t <= 0.02 || t >= L - 0.02 || w.cuts.some(c => Math.abs(c - t) < 0.02)) return;
  const j = w.cuts.filter(c => c < t).length,
    lo = j > 0 ? w.cuts[j - 1] : 0,
    hi = j < w.cuts.length ? w.cuts[j] : L,
    src = w.segs[j];
  w.cuts.splice(j, 0, r3(t));
  const nw = { cid: src.cid, adj: src.adj, adjT: src.adjT, openings: [] };
  if (t - lo < hi - t) {
    nw.openings = src.openings;
    src.openings = [];
  }
  w.segs.splice(j + 1, 0, nw);
}
function partnersOf(room, i, j) {
  const b = bounds(room, i);
  if (!room.walls[i] || !['auto', 'open'].includes(room.walls[i].segs[j].adj)) return [];
  return sharedParts(room, i, b[j], b[j + 1]).map(p => {
    const bo = bounds(p.o, p.k),
      mid = (p.u0 + p.u1) / 2;
    let jj = 0;
    while (jj < bo.length - 2 && mid > bo[jj + 1]) jj++;
    return {
      ...p,
      jj,
      exact: Math.abs(bo[jj] - p.u0) < 0.03 && Math.abs(bo[jj + 1] - p.u1) < 0.03,
      whole: Math.abs(p.t0 - b[j]) < 0.03 && Math.abs(p.t1 - b[j + 1]) < 0.03
    };
  });
}
// give the shared pieces in the neighbouring rooms their own wall part, so they can follow this one
function isolatePartners(room, i, j) {
  partnersOf(room, i, j).forEach(p => {
    cutAt(p.o, p.k, p.u0);
    cutAt(p.o, p.k, p.u1);
  });
  return partnersOf(room, i, j);
}
// the one wall part on the other side when this part lies entirely against a single room: windows and doors are mirrored there
function mirrorPartner(room, i, j) {
  const ps = isolatePartners(room, i, j);
  return ps.length === 1 && ps[0].whole && ps[0].exact ? ps[0] : null;
}
function linkedOpenings(lk, fn) {
  if (!lk) return;
  P.rooms.forEach(r =>
    r.walls.forEach(w =>
      w.segs.forEach(sg =>
        sg.openings.slice().forEach(o => {
          if (o.lk === lk) fn(o, sg);
        })
      )
    )
  );
}

/* ---------- windows and doors: position along the wall ----------
   o.at = distance in m from the corner where the wall starts to the left side of the opening.
   Without o.at (older projects, new openings) the openings sit side by side in the middle of their wall part. */
function opLayout(room, i, j) {
  const b = bounds(room, i),
    s0 = b[j],
    s1 = b[j + 1],
    ops = room.walls[i].segs[j].openings.filter(o => o.w > 0);
  const auto = ops.filter(o => !Number.isFinite(o.at)),
    tot = auto.reduce((a, o) => a + o.w, 0) + 0.3 * Math.max(0, auto.length - 1);
  let t = (s0 + s1) / 2 - Math.min(tot, s1 - s0) / 2;
  return ops.map(o => {
    const w = Math.min(o.w, s1 - s0);
    let t0;
    if (Number.isFinite(o.at)) t0 = o.at;
    else {
      t0 = t;
      t += w + 0.3;
    }
    t0 = Math.max(s0, Math.min(s1 - w, t0));
    return { o, t0, t1: t0 + w };
  });
}
// o.sill = height of the bottom of the opening above the floor (m). Only for the picture, not for the calculation.
// Without it a door (1,9 m or higher) stands on the floor and a window starts at 0,9 m.
function opSill(o, top) {
  const def = o.h >= 1.9 ? 0 : Math.max(0, Math.min(0.9, top - o.h - 0.1));
  return Math.max(0, Math.min(Number.isFinite(o.sill) ? o.sill : def, top - 0.05));
}
function freezeOpenings(room, i, j) {
  opLayout(room, i, j).forEach(x => {
    if (!Number.isFinite(x.o.at)) x.o.at = r3(x.t0);
  });
}
// a mirrored opening in the room on the other side gets the same place in the world
function syncLinkedAt(o, room, i) {
  if (!o.lk || !Number.isFinite(o.at)) return;
  const e = edge(room, i);
  const p0 = { x: e.a.x + e.ux * o.at, y: e.a.y + e.uy * o.at },
    p1 = { x: p0.x + e.ux * o.w, y: p0.y + e.uy * o.w };
  P.rooms.forEach(r =>
    r.walls.forEach((w, k) =>
      w.segs.forEach(sg =>
        sg.openings.forEach(x => {
          if (x === o || x.lk !== o.lk) return;
          const f = edge(r, k);
          const u = p => (p.x - f.a.x) * f.ux + (p.y - f.a.y) * f.uy;
          x.at = r3(Math.max(0, Math.min(u(p0), u(p1))));
        })
      )
    )
  );
}

/* ---------- floors and ceilings: the rooms directly below or above, found from the drawing ---------- */
function triangulate(pts) {
  // ear clipping for a simple polygon (also L and U shapes)
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    sg = polyArea(pts) > 0 ? 1 : -1,
    tris = [];
  let idx = pts.map((_, i) => i),
    guard = 0;
  const inTri = (p, a, b, c) => {
    const d1 = cross(a, b, p) * sg,
      d2 = cross(b, c, p) * sg,
      d3 = cross(c, a, p) * sg;
    return d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12;
  };
  while (idx.length > 3 && guard++ < 500) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length],
        ib = idx[i],
        ic = idx[(i + 1) % idx.length],
        a = pts[ia],
        b = pts[ib],
        c = pts[ic];
      if (cross(a, b, c) * sg <= 1e-12) continue;
      if (idx.some(j => j !== ia && j !== ib && j !== ic && inTri(pts[j], a, b, c))) continue;
      tris.push([a, b, c]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx.map(j => pts[j]));
  return tris;
}
function clipConvex(subject, clip) {
  const sg = polyArea(clip) > 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      side = p => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * sg,
      inp = out;
    out = [];
    inp.forEach((p, j) => {
      const q = inp[(j + 1) % inp.length],
        sp = side(p),
        sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    });
  }
  return out;
}
const _ov = new Map();
function overlapArea(A, B) {
  const key = A.map(p => p.x + ',' + p.y).join(' ') + '|' + B.map(p => p.x + ',' + p.y).join(' ');
  if (_ov.has(key)) return _ov.get(key);
  const v = triangulate(B).reduce((s, t) => {
    const c = clipConvex(A, t);
    return s + (c.length >= 3 ? Math.abs(polyArea(c)) : 0);
  }, 0);
  if (_ov.size > 4000) _ov.clear();
  _ov.set(key, v);
  return v;
}
// k = 'floor' or 'ceil': rooms on the storey directly below / above, with the overlapping area. null when there is no such storey.
function surfNeighbours(room, k, poly) {
  const l = levelsOf(room),
    fi = k === 'floor' ? l[0] - 1 : l[1] + 1;
  if (fi < 0 || fi >= P.floors.length) return null;
  const fid = P.floors[fi].id,
    res = [];
  P.rooms.forEach(o => {
    if (o.id === room.id || !presentOn(o, fid)) return;
    const A = overlapArea(poly, o.pts);
    if (A > 0.01) res.push({ room: o, A });
  });
  return res;
}

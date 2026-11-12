// Tekenen: plattegrond (SVG), trappen en de 2,5D-weergave.
'use strict';
/* ---------- view transforms ---------- */
const svg = $('cv'),
  stage = $('stage');
const S = p => ({ x: p.x * view.s + view.tx, y: p.y * view.s + view.ty });
function toWorld(e) {
  const r = svg.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.tx) / view.s, y: (e.clientY - r.top - view.ty) / view.s };
}
function snapPoint(w, o) {
  o = o || {};
  const tol = 10 / view.s;
  if (!o.alt) {
    let best = null,
      bd = tol;
    for (const r of snapRooms())
      r.pts.forEach((p, i) => {
        if (o.exclude && o.exclude.r === r.id && o.exclude.i === i) return;
        const d = dist(p, w);
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
    drawPts.forEach(p => {
      const d = dist(p, w);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    if (best) return { x: best.x, y: best.y, kind: 'vtx' };
  }
  const st = o.alt ? 0.001 : Math.max(0.001, P.settings.snap);
  let x = r3(Math.round(w.x / st) * st),
    y = r3(Math.round(w.y / st) * st);
  let kind = 'grid';
  const al = 8 / view.s;
  [o.prev, o.next].forEach(q => {
    if (!q) return;
    if (Math.abs(w.x - q.x) < al) {
      x = q.x;
      kind = 'align';
    }
    if (Math.abs(w.y - q.y) < al) {
      y = q.y;
      kind = 'align';
    }
  });
  return { x, y, kind };
}
function fit() {
  const W = stage.clientWidth,
    H = stage.clientHeight;
  if (!W || !H) return;
  let list = curRooms();
  if (!list.length) list = underRooms();
  if (!list.length) list = P.rooms;
  if (!list.length) {
    view = { s: 60, tx: 60, ty: 80 };
    renderCanvas();
    return;
  }
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  list.forEach(r =>
    r.pts.forEach(p => {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    })
  );
  const m = 70,
    s = Math.max(
      8,
      Math.min(300, Math.min((W - 2 * m) / Math.max(0.5, x1 - x0), (H - 2 * m - 30) / Math.max(0.5, y1 - y0)))
    );
  view.s = s;
  view.tx = (W - (x1 - x0) * s) / 2 - x0 * s;
  view.ty = (H - (y1 - y0) * s) / 2 - y0 * s + 12;
  renderCanvas();
}
function zoomAt(f, cx, cy) {
  const ns = Math.max(6, Math.min(600, view.s * f));
  const k = ns / view.s;
  view.tx = cx - (cx - view.tx) * k;
  view.ty = cy - (cy - view.ty) * k;
  view.s = ns;
  renderCanvas();
}

/* ---------- canvas rendering ---------- */
function gridSvg(W, H) {
  const s = view.s;
  let st = s >= 70 ? 0.1 : s >= 25 ? 0.5 : s >= 10 ? 1 : 5;
  const major = st < 1 ? 1 : 5;
  const x0 = -view.tx / s,
    x1 = (W - view.tx) / s,
    y0 = -view.ty / s,
    y1 = (H - view.ty) / s;
  let minor = '',
    maj = '';
  for (let x = Math.floor(x0 / st) * st; x <= x1; x += st) {
    const X = (x * s + view.tx).toFixed(1);
    const isM = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    if (isM) maj += `M${X} 0V${H}`;
    else minor += `M${X} 0V${H}`;
  }
  for (let y = Math.floor(y0 / st) * st; y <= y1; y += st) {
    const Y = (y * s + view.ty).toFixed(1);
    const isM = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    if (isM) maj += `M0 ${Y}H${W}`;
    else minor += `M0 ${Y}H${W}`;
  }
  return `<path d="${minor}" stroke="var(--grid)" stroke-width="1"/><path d="${maj}" stroke="var(--grid-major)" stroke-width="1"/>`;
}
/* ---------- staircases: treads in plan, for the 2.5D view and the floor plan ----------
   room.stair = {shape:'recht'|'kwart'|'half', edge: wall where the stair starts, side:'a'|'b' (the end of that wall it runs along), w: width}
   The stairwell is taken as the rectangle around the room, seen from the start wall. */
const STAIR_SHAPES = { recht: 'Rechte trap', kwart: 'Kwartslag (gaat de hoek om)', half: 'Halve draai (met bordes)' };
function stairOf(r) {
  const st = r.stair || {};
  return {
    shape: STAIR_SHAPES[st.shape] ? st.shape : 'recht',
    edge: Math.max(0, Math.min(r.pts.length - 1, st.edge | 0)),
    side: st.side === 'b' ? 'b' : 'a',
    w: +st.w > 0 ? +st.w : 0.85
  };
}
function stairTreads(r, H) {
  const st = stairOf(r),
    e = edge(r, st.edge);
  if (e.L < 0.3) return null;
  const W = (u, v) => ({ x: e.a.x + e.ux * u - e.nx * v, y: e.a.y + e.uy * u - e.ny * v });
  const loc = r.pts.map(p => ({
    u: (p.x - e.a.x) * e.ux + (p.y - e.a.y) * e.uy,
    v: -((p.x - e.a.x) * e.nx + (p.y - e.a.y) * e.ny)
  }));
  const u0 = Math.min(...loc.map(p => p.u)),
    u1 = Math.max(...loc.map(p => p.u)),
    vm = Math.max(...loc.map(p => p.v));
  if (u1 - u0 < 0.3 || vm < 0.3) return null;
  const N = Math.max(3, Math.round(H / 0.185)),
    T = N - 1; // risers and treads (the last riser steps onto the floor above)
  let w = Math.min(st.w, (u1 - u0) / (st.shape === 'half' ? 2 : 1), st.shape === 'recht' ? vm : vm / 2);
  const A = st.side === 'a',
    sa = A ? [u0, u0 + w] : [u1 - w, u1],
    sb = A ? [u1 - w, u1] : [u0, u0 + w];
  const out = [];
  // a straight run of n treads over the rectangle u∈[ua,ub], v∈[va,vb], walking in direction dir
  const run = (n, ua, ub, va, vb, dir) => {
    for (let j = 0; j < n; j++) {
      let q;
      if (dir === 'v+') {
        const a = va + ((vb - va) * j) / n,
          b = va + ((vb - va) * (j + 1)) / n;
        q = { poly: [W(ua, a), W(ub, a), W(ub, b), W(ua, b)], front: [W(ua, a), W(ub, a)] };
      } else if (dir === 'v-') {
        const a = vb - ((vb - va) * j) / n,
          b = vb - ((vb - va) * (j + 1)) / n;
        q = { poly: [W(ua, a), W(ub, a), W(ub, b), W(ua, b)], front: [W(ua, a), W(ub, a)] };
      } else if (dir === 'u+') {
        const a = ua + ((ub - ua) * j) / n,
          b = ua + ((ub - ua) * (j + 1)) / n;
        q = { poly: [W(a, va), W(a, vb), W(b, vb), W(b, va)], front: [W(a, va), W(a, vb)] };
      } else {
        const a = ub - ((ub - ua) * j) / n,
          b = ub - ((ub - ua) * (j + 1)) / n;
        q = { poly: [W(a, va), W(a, vb), W(b, vb), W(b, va)], front: [W(a, va), W(a, vb)] };
      }
      out.push(q);
    }
  };
  if (st.shape === 'recht') run(T, sa[0], sa[1], 0, vm, 'v+');
  else if (st.shape === 'kwart') {
    const L1 = vm - w,
      L2 = u1 - u0 - w,
      rest = Math.max(2, T - 3),
      n1 = Math.max(1, Math.round((rest * L1) / (L1 + L2))),
      n2 = Math.max(1, rest - n1);
    run(n1, sa[0], sa[1], 0, vm - w, 'v+');
    // three winders turning the corner: wedges from the inner corner to the outer sides of the corner square
    const ui = A ? sa[1] : sa[0],
      uo = A ? sa[0] : sa[1],
      pin = W(ui, vm - w),
      outer = [W(uo, vm - w), W(uo, vm), W(ui, vm)],
      seg = [
        [outer[0], outer[1]],
        [outer[1], outer[2]]
      ];
    const along = t =>
      t <= 1
        ? { x: outer[0].x + (outer[1].x - outer[0].x) * t, y: outer[0].y + (outer[1].y - outer[0].y) * t }
        : { x: outer[1].x + (outer[2].x - outer[1].x) * (t - 1), y: outer[1].y + (outer[2].y - outer[1].y) * (t - 1) };
    for (let k = 0; k < 3; k++) {
      const t0 = (2 * k) / 3,
        t1 = (2 * (k + 1)) / 3,
        pts = [pin, along(t0)];
      if (t0 < 1 && t1 > 1) pts.push(outer[1]);
      pts.push(along(t1));
      out.push({ poly: pts, front: [pin, along(t0)] });
    }
    if (A) run(n2, sa[1], u1, vm - w, vm, 'u+');
    else run(n2, u0, sa[0], vm - w, vm, 'u-');
  } else {
    const n1 = Math.max(1, Math.floor((T - 1) / 2)),
      n2 = Math.max(1, T - 1 - n1);
    run(n1, sa[0], sa[1], 0, vm - w, 'v+');
    out.push({
      poly: [W(u0, vm - w), W(u1, vm - w), W(u1, vm), W(u0, vm)],
      front: [W(sa[0], vm - w), W(sa[1], vm - w)],
      landing: true
    });
    run(n2, sb[0], sb[1], 0, vm - w, 'v-');
  }
  const rise = H / N;
  out.forEach((q, k) => (q.z = rise * (k + 1)));
  return { treads: out, rise, N };
}

/* ---------- 2.5D view: the floors up to the current one, stacked, seen from an angle ---------- */
let view3d = false,
  drag3 = null;
const v3 = { th: -0.55, el: 0.72, s: 40, tx: 0, ty: 0 };
function floorElev() {
  const el = {};
  let z = 0;
  P.floors.forEach(f => {
    el[f.id] = z;
    const rs = P.rooms.filter(r => r.floorId === f.id && !spans(r));
    z += rs.length ? Math.max(...rs.map(roomTop)) : P.settings.height;
  });
  return el;
}
function pr3(p, z, raw) {
  const c = Math.cos(v3.th),
    s = Math.sin(v3.th),
    xr = p.x * c - p.y * s,
    yr = p.x * s + p.y * c,
    se = Math.sin(v3.el),
    ce = Math.cos(v3.el);
  const k = raw ? 1 : v3.s,
    ox = raw ? 0 : v3.tx,
    oy = raw ? 0 : v3.ty;
  return { X: ox + k * xr, Y: oy + k * (yr * se - z * ce), d: yr * ce + z * se };
}
const zTop = (room, R, p) => (R ? R.z(R.sOf(p)) : room.height);
const roomTop = r => {
  const R = roofOf(r);
  return R ? Math.min(R.cap, R.nok) : r.height;
};
// the point on the current floor level that lies under screen position (X,Y): the centre of rotation
function unproject3(X, Y, z) {
  const c = Math.cos(v3.th),
    s = Math.sin(v3.th),
    se = Math.max(0.05, Math.sin(v3.el)),
    ce = Math.cos(v3.el);
  const xr = (X - v3.tx) / v3.s,
    yr = ((Y - v3.ty) / v3.s + z * ce) / se;
  return { x: xr * c + yr * s, y: -xr * s + yr * c };
}
function rooms3d() {
  const ci = floorIdx(curFloor),
    el = floorElev();
  return P.rooms.filter(r => floorIdx(r.floorId) <= ci).map(r => ({ r, z0: el[r.floorId], fi: floorIdx(r.floorId) }));
}
function fit3d() {
  const W = stage.clientWidth,
    H = stage.clientHeight;
  const ps = [];
  rooms3d().forEach(({ r, z0 }) =>
    r.pts.forEach(p => {
      ps.push(pr3(p, z0, true));
      ps.push(pr3(p, z0 + roomTop(r), true));
    })
  );
  if (!ps.length || !W || !H) return;
  const X0 = Math.min(...ps.map(p => p.X)),
    X1 = Math.max(...ps.map(p => p.X)),
    Y0 = Math.min(...ps.map(p => p.Y)),
    Y1 = Math.max(...ps.map(p => p.Y));
  v3.s = Math.max(4, Math.min(300, Math.min((W - 120) / Math.max(0.5, X1 - X0), (H - 170) / Math.max(0.5, Y1 - Y0))));
  v3.tx = W / 2 - (v3.s * (X0 + X1)) / 2;
  v3.ty = (H + 40) / 2 - (v3.s * (Y0 + Y1)) / 2;
}
function set3d(on) {
  if (pendSplit) closeAsk();
  if (on && tool !== 'select') setTool('select');
  view3d = on;
  drawPts = [];
  hover = null;
  drag3 = null;
  stage.classList.toggle('is3d', on);
  const b = $('z-3d');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? '2D' : '2,5D';
  $('hint').textContent = on
    ? 'Draaien en kantelen: sleep met ingedrukt scrollwiel (of Shift + slepen) vanaf het punt waar je omheen wilt draaien. Slepen schuift, scrollen zoomt. Klik op een vloer of wand om die te bewerken. D: terug naar de plattegrond.'
    : HINTS[tool];
  if (on) fit3d();
  renderCanvas();
}
function render3d() {
  const c = Math.cos(v3.th),
    sn = Math.sin(v3.th),
    ci = floorIdx(curFloor);
  const P3 = (p, z) => pr3(p, z);
  const pt = q => q.X.toFixed(1) + ',' + q.Y.toFixed(1);
  const L = { x: -0.5, y: -0.8 },
    Ll = Math.hypot(L.x, L.y);
  let out = '';
  const labels = [];
  const byFloor = {};
  rooms3d().forEach(o => (byFloor[o.fi] = byFloor[o.fi] || []).push(o));
  // staircases: one flight per storey the stairwell runs through. A flight is sorted together with the storey it leads to,
  // so the walls of that storey cover it (or not) depending on what is in front.
  const stairItems = {},
    el = floorElev();
  rooms3d().forEach(({ r }) => {
    if (r.kind !== 'trap' || !spans(r)) return;
    const l = levelsOf(r);
    for (let lv = l[0]; lv < l[1]; lv++) {
      if (lv > ci) break;
      const zb = el[P.floors[lv].id],
        zt = el[P.floors[lv + 1].id],
        sg = stairTreads(r, zt - zb);
      if (!sg) continue;
      const tf = lv + 1 <= ci ? lv + 1 : lv,
        arr = (stairItems[tf] = stairItems[tf] || []);
      sg.treads.forEach((q, k) => {
        const z = zb + q.z,
          zp = zb + (k ? sg.treads[k - 1].z : 0);
        const tp = q.poly.map(p => P3(p, z)),
          fr = [P3(q.front[0], zp), P3(q.front[1], zp), P3(q.front[1], z), P3(q.front[0], z)];
        const d = tp.reduce((a, p) => a + p.d, 0) / tp.length;
        arr.push({
          mid: true,
          d: d - 0.001,
          svg: `<polygon points="${fr.map(pt).join(' ')}" fill="#8A6236" fill-opacity=".9" stroke="#5C4022" stroke-width=".6" pointer-events="none"/>`
        });
        // sides down to the floor, so the stair reads as one solid block
        q.poly.forEach((a, i) => {
          const b = q.poly[(i + 1) % q.poly.length];
          if (
            (dist(a, q.front[0]) < 1e-6 && dist(b, q.front[1]) < 1e-6) ||
            (dist(b, q.front[0]) < 1e-6 && dist(a, q.front[1]) < 1e-6)
          )
            return;
          const f4 = [P3(a, zb), P3(b, zb), P3(b, z), P3(a, z)],
            ds = f4.reduce((x, p) => x + p.d, 0) / 4;
          arr.push({
            mid: true,
            d: ds - 0.002,
            svg: `<polygon points="${f4.map(pt).join(' ')}" fill="#9C7040" fill-opacity=".95" stroke="#5C4022" stroke-width=".4" pointer-events="none"/>`
          });
        });
        arr.push({
          mid: true,
          d,
          svg: `<polygon points="${tp.map(pt).join(' ')}" fill="${q.landing ? '#B88E5A' : '#C9A46A'}" fill-opacity=".95" stroke="#5C4022" stroke-width=".6" pointer-events="none"/>`
        });
      });
    }
  });
  [...new Set([...Object.keys(byFloor), ...Object.keys(stairItems)].map(Number))]
    .sort((a, b) => a - b)
    .forEach(fi => {
      const list = byFloor[fi] || [],
        top = fi === ci;
      const items = [];
      // staircases leading to this storey, and the pipes (with risers) on this floor
      items.push(...(stairItems[fi] || []));
      if (P.floors[fi]) {
        const fid = P.floors[fi].id;
        (P.pipes || [])
          .filter(pp => pp.floorId === fid)
          .forEach(pp => {
            const z = el[pp.floorId] + 0.12,
              ps = pp.pts.map(p => P3(p, z)),
              d = ps.reduce((a, p) => a + p.d, 0) / ps.length,
              pl = ps.map(pt).join(' ');
            items.push({
              mid: true,
              d,
              svg: `<polyline points="${pl}" fill="none" stroke="#2563EB" stroke-width="5" stroke-linejoin="round" pointer-events="none"/><polyline points="${pl}" fill="none" stroke="#DC2626" stroke-width="2" stroke-linejoin="round" pointer-events="none"/>`
            });
          });
        if ((P.pipes || []).length)
          network()
            .edges.filter(e => e.vert && e.a.f === fid && floorIdx(e.b.f) <= ci)
            .forEach(e => {
              const a = P3(e.a, el[e.a.f] + 0.12),
                b = P3(e.b, el[e.b.f] + 0.12);
              items.push({
                mid: true,
                d: (a.d + b.d) / 2,
                svg: `<line x1="${a.X}" y1="${a.Y}" x2="${b.X}" y2="${b.Y}" stroke="#2563EB" stroke-width="5" pointer-events="none"/><line x1="${a.X}" y1="${a.Y}" x2="${b.X}" y2="${b.Y}" stroke="#DC2626" stroke-width="2" pointer-events="none"/>`
              });
            });
      }
      // floors
      list.forEach(({ r, z0 }) => {
        const isSel = top && sel && sel.r === r.id;
        const k = calcRoom(r);
        out += `<polygon points="${r.pts.map(p => pt(P3(p, z0))).join(' ')}" fill="var(--paper)" stroke="var(--line)" stroke-width="1" ${top ? '' : 'pointer-events="none"'}/>`;
        out += `<polygon ${top ? `data-k3="room" data-r="${r.id}"` : 'pointer-events="none"'} points="${r.pts.map(p => pt(P3(p, z0))).join(' ')}" fill="${isSel ? 'var(--accent-soft-2)' : 'var(--room)'}" stroke="none" style="cursor:pointer"/>`;
        (r.emitters || []).forEach(em => {
          if (em.kind === 'vv') {
            out += `<polygon points="${em.pts.map(p => pt(P3(p, z0 + 0.01))).join(' ')}" fill="url(#vvhatch)" stroke="var(--c-hp)" stroke-width="1" stroke-dasharray="5 4" pointer-events="none"/>`;
          } else {
            const a = P3(em.a, z0 + 0.35),
              b = P3(em.b, z0 + 0.35),
              a2 = P3(em.a, z0 + 0.85),
              b2 = P3(em.b, z0 + 0.85);
            items.push({
              mid: true,
              d: (a.d + b.d) / 2 - 0.05,
              svg: `<polygon points="${[a, b, b2, a2].map(pt).join(' ')}" fill="var(--c-hp)" fill-opacity=".75" stroke="var(--c-hp)" stroke-width="1" pointer-events="none"/>`
            });
          }
        });
        if (top) {
          const cc = P3(labelPt(r.pts), z0);
          labels.push(
            `<text x="${cc.X}" y="${cc.Y - 4}" text-anchor="middle" class="rname" font-size="10.5" pointer-events="none">${esc(r.name)}</text><text x="${cc.X}" y="${cc.Y + 13}" text-anchor="middle" class="rheat" font-size="14" pointer-events="none">${fmt(k.total / 1000, 2)} kW</text>`
          );
        }
        // knee walls: a low partition under the slope (dashed outline)
        kneeSegs(r).forEach(sg => {
          const h = r.roof.kneeH,
            q = [P3(sg[0], z0), P3(sg[1], z0), P3(sg[1], z0 + h), P3(sg[0], z0 + h)];
          items.push({
            mid: true,
            d: q.reduce((a, p) => a + p.d, 0) / 4,
            svg: `<polygon points="${q.map(pt).join(' ')}" fill="var(--surface)" fill-opacity=".35" stroke="var(--ink)" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="6 4" pointer-events="none"/>`
          });
        });
        // walls, per wall part, with the top following a sloped roof
        const R = roofOf(r);
        r.pts.forEach((_, i) => {
          const e = edge(r, i);
          if (e.L < 1e-6) return;
          const b = bounds(r, i),
            w = r.walls[i];
          const nyr = e.nx * sn + e.ny * c,
            near = nyr > 0.02,
            lit = (e.nx * L.x + e.ny * L.y) / Ll;
          const at = t => ({ x: e.a.x + e.ux * t, y: e.a.y + e.uy * t });
          w.segs.forEach((sg, j) => {
            const s0 = b[j],
              s1 = b[j + 1];
            if (s1 - s0 < 1e-4) return;
            const ts = [s0, s1];
            if (R) {
              const sa = R.sOf(e.a),
                ds = e.ux * R.v.x + e.uy * R.v.y;
              if (Math.abs(ds) > 1e-9)
                R.crit.forEach(cv => {
                  const t = (cv - sa) / ds;
                  if (t > s0 && t < s1) ts.push(t);
                });
            }
            ts.sort((x, y) => x - y);
            const bot = ts.map(t => P3(at(t), z0)),
              tp = ts.map(t => P3(at(t), z0 + zTop(r, R, at(t))));
            const con = conById(sg.cid),
              col = con ? con.color : 'var(--warn)',
              isSel = top && sel && sel.t === 'seg' && sel.r === r.id && sel.w === i && sel.s === j;
            const poly = bot.concat(tp.slice().reverse()).map(pt).join(' ');
            const d = bot.concat(tp).reduce((a, q) => a + q.d, 0) / (bot.length * 2);
            if (sg.adj === 'open') {
              items.push({
                d,
                near: true,
                svg: `<polygon ${top ? `data-k3="seg" data-r="${r.id}" data-w="${i}" data-s="${j}"` : ''} points="${poly}" fill="${isSel ? 'var(--heat)' : 'none'}" fill-opacity=".15" stroke="var(--muted)" stroke-opacity=".6" stroke-width="1" stroke-dasharray="5 5" pointer-events="${top ? 'stroke' : 'none'}" style="cursor:pointer"/>`
              });
              return;
            }
            const op = !top ? (near ? 0.18 : 0.55) : near ? 0.22 : 0.9;
            const shade = Math.max(0, Math.min(0.45, 0.22 - 0.22 * lit));
            let g = `<polygon points="${poly}" fill="${col}" fill-opacity="${op}" stroke="var(--wall)" stroke-opacity="${near ? 0.35 : 0.8}" stroke-width="1" stroke-linejoin="round" pointer-events="none"/>`;
            if (!near)
              g += `<polygon points="${poly}" fill="#000" fill-opacity="${(shade * op).toFixed(3)}" pointer-events="none"/>`;
            // windows and doors: side by side in the middle of the wall part (their exact place is not stored)
            opLayout(r, i, j)
              .filter(x => x.o.h > 0)
              .forEach(({ o, t0, t1 }) => {
                const t = t0,
                  ow = t1 - t0,
                  top = zTop(r, R, at(t + ow / 2)),
                  sill = opSill(o, top),
                  hh = Math.min(o.h, top - sill - 0.02);
                if (hh <= 0) return;
                const q = [
                  P3(at(t), z0 + sill),
                  P3(at(t + ow), z0 + sill),
                  P3(at(t + ow), z0 + sill + hh),
                  P3(at(t), z0 + sill + hh)
                ];
                g += `<polygon points="${q.map(pt).join(' ')}" fill="var(--heat)" fill-opacity="${near ? 0.25 : 0.55}" stroke="var(--heat)" stroke-width="1.2" pointer-events="none"/>`;
              });
            const isHov = top && hoverSeg && hoverSeg.r === r.id && hoverSeg.w === i && hoverSeg.s === j;
            if (isSel || isHov)
              g += `<polygon points="${poly}" fill="${isSel ? 'var(--heat)' : 'var(--accent)'}" fill-opacity=".25" stroke="${isSel ? 'var(--heat)' : 'var(--accent)'}" stroke-width="3" stroke-linejoin="round" pointer-events="none"/>`;
            if (top)
              g += near
                ? `<polygon data-k3="seg" data-r="${r.id}" data-w="${i}" data-s="${j}" points="${poly}" fill="none" stroke="transparent" stroke-width="8" pointer-events="stroke" style="cursor:pointer"/>`
                : `<polygon data-k3="seg" data-r="${r.id}" data-w="${i}" data-s="${j}" points="${poly}" fill="transparent" stroke="none" style="cursor:pointer"/>`;
            items.push({ d: d + (near ? 0.0001 : 0), near, svg: g });
          });
        });
        if (R)
          roofLines(R).forEach(cv => {
            const sg = lineAcross(r, R, cv);
            if (!sg) return;
            const z = z0 + R.z(cv),
              a = P3(sg[0], z),
              b = P3(sg[1], z);
            items.push({
              d: (a.d + b.d) / 2,
              svg: `<line x1="${a.X}" y1="${a.Y}" x2="${b.X}" y2="${b.Y}" stroke="var(--heat)" stroke-width="2" stroke-dasharray="7 5" pointer-events="none"/>`
            });
          });
      });
      // far walls first, then what stands in the rooms (stairs, radiators), near walls (transparent) last so the rooms stay visible through them
      const grp = it => (it.near ? 2 : it.mid ? 1 : 0);
      items.sort((a, b) => grp(a) - grp(b) || a.d - b.d).forEach(it => (out += it.svg));
    });
  return out + labels.join('');
}
function renderCanvas() {
  if (!P) return;
  const W = stage.clientWidth,
    H = stage.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (!P.floors.some(f => f.id === curFloor)) {
    let saved = null;
    try {
      saved = localStorage.getItem('wvt.floor.' + P.id);
    } catch (_) {}
    curFloor = P.floors.some(f => f.id === saved) ? saved : P.floors[0].id;
  }
  if (view3d) {
    svg.innerHTML =
      '<defs><pattern id="vvhatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--c-hp)" stroke-width="1.3" stroke-opacity=".45"/></pattern></defs>' +
      render3d();
    renderLegend();
    return;
  }
  const calc = {};
  curRooms().forEach(r => (calc[r.id] = calcRoom(r)));
  let out =
    gridSvg(W, H) +
    '<defs><pattern id="vvhatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--c-hp)" stroke-width="1.3" stroke-opacity=".45"/></pattern><marker id="airhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--c-air)"/></marker><pattern id="videhatch" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0M-2 2L2 -2M8 12L12 8" stroke="var(--muted)" stroke-width="1" stroke-opacity=".4"/></pattern></defs>';
  const off = 6 / view.s;
  const selR = sel && sel.r;
  // underlay: floor below in light grey
  underRooms().forEach(r => {
    const pts = r.pts
      .map(S)
      .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
      .join(' ');
    const c = S(centroid(r.pts));
    out += `<polygon points="${pts}" fill="none" stroke="var(--under)" stroke-width="2" stroke-linejoin="round" pointer-events="none"/>`;
    if (tab !== 'vent')
      out += `<text x="${c.x}" y="${c.y + 40}" text-anchor="middle" font-size="11" fill="var(--under)" stroke="none" pointer-events="none">${esc(r.name)}</text>`;
  });
  // rooms from a lower floor that continue through this one
  videRooms().forEach(r => {
    const pts = r.pts
      .map(S)
      .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
      .join(' ');
    const c = S(centroid(r.pts));
    const base = P.floors[floorIdx(r.floorId)];
    if (sel && sel.r === r.id)
      out += `<polygon points="${pts}" fill="var(--accent-soft-2)" stroke="none" pointer-events="none"/>`;
    out += `<polygon data-k="vide" data-r="${r.id}" points="${pts}" fill="url(#videhatch)" stroke="var(--wall)" stroke-width="5" stroke-linejoin="miter" style="cursor:pointer"/>`;
    out += `<text x="${c.x}" y="${c.y - 4}" text-anchor="middle" class="rname" font-size="10.5" pointer-events="none">${r.kind === 'trap' ? 'Trappenhuis' : 'Vide'} · ${esc(r.name)}</text><text x="${c.x}" y="${c.y + 12}" text-anchor="middle" class="rsub" font-size="10" pointer-events="none">loopt door vanaf ${esc(base.name)}</text>`;
  });
  // room fills
  curRooms().forEach(r => {
    const pts = r.pts
      .map(S)
      .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
      .join(' ');
    out += `<polygon class="room" data-k="room" data-r="${r.id}" points="${pts}" fill="${selR === r.id ? 'var(--accent-soft-2)' : 'var(--room)'}" stroke="none"/>`;
  });
  // walls: dark architectural line on the drawn outline (shared walls coincide), construction colour as a strip on the room side
  const P2 = (e, t, o) => S({ x: e.a.x + e.ux * t - e.nx * o, y: e.a.y + e.uy * t - e.ny * o });
  curRooms().forEach(r => {
    const pts = r.pts
      .map(S)
      .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
      .join(' ');
    out += `<polygon points="${pts}" fill="none" stroke="var(--wall)" stroke-width="5" stroke-linejoin="miter" pointer-events="none"/>`;
  });
  curRooms().forEach(r => {
    r.pts.forEach((_, i) => {
      const e = edge(r, i);
      if (e.L < 1e-6) return;
      const b = bounds(r, i);
      const w = r.walls[i];
      w.segs.forEach((sg, j) => {
        const s0 = b[j],
          s1 = b[j + 1];
        if (s1 - s0 < 1e-4) return;
        const a = P2(e, s0 + 3 / view.s, off),
          bb = P2(e, s1 - 3 / view.s, off),
          w0 = P2(e, s0, 0),
          w1 = P2(e, s1, 0);
        const con = conById(sg.cid);
        const isSel = sel && sel.t === 'seg' && sel.r === r.id && sel.w === i && sel.s === j,
          isHov = hoverSeg && hoverSeg.r === r.id && hoverSeg.w === i && hoverSeg.s === j;
        if (isHov && !isSel)
          out += `<line x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke="var(--accent)" stroke-opacity=".45" stroke-width="16" stroke-linecap="round"/>`;
        if (isSel)
          out += `<line x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke="var(--heat)" stroke-opacity=".55" stroke-width="16" stroke-linecap="round"/>`;
        if (sg.adj === 'open')
          out += `<line x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke="var(--paper)" stroke-width="7"/><line x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke="var(--room)" stroke-width="7"/><line x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="6 5"/>`;
        else
          out += `<line x1="${a.x}" y1="${a.y}" x2="${bb.x}" y2="${bb.y}" stroke="${con ? con.color : 'var(--warn)'}" stroke-width="${isSel ? 4 : 3}" stroke-linecap="round" ${con ? '' : 'stroke-dasharray="3 3"'}/>`;
        out += `<line class="hit" data-k="seg" data-r="${r.id}" data-w="${i}" data-s="${j}" x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke-width="18"/>`;
        // windows and doors: orange in the wall, each at its own place; drag them along the wall
        opLayout(r, i, j).forEach(({ o, t0, t1 }) => {
          const p0 = P2(e, t0 + 0.02, 0),
            p1 = P2(e, t1 - 0.02, 0),
            moving = drag && drag.type === 'op' && drag.o === o.id;
          out += `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="var(--heat)" stroke-width="${moving ? 9 : 7}"/><line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="var(--paper)" stroke-width="1.2"/>`;
          if (tool === 'select')
            out += `<line class="hit" data-k="op" data-r="${r.id}" data-w="${i}" data-s="${j}" data-o="${o.id}" x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke-width="16" style="cursor:grab"><title>${esc(o.name)}: sleep om te verplaatsen</title></line>`;
          if (moving) {
            const m = P2(e, (t0 + t1) / 2, -22 / view.s);
            out += `<text x="${m.x}" y="${m.y + 4}" text-anchor="middle" class="dim" pointer-events="none">${fmt(t0 - s0)} | ${esc(o.name)} | ${fmt(s1 - t1)} m</text>`;
          }
        });
      });
      // cut markers
      w.cuts.forEach((c, ci) => {
        if (c <= 0 || c >= e.L) return;
        const m = P2(e, c, off / 2);
        const big = selR === r.id;
        const tx = e.nx * 9,
          ty = e.ny * 9;
        out += `<line x1="${m.x - tx}" y1="${m.y - ty}" x2="${m.x + tx}" y2="${m.y + ty}" stroke="var(--ink)" stroke-width="2"/>`;
        if (big)
          out += `<circle data-k="cut" data-r="${r.id}" data-w="${i}" data-c="${ci}" cx="${m.x}" cy="${m.y}" r="6" fill="var(--surface)" stroke="var(--heat)" stroke-width="2" style="cursor:ew-resize"/>`;
      });
    });
  });
  // the other side of a selected shared wall part lights up too
  if (sel && sel.t === 'seg') {
    const sr = getRoom(sel.r);
    if (sr && sr.walls[sel.w] && sr.walls[sel.w].segs[sel.s])
      partnersOf(sr, sel.w, sel.s).forEach(p => {
        if (!presentOn(p.o, curFloor)) return;
        const f = edge(p.o, p.k);
        const a = S({ x: f.a.x + f.ux * p.u0, y: f.a.y + f.uy * p.u0 }),
          b = S({ x: f.a.x + f.ux * p.u1, y: f.a.y + f.uy * p.u1 });
        out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--heat)" stroke-opacity=".35" stroke-width="12" stroke-dasharray="10 6" pointer-events="none"/>`;
      });
  }
  // pipe network: index circuit (orange glow) and risers
  const NET = (P.pipes || []).length || P.hpPos ? network() : null;
  if (NET) {
    NET.edges.forEach(e => {
      if (e.vert) {
        [e.a, e.b].forEach(n => {
          if (n.f !== curFloor) return;
          const q = S(n);
          out += `<circle cx="${q.x}" cy="${q.y}" r="8" fill="var(--surface)" stroke="#DC2626" stroke-width="1.5" pointer-events="none"/><text x="${q.x}" y="${q.y + 4}" text-anchor="middle" font-size="11" fill="#DC2626" stroke="none" pointer-events="none">↕</text>`;
        });
        return;
      }
      if (e.a.f !== curFloor || !NET.indexEdges.has(e)) return;
      const a = S(e.a),
        b = S(e.b);
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#F59E0B" stroke-opacity=".55" stroke-width="15" stroke-linecap="round" pointer-events="none"/>`;
    });
  }
  // pipe network: one line = supply (red) and return (blue)
  (P.pipes || [])
    .filter(pp => pp.floorId === curFloor)
    .forEach(pp => {
      const pts = pp.pts
          .map(S)
          .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
          .join(' '),
        isSel = sel && sel.t === 'pipe' && sel.p === pp.id;
      if (isSel)
        out += `<polyline points="${pts}" fill="none" stroke="var(--heat)" stroke-opacity=".35" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
      out += `<polyline points="${pts}" fill="none" stroke="#2563EB" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/><polyline points="${pts}" fill="none" stroke="#DC2626" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
      if (tool === 'select')
        out += `<polyline class="hit" data-k="pipe" data-p="${pp.id}" points="${pts}" fill="none" stroke-width="14"/>`;
      let bi = 1,
        bl = 0;
      pp.pts.forEach((p, i) => {
        if (i && dist(pp.pts[i - 1], p) > bl) {
          bl = dist(pp.pts[i - 1], p);
          bi = i;
        }
      });
      const a = pp.pts[bi - 1],
        b = pp.pts[bi],
        m = S({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const tr = NET ? NET.edges.filter(e => e.pp === pp && e.inTree && !e.vert) : [],
        mq = tr.length ? Math.max(...tr.map(e => e.lh)) : 0,
        mv = tr.length ? Math.max(...tr.map(e => e.v)) : 0;
      out += `<text x="${m.x}" y="${m.y - 9}" text-anchor="middle" class="dim" font-size="10" pointer-events="none" ${mv > V_OK ? 'style="fill:var(--warn)"' : ''}>${esc((PIPES[pp.mat] || {}).label || '')} ${esc(dnLabel(pp.mat, pp.dn))} · ${fmt(pipeLen(pp) + pp.extra, 1)} m${tr.length ? ` · ${fmtW(mq)} l/h · ${fmt(mv, 2)} m/s` : ''}</text>`;
      if (isSel && tool === 'select') {
        pp.pts.forEach((p, i) => {
          const q = S(p);
          if (i < pp.pts.length - 1) {
            const r2 = S(pp.pts[i + 1]);
            out += `<circle data-k="pipemid" data-p="${pp.id}" data-i="${i}" cx="${(q.x + r2.x) / 2}" cy="${(q.y + r2.y) / 2}" r="5" fill="var(--surface)" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="2 2" style="cursor:copy"/>`;
          }
          out += `<circle data-k="pipept" data-p="${pp.id}" data-i="${i}" cx="${q.x}" cy="${q.y}" r="6" fill="var(--surface)" stroke="#DC2626" stroke-width="2" style="cursor:grab"/>`;
        });
      }
    });
  // staircases: treads and an arrow pointing up
  curRooms().forEach(r => {
    if (r.kind !== 'trap' || !spans(r)) return;
    const el = floorElev(),
      l = levelsOf(r),
      sg = stairTreads(r, el[P.floors[l[0] + 1].id] - el[r.floorId]);
    if (!sg) return;
    sg.treads.forEach(q => {
      out += `<polygon points="${q.poly
        .map(S)
        .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
        .join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-opacity=".7" pointer-events="none"/>`;
    });
    const mids = sg.treads.map(q => S(centroid(q.poly)));
    out += `<polyline points="${mids.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1.4" pointer-events="none"/>`;
    const a = mids[mids.length - 2] || mids[0],
      b = mids[mids.length - 1],
      ang = Math.atan2(b.y - a.y, b.x - a.x),
      hd = 8;
    out += `<path d="M${b.x} ${b.y}L${b.x - hd * Math.cos(ang - 0.45)} ${b.y - hd * Math.sin(ang - 0.45)}M${b.x} ${b.y}L${b.x - hd * Math.cos(ang + 0.45)} ${b.y - hd * Math.sin(ang + 0.45)}" stroke="var(--muted)" stroke-width="1.4" pointer-events="none"/>`;
    out += `<circle cx="${mids[0].x}" cy="${mids[0].y}" r="2.5" fill="var(--muted)" pointer-events="none"/>`;
  });
  // heat emitters: radiators etc. as thick blue bars, underfloor heating as a hatched area
  curRooms().forEach(r =>
    (r.emitters || []).forEach(em => {
      const isSel = sel && sel.t === 'em' && sel.e === em.id;
      const o = emOutput(em, r),
        pc = pipeCheck(em, o);
      if (em.kind === 'vv') {
        const pts = em.pts
          .map(S)
          .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
          .join(' ');
        out += `<polygon points="${pts}" fill="url(#vvhatch)" stroke="var(--c-hp)" stroke-width="${isSel ? 2.5 : 1.5}" stroke-dasharray="6 4" pointer-events="none"/>`;
        out += `<polygon data-k="em" data-r="${r.id}" data-e="${em.id}" points="${pts}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" style="cursor:pointer"/>`;
        if (isSel && tool === 'select') {
          em.pts.forEach((p, i) => {
            const a = S(p),
              b = S(em.pts[(i + 1) % em.pts.length]);
            out += `<circle data-k="vvmid" data-r="${r.id}" data-e="${em.id}" data-i="${i}" cx="${(a.x + b.x) / 2}" cy="${(a.y + b.y) / 2}" r="5" fill="var(--surface)" stroke="var(--c-hp)" stroke-width="1.5" stroke-dasharray="2 2" style="cursor:copy"><title>Klik om een hoekpunt toe te voegen</title></circle>`;
            out += `<circle data-k="vvpt" data-r="${r.id}" data-e="${em.id}" data-i="${i}" cx="${a.x}" cy="${a.y}" r="6" fill="var(--surface)" stroke="var(--c-hp)" stroke-width="2" style="cursor:grab"><title>Sleep om te verplaatsen, dubbelklik om weg te halen</title></circle>`;
          });
        }
        const q = S(em.pts[0]);
        out += `<text x="${q.x + 6}" y="${q.y + 14}" class="dim" font-size="10" style="fill:var(--c-hp)" pointer-events="none">${pc.state !== 'ok' ? '⚠ ' : ''}VV ${fmt(o / 1000, 2)} kW</text>`;
      } else {
        const a = S(em.a),
          b = S(em.b);
        if (isSel)
          out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--c-hp)" stroke-opacity=".3" stroke-width="18" stroke-linecap="round"/>`;
        out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--c-hp)" stroke-width="7" stroke-linecap="round" pointer-events="none"/>`;
        if (em.kind !== 'rad')
          out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--paper)" stroke-width="1.5" stroke-dasharray="${em.kind === 'fan' ? '1 4' : '5 3'}" pointer-events="none"/>`;
        out += `<line class="hit" data-k="em" data-r="${r.id}" data-e="${em.id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="18"/>`;
        if (isSel && tool === 'select')
          [
            ['a', a],
            ['b', b]
          ].forEach(
            ([end, q]) =>
              (out += `<circle data-k="emend" data-r="${r.id}" data-e="${em.id}" data-end="${end}" cx="${q.x}" cy="${q.y}" r="6" fill="var(--surface)" stroke="var(--c-hp)" stroke-width="2" style="cursor:crosshair"><title>Sleep om de lengte te veranderen</title></circle>`)
          );
        if (drag && drag.type === 'emend' && drag.e === em.id) {
          const mm = S(emMid(em));
          out += `<text x="${mm.x}" y="${mm.y - 14}" text-anchor="middle" class="dim" pointer-events="none">${fmt(emLen(em))} m</text>`;
        }
        const m = S(emMid(em)),
          c = S(centroid(r.pts)),
          dx = c.x - m.x,
          dy = c.y - m.y,
          dd = Math.hypot(dx, dy) || 1;
        out += `<text x="${m.x + (dx / dd) * 16}" y="${m.y + (dy / dd) * 16 + 3}" text-anchor="middle" class="dim" font-size="10" style="fill:var(--c-hp)" pointer-events="none">${pc.state !== 'ok' ? '⚠ ' : ''}${fmt(o / 1000, 2)} kW${em.boost ? ' ⟳' : ''}</text>`;
      }
    })
  );
  if (drag && drag.type === 'emline') {
    const a = S(drag.p0),
      b = S(drag.p1);
    out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--c-hp)" stroke-width="7" stroke-linecap="round" stroke-opacity=".7"/><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 10}" text-anchor="middle" class="dim">${fmt(dist(drag.p0, drag.p1))} m</text>`;
  }
  if (drag && drag.type === 'emrect') {
    const a = S(drag.p0),
      b = S(drag.p1),
      x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y),
      w = Math.abs(a.x - b.x),
      hh = Math.abs(a.y - b.y);
    out += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#vvhatch)" stroke="var(--c-hp)" stroke-width="2"/><text x="${x + w / 2}" y="${y + hh / 2 + 4}" text-anchor="middle" class="dim">${fmt(Math.abs(drag.p1.x - drag.p0.x) * Math.abs(drag.p1.y - drag.p0.y), 1)} m²</text>`;
  }
  if ((tool === 'emit' || tool === 'vv') && hover && !drag) {
    const q = S(hover);
    out += `<circle cx="${q.x}" cy="${q.y}" r="4" fill="none" stroke="var(--c-hp)" stroke-width="1.8"/>`;
  }
  // heat pump: start of the pipe network
  const hpMark = (p, ghost) => {
    const q = S(p);
    return `<g pointer-events="none" ${ghost ? 'opacity=".5"' : ''}><rect x="${q.x - 15}" y="${q.y - 11}" width="30" height="22" rx="4" fill="var(--surface)" stroke="#DC2626" stroke-width="2"/><text x="${q.x}" y="${q.y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#DC2626" stroke="none">WP</text></g>`;
  };
  if (P.hpPos && P.hpPos.floorId === curFloor) out += hpMark(P.hpPos, false);
  if (tool === 'hp' && hover) out += hpMark(hover, true);
  if (tool === 'pipe' && hover && !drag) {
    const q = S(hover),
      big = hover.kind && hover.kind !== 'grid' && hover.kind !== 'align';
    out += `<circle cx="${q.x}" cy="${q.y}" r="${big ? 7 : 4}" fill="none" stroke="#DC2626" stroke-width="1.8" ${hover.kind === 'riser' ? 'stroke-dasharray="3 2"' : ''}/>`;
    if (hover.kind === 'riser')
      out += `<text x="${q.x + 10}" y="${q.y - 8}" class="dim" font-size="10" fill="#DC2626">stijgleiding</text>`;
  }
  // knee walls: a dashed line where the partition stands, storage behind it
  curRooms().forEach(r => {
    const K = kneeLines(r);
    K.cs.forEach(k => {
      const sg = lineAcross(r, K.R, k.c);
      if (!sg) return;
      const a = S(sg[0]),
        b = S(sg[1]),
        m = S({ x: (sg[0].x + sg[1].x) / 2, y: (sg[0].y + sg[1].y) / 2 }),
        cc = S(labelPt(r.pts)),
        dx = m.x - cc.x,
        dy = m.y - cc.y,
        d = Math.hypot(dx, dy) || 1;
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--ink)" stroke-opacity=".75" stroke-width="2.2" stroke-dasharray="8 5" pointer-events="none"/>`;
      out += `<text x="${m.x + (dx / d) * 14}" y="${m.y + (dy / d) * 14 + 3}" text-anchor="middle" class="dim" font-size="10" pointer-events="none">knieschot ${fmt(r.roof.kneeH, 2)} m</text>`;
    });
  });
  // sloped roofs: ridge (orange dashes) and the edge of a flat ceiling (grey dashes), with heights
  curRooms().forEach(r => {
    const R = roofOf(r);
    if (!R) return;
    roofLines(R).forEach(c => {
      const sg = lineAcross(r, R, c);
      if (!sg) return;
      const a = S(sg[0]),
        b = S(sg[1]);
      const ridge = R.type === 'zadel' && R.wc === 0;
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${ridge ? 'var(--heat)' : 'var(--muted)'}" stroke-width="1.6" stroke-dasharray="7 5" pointer-events="none"/>`;
      const lx = a.x + (b.x - a.x) * 0.12,
        ly = a.y + (b.y - a.y) * 0.12;
      out += `<text x="${lx}" y="${ly - 5}" class="dim" font-size="10" pointer-events="none" ${ridge ? '' : 'style="fill:var(--muted)"'}>${ridge ? 'nok' : 'plafond'} ${fmt(R.z(c), 2)} m</text>`;
    });
    // outer walls: mark the low eave(s) with the height of the wall plate (not when a knee wall stands in front of it)
    const eaves = kneeLines(r).cs.length ? [] : R.type === 'zadel' ? [R.smin, R.smax] : [R.lowMin ? R.smin : R.smax];
    eaves.forEach(c => {
      const sg = lineAcross(r, R, c + (c === R.smin ? 1e-6 : -1e-6));
      if (!sg) return;
      const m = S({ x: (sg[0].x + sg[1].x) / 2, y: (sg[0].y + sg[1].y) / 2 });
      const cc = S(centroid(r.pts));
      const dx = cc.x - m.x,
        dy = cc.y - m.y,
        d = Math.hypot(dx, dy) || 1;
      out += `<text x="${m.x + (dx / d) * 18}" y="${m.y + (dy / d) * 18 + 3}" text-anchor="middle" class="dim" font-size="10" style="fill:var(--muted)" pointer-events="none">${fmt(R.knee, 2)} m</text>`;
    });
  });
  // air flows between rooms: moving arrows, in the Ventilatie tab for all rooms, otherwise for the selected room.
  // Texts are placed so they do not cover the room labels or each other.
  if ((tab === 'vent' || (sel && sel.t === 'room')) && P.rooms.length > 1) {
    const boxes = [],
      hits = b => boxes.some(o => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
    // room labels (name, kW, bar, temperature) are obstacles
    curRooms().forEach(r => {
      const c = S(labelPt(r.pts));
      boxes.push({ x: c.x - 62, y: c.y - (tab === 'vent' ? 44 : 28), w: 124, h: tab === 'vent' ? 82 : 66 });
    });
    const place = (x, y, txt, steps) => {
      const w = txt.length * 6.2 + 6,
        h = 13;
      for (const dy of steps || [0, -13, 13, -26, 26, -39, 39, -52, 52]) {
        const b = { x: x - w / 2, y: y + dy - 10, w, h };
        if (!hits(b)) {
          boxes.push(b);
          return y + dy;
        }
      }
      boxes.push({ x: x - w / 2, y: y - 10, w, h });
      return y;
    };
    const airText = (x, y, txt, steps) =>
      `<text x="${x.toFixed(1)}" y="${place(x, y, txt, steps).toFixed(1)}" text-anchor="middle" class="dim" font-size="10" style="fill:var(--c-air)" pointer-events="none">${esc(txt)}</text>`;
    let labels = '';
    // supply and extraction per room, just above the room name
    if (tab === 'vent')
      curRooms().forEach(r => {
        if (!(r.sup > 0 || r.ext > 0)) return;
        const p = S(labelPt(r.pts));
        out += `<text x="${p.x}" y="${p.y - 30}" text-anchor="middle" class="dim" font-size="10" style="fill:var(--c-air)" pointer-events="none">${r.sup > 0 ? '+' + fmtW(r.sup) + (P.settings.ventSys === 'D' ? ' inblaas' : ' toevoer') : ''}${r.sup > 0 && r.ext > 0 ? ' · ' : ''}${r.ext > 0 ? '−' + fmtW(r.ext) + ' afzuig' : ''}</text>`;
      });
    const below = {}; // notes about other floors, stacked under each room
    airFlows()
      .filter(t => tab === 'vent' || t.from === sel.r || t.to === sel.r)
      .forEach(t => {
        const a = getRoom(t.from),
          b = getRoom(t.to);
        if (!a || !b) return;
        const onA = presentOn(a, curFloor),
          onB = presentOn(b, curFloor),
          w = Math.min(7, 1.5 + t.q / 25);
        if (onA && onB) {
          const p = S(labelPt(a.pts)),
            q = S(labelPt(b.pts)),
            dx = q.x - p.x,
            dy = q.y - p.y,
            L = Math.hypot(dx, dy) || 1,
            ux = dx / L,
            uy = dy / L,
            off = Math.min(52, L / 3);
          const p0 = { x: p.x + ux * off, y: p.y + uy * off },
            p1 = { x: q.x - ux * off, y: q.y - uy * off },
            mx = (p0.x + p1.x) / 2 - uy * L * 0.12,
            my = (p0.y + p1.y) / 2 + ux * L * 0.12;
          out += `<path d="M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}" fill="none" stroke="var(--c-air)" stroke-width="${w.toFixed(1)}" stroke-linecap="round" class="airflow" marker-end="url(#airhead)" pointer-events="none"/>`;
          // the label on the curve itself (its middle), moved up or down until it is free
          labels += airText(
            0.25 * p0.x + 0.5 * mx + 0.25 * p1.x,
            0.25 * p0.y + 0.5 * my + 0.25 * p1.y - 6,
            fmtW(t.q) + ' m³/h'
          );
        } else if (onA || onB) {
          // to or from another floor: a note under the room on this floor
          const r = onA ? a : b,
            other = onA ? b : a,
            p = S(labelPt(r.pts)),
            above = floorIdx(other.floorId) > floorIdx(curFloor),
            k = (below[r.id] = (below[r.id] || 0) + 1);
          labels += airText(
            p.x,
            p.y + 40 + k * 13,
            (onA ? (above ? '↑' : '↓') + ' naar ' : (above ? '↓' : '↑') + ' uit ') +
              other.name +
              ' ' +
              fmtW(t.q) +
              ' m³/h',
            [0, 13, 26, 39, 52, 65]
          );
        }
      });
    out += labels;
  }
  // labels: small caps name + area, heat load in kW, breakdown bar, temperature
  curRooms().forEach(r => {
    const c = S(labelPt(r.pts));
    const k = calc[r.id];
    let x0 = 1e9,
      x1 = -1e9,
      y0 = 1e9,
      y1 = -1e9;
    r.pts.forEach(p => {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    });
    const wpx = (x1 - x0) * view.s,
      hpx = (y1 - y0) * view.s;
    const full = wpx >= 110 && hpx >= 96;
    out += `<text x="${c.x}" y="${c.y - 14}" text-anchor="middle" class="rname" font-size="10.5" pointer-events="none">${esc(r.name)}${spans(r) ? ' ↑' : ''}${full ? ' · ' + fmt(k.Af, 1) + ' m²' : ''}${k.missing ? ' ⚠' : ''}</text>`;
    out += `<text x="${c.x}" y="${c.y + 6}" text-anchor="middle" class="rheat" font-size="${full ? 18 : 14}" pointer-events="none">${fmt(k.total / 1000, 2)} kW</text>`;
    if (full) {
      const bw = Math.min(84, wpx - 30),
        br = brk(k),
        tot = br.fab + br.gla + br.air;
      let bx = c.x - bw / 2;
      if (tot > 0)
        [
          ['fab', '--seg-fabric'],
          ['gla', '--seg-glass'],
          ['air', '--seg-air']
        ].forEach(([key, col]) => {
          const sw = (br[key] / tot) * (bw - 6);
          if (sw <= 0.5) return;
          out += `<rect x="${bx}" y="${c.y + 13}" width="${sw}" height="4" rx="2" fill="var(${col})" pointer-events="none"/>`;
          bx += sw + 3;
        });
      out += `<text x="${c.x}" y="${c.y + 32}" text-anchor="middle" class="rsub" font-size="10.5" pointer-events="none">${nv(r.temp, 1)} °C</text>`;
    }
  });
  // selected room: dimension lines with pill labels + vertices
  const room = selR && getRoom(selR);
  if (room) {
    room.pts.forEach((_, i) => {
      const e = edge(room, i);
      if (e.L * view.s < 36) return;
      const o = -24 / view.s;
      const d0 = P2(e, 0, o),
        d1 = P2(e, e.L, o),
        w0 = P2(e, 0, -4 / view.s),
        w1 = P2(e, e.L, -4 / view.s),
        m = P2(e, e.L / 2, o);
      const tk = 5,
        nx = e.nx * tk,
        ny = e.ny * tk;
      out += `<g pointer-events="none" stroke="var(--heat)"><line x1="${w0.x}" y1="${w0.y}" x2="${d0.x + nx}" y2="${d0.y + ny}" stroke-opacity=".35" stroke-width="1"/><line x1="${w1.x}" y1="${w1.y}" x2="${d1.x + nx}" y2="${d1.y + ny}" stroke-opacity=".35" stroke-width="1"/>
        <line x1="${d0.x}" y1="${d0.y}" x2="${d1.x}" y2="${d1.y}" stroke-width="1.3"/><line x1="${d0.x - nx}" y1="${d0.y - ny}" x2="${d0.x + nx}" y2="${d0.y + ny}" stroke-width="1.3"/><line x1="${d1.x - nx}" y1="${d1.y - ny}" x2="${d1.x + nx}" y2="${d1.y + ny}" stroke-width="1.3"/></g>`;
      const txt = `${fmt(e.L)} m`,
        tw = txt.length * 6.6 + 22;
      out += `<g pointer-events="none"><rect x="${m.x - tw / 2}" y="${m.y - 9}" width="${tw}" height="18" rx="9" fill="var(--surface)" stroke="var(--heat)" stroke-width="1"/><text x="${m.x}" y="${m.y + 3.8}" text-anchor="middle" class="pilltxt"><tspan fill="var(--muted)">${i + 1}</tspan>  ${txt}</text></g>`;
    });
    room.pts.forEach((p, i) => {
      const q = S(p);
      const isV = sel.t === 'vtx' && sel.i === i;
      out += `<circle data-k="vtx" data-r="${room.id}" data-i="${i}" cx="${q.x}" cy="${q.y}" r="${isV ? 7 : 5.5}" fill="${isV ? 'var(--heat)' : 'var(--surface)'}" stroke="var(--heat)" stroke-width="2" style="cursor:grab"/>`;
    });
  }
  // split hover
  if (tool === 'split' && hoverSplit) {
    const r = getRoom(hoverSplit.r);
    if (r) {
      const e = edge(r, hoverSplit.w);
      const t = hoverSplit.t;
      const m = S({ x: e.a.x + e.ux * t - e.nx * off, y: e.a.y + e.uy * t - e.ny * off });
      out += `<line x1="${m.x - e.nx * 12}" y1="${m.y - e.ny * 12}" x2="${m.x + e.nx * 12}" y2="${m.y + e.ny * 12}" stroke="var(--accent)" stroke-width="2.5"/>`;
      out += `<text x="${m.x - e.nx * 26}" y="${m.y - e.ny * 26 + 4}" text-anchor="middle" class="dim">${fmt(t)} | ${fmt(e.L - t)} m</text>`;
    }
  }
  // wall tool: line being drawn, and the part that becomes a new room while the dialog is open
  if (pendSplit) {
    const r = getRoom(pendSplit.r),
      parts = r && splitRoomParts(r, pendSplit.line);
    if (parts) {
      const pts = parts.small.pts
        .map(S)
        .map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))
        .join(' ');
      out += `<polygon points="${pts}" fill="var(--accent)" fill-opacity=".18" stroke="none" pointer-events="none"/>`;
    }
    const lp = pendSplit.line.map(S);
    out += `<path d="M${lp.map(p => p.x + ' ' + p.y).join('L')}" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linejoin="round" pointer-events="none"/>`;
  }
  if (tool === 'wall' && !pendSplit) {
    const pts = drawPts.map(S);
    if (pts.length)
      out += `<path d="M${pts.map(p => p.x + ' ' + p.y).join('L')}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linejoin="round"/>`;
    if (hover && pts.length) {
      const h = S(hover),
        l = pts[pts.length - 1];
      out += `<line x1="${l.x}" y1="${l.y}" x2="${h.x}" y2="${h.y}" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 4"/>`;
      out += `<text x="${(l.x + h.x) / 2}" y="${(l.y + h.y) / 2 - 8}" text-anchor="middle" class="dim">${fmt(dist(hover, drawPts[drawPts.length - 1]))} m</text>`;
    }
    pts.forEach(
      p =>
        (out += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>`)
    );
    if (hover) {
      const h = S(hover),
        edgeHit = hover.kind === 'vtx' || hover.kind === 'edge';
      out += `<circle cx="${h.x}" cy="${h.y}" r="${edgeHit ? 7 : 3.5}" fill="${edgeHit ? 'var(--accent-soft-2)' : 'none'}" stroke="var(--accent)" stroke-width="1.8"/>`;
    }
  }
  // drawing previews
  if ((tool === 'poly' || tool === 'vv' || tool === 'pipe') && drawPts.length) {
    const col = tool === 'poly' ? 'var(--accent)' : tool === 'vv' ? 'var(--c-hp)' : '#DC2626',
      closed = tool !== 'pipe';
    const pts = drawPts.map(S);
    let d = 'M' + pts.map(p => p.x + ' ' + p.y).join('L');
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5"/>`;
    if (hover) {
      const h = S(hover),
        l = pts[pts.length - 1];
      out += `<line x1="${l.x}" y1="${l.y}" x2="${h.x}" y2="${h.y}" stroke="${col}" stroke-width="2" stroke-dasharray="5 4"/>`;
      if (closed && drawPts.length >= 2)
        out += `<line x1="${h.x}" y1="${h.y}" x2="${pts[0].x}" y2="${pts[0].y}" stroke="${col}" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 4"/>`;
      const L = dist(hover, drawPts[drawPts.length - 1]);
      out += `<text x="${(l.x + h.x) / 2}" y="${(l.y + h.y) / 2 - 8}" text-anchor="middle" class="dim">${fmt(L)} m</text>`;
    }
    pts.forEach(
      (p, i) =>
        (out += `<circle cx="${p.x}" cy="${p.y}" r="${closed && i === 0 && drawPts.length >= 3 ? 7 : 4}" fill="var(--surface)" stroke="${col}" stroke-width="2"/>`)
    );
  }
  if (tool === 'rect' && drag && drag.type === 'rect') {
    const a = S(drag.p0),
      b = S(drag.p1);
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y),
      w = Math.abs(a.x - b.x),
      h = Math.abs(a.y - b.y);
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--accent-soft-2)" stroke="var(--accent)" stroke-width="2"/>`;
    out += `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" class="dim">${fmt(Math.abs(drag.p1.x - drag.p0.x))} × ${fmt(Math.abs(drag.p1.y - drag.p0.y))} m</text>`;
  }
  if ((tool === 'poly' || tool === 'rect') && hover && !(drag && drag.type === 'rect')) {
    const h = S(hover);
    out += `<circle cx="${h.x}" cy="${h.y}" r="${hover.kind === 'vtx' ? 7 : 3.5}" fill="none" stroke="var(--accent)" stroke-width="1.8"/>`;
  }
  svg.innerHTML = out;
  renderScale();
  renderLegend();
}
function renderScale() {
  const targets = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
  let m = 1;
  for (const t of targets) {
    if (t * view.s >= 60) {
      m = t;
      break;
    }
    m = t;
  }
  $('scalebar').innerHTML = `<span>${nv(m, 1)} m</span><i style="width:${(m * view.s).toFixed(0)}px"></i>`;
}
function renderLegend() {
  const used = new Map();
  curRooms().forEach(r =>
    r.walls.forEach(w =>
      w.segs.forEach(s => {
        const c = conById(s.cid);
        if (c) used.set(c.id, c);
      })
    )
  );
  const el = $('legend');
  if (!used.size) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = [...used.values()]
    .map(
      c =>
        `<div><span class="sw" style="background:${esc(c.color)}"></span><span>${esc(c.name)} · U ${nv(c.U, 3)}</span></div>`
    )
    .join('');
}
function updateCoords() {
  $('coords').textContent = cursorW ? `x ${fmt(cursorW.x)}  y ${fmt(cursorW.y)} m` : 'x –  y –';
}

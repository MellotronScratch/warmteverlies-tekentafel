// Gereedschappen, bewerkingen (ongedaan maken, splitsen, vides) en muis/toetsenbord.
'use strict';
/* ---------- hints & tools ---------- */
const HINTS = {
  hp: 'Klik waar de warmtepomp (of de aansluiting van het buitendeel) staat. Laat daarna een leiding hier beginnen: het leidingnet wordt vanaf dit punt doorgerekend.',
  select:
    'Klik een wanddeel of ruimte om te bewerken. Sleep hoekpunten of een hele ruimte. Dubbelklik op een wand om een hoekpunt toe te voegen. Sleep een lege plek om te schuiven, scroll om te zoomen.',
  rect: 'Sleep een rechthoek voor een nieuwe ruimte. Punten klikken vast op het raster en op hoeken van andere ruimtes. Alt: niet vastklikken.',
  poly: 'Klik de hoekpunten. Sluit door op het eerste punt te klikken, te dubbelklikken of Enter. Backspace haalt het laatste punt weg, Esc annuleert.',
  wall: 'Klik op de rand van een ruimte, zet eventueel knikpunten binnen de ruimte en eindig op een andere rand. Daarna kun je de ruimte langs die lijn in tweeën splitsen. Backspace haalt het laatste punt weg, Esc annuleert.',
  split:
    'Klik op een wand om hem op die plek in twee delen te splitsen. Elk deel krijgt een eigen constructie en isolatiewaarde.',
  emit: 'Sleep een lijn binnen een ruimte voor een radiator, convector of fancoil. Daarna kies je de soort en vul je het vermogen in. De aansluitleiding volgt uit de leiding die je naar het element tekent.',
  vv: 'Klik de hoekpunten van de vloerverwarming (bijvoorbeeld een L-vorm) en sluit op het eerste punt, met dubbelklik of Enter. Slepen geeft een rechthoek. Een hele ruimte vullen kan ook met de knop bij de ruimte.',
  pipe: 'Klik de punten van een leiding, bijvoorbeeld van de warmtepomp naar de verdeler of de radiatoren. Eén lijn is aanvoer en retour samen. Rond af met dubbelklik of Enter.'
};
function setTool(t) {
  if ((t === 'pipe' || t === 'hp') && !layerOn('pipes')) setLayer('pipes', true);
  if ((t === 'emit' || t === 'vv') && !layerOn('emit')) setLayer('emit', true);
  if (pendSplit) closeAsk();
  if (view3d && t !== 'select') {
    view3d = false;
    stage.classList.remove('is3d');
    const b = $('z-3d');
    b.setAttribute('aria-pressed', 'false');
    b.textContent = '2,5D';
  }
  tool = t;
  drawPts = [];
  drag = null;
  hover = null;
  hoverSplit = null;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  stage.className = 'stage t-' + t;
  $('hint').textContent = HINTS[t];
  renderCanvas();
}

/* ---------- mutations ---------- */
function pushUndo() {
  undoStack.push(JSON.stringify(P));
  if (undoStack.length > 120) undoStack.shift();
  redoStack = [];
  updateUndoBtns();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(P));
  P = normalizeProject(JSON.parse(undoStack.pop()));
  all[P.id] = P;
  validateSel();
  markDirty(true);
  renderAll();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(P));
  P = normalizeProject(JSON.parse(redoStack.pop()));
  all[P.id] = P;
  validateSel();
  markDirty(true);
  renderAll();
}
function updateUndoBtns() {
  $('btn-undo').disabled = !undoStack.length;
  $('btn-redo').disabled = !redoStack.length;
}
function validateSel() {
  if (!sel) return;
  if (sel.t === 'pipe') {
    if (!(P.pipes || []).some(x => x.id === sel.p && x.floorId === curFloor)) sel = null;
    return;
  }
  if (sel.t === 'hp') {
    if (!P.hpPos || P.hpPos.floorId !== curFloor) sel = null;
    return;
  }
  const r = getRoom(sel.r);
  if (!r || !presentOn(r, curFloor)) {
    sel = null;
    return;
  }
  // a stairwell or vide from a floor below can be selected here as a whole; its walls and radiators only on its own floor
  if (r.floorId !== curFloor) {
    sel = { t: 'room', r: r.id };
    return;
  }
  if (sel.t === 'seg') {
    if (!r.walls[sel.w] || !r.walls[sel.w].segs[sel.s]) sel = { t: 'room', r: r.id };
  }
  if (sel.t === 'vtx' && !r.pts[sel.i]) sel = { t: 'room', r: r.id };
  if (sel.t === 'em' && !(r.emitters || []).some(x => x.id === sel.e)) sel = { t: 'room', r: r.id };
}
function defaultCid(kind) {
  const c = P.constructions.find(c => c.kind === kind);
  return c ? c.id : '';
}
function makeRoom(pts) {
  const n = P.rooms.length + 1;
  const wc = defaultCid('wand');
  const r = {
    id: rid(),
    name: (P.floors[floorIdx(curFloor)] || {}).below
      ? P.floors[floorIdx(curFloor)].below === 'kelder'
        ? 'Kelder'
        : 'Kruipruimte'
      : 'Ruimte ' + n,
    floorId: curFloor,
    temp: (P.floors[floorIdx(curFloor)] || {}).below ? (P.floors[floorIdx(curFloor)].below === 'kelder' ? 12 : 10) : 20,
    heated: !(P.floors[floorIdx(curFloor)] || {}).below,
    height:
      (P.floors[floorIdx(curFloor)] || {}).below === 'kruip'
        ? 0.6
        : (P.floors[floorIdx(curFloor)] || {}).below === 'kelder'
          ? 2.2
          : P.settings.height,
    sup: 0,
    ext: 0,
    pts: pts.map(p => ({ x: r3(p.x), y: r3(p.y) })),
    walls: pts.map(() => ({ cuts: [], segs: [seg(wc, 'auto')] })),
    floor: { cid: defaultCid('vloer'), adj: 'auto', t: 20 },
    ceil: { cid: defaultCid('dak'), adj: 'auto', t: 20 },
    roof: {
      type: 'plat',
      pitch: 45,
      knee: 0.6,
      edge: 0,
      low: 'min',
      cid: defaultCid('dak'),
      adj: 'buiten',
      t: 20,
      flat: false
    }
  };
  {
    const below = surfNeighbours(r, 'floor', r.pts);
    if (below && below.length) {
      const big = (below.filter(n => n.room).sort((a, b) => b.A - a.A)[0] || {}).room;
      if (big && big.ceil && big.ceil.cid) r.floor.cid = big.ceil.cid;
    }
  }
  const pieces = clipToVides(r);
  if (!pieces.length) {
    toast('Deze ruimte valt helemaal in een vide van een verdieping lager.');
    renderCanvas();
    return;
  }
  pushUndo();
  pieces.forEach((x, k) => {
    if (k > 0) {
      x.id = rid();
      x.name = r.name + ' (' + (k + 1) + ')';
    }
    P.rooms.push(x);
  });
  sel = { t: 'room', r: pieces[0].id };
  tab = 'sel';
  markDirty();
  renderAll();
  toast(
    pieces.length === 1 && pieces[0] === r
      ? `${r.name} toegevoegd. Klik op een wand om de constructie te kiezen.`
      : pieces.length === 1
        ? `${r.name} toegevoegd. Het stuk dat in de vide valt, is eruit geknipt.`
        : `${r.name} toegevoegd in ${pieces.length} delen: de vide is eruit geknipt. De delen hebben een open verbinding.`
  );
}
function finishVV() {
  const pts = drawPts.filter((p, i) => i === 0 || dist(p, drawPts[i - 1]) > 1e-6);
  drawPts = [];
  hover = null;
  if (pts.length >= 3 && Math.abs(polyArea(pts)) > 0.1) addEmitter('vv', { pts });
  else renderCanvas();
}
let lastPipeSpec = { mat: 'pex', dn: '26' };
// snapping for pipes: heat pump, radiator ends, floor heating corners, points of other pipes (also one floor up or down,
// for a riser), onto another pipe (a T-junction), otherwise the grid
function pipeSnap(wp, o) {
  o = o || {};
  if (!o.alt) {
    let best = null,
      bd = 10 / view.s;
    const tryP = (p, kind) => {
      const d = dist(p, wp);
      if (d < bd) {
        bd = d;
        best = { x: p.x, y: p.y, kind };
      }
    };
    if (P.hpPos && P.hpPos.floorId === curFloor) tryP(P.hpPos, 'vtx');
    curRooms().forEach(r =>
      (r.emitters || []).forEach(em => {
        if (em.kind === 'vv') em.pts.forEach(p => tryP(p, 'vtx'));
        else if (em.a && em.b) {
          tryP(em.a, 'vtx');
          tryP(em.b, 'vtx');
        }
      })
    );
    const fi = floorIdx(curFloor);
    (P.pipes || []).forEach(pp => {
      const pf = floorIdx(pp.floorId);
      if (Math.abs(pf - fi) > 1) return;
      pp.pts.forEach((p, i) => {
        if (o.skip && o.skip.p === pp.id && o.skip.i === i) return;
        tryP(p, pf === fi ? 'vtx' : 'riser');
      });
    });
    drawPts.forEach(p => tryP(p, 'vtx'));
    if (best) return best;
    (P.pipes || [])
      .filter(pp => pp.floorId === curFloor)
      .forEach(pp => {
        for (let i = 1; i < pp.pts.length; i++) {
          if (o.skip && o.skip.p === pp.id && (o.skip.i === i || o.skip.i === i - 1)) continue;
          const h = onSeg(wp, pp.pts[i - 1], pp.pts[i], bd);
          if (h && dist(wp, h.q) < bd) {
            bd = dist(wp, h.q);
            best = { x: r3(h.q.x), y: r3(h.q.y), kind: 'edge' };
          }
        }
      });
    if (best) return best;
  }
  return snapPoint(wp, { prev: o.prev, next: o.next, alt: o.alt });
}
function finishPipe() {
  const pts = drawPts.filter((p, i) => i === 0 || dist(p, drawPts[i - 1]) > 1e-6);
  drawPts = [];
  hover = null;
  if (pts.length < 2 || pipeLen({ pts }) < 0.2) {
    renderCanvas();
    return;
  }
  pushUndo();
  const pp = {
    id: rid(),
    floorId: curFloor,
    pts,
    mat: lastPipeSpec.mat,
    dn: lastPipeSpec.dn,
    extra: 0,
    name: 'Leiding ' + (P.pipes.length + 1)
  };
  P.pipes.push(pp);
  sel = { t: 'pipe', p: pp.id };
  tab = 'sel';
  markDirty();
  renderAll();
  toast(`${pp.name} getekend (${fmt(pipeLen(pp))} m). Kies het leidingtype en de diameter.`);
}
// floor heating that fills a whole room, 10 cm from the walls
function insetPoly(pts, d) {
  const n = pts.length,
    sg = polyArea(pts) >= 0 ? 1 : -1,
    L = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n],
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len,
      uy = dy / len;
    L.push({ p: { x: a.x - sg * uy * d, y: a.y + sg * ux * d }, u: { x: ux, y: uy } });
  }
  const m = L.length,
    out = [];
  for (let i = 0; i < m; i++) {
    const A = L[(i - 1 + m) % m],
      B = L[i],
      den = A.u.x * B.u.y - A.u.y * B.u.x;
    if (Math.abs(den) < 1e-9) {
      out.push({ x: r3(B.p.x), y: r3(B.p.y) });
      continue;
    }
    const t = ((B.p.x - A.p.x) * B.u.y - (B.p.y - A.p.y) * B.u.x) / den;
    out.push({ x: r3(A.p.x + A.u.x * t), y: r3(A.p.y + A.u.y * t) });
  }
  const a0 = polyArea(pts),
    a1 = polyArea(out);
  return Math.sign(a0) === Math.sign(a1) && Math.abs(a1) > 0.05 && Math.abs(a1) < Math.abs(a0) ? out : null;
}
function finishPoly() {
  const pts = drawPts.filter((p, i) => i === 0 || dist(p, drawPts[i - 1]) > 1e-6);
  drawPts = [];
  hover = null;
  if (pts.length >= 3 && Math.abs(polyArea(pts)) > 0.01) makeRoom(pts);
  else renderCanvas();
}
function addCut(room, i, t) {
  const w = room.walls[i];
  const L = edge(room, i).L;
  if (t <= 0.02 || t >= L - 0.02) return;
  if (w.cuts.some(c => Math.abs(c - t) < 0.02)) return;
  pushUndo();
  const j = w.cuts.filter(c => c < t).length;
  w.cuts.splice(j, 0, r3(t));
  const src = w.segs[j];
  w.segs.splice(j + 1, 0, { cid: src.cid, adj: src.adj, adjT: src.adjT, openings: [] });
  sel = { t: 'seg', r: room.id, w: i, s: j + 1 };
  tab = 'sel';
  markDirty();
  renderAll();
  toast(`Wand ${i + 1} gesplitst op ${fmt(t)} m. Kies nu de constructie van het nieuwe deel.`);
}
function removeCut(room, i, c) {
  const w = room.walls[i];
  if (c < 0 || c >= w.cuts.length) return;
  pushUndo();
  const merged = w.segs[c].openings.concat(w.segs[c + 1].openings);
  w.cuts.splice(c, 1);
  w.segs.splice(c + 1, 1);
  w.segs[c].openings = merged;
  sel = { t: 'seg', r: room.id, w: i, s: c };
  markDirty();
  renderAll();
}
function insertVertex(room, i, t) {
  const e = edge(room, i);
  if (t < 0.05 || t > e.L - 0.05) return;
  pushUndo();
  const p = { x: r3(e.a.x + e.ux * t), y: r3(e.a.y + e.uy * t) };
  const w = room.walls[i];
  const j = w.cuts.filter(c => c < t).length;
  const w1 = { cuts: w.cuts.slice(0, j), segs: w.segs.slice(0, j + 1).map(clone) };
  const tail = w.segs.slice(j).map(clone);
  tail[0].openings = [];
  tail.forEach((s, k) => {
    if (k > 0)
      s.openings.forEach(o => {
        if (Number.isFinite(o.at)) o.at = r3(o.at - t);
      });
  });
  const w2 = { cuts: w.cuts.slice(j).map(c => r3(c - t)), segs: tail };
  room.pts.splice(i + 1, 0, p);
  room.walls.splice(i, 1, w1, w2);
  sel = { t: 'vtx', r: room.id, i: i + 1 };
  markDirty();
  renderAll();
}
function deleteSelection() {
  if (!sel) return;
  if (sel.t === 'hp') {
    pushUndo();
    P.hpPos = null;
    sel = null;
    markDirty();
    renderAll();
    toast('Warmtepomp weggehaald.', true);
    return;
  }
  if (sel.t === 'pipe') {
    pushUndo();
    P.pipes = P.pipes.filter(x => x.id !== sel.p);
    sel = null;
    markDirty();
    renderAll();
    toast('Leiding verwijderd.', true);
    return;
  }
  const room = getRoom(sel.r);
  if (!room) return;
  if (sel.t === 'em') {
    pushUndo();
    room.emitters = (room.emitters || []).filter(x => x.id !== sel.e);
    sel = { t: 'room', r: room.id };
    markDirty();
    renderAll();
    toast('Afgifte-element verwijderd.', true);
    return;
  }
  if (sel.t === 'vtx') {
    if (room.pts.length <= 3) {
      toast('Een ruimte heeft minstens drie hoekpunten.');
      return;
    }
    pushUndo();
    room.pts.splice(sel.i, 1);
    room.walls.splice(sel.i, 1);
    normalizeWalls(room);
    sel = { t: 'room', r: room.id };
    markDirty();
    renderAll();
    return;
  }
  if (sel.t === 'seg') {
    if (room.walls[sel.w].segs.length > 1) {
      const c = sel.s > 0 ? sel.s - 1 : 0;
      removeCut(room, sel.w, c);
      toast('Splitsing verwijderd.', true);
    } else toast('Selecteer de ruimte zelf om hem te verwijderen.');
    return;
  }
  pushUndo();
  P.rooms = P.rooms.filter(r => r !== room);
  P.transfers = P.transfers.filter(t => t.from !== room.id && t.to !== room.id);
  sel = null;
  markDirty();
  renderAll();
  toast(`${room.name} verwijderd.`, true);
}
function splitT(room, i, w, alt) {
  const e = edge(room, i);
  let t = (w.x - e.a.x) * e.ux + (w.y - e.a.y) * e.uy;
  t = Math.max(0, Math.min(e.L, t));
  if (!alt) {
    const tol = 10 / view.s;
    let best = null,
      bd = tol;
    neighbourIntervals(room, i).forEach(n =>
      n.ivs.forEach(iv =>
        iv.forEach(v => {
          const d = Math.abs(v - t);
          if (d < bd && v > 0.02 && v < e.L - 0.02) {
            bd = d;
            best = v;
          }
        })
      )
    );
    if (best != null) return r3(best);
    const st = Math.max(0.001, P.settings.snap);
    t = r3(Math.round(t / st) * st);
  }
  return t;
}

/* ---------- wall tool: draw a line through a room and split the room along it ---------- */
let pendSplit = null; // {r, line} while the "split this room?" dialog is open
function onSeg(p, a, b, tol) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return null;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return dist(p, q) <= tol ? { q, t } : null;
}
function onBoundary(room, p, tol) {
  for (let i = 0; i < room.pts.length; i++) {
    const e = edge(room, i);
    if (onSeg(p, e.a, e.b, tol || 2e-3)) return i;
  }
  return -1;
}
function wallSnap(wp, o) {
  // corner points first, then the nearest wall of a room, otherwise the grid
  o = o || {};
  const prev = o.prev,
    v = snapPoint(wp, { prev, alt: o.alt });
  if (v.kind === 'vtx' || o.alt) return v;
  const tol = 10 / view.s;
  let best = null,
    bd = tol;
  curRooms().forEach(r =>
    r.pts.forEach((_, i) => {
      const e = edge(r, i);
      const h = onSeg(wp, e.a, e.b, tol);
      if (h && dist(wp, h.q) < bd) {
        bd = dist(wp, h.q);
        best = { e, q: h.q };
      }
    })
  );
  // knee walls (dashed lines) count as a place to start or end a wall
  curRooms().forEach(r =>
    kneeSegs(r).forEach(([a, b]) => {
      const h = onSeg(wp, a, b, tol);
      if (h && dist(wp, h.q) < bd) {
        const L = dist(a, b);
        bd = dist(wp, h.q);
        best = { e: { a, b, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L }, q: h.q, knee: true };
      }
    })
  );
  if (!best) return v;
  const e = best.e,
    st = Math.max(0.001, P.settings.snap),
    al = 8 / view.s;
  let x = best.q.x,
    y = best.q.y;
  const clampTo = (val, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), val));
  if (Math.abs(e.uy) < 1e-9) {
    y = e.a.y;
    x = clampTo(prev && Math.abs(x - prev.x) < al ? prev.x : r3(Math.round(x / st) * st), e.a.x, e.b.x);
  } else if (Math.abs(e.ux) < 1e-9) {
    x = e.a.x;
    y = clampTo(prev && Math.abs(y - prev.y) < al ? prev.y : r3(Math.round(y / st) * st), e.a.y, e.b.y);
  } else {
    x = r3(x);
    y = r3(y);
  }
  return { x, y, kind: best.knee ? 'knie' : 'edge' };
}
const onKneeLine = p => curRooms().some(r => kneeSegs(r).some(([a, b]) => onSeg(p, a, b, 2e-3)));
// a wall drawn from knee wall to knee wall runs on, in the same direction, to the outer walls of the room
function extendToBoundary(line) {
  const room = curRooms().find(r => {
    const a = line[0],
      b = line[1];
    return pointInPoly({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r.pts);
  });
  if (!room) return line;
  const hit = (p, d) => {
    let best = null;
    room.pts.forEach((a, i) => {
      const b = room.pts[(i + 1) % room.pts.length],
        den = d.x * (b.y - a.y) - d.y * (b.x - a.x);
      if (Math.abs(den) < 1e-12) return;
      const t = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / den,
        u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
      if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && (best == null || t < best)) best = t;
    });
    return best == null ? null : { x: r3(p.x + d.x * best), y: r3(p.y + d.y * best) };
  };
  const out = line.slice();
  // the wall stops at the knee wall: behind it the line only divides the room (an open connection, no wall)
  let first = false,
    last = false;
  if (onBoundary(room, out[0]) < 0 && onKneeLine(out[0])) {
    const q = hit(out[0], { x: out[0].x - out[1].x, y: out[0].y - out[1].y });
    if (q) {
      out.unshift(q);
      first = true;
    }
  }
  const m = out.length;
  if (onBoundary(room, out[m - 1]) < 0 && onKneeLine(out[m - 1])) {
    const q = hit(out[m - 1], { x: out[m - 1].x - out[m - 2].x, y: out[m - 1].y - out[m - 2].y });
    if (q) {
      out.push(q);
      last = true;
    }
  }
  out.openSegs = new Set([...(first ? [0] : []), ...(last ? [out.length - 2] : [])]);
  return out;
}
function crossesProper(p1, p2, q1, q2) {
  const o = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const E = 1e-9;
  const d1 = o(q1, q2, p1),
    d2 = o(q1, q2, p2),
    d3 = o(p1, p2, q1),
    d4 = o(p1, p2, q2);
  return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E));
}
function splitEdgeAt(room, i, t) {
  // put a corner point in wall i at distance t; both halves keep their wall parts. Returns the new point.
  const e = edge(room, i),
    w = room.walls[i],
    p = { x: r3(e.a.x + e.ux * t), y: r3(e.a.y + e.uy * t) };
  let head, tail;
  const near = w.cuts.findIndex(c => Math.abs(c - t) <= 0.01);
  if (near >= 0) {
    head = { cuts: w.cuts.slice(0, near), segs: w.segs.slice(0, near + 1).map(clone) };
    tail = { cuts: w.cuts.slice(near + 1).map(c => r3(c - t)), segs: w.segs.slice(near + 1).map(clone) };
  } else {
    const j = w.cuts.filter(c => c < t).length,
      lo = j > 0 ? w.cuts[j - 1] : 0,
      hi = j < w.cuts.length ? w.cuts[j] : e.L;
    head = { cuts: w.cuts.slice(0, j), segs: w.segs.slice(0, j + 1).map(clone) };
    tail = { cuts: w.cuts.slice(j).map(c => r3(c - t)), segs: w.segs.slice(j).map(clone) };
    if (t - lo >= hi - t) tail.segs[0].openings = [];
    else head.segs[j].openings = [];
  } // windows of the part that is cut stay with the longer half
  tail.segs.forEach(sg =>
    sg.openings.forEach(o => {
      if (Number.isFinite(o.at)) o.at = r3(Math.max(0, o.at - t));
    })
  );
  head._o = tail._o = w._o;
  room.pts.splice(i + 1, 0, p);
  room.walls.splice(i, 1, head, tail);
  return p;
}
function ensureVertex(room, p) {
  const n = room.pts.length;
  const v = room.pts.find(q => dist(q, p) < 2e-3);
  if (v) return v;
  for (let i = 0; i < n; i++) {
    const e = edge(room, i);
    const h = onSeg(p, e.a, e.b, 2e-3);
    if (!h) continue;
    const t = h.t * e.L;
    if (t < 0.01) return room.pts[i];
    if (t > e.L - 0.01) return room.pts[(i + 1) % n];
    return splitEdgeAt(room, i, t);
  }
  return null;
}
const innerWallCid = () => (P.constructions.find(c => c.kind === 'wand' && c.inner) || {}).id || defaultCid('wand');
function splitRoomParts(room, line, open) {
  // two new rooms {big,small} from cutting room along line, or null if the line does not divide it cleanly
  const R = clone(room);
  R.walls.forEach((w, i) => (w._o = i));
  const va = ensureVertex(R, line[0]),
    vb = ensureVertex(R, line[line.length - 1]);
  if (!va || !vb || va === vb) return null;
  const n = R.pts.length,
    a = R.pts.indexOf(va),
    b = R.pts.indexOf(vb),
    inner = line.slice(1, -1).map(p => ({ x: r3(p.x), y: r3(p.y) }));
  // line.openSegs: parts of the line behind a knee wall, where the new wall does not continue (an open connection)
  const ic = innerWallCid(),
    so = line.openSegs || new Set(),
    nw = k => ({ cuts: [], segs: [seg(ic, open || so.has(k) ? 'open' : 'auto')], _o: -1 });
  const ring = (from, to) => {
    const pts = [],
      walls = [];
    for (let k = from; ; k = (k + 1) % n) {
      pts.push(R.pts[k]);
      if (k === to) break;
      walls.push(R.walls[k]);
    }
    return { pts, walls };
  };
  const A = ring(a, b),
    B = ring(b, a);
  A.pts.push(...inner.slice().reverse());
  B.pts.push(...inner);
  // B runs along the line from start to end, A the other way round
  for (let k = 0; k <= inner.length; k++) {
    A.walls.push(nw(inner.length - k));
    B.walls.push(nw(k));
  }
  const a0 = Math.abs(polyArea(room.pts)),
    aA = Math.abs(polyArea(A.pts)),
    aB = Math.abs(polyArea(B.pts));
  if (aA < 0.05 || aB < 0.05 || Math.abs(aA + aB - a0) > 0.01 + a0 * 1e-3) return null;
  const mk = (g, area, id) => {
    const r = clone({ ...R, pts: g.pts, walls: g.walls });
    r.id = id;
    const f = area / a0;
    r.sup = Math.round(room.sup * f * 10) / 10;
    r.ext = Math.round(room.ext * f * 10) / 10;
    r.roof.edge = Math.max(
      0,
      r.walls.findIndex(w => w._o === (room.roof.edge | 0))
    );
    r.walls.forEach(w => delete w._o);
    normalizeWalls(r);
    return r;
  };
  const bigA = aA >= aB,
    big = mk(bigA ? A : B, bigA ? aA : aB, room.id),
    small = mk(bigA ? B : A, bigA ? aB : aA, rid());
  const inSmall = em => pointInPoly(emMid(em), small.pts);
  small.emitters = (room.emitters || []).filter(inSmall).map(clone);
  big.emitters = (room.emitters || []).filter(em => !inSmall(em)).map(clone);
  return { big, small };
}
function splitTarget(line) {
  // the room on this floor that line runs straight through, from wall to wall
  const n = line.length,
    tol = 2e-3;
  return (
    curRooms().find(r => {
      if (onBoundary(r, line[0], tol) < 0 || onBoundary(r, line[n - 1], tol) < 0) return false;
      for (let k = 1; k < n - 1; k++)
        if (onBoundary(r, line[k], tol) >= 0 || !pointInPoly(line[k], r.pts)) return false;
      for (let k = 0; k < n - 1; k++) {
        const a = line[k],
          b = line[k + 1],
          m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (onBoundary(r, m, tol) >= 0 || !pointInPoly(m, r.pts)) return false;
        for (let i = 0; i < r.pts.length; i++) {
          const e = edge(r, i);
          if (crossesProper(a, b, e.a, e.b)) return false;
        }
      }
      return !!splitRoomParts(r, line);
    }) || null
  );
}
/* ---------- vides: a room on a higher floor may not overlap a room that continues from below (a vide or stairwell) ----------
   The part inside the vide is cut away along the vide's outline, using the same cut as the wall tool. */
function segCross(p, q, a, b) {
  const d = (q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / d,
    u = ((a.x - p.x) * (q.y - p.y) - (a.y - p.y) * (q.x - p.x)) / d;
  return t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9 ? t : null;
}
// the pieces of outline V that run through the inside of room A, each from A's outline to A's outline
function chainsInside(A, V) {
  const tol = 2e-3,
    inA = p => onBoundary(A, p, tol) < 0 && pointInPoly(p, A.pts),
    seq = [];
  V.forEach((p, k) => {
    const q = V[(k + 1) % V.length];
    seq.push(p);
    const ts = [];
    A.pts.forEach((a, i) => {
      const b = A.pts[(i + 1) % A.pts.length];
      const t = segCross(p, q, a, b);
      if (t != null && t > 1e-6 && t < 1 - 1e-6) ts.push(t);
      const h = onSeg(a, p, q, tol);
      if (h && h.t > 1e-6 && h.t < 1 - 1e-6) ts.push(h.t);
    });
    ts.sort((x, y) => x - y).forEach(t => seq.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
  });
  const m = seq.length,
    ins = seq.map((p, k) => {
      const q = seq[(k + 1) % m];
      return dist(p, q) > 1e-6 && inA({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    });
  if (ins.every(Boolean)) return { hole: true, chains: [] };
  const st = ins.findIndex(v => !v),
    chains = [];
  let cur = null;
  for (let n = 1; n <= m; n++) {
    const k = (st + n) % m;
    if (ins[k]) {
      if (!cur) cur = [seq[k]];
      cur.push(seq[(k + 1) % m]);
    } else if (cur) {
      chains.push(cur);
      cur = null;
    }
  }
  if (cur) chains.push(cur);
  return { hole: false, chains: chains.filter(c => c.length >= 2) };
}
// where to put a room's label: the centre if that lies well inside, otherwise the inside point furthest from the walls (L and U shapes)
const _lab = new Map();
function labelPt(pts) {
  const key = pts.map(p => p.x + ',' + p.y).join(' ');
  if (_lab.has(key)) return _lab.get(key);
  const dEdge = p => {
    let d = 1e9;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length],
        dx = b.x - a.x,
        dy = b.y - a.y,
        L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
      d = Math.min(d, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
    });
    return d;
  };
  const c = centroid(pts);
  let best = pointInPoly(c, pts) ? c : null,
    bd = best ? dEdge(c) : -1;
  const xs = pts.map(p => p.x),
    ys = pts.map(p => p.y),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys),
    N = 16;
  if (!best || bd < (0.35 * Math.min(x1 - x0, y1 - y0)) / 2)
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const p = { x: x0 + ((x1 - x0) * i) / N, y: y0 + ((y1 - y0) * j) / N };
        if (!pointInPoly(p, pts)) continue;
        const d = dEdge(p);
        if (d > bd + 1e-6) {
          bd = d;
          best = p;
        }
      }
  best = best || c;
  if (_lab.size > 500) _lab.clear();
  _lab.set(key, best);
  return best;
}
function innerPoint(room) {
  for (let i = 0; i < room.pts.length; i++) {
    const e = edge(room, i);
    if (e.L < 0.03) continue;
    const p = { x: (e.a.x + e.b.x) / 2 - e.nx * 0.01, y: (e.a.y + e.b.y) / 2 - e.ny * 0.01 };
    if (pointInPoly(p, room.pts)) return p;
  }
  return centroid(room.pts);
}
function cutOutVide(room, V, depth) {
  depth = depth || 0;
  if (depth > 14) return [room];
  const c = chainsInside(room, V.pts);
  for (const ch of c.chains) {
    const parts = splitRoomParts(room, ch, false);
    if (parts) return [...cutOutVide(parts.big, V, depth + 1), ...cutOutVide(parts.small, V, depth + 1)];
  }
  if (c.hole || V.pts.some(p => onBoundary(room, p) < 0 && pointInPoly(p, room.pts))) {
    // the vide lies inside the room: cut the room in two through the vide first
    const cc = centroid(V.pts),
      y = r3(cc.y),
      xs = [];
    room.pts.forEach((a, i) => {
      const b = room.pts[(i + 1) % room.pts.length];
      if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
    });
    const xl = Math.max(...xs.filter(x => x < cc.x)),
      xr = Math.min(...xs.filter(x => x > cc.x));
    if (isFinite(xl) && isFinite(xr)) {
      const parts = splitRoomParts(
        room,
        [
          { x: xl, y },
          { x: xr, y }
        ],
        true
      );
      if (parts) return [...cutOutVide(parts.big, V, depth + 1), ...cutOutVide(parts.small, V, depth + 1)];
    }
    return [room];
  }
  return pointInPoly(innerPoint(room), V.pts) && onBoundary(V, innerPoint(room)) < 0 ? [] : [room];
}
const bboxHit = (a, b) => {
  const bb = p => [
    Math.min(...p.map(q => q.x)),
    Math.max(...p.map(q => q.x)),
    Math.min(...p.map(q => q.y)),
    Math.max(...p.map(q => q.y))
  ];
  const A = bb(a.pts),
    B = bb(b.pts);
  return A[0] < B[1] - 1e-3 && B[0] < A[1] - 1e-3 && A[2] < B[3] - 1e-3 && B[2] < A[3] - 1e-3;
};
// cut every vide that runs through this room's floor out of the room; returns the pieces that remain
function clipToVides(room) {
  let pieces = [room];
  P.rooms
    .filter(v => v !== room && v.floorId !== room.floorId && presentOn(v, room.floorId))
    .forEach(v => {
      pieces = pieces.flatMap(p => (bboxHit(p, v) ? cutOutVide(p, v) : [p]));
    });
  return pieces;
}
// a room that now continues upwards: cut it out of the rooms on the floors above
function clipAbove(vide) {
  if (!spans(vide)) return 0;
  let n = 0;
  const l = levelsOf(vide);
  P.floors.slice(l[0] + 1, l[1] + 1).forEach(f => {
    P.rooms
      .filter(r => r.floorId === f.id && bboxHit(r, vide))
      .forEach(r => {
        const ps = cutOutVide(r, vide);
        if (ps.length === 1 && ps[0] === r) return;
        n++;
        ps.forEach((x, k) => {
          if (k > 0) {
            x.id = rid();
            x.name = r.name + ' (' + (k + 1) + ')';
          }
        });
        P.rooms.splice(P.rooms.indexOf(r), 1, ...ps);
      });
  });
  if (n) P.transfers = P.transfers.filter(t => getRoom(t.from) && getRoom(t.to));
  return n;
}

function wallClick(p) {
  const onAny = curRooms().some(r => onBoundary(r, p) >= 0) || onKneeLine(p);
  if (!drawPts.length) {
    if (!onAny) {
      toast('Begin de wand op de rand van een ruimte of op een knieschot.');
      return;
    }
    drawPts.push({ x: p.x, y: p.y });
    renderCanvas();
    return;
  }
  const last = drawPts[drawPts.length - 1];
  if (dist(p, last) < 1e-6) return;
  const line = extendToBoundary(drawPts.concat([{ x: p.x, y: p.y }]));
  if (onAny) {
    const r = splitTarget(line);
    if (r) {
      drawPts = [];
      hover = null;
      askSplit(r, line);
      return;
    }
    toast('Deze lijn deelt geen ruimte in tweeën. Trek hem binnen één ruimte van wand naar wand.');
    return;
  }
  if (!curRooms().some(r => pointInPoly(p, r.pts))) {
    toast('Zet knikpunten binnen de ruimte.');
    return;
  }
  drawPts.push({ x: p.x, y: p.y });
  renderCanvas();
}
function askSplit(room, line) {
  const parts = splitRoomParts(room, line);
  if (!parts) return;
  pendSplit = { r: room.id, line };
  const c = conById(innerWallCid()),
    aB = Math.abs(polyArea(parts.big.pts)),
    aS = Math.abs(polyArea(parts.small.pts));
  const box = $('ask');
  box.innerHTML = `<b>Ruimte splitsen?</b>
    <p>De lijn deelt <b>${esc(room.name)}</b> in ${fmt(aB, 1)} m² en ${fmt(aS, 1)} m². Beide delen houden de wanden, ramen, vloer, plafond, hoogte en temperatuur van ${esc(room.name)}. De nieuwe wand krijgt ${c ? 'de constructie <b>' + esc(c.name) + '</b>' : 'nog geen constructie'} en grenst aan de andere ruimte.${room.sup || room.ext ? ' Toevoer en afzuiging worden naar oppervlak verdeeld.' : ''}${room.roof && room.roof.type !== 'plat' ? ' Controleer daarna het dak van beide ruimtes.' : ''}</p>
    <label class="f" for="ask-name">Naam van het gemarkeerde deel<input class="in" id="ask-name" value="${esc('Ruimte ' + (P.rooms.length + 1))}"></label>
    <label class="f" for="ask-kind">De nieuwe scheiding is<select class="in" id="ask-kind"><option value="wand">een binnenwand</option><option value="open">een open verbinding (geen wand, bijvoorbeeld hal en trapvide)</option></select></label>
    <div class="row"><button class="btn primary" id="ask-ok">Splitsen</button><button class="btn" id="ask-no">Annuleren</button></div>`;
  box.hidden = false;
  $('ask-ok').onclick = doSplit;
  $('ask-no').onclick = closeAsk;
  box.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSplit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeAsk();
    }
  };
  const inp = $('ask-name');
  inp.focus();
  inp.select();
  renderCanvas();
}
function closeAsk() {
  pendSplit = null;
  const box = $('ask');
  box.hidden = true;
  box.innerHTML = '';
  renderCanvas();
}
function doSplit() {
  const ps = pendSplit;
  const name = (($('ask-name') || {}).value || '').trim(),
    open = ($('ask-kind') || {}).value === 'open';
  closeAsk();
  if (!ps) return;
  const room = getRoom(ps.r);
  const parts = room && splitRoomParts(room, ps.line, open);
  if (!parts) return;
  pushUndo();
  parts.small.name = name || 'Ruimte ' + (P.rooms.length + 1);
  P.rooms.splice(P.rooms.indexOf(room), 1, parts.big, parts.small);
  sel = { t: 'room', r: parts.small.id };
  tab = 'sel';
  markDirty();
  renderAll();
  toast(`${room.name} gesplitst in ${parts.big.name} en ${parts.small.name}.`, true);
}

/* ---------- pointer interaction ---------- */
function capture(e) {
  try {
    svg.setPointerCapture(e.pointerId);
  } catch (_) {}
}
function beginPan(e) {
  pan = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  stage.classList.add('panning');
  capture(e);
}
svg.addEventListener('contextmenu', e => e.preventDefault());
svg.addEventListener('mousedown', e => {
  if (e.button === 1) e.preventDefault();
}); // no autoscroll on the middle button
svg.addEventListener('pointerdown', e => {
  if (view3d) {
    e.preventDefault();
    const t3 = e.target.closest ? e.target.closest('[data-k3]') : null;
    const rb = svg.getBoundingClientRect(),
      X = e.clientX - rb.left,
      Y = e.clientY - rb.top;
    const rot = e.button === 1 || (e.button === 0 && e.shiftKey),
      zc = floorElev()[curFloor] || 0;
    drag3 = {
      x: e.clientX,
      y: e.clientY,
      th: v3.th,
      el: v3.el,
      tx: v3.tx,
      ty: v3.ty,
      pan: !rot,
      X,
      Y,
      zc,
      pivot: rot ? unproject3(X, Y, zc) : null,
      moved: false,
      k: t3 && t3.dataset.k3,
      r: t3 && t3.dataset.r,
      w: t3 && +t3.dataset.w,
      s: t3 && +t3.dataset.s
    };
    if (drag3.pan) stage.classList.add('panning');
    capture(e);
    return;
  }
  const wp = toWorld(e);
  const tgt = e.target.closest ? e.target.closest('[data-k]') : null;
  const k = tgt && tgt.dataset.k;
  if (e.button === 1 || e.button === 2 || spaceDown) {
    beginPan(e);
    return;
  }
  if (e.button !== 0) return;
  if (tool === 'select') {
    if (k === 'vtx') {
      sel = { t: 'vtx', r: tgt.dataset.r, i: +tgt.dataset.i };
      drag = { type: 'vtx', r: sel.r, i: sel.i, moved: false };
      capture(e);
      tab = 'sel';
      renderAll();
      return;
    }
    if (k === 'vide') {
      const r = getRoom(tgt.dataset.r);
      if (r) {
        // stay on this floor: the stairwell or vide runs through it
        sel = { t: 'room', r: r.id };
        tab = 'sel';
        renderAll();
      }
      return;
    }
    if (k === 'vvpt' || k === 'vvmid') {
      const r = getRoom(tgt.dataset.r),
        em = r && (r.emitters || []).find(x => x.id === tgt.dataset.e);
      if (!em) return;
      let i = +tgt.dataset.i;
      if (k === 'vvmid') {
        pushUndo();
        const a = em.pts[i],
          b = em.pts[(i + 1) % em.pts.length];
        em.pts.splice(i + 1, 0, { x: r3((a.x + b.x) / 2), y: r3((a.y + b.y) / 2) });
        drag = { type: 'vvpt', r: r.id, e: em.id, i: i + 1, moved: true };
        capture(e);
        renderCanvas();
        return;
      }
      const now = Date.now();
      if (lastPtDown && lastPtDown.id === em.id && lastPtDown.i === i && now - lastPtDown.t < 400) {
        lastPtDown = null;
        if (em.pts.length > 3) {
          pushUndo();
          em.pts.splice(i, 1);
          markDirty();
          renderAll();
        } else toast('Vloerverwarming heeft minstens drie hoekpunten.');
        return;
      }
      lastPtDown = { id: em.id, i, t: now };
      drag = { type: 'vvpt', r: r.id, e: em.id, i, moved: false };
      capture(e);
      return;
    }
    if (k === 'hp') {
      sel = { t: 'hp' };
      tab = 'sel';
      drag = { type: 'hp', moved: false };
      capture(e);
      renderAll();
      return;
    }
    if (k === 'pipe') {
      sel = { t: 'pipe', p: tgt.dataset.p };
      tab = 'sel';
      renderAll();
      return;
    }
    if (k === 'pipept' || k === 'pipemid') {
      const pp = P.pipes.find(x => x.id === tgt.dataset.p);
      if (!pp) return;
      let i = +tgt.dataset.i;
      if (k === 'pipemid') {
        pushUndo();
        const a = pp.pts[i],
          b = pp.pts[i + 1];
        pp.pts.splice(i + 1, 0, { x: r3((a.x + b.x) / 2), y: r3((a.y + b.y) / 2) });
        drag = { type: 'pipept', p: pp.id, i: i + 1, moved: true };
        capture(e);
        renderCanvas();
        return;
      }
      const now = Date.now();
      if (lastPtDown && lastPtDown.id === pp.id && lastPtDown.i === i && now - lastPtDown.t < 400) {
        lastPtDown = null;
        if (pp.pts.length > 2) {
          pushUndo();
          pp.pts.splice(i, 1);
          markDirty();
          renderAll();
        }
        return;
      }
      lastPtDown = { id: pp.id, i, t: now };
      drag = { type: 'pipept', p: pp.id, i, moved: false };
      capture(e);
      return;
    }
    if (k === 'emend') {
      drag = { type: 'emend', r: tgt.dataset.r, e: tgt.dataset.e, end: tgt.dataset.end, moved: false };
      capture(e);
      return;
    }
    if (k === 'em') {
      const r = getRoom(tgt.dataset.r);
      const em = (r.emitters || []).find(x => x.id === tgt.dataset.e);
      if (!em) return;
      sel = { t: 'em', r: r.id, e: em.id };
      tab = 'sel';
      drag = { type: 'em', r: r.id, e: em.id, start: wp, orig: clone(em), moved: false };
      capture(e);
      renderAll();
      return;
    }
    if (k === 'op') {
      const r = getRoom(tgt.dataset.r),
        i = +tgt.dataset.w,
        j = +tgt.dataset.s;
      const it = opLayout(r, i, j).find(x => x.o.id === tgt.dataset.o);
      if (!it) return;
      const ed = edge(r, i);
      sel = { t: 'seg', r: r.id, w: i, s: j };
      tab = 'sel';
      drag = {
        type: 'op',
        r: r.id,
        w: i,
        s: j,
        o: it.o.id,
        grab: (wp.x - ed.a.x) * ed.ux + (wp.y - ed.a.y) * ed.uy - it.t0,
        moved: false
      };
      capture(e);
      renderAll();
      return;
    }
    if (k === 'cut') {
      drag = { type: 'cut', r: tgt.dataset.r, w: +tgt.dataset.w, c: +tgt.dataset.c, moved: false };
      capture(e);
      return;
    }
    if (k === 'seg') {
      const r = tgt.dataset.r,
        w = +tgt.dataset.w,
        now = Date.now();
      if (
        lastSegDown &&
        lastSegDown.r === r &&
        lastSegDown.w === w &&
        now - lastSegDown.t < 400 &&
        Math.hypot(e.clientX - lastSegDown.x, e.clientY - lastSegDown.y) < 8
      ) {
        lastSegDown = null;
        const room = getRoom(r);
        const ed = edge(room, w);
        let t = (wp.x - ed.a.x) * ed.ux + (wp.y - ed.a.y) * ed.uy;
        const st = Math.max(0.001, P.settings.snap);
        insertVertex(room, w, r3(Math.round(t / st) * st));
        return;
      }
      lastSegDown = { r, w, t: now, x: e.clientX, y: e.clientY };
      sel = { t: 'seg', r, w, s: +tgt.dataset.s };
      tab = 'sel';
      renderAll();
      return;
    }
    if (k === 'room') {
      const r = getRoom(tgt.dataset.r);
      if (!(sel && sel.r === r.id && sel.t === 'room')) {
        sel = { t: 'room', r: r.id };
        tab = 'sel';
        renderAll();
      }
      drag = { type: 'room', r: r.id, start: wp, orig: clone(r.pts), oem: clone(r.emitters || []), moved: false };
      capture(e);
      return;
    }
    if (sel) {
      sel = null;
      renderAll();
    }
    beginPan(e);
    return;
  }
  if (tool === 'poly') {
    const p = snapPoint(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey });
    if (drawPts.length >= 3 && dist(p, drawPts[0]) * view.s < 10) {
      finishPoly();
      return;
    }
    const last = drawPts[drawPts.length - 1];
    if (last && dist(p, last) < 1e-6) {
      if (drawPts.length >= 3) finishPoly();
      return;
    }
    drawPts.push({ x: p.x, y: p.y });
    renderCanvas();
    return;
  }
  if (tool === 'rect') {
    const p = snapPoint(wp, { alt: e.altKey });
    drag = { type: 'rect', p0: p, p1: p };
    capture(e);
    renderCanvas();
    return;
  }
  if (tool === 'emit') {
    const p = snapPoint(wp, { alt: e.altKey });
    drag = { type: 'emline', p0: p, p1: p };
    capture(e);
    renderCanvas();
    return;
  }
  if (tool === 'hp') {
    const p = pipeSnap(wp, { alt: e.altKey });
    pushUndo();
    P.hpPos = { floorId: curFloor, x: p.x, y: p.y };
    markDirty();
    setTool('select');
    renderAll();
    toast('Warmtepomp geplaatst. Teken met Leiding (L) vanaf hier naar de verdeler en de radiatoren.');
    return;
  }
  if (tool === 'vv' || tool === 'pipe') {
    const p =
        tool === 'pipe'
          ? pipeSnap(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey })
          : snapPoint(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey }),
      fin = tool === 'vv' ? finishVV : finishPipe;
    if (drawPts.length) {
      if (tool === 'vv' && drawPts.length >= 3 && dist(p, drawPts[0]) * view.s < 10) {
        fin();
        return;
      }
      const last = drawPts[drawPts.length - 1];
      if (dist(p, last) < 1e-6) {
        fin();
        return;
      }
      drawPts.push({ x: p.x, y: p.y });
      renderCanvas();
      return;
    }
    if (tool === 'vv') {
      drag = { type: 'emrect', p0: p, p1: p };
      capture(e);
      renderCanvas();
      return;
    } // drag = rectangle, click = start a polygon
    drawPts.push({ x: p.x, y: p.y });
    renderCanvas();
    return;
  }
  if (tool === 'split') {
    if (k === 'seg') {
      const r = getRoom(tgt.dataset.r);
      const i = +tgt.dataset.w;
      addCut(r, i, splitT(r, i, wp, e.altKey));
    }
    return;
  }
  if (tool === 'wall') {
    if (!pendSplit) wallClick(wallSnap(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey }));
    return;
  }
});
svg.addEventListener('pointermove', e => {
  if (view3d) {
    if (!drag3) return;
    const dx = e.clientX - drag3.x,
      dy = e.clientY - drag3.y;
    if (!drag3.moved && Math.hypot(dx, dy) < 4) return;
    drag3.moved = true;
    if (drag3.pan) {
      v3.tx = drag3.tx + dx;
      v3.ty = drag3.ty + dy;
    } else {
      v3.th = drag3.th + dx * 0.008;
      v3.el = Math.max(0.12, Math.min(1.5, drag3.el + dy * 0.006));
      v3.tx = drag3.tx;
      v3.ty = drag3.ty;
      const q = pr3(drag3.pivot, drag3.zc);
      v3.tx += drag3.X - q.X;
      v3.ty += drag3.Y - q.Y;
    } // keep the clicked point in place
    renderCanvas();
    return;
  }
  const wp = toWorld(e);
  cursorW = wp;
  updateCoords();
  if (pan) {
    view.tx = pan.tx + (e.clientX - pan.x);
    view.ty = pan.ty + (e.clientY - pan.y);
    renderCanvas();
    return;
  }
  if (drag) {
    if (drag.type === 'vtx') {
      const r = getRoom(drag.r);
      const n = r.pts.length;
      const p = snapPoint(wp, {
        exclude: { r: r.id, i: drag.i },
        prev: r.pts[(drag.i - 1 + n) % n],
        next: r.pts[(drag.i + 1) % n],
        alt: e.altKey
      });
      const cur = r.pts[drag.i];
      if (cur.x === p.x && cur.y === p.y) return;
      if (!drag.moved) {
        pushUndo();
        drag.moved = true;
      }
      r.pts[drag.i] = { x: p.x, y: p.y };
      renderCanvas();
      return;
    }
    if (drag.type === 'room') {
      const r = getRoom(drag.r);
      const st = e.altKey ? 0.001 : Math.max(0.001, P.settings.snap);
      let dx = r3(Math.round((wp.x - drag.start.x) / st) * st),
        dy = r3(Math.round((wp.y - drag.start.y) / st) * st);
      // magnet: snap moved vertices to other rooms' vertices
      if (!e.altKey) {
        const tol = 10 / view.s;
        let best = null,
          bd = tol;
        drag.orig.forEach(p => {
          const q = { x: p.x + dx, y: p.y + dy };
          snapRooms().forEach(o => {
            if (o.id === r.id) return;
            o.pts.forEach(v => {
              const d = dist(v, q);
              if (d < bd) {
                bd = d;
                best = { dx: v.x - p.x, dy: v.y - p.y };
              }
            });
          });
        });
        if (best) {
          dx = r3(best.dx);
          dy = r3(best.dy);
        }
      }
      if (!drag.moved && (dx || dy)) {
        pushUndo();
        drag.moved = true;
      }
      if (!drag.moved) return;
      r.pts = drag.orig.map(p => ({ x: r3(p.x + dx), y: r3(p.y + dy) }));
      r.emitters = drag.oem.map(em => shiftEm(em, dx, dy));
      renderCanvas();
      return;
    }
    if (drag.type === 'em') {
      const r = getRoom(drag.r);
      const st = e.altKey ? 0.001 : Math.max(0.001, P.settings.snap);
      const dx = r3(Math.round((wp.x - drag.start.x) / st) * st),
        dy = r3(Math.round((wp.y - drag.start.y) / st) * st);
      if (!drag.moved && (dx || dy)) {
        pushUndo();
        drag.moved = true;
      }
      if (!drag.moved) return;
      const i = r.emitters.findIndex(x => x.id === drag.e);
      if (i >= 0) r.emitters[i] = shiftEm(drag.orig, dx, dy);
      renderCanvas();
      return;
    }
    if (drag.type === 'op') {
      const r = getRoom(drag.r),
        ed = edge(r, drag.w),
        b = bounds(r, drag.w),
        o = r.walls[drag.w].segs[drag.s].openings.find(x => x.id === drag.o);
      if (!o) return;
      const st = e.altKey ? 0.001 : Math.max(0.001, P.settings.snap),
        w = Math.min(o.w, b[drag.s + 1] - b[drag.s]);
      let t = r3(Math.round(((wp.x - ed.a.x) * ed.ux + (wp.y - ed.a.y) * ed.uy - drag.grab) / st) * st);
      t = r3(Math.max(b[drag.s], Math.min(b[drag.s + 1] - w, t)));
      if (!drag.moved) {
        if (Number.isFinite(o.at) && o.at === t) return;
        pushUndo();
        drag.moved = true;
        freezeOpenings(r, drag.w, drag.s);
      }
      o.at = t;
      syncLinkedAt(o, r, drag.w);
      renderCanvas();
      return;
    }
    if (drag.type === 'hp') {
      const p = pipeSnap(wp, { alt: e.altKey });
      if (P.hpPos.x === p.x && P.hpPos.y === p.y) return;
      if (!drag.moved) {
        pushUndo();
        drag.moved = true;
      }
      P.hpPos = { floorId: P.hpPos.floorId, x: p.x, y: p.y };
      renderCanvas();
      return;
    }
    if (drag.type === 'vvpt' || drag.type === 'pipept') {
      const pts =
        drag.type === 'vvpt'
          ? ((getRoom(drag.r).emitters || []).find(x => x.id === drag.e) || {}).pts
          : (P.pipes.find(x => x.id === drag.p) || {}).pts;
      if (!pts) return;
      const n = pts.length,
        closed = drag.type === 'vvpt',
        prev = closed ? pts[(drag.i - 1 + n) % n] : pts[drag.i - 1],
        next = closed ? pts[(drag.i + 1) % n] : pts[drag.i + 1];
      const p =
        drag.type === 'pipept'
          ? pipeSnap(wp, { prev, next, alt: e.altKey, skip: { p: drag.p, i: drag.i } })
          : snapPoint(wp, { prev, next, alt: e.altKey });
      const cur = pts[drag.i];
      if (cur.x === p.x && cur.y === p.y) return;
      if (!drag.moved) {
        pushUndo();
        drag.moved = true;
      }
      pts[drag.i] = { x: p.x, y: p.y };
      renderCanvas();
      return;
    }
    if (drag.type === 'emend') {
      const r = getRoom(drag.r),
        em = (r.emitters || []).find(x => x.id === drag.e);
      if (!em) return;
      const other = drag.end === 'a' ? em.b : em.a;
      const p = snapPoint(wp, { prev: other, alt: e.altKey });
      if (dist(p, other) < 0.2) return;
      const cur = em[drag.end];
      if (cur.x === p.x && cur.y === p.y) return;
      if (!drag.moved) {
        pushUndo();
        drag.moved = true;
      }
      em[drag.end] = { x: p.x, y: p.y };
      if (RAD_TYPES[em.rt]) {
        em.rl = Math.round(emLen(em) * 1000);
        syncRad(em);
      }
      renderCanvas();
      return;
    }
    if (drag.type === 'emline') {
      drag.p1 = snapPoint(wp, { prev: drag.p0, alt: e.altKey });
      renderCanvas();
      return;
    }
    if (drag.type === 'emrect') {
      drag.p1 = snapPoint(wp, { alt: e.altKey });
      renderCanvas();
      return;
    }
    if (drag.type === 'cut') {
      const r = getRoom(drag.r);
      const w = r.walls[drag.w];
      let t = splitT(r, drag.w, wp, e.altKey);
      const lo = (drag.c > 0 ? w.cuts[drag.c - 1] : 0) + 0.02,
        hi = (drag.c < w.cuts.length - 1 ? w.cuts[drag.c + 1] : edge(r, drag.w).L) - 0.02;
      t = Math.max(lo, Math.min(hi, t));
      if (t === w.cuts[drag.c]) return;
      if (!drag.moved) {
        pushUndo();
        drag.moved = true;
      }
      w.cuts[drag.c] = r3(t);
      sel = { t: 'seg', r: r.id, w: drag.w, s: drag.c };
      renderCanvas();
      return;
    }
    if (drag.type === 'rect') {
      drag.p1 = snapPoint(wp, { alt: e.altKey });
      renderCanvas();
      return;
    }
  }
  if (tool === 'wall') {
    hover = pendSplit ? null : wallSnap(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey });
    renderCanvas();
    return;
  }
  if (tool === 'pipe' || tool === 'hp') {
    hover = pipeSnap(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey });
    renderCanvas();
    return;
  }
  if (tool === 'poly' || tool === 'rect' || tool === 'emit' || tool === 'vv') {
    hover = snapPoint(wp, { prev: drawPts[drawPts.length - 1], alt: e.altKey });
    renderCanvas();
    return;
  }
  if (tool === 'split') {
    const tgt = e.target.closest ? e.target.closest('[data-k="seg"]') : null;
    if (tgt) {
      const r = getRoom(tgt.dataset.r);
      const i = +tgt.dataset.w;
      hoverSplit = { r: r.id, w: i, t: splitT(r, i, wp, e.altKey) };
    } else hoverSplit = null;
    renderCanvas();
  }
});
function endPointer() {
  if (drag3) {
    const d = drag3;
    drag3 = null;
    stage.classList.remove('panning');
    if (!d.moved) {
      if (d.k === 'seg') sel = { t: 'seg', r: d.r, w: d.w, s: d.s };
      else if (d.k === 'room') sel = { t: 'room', r: d.r };
      else sel = null;
      tab = 'sel';
      renderAll();
    }
    return;
  }
  if (pan) {
    pan = null;
    stage.classList.remove('panning');
  }
  if (drag) {
    const d = drag;
    drag = null;
    if (d.type === 'emline') {
      if (dist(d.p0, d.p1) >= 0.2) addEmitter('line', { a: { x: d.p0.x, y: d.p0.y }, b: { x: d.p1.x, y: d.p1.y } });
      else renderCanvas();
      return;
    }
    if (d.type === 'emrect') {
      const w = Math.abs(d.p1.x - d.p0.x),
        hh = Math.abs(d.p1.y - d.p0.y);
      if (w >= 0.3 && hh >= 0.3) {
        const x0 = Math.min(d.p0.x, d.p1.x),
          y0 = Math.min(d.p0.y, d.p1.y);
        addEmitter('vv', { pts: rectPts(x0, y0, x0 + w, y0 + hh) });
      } else if (dist(d.p0, d.p1) < 0.05) {
        drawPts = [{ x: d.p0.x, y: d.p0.y }];
        renderCanvas();
      } else renderCanvas();
      return;
    }
    if (d.type === 'rect') {
      const w = Math.abs(d.p1.x - d.p0.x),
        h = Math.abs(d.p1.y - d.p0.y);
      if (w >= 0.1 && h >= 0.1) {
        const x0 = Math.min(d.p0.x, d.p1.x),
          y0 = Math.min(d.p0.y, d.p1.y);
        makeRoom(rectPts(x0, y0, x0 + w, y0 + h));
      } else renderCanvas();
      return;
    }
    if (d.moved) {
      const r = getRoom(d.r);
      if (r) normalizeWalls(r);
      markDirty();
      renderAll();
    } else if (d.type === 'op') renderCanvas();
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('pointerleave', () => {
  if (!drag && !pan) {
    hover = null;
    hoverSplit = null;
    cursorW = null;
    updateCoords();
    if (tool !== 'select') renderCanvas();
  }
});
let lastSegDown = null,
  lastPtDown = null;
svg.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    if (view3d) {
      const f = Math.exp(-e.deltaY * 0.0015),
        ns = Math.max(4, Math.min(400, v3.s * f)),
        k = ns / v3.s,
        cx = e.clientX - r.left,
        cy = e.clientY - r.top;
      v3.tx = cx - (cx - v3.tx) * k;
      v3.ty = cy - (cy - v3.ty) * k;
      v3.s = ns;
      renderCanvas();
      return;
    }
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false }
);
const zoom3 = f => {
  const cx = stage.clientWidth / 2,
    cy = stage.clientHeight / 2,
    ns = Math.max(4, Math.min(400, v3.s * f)),
    k = ns / v3.s;
  v3.tx = cx - (cx - v3.tx) * k;
  v3.ty = cy - (cy - v3.ty) * k;
  v3.s = ns;
  renderCanvas();
};
$('z-in').onclick = () => (view3d ? zoom3(1.25) : zoomAt(1.25, stage.clientWidth / 2, stage.clientHeight / 2));
$('z-out').onclick = () => (view3d ? zoom3(0.8) : zoomAt(0.8, stage.clientWidth / 2, stage.clientHeight / 2));
$('tool-fit').onclick = () => (view3d ? (fit3d(), renderCanvas()) : fit());
$('z-3d').onclick = () => set3d(!view3d);
document.querySelectorAll('[data-tool]').forEach(b => (b.onclick = () => setTool(b.dataset.tool)));
$('btn-undo').onclick = undo;
$('btn-redo').onclick = redo;
new ResizeObserver(() => renderCanvas()).observe(stage);

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
  if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ') {
    spaceDown = true;
    e.preventDefault();
    return;
  }
  const k = e.key.toLowerCase();
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    const i = floorIdx(curFloor) + (e.key === 'PageUp' ? 1 : -1);
    if (i >= 0 && i < P.floors.length) setFloor(P.floors[i].id);
    return;
  }
  if (k === 'o') {
    toggleUnder();
    return;
  }
  if (k === 'v') setTool('select');
  else if (k === 'r') setTool('rect');
  else if (k === 'p') setTool('poly');
  else if (k === 'd') set3d(!view3d);
  else if (k === 's') setTool('split');
  else if (k === 'w') setTool('wall');
  else if (k === 'a') setTool('emit');
  else if (k === 'h') setTool('vv');
  else if (k === 'l') setTool('pipe');
  else if (k === 'k') setTool('hp');
  else if (k === 'f') $('tool-fit').click();
  else if (e.key === 'Escape') {
    if (pendSplit) closeAsk();
    else if (drawPts.length) {
      drawPts = [];
      renderCanvas();
    } else if (tool !== 'select') setTool('select');
    else {
      sel = null;
      renderAll();
    }
  } else if (e.key === 'Enter' && tool === 'poly') {
    finishPoly();
  } else if (e.key === 'Enter' && tool === 'vv' && drawPts.length) {
    finishVV();
  } else if (e.key === 'Enter' && tool === 'pipe' && drawPts.length) {
    finishPipe();
  } else if (
    e.key === 'Backspace' &&
    (tool === 'poly' || tool === 'wall' || tool === 'vv' || tool === 'pipe') &&
    drawPts.length
  ) {
    e.preventDefault();
    drawPts.pop();
    renderCanvas();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select' && sel) {
    e.preventDefault();
    deleteSelection();
  }
});
document.addEventListener('keyup', e => {
  if (e.key === ' ') spaceDown = false;
});

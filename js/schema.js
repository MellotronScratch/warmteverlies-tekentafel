// Schema van het leidingnet: een boom vanaf de warmtepomp naar alle aangesloten afgifte-elementen.
// Rechte stukken zonder aftakking worden samengevoegd tot één leidingstuk met lengte, maat, debiet en snelheid.
'use strict';
const SCH = { col: 210, row: 52, box: 300, pad: 24, bus: 22 };

function pipeShort(pp) {
  if (!pp) return 'leiding';
  const m = PIPES[pp.mat] || PIPES.koper;
  return (pp.mat === 'koper' ? 'Cu' : pp.mat === 'pex' ? 'PEX' : m.label.split(' ')[0]) + ' ' + pp.dn;
}

// tree of schema nodes: {n, segs:[{L, dp, lh, v, pipes, floors, index, to}], ems:[o]}
function schemaTree(N) {
  const kids = n => n.adj.filter(e => e.inTree && e.down && e.down !== n);
  const build = n => {
    const t = { n, ems: n.ems.filter(o => o.reach), segs: [] };
    kids(n).forEach(e0 => {
      const seg = { L: 0, dp: 0, lh: e0.lh, v: 0, pipes: [], floors: [], index: N.indexEdges.has(e0), first: e0 };
      let e = e0,
        m;
      for (;;) {
        m = e.down;
        seg.L += e.L;
        seg.dp += e.dp || 0;
        seg.v = Math.max(seg.v, e.v || 0);
        if (e.vert) seg.floors.push(m.f);
        else if (e.pp && !seg.pipes.includes(e.pp)) seg.pipes.push(e.pp);
        const nx = kids(m);
        if (nx.length !== 1 || m.ems.some(o => o.reach)) break;
        e = nx[0];
      }
      seg.to = build(m);
      t.segs.push(seg);
    });
    return t;
  };
  return build(N.root);
}

function schemaSvg(N) {
  const T = schemaTree(N);
  let rows = 0,
    maxD = 0;
  // place: emitters are leaves (one row each), a junction sits in the middle of its children
  const place = (t, d) => {
    t.d = d;
    maxD = Math.max(maxD, d);
    const ys = [];
    t.ems.forEach(o => ys.push((o.y = rows++)));
    t.segs.forEach(s => ys.push(place(s.to, d + 1)));
    if (!ys.length) ys.push(rows++); // dead end
    t.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    return t.y;
  };
  place(T, 0);
  const fname = id => (P.floors.find(f => f.id === id) || {}).name || '';
  const label = sg => `${sg.pipes.map(pipeShort).join(' + ') || 'leiding'} · ${fmt(sg.L, 1)} m`,
    sub = sg =>
      `${fmtW(sg.lh)} l/h · ${fmt(sg.v, 2)} m/s${sg.v > V_OK ? ' ⚠' : ''}${sg.floors.length ? ' · ↕ ' + sg.floors.map(fname).join(', ') : ''}`;
  const colW = [],
    meas = { box: SCH.box };
  const measure = t => {
    t.segs.forEach(sg => {
      const d = sg.to.d;
      colW[d] = Math.max(
        colW[d] || SCH.col,
        label(sg).length * 6.4 + SCH.bus + 20,
        sub(sg).length * 5.6 + SCH.bus + 20
      );
      measure(sg.to);
    });
    t.ems.forEach(
      o =>
        (meas.box = Math.max(
          meas.box,
          (o.em.name + ' · ' + o.room.name + ' (' + fname(o.room.floorId) + ')').length * 6.6 + 24
        ))
    );
  };
  measure(T);
  const box = meas.box,
    xs = [SCH.pad + 70];
  for (let d = 1; d <= maxD + 1; d++) xs[d] = xs[d - 1] + (colW[d] || SCH.col);
  const X = d => xs[d],
    Y = r => SCH.pad + 20 + r * SCH.row,
    xBox = X(maxD) + SCH.bus + 110,
    W = xBox + box + SCH.pad,
    H = Y(rows - 1) + SCH.row / 2 + SCH.pad;
  let s = '';
  const line = (pts, idx, warn) =>
    `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${idx ? '#F59E0B' : warn ? 'var(--warn)' : 'var(--c-hp)'}" stroke-width="${idx ? 3.2 : 2}" stroke-linejoin="round"/>`;
  const draw = t => {
    const x = X(t.d),
      y = Y(t.y),
      xb = x + SCH.bus;
    t.segs.forEach(sg => {
      const c = sg.to,
        xc = X(c.d),
        yc = Y(c.y),
        warn = sg.v > V_OK;
      s += line(
        [
          [x, y],
          [xb, y],
          [xb, yc],
          [xc, yc]
        ],
        sg.index,
        warn
      );
      const lab = label(sg);
      s += `<text x="${xb + 6}" y="${yc - 6}" font-size="11" class="schl">${esc(lab)}</text>`;
      s += `<text x="${xb + 6}" y="${yc + 14}" font-size="10" class="schs${warn ? ' warn' : ''}">${esc(sub(sg))}</text>`;
      draw(c);
    });
    t.ems.forEach(o => {
      const yo = Y(o.y),
        idx = N.index && N.index.em === o.em,
        extra = N.index ? N.index.dpTot - o.dpTot : 0;
      s += line(
        [
          [x, y],
          [xb, y],
          [xb, yo],
          [xBox, yo]
        ],
        idx,
        false
      );
      s += `<g class="schem" data-r="${o.room.id}" data-e="${o.em.id}" style="cursor:pointer"><rect x="${xBox}" y="${yo - 19}" width="${box}" height="38" rx="7" fill="var(--surface)" stroke="${idx ? '#F59E0B' : 'var(--line)'}" stroke-width="${idx ? 2 : 1}"/>
        <text x="${xBox + 10}" y="${yo - 3}" font-size="12" class="schl"><tspan font-weight="600">${esc(o.em.name)}</tspan> · ${esc(o.room.name)}${P.floors.length > 1 ? ' <tspan class="schs">(' + esc(fname(o.room.floorId)) + ')</tspan>' : ''}</text>
        <text x="${xBox + 10}" y="${yo + 12}" font-size="10" class="schs">${fmt(o.W / 1000, 2)} kW · ${fmtW(o.lh)} l/h · Δp ${fmt(o.dpTot, 1)} kPa · ${idx ? 'indexcircuit' + (o.preset ? ' · ' + (o.preset.kind === 'debiet' ? fmtW(o.preset.s) + ' l/h' : 'stand ' + o.preset.s) : '') : o.preset ? 'inregelen ' + presetText(o, N) : 'inregelen +' + fmt(extra, 1) + ' kPa'}</text><title>Klik om dit element te openen</title></g>`;
    });
    if (!t.ems.length && !t.segs.length && t !== T)
      s += `<circle cx="${x}" cy="${y}" r="4" fill="var(--warn)"/><text x="${x + 8}" y="${y + 4}" font-size="10" class="schs warn">loos eind</text>`;
    else if (t !== T && (t.segs.length + t.ems.length > 1 || t.ems.length))
      s += `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--c-hp)"/>`;
  };
  draw(T);
  // heat pump
  const yr = Y(T.y);
  s += `<rect x="${SCH.pad}" y="${yr - 20}" width="66" height="40" rx="6" fill="var(--surface)" stroke="#DC2626" stroke-width="2"/><text x="${SCH.pad + 33}" y="${yr - 2}" font-size="12" text-anchor="middle" fill="#DC2626" font-weight="700">WP</text><text x="${SCH.pad + 33}" y="${yr + 12}" font-size="9.5" text-anchor="middle" class="schs">${fmtW(N.total)} l/h</text>`;
  return `<svg class="schsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Schema van het leidingnet">${s}</svg>`;
}

function schemaHtml() {
  const N = network();
  let h = `<div class="schhead"><h2>Schema leidingnet</h2><button class="btn small" id="sch-print">Afdrukken</button><button class="btn small" id="sch-close" aria-label="Sluiten">Sluiten ✕</button></div>`;
  if (!N.hp)
    return (
      h +
      `<p class="note">Plaats eerst de warmtepomp met <b>Warmtepomp</b> (K) en teken de leidingen met <b>Leiding</b> (L).</p>`
    );
  if (!N.root)
    return (
      h +
      `<p class="note">De warmtepomp is nog niet verbonden met een leiding. Laat een leiding beginnen bij de warmtepomp (binnen ${nv(ATTACH * 100, 0)} cm).</p>`
    );
  const loose = N.ems.filter(o => !o.reach),
    warn = [];
  if (loose.length)
    warn.push(
      `Niet aangesloten (geen leiding = geen verbinding): ${loose.map(o => `<button class="crumb schgo" data-r="${o.room.id}" data-e="${o.em.id}">${esc(o.room.name)} · ${esc(o.em.name)}</button>`).join(', ')}.`
    );
  const names = es => [...new Set(es.map(e => (e.pp ? e.pp.name : 'stijgleiding')))].map(esc).join(', ');
  if (N.loops)
    warn.push(
      `Rondgaande verbinding (lus) bij ${names(N.loopEdges)}. De app rekent met een boom; die verbinding is in het schema weggelaten. Twee leidingen die elkaar kruisen zonder T-stuk, laat je niet op elkaars punt eindigen.`
    );
  const off = N.edges.filter(e => !e.inTree && !N.loopEdges.includes(e));
  if (off.length) warn.push(`Niet verbonden met de warmtepomp: ${names(off)}.`);
  h += `<p class="note">${N.index ? `Indexcircuit (oranje): ${esc(N.index.em.name)} in ${esc(N.index.room.name)}, ${fmt(N.index.dpTot, 1)} kPa. ` : ''}Totaal ${fmtW(N.total)} l/h bij ΔT ${nv(N.dT, 1)} K. Lengtes zijn enkel (de retour loopt mee), het drukverlies is aanvoer + retour. Klik op een element om het te openen.</p>`;
  if (warn.length) h += warn.map(w => `<p class="note" style="color:var(--warn)">⚠ ${w}</p>`).join('');
  return h + `<div class="schwrap">${schemaSvg(N)}</div>`;
}

function openSchema() {
  const el = $('schema');
  el.innerHTML = `<div class="schbox">${schemaHtml()}</div>`;
  el.hidden = false;
  const c = $('sch-close');
  if (c) c.focus();
}
function closeSchema() {
  const el = $('schema');
  if (el && !el.hidden) {
    el.hidden = true;
    el.innerHTML = '';
  }
}
$('schema').addEventListener('click', e => {
  if (e.target === $('schema') || e.target.closest('#sch-close')) return closeSchema();
  if (e.target.closest('#sch-print')) return window.print();
  const g = e.target.closest('.schem, .schgo');
  if (g) {
    const r = getRoom(g.dataset.r);
    if (!r) return;
    closeSchema();
    curFloor = r.floorId;
    sel = { t: 'em', r: r.id, e: g.dataset.e };
    tab = 'sel';
    renderAll();
  }
});
document.addEventListener(
  'keydown',
  e => {
    if (e.key === 'Escape' && !$('schema').hidden) {
      e.stopPropagation();
      e.preventDefault();
      closeSchema();
    }
  },
  true
);

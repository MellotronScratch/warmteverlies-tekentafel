// Meldingen, export (JSON, CSV) en heatlossjs.
'use strict';
/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg, withUndo) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button id="toast-undo">Ongedaan maken</button>' : ''}`;
  t.hidden = false;
  if (withUndo)
    $('toast-undo').onclick = () => {
      undo();
      t.hidden = true;
    };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), withUndo ? 6000 : 3500);
}

/* ---------- import / export ---------- */
let downloads = null;
async function saveFile(filename, data) {
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      return;
    } catch (err) {
      if (err && err.code === 'declined') return;
    }
  }
  try {
    const type = /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : 'application/json';
    const url = URL.createObjectURL(new Blob([/\.csv$/i.test(filename) ? '\uFEFF' + data : data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(data);
    toast('Downloaden kan hier niet. De inhoud staat op je klembord.');
  } catch (_) {
    toast('Downloaden is in deze weergave niet beschikbaar.');
  }
}
function exportJson() {
  saveFile(safeName(P.name) + '.json', JSON.stringify(P, null, 1));
}
function exportCsv() {
  const c = calcAll();
  const rows = [
    [
      'Ruimte',
      'Temperatuur C',
      'Vloeroppervlak m2',
      'Transmissie W',
      'Ventilatie W',
      'Infiltratie W',
      'Totaal W',
      'W/m2'
    ]
  ];
  c.per.forEach(x =>
    rows.push([
      x.room.name,
      x.room.temp,
      x.c.Af.toFixed(2),
      x.c.trans.toFixed(0),
      x.c.vent.toFixed(0),
      x.c.inf.toFixed(0),
      x.c.total.toFixed(0),
      x.c.Af ? (x.c.total / x.c.Af).toFixed(0) : ''
    ])
  );
  rows.push(['Totaal', '', '', '', '', '', c.total.toFixed(0), '']);
  saveFile(
    safeName(P.name) + ' - warmteverlies.csv',
    rows
      .map(r =>
        r
          .map(v => {
            const s = String(v);
            return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(';')
      )
      .join('\n')
  );
}
/* ---------- heatlossjs (github.com/trystanLea/heatlossjs) ---------- */
function toHeatlossjs() {
  const S = P.settings;
  const T = { external: S.te, ground: S.tGround, unheated: S.tUnheated };
  const element_type = {},
    elements = [],
    rooms = {},
    typeMap = {},
    names = {};
  const taken = new Set(['external', 'ground', 'unheated', 'buurwoning']);
  P.rooms.forEach(r => {
    const n = (r.name || '').trim() || 'Ruimte';
    let k = n,
      i = 2;
    while (taken.has(k)) k = n + ' ' + i++;
    taken.add(k);
    names[r.id] = k;
  });
  const bnd = (type, t) => {
    if (type === 'grond') return 'ground';
    if (type === 'onverwarmd') return 'unheated';
    if (type === 'buurwoning') {
      T.buurwoning = S.tNeighbour;
      return 'buurwoning';
    }
    if (type === 'temp') {
      const k = 'vast ' + nv(t, 1) + ' C';
      T[k] = t;
      return k;
    }
    return 'external';
  };
  const tname = (cid, type) => {
    const c = conById(cid);
    const du = !!(c && DU_TYPES.has(type) && S.dU > 0);
    const k = (c ? c.name : 'Geen constructie') + (du ? ' (+ΔU)' : '');
    if (!element_type[k]) {
      const u = Math.round((c ? c.U + (du ? S.dU : 0) : 0) * 10000) / 10000;
      element_type[k] = { uvalue: u };
      typeMap[k] = { cid: c ? c.id : '', du: du ? S.dU : 0, u };
    }
    return k;
  };
  const add = (nm, el, boundary) => {
    elements.push(el);
    rooms[nm].elements.push({ id: elements.length - 1, boundary });
    return elements.length - 1;
  };
  P.rooms.forEach(r => {
    const R = wallRoof(r),
      Af = Math.abs(polyArea(r.pts)),
      V = roomVolume(r),
      nm = names[r.id],
      h = R ? (Af > 0 ? r3(V / Af) : r.height) : r.height,
      dTe = r.temp - S.te;
    // heatlossjs only knows air changes against the outside temperature (0,33 Wh/m³K): express ventilation + infiltration as an equivalent ach
    const cr = calcRoom(r);
    let ach = 0;
    if (V > 0 && dTe !== 0) ach = (cr.vent + cr.inf) / (0.33 * V * dTe);
    rooms[nm] = {
      temperature: r.temp,
      area: r3(Af),
      height: h,
      air_change_an_hour: Math.round(ach * 10000) / 10000,
      elements: [],
      radiators: [],
      ufh: []
    };
    (r.emitters || []).forEach(em => {
      if (em.kind === 'rad' || em.kind === 'conv')
        rooms[nm].radiators.push({
          name: em.name + (em.boost ? ' (met boosters)' : ''),
          heat50k: Math.round(em.p * (em.boost ? 1 + (em.boostPct || 0) / 100 : 1)),
          model: 'pow'
        });
      else if (em.kind === 'vv')
        rooms[nm].ufh.push({
          name: em.name,
          area: r3(emArea(em)),
          flooring: (VV_COVER[em.cover] || VV_COVER.tegels)[1]
        });
    });
    r.pts.forEach((_, i) => {
      const w = r.walls[i],
        b = bounds(r, i),
        nb = neighbourIntervals(r, i);
      w.segs.forEach((sg, j) => {
        const s0 = b[j],
          s1 = b[j + 1],
          len = s1 - s0;
        if (len <= 1e-4 || sg.adj === 'open') return;
        let parts;
        if (sg.adj === 'auto')
          parts = wallParts(r, i, s0, s1, nb, R).map(p =>
            p.room
              ? { len: p.len, A: p.A, type: 'ruimte', bnd: names[p.room.id], key: p.room.id }
              : { len: p.len, A: p.A, type: 'buiten', bnd: 'external', key: 'buiten' }
          );
        else
          parts = [{ len, A: wallArea(r, edge(r, i), s0, s1, R), type: sg.adj, bnd: bnd(sg.adj, sg.adjT), key: 'adj' }];
        // each opening sits in the wall part at its own place (outside, or a neighbouring room for an inner door)
        const lay = sg.adj === 'auto' ? opLayout(r, i, j) : [];
        const hostOf = o => {
          if (sg.adj !== 'auto') return parts[0];
          const it = lay.find(x => x.o === o),
            tc = it ? (it.t0 + it.t1) / 2 : (s0 + s1) / 2,
            n = nb.find(n => n.ivs.some(v => tc >= v[0] - 1e-6 && tc <= v[1] + 1e-6));
          return parts.find(p => p.key === (n ? n.room.id : 'buiten')) || parts[0];
        };
        const ops = sg.openings.map(o => ({ o, A: Math.max(0, o.w * o.h), host: hostOf(o) }));
        // width × height only works for straight-topped walls; under a sloped roof every piece goes as a net area
        const simple =
          !R &&
          !spans(r) &&
          parts.every(p => ops.filter(x => x.host === p).reduce((a, x) => a + x.A, 0) <= p.len * h + 1e-9);
        if (!simple) {
          let rem = 0;
          ops.forEach(x => {
            const d = x.host ? Math.min(x.host.A, x.A) : 0;
            if (x.host) x.host.A -= d;
            rem += x.A - d;
          });
          parts.forEach(p => {
            const d = Math.min(p.A, rem);
            p.A -= d;
            rem -= d;
          });
        }
        parts.forEach(p => {
          const el = { type: tname(sg.cid, p.type), orientation: '' };
          if (simple) {
            el.width = r3(p.len);
            el.height = h;
          } else el.area = r3(p.A);
          p.idx = add(nm, el, p.bnd);
        });
        ops.forEach(({ o, host }) => {
          const el = { type: tname(o.cid, host ? host.type : 'buiten'), orientation: '', width: o.w, height: o.h };
          if (simple && host) el.subtractfrom = host.idx;
          add(nm, el, host ? host.bnd : 'external');
        });
      });
    });
    transLines(r)
      .lines.filter(l => l.group === 'floor' || l.group === 'ceil' || l.group === 'roof' || l.ri)
      .forEach(l => {
        const s = r[l.group];
        if (!s || l.A < 1e-4) return;
        add(
          nm,
          { type: tname(l.cid || s.cid, l.type), orientation: '', area: r3(l.A) },
          l.nb ? names[l.nb] : bnd(l.type, l.t)
        );
      });
  });
  return {
    project_name: P.name,
    degreedays: 2900,
    heating_MWT: (S.twSup + tRet()) / 2,
    heatpump_flow_rate: 12,
    T,
    element_type,
    elements,
    rooms,
    house: {},
    JK: 50,
    cop_calculation_method: 'ecodan',
    heatpump_capacity: 5,
    solver_running: false,
    tekentafel: { version: 1, exported: new Date().toISOString(), names, typeMap, project: clone(P) }
  };
}
function exportHeatlossjs() {
  saveFile('heatlossjs_' + safeName(P.name) + '.json', JSON.stringify(toHeatlossjs(), null, 1));
}
function guessKind(n) {
  n = n.toLowerCase();
  if (/window|door|raam|deur|glas|glaz/.test(n)) return 'raam';
  if (/floor|vloer/.test(n)) return 'vloer';
  if (/roof|ceiling|loft|dak|plafond/.test(n)) return 'dak';
  return 'wand';
}
function importHeatlossjs(o) {
  const meta = o.tekentafel;
  if (meta && meta.project) {
    const p = normalizeProject(clone(meta.project));
    if (!p) throw 0;
    p.id = 'p' + rid();
    p.example = false;
    p.updatedAt = Date.now();
    let n = 0;
    const T = o.T || {},
      S = p.settings;
    [
      ['external', 'te'],
      ['ground', 'tGround'],
      ['unheated', 'tUnheated'],
      ['buurwoning', 'tNeighbour']
    ].forEach(([k, s]) => {
      const v = +T[k];
      if (T[k] != null && Number.isFinite(v) && v !== S[s]) {
        S[s] = v;
        n++;
      }
    });
    Object.entries(meta.names || {}).forEach(([id, name]) => {
      const r = p.rooms.find(x => x.id === id),
        hr = o.rooms && o.rooms[name];
      const v = hr ? +hr.temperature : NaN;
      if (r && Number.isFinite(v) && v !== r.temp) {
        r.temp = v;
        n++;
      }
    });
    Object.entries(meta.typeMap || {}).forEach(([k, m]) => {
      const et = o.element_type && o.element_type[k];
      const u = et ? +et.uvalue : NaN;
      if (!Number.isFinite(u) || Math.abs(u - m.u) < 0.0005) return;
      const c = p.constructions.find(x => x.id === m.cid);
      if (!c) return;
      c.mode = 'U';
      c.U = Math.max(0.0001, Math.round((u - m.du) * 10000) / 10000);
      n++;
    });
    all[p.id] = p;
    openProject(p.id);
    markDirty();
    renderAll();
    toast(
      n
        ? `Tekening teruggeladen. ${n} waarde${n > 1 ? 'n' : ''} uit heatlossjs overgenomen.`
        : 'Tekening teruggeladen uit het heatlossjs-bestand.'
    );
    return;
  }
  const types = Object.entries(o.element_type || {});
  if (!types.length) throw 0;
  pushUndo();
  types.forEach(([name, v], i) => {
    if (P.constructions.some(c => c.name === name)) return;
    P.constructions.push({
      id: rid(),
      name,
      kind: guessKind(name),
      U: +v.uvalue || 0,
      color: PALETTE[(P.constructions.length + i) % PALETTE.length],
      mode: 'U',
      inner: /internal|party/i.test(name),
      layers: []
    });
  });
  markDirty();
  tab = 'con';
  renderAll();
  toast(
    `${types.length} constructietypen uit heatlossjs toegevoegd. Dit bestand heeft geen tekening, dus ruimtes en wanden zijn niet overgenomen.`
  );
}
function safeName(s) {
  return String(s || 'project')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .slice(0, 80);
}
$('file-in').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let o;
    try {
      o = JSON.parse(rd.result);
    } catch (_) {
      toast('Dit bestand is geen geldig JSON-bestand.');
      return;
    }
    if (o && Array.isArray(o.warmtepompen)) {
      const l = hpValid(o.warmtepompen);
      if (!l.length) {
        toast(
          'Geen bruikbare warmtepompen gevonden. Elke warmtepomp heeft minstens twee punten met buiten en max nodig.'
        );
        return;
      }
      hpList = l;
      hpSource = 'eigen';
      hpErr = '';
      saveHpOwn(l);
      tab = 'inst';
      renderPanel();
      toast(`${l.length} warmtepomp${l.length > 1 ? 'en' : ''} geïmporteerd.`);
      return;
    }
    if (o && o.rooms && typeof o.rooms === 'object' && !Array.isArray(o.rooms)) {
      try {
        importHeatlossjs(o);
      } catch (_) {
        toast('Dit heatlossjs-bestand kon niet worden gelezen.');
      }
      return;
    }
    try {
      const p = normalizeProject(o);
      if (!p) throw 0;
      p.id = 'p' + rid();
      p.example = false;
      all[p.id] = p;
      openProject(p.id);
      markDirty();
      renderAll();
      toast(`“${p.name}” geïmporteerd.`);
    } catch (_) {
      toast('Dit bestand is geen geldig project (.json uit deze app).');
    }
  };
  rd.readAsText(f);
  e.target.value = '';
});

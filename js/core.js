// Constanten, hulpfuncties, voorbeeldproject, normalizeProject (migratie) en de toestand van de app.
'use strict';
/* ---------- constants & helpers ---------- */
const LS_KEY = 'wvt.projects.v1',
  LS_LAST = 'wvt.last.v1';
const PALETTE = [
  '#C2410C',
  '#0E7490',
  '#7C3AED',
  '#15803D',
  '#B45309',
  '#BE185D',
  '#1D4ED8',
  '#4D7C0F',
  '#9F1239',
  '#0F766E'
];
const ADJ = {
  buiten: 'Buiten',
  grond: 'Grond / kruipruimte',
  onverwarmd: 'Onverwarmde ruimte',
  buurwoning: 'Buurwoning',
  temp: 'Ruimte met vaste temperatuur'
};
const DU_TYPES = new Set(['buiten', 'grond', 'onverwarmd']);
const KINDS = { wand: 'Wand', raam: 'Raam / deur', vloer: 'Vloer', dak: 'Dak / plafond' };
const RS = { wand: [0.13, 0.04], raam: [0.13, 0.04], vloer: [0.17, 0.04], dak: [0.1, 0.04] };
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAT_ADDED = { 2: ['m-staal'] }; // presets added later: version -> ids, added once to existing projects
const presetMaterials = () =>
  MAT_PRESETS.map(([id, name, type, v, color]) => ({
    id,
    name,
    type,
    lambda: type === 'lambda' ? v : 0,
    R: type === 'R' ? v : 0,
    color
  }));
// Rλ of unventilated air layers, NEN-EN-ISO 6946 table (thickness mm → m²K/W)
const AIR = {
  h: [
    [0, 0],
    [5, 0.11],
    [7, 0.13],
    [10, 0.15],
    [15, 0.17],
    [25, 0.18],
    [300, 0.18]
  ],
  up: [
    [0, 0],
    [5, 0.11],
    [7, 0.13],
    [10, 0.15],
    [15, 0.16],
    [300, 0.16]
  ],
  down: [
    [0, 0],
    [5, 0.11],
    [7, 0.13],
    [10, 0.15],
    [15, 0.17],
    [25, 0.19],
    [50, 0.21],
    [100, 0.22],
    [300, 0.23]
  ]
};
const DEFAULT_SETTINGS = {
  te: -10,
  tGround: 5,
  tUnheated: 5,
  tNeighbour: 15,
  dU: 0.1,
  nInf: 0.5,
  tSupply: -10,
  maxWall: 0.35,
  snap: 0.05,
  height: 2.6,
  hpVol: 3,
  fitPct: 30,
  bufVol: 0,
  minVolL: 15,
  ventSys: 'D',
  eta: 0.85,
  tRet: 20,
  infMode: 'qv10',
  qv10: 1.0,
  fInf: 1,
  twSup: 35,
  twRet: 30
};
// improvement advice: constructions of this kind facing outside/ground/unheated with U above 'on' get the measure, to U 'to'
const ADVICE_DEFAULT = {
  raam: { on: 1.6, to: 1.1, label: 'Ramen en deuren vervangen door HR++ glas' },
  wand: { on: 0.7, to: 0.4, label: 'Gevel of spouw na-isoleren' },
  vloer: { on: 0.7, to: 0.29, label: 'Vloer of kruipruimte isoleren' },
  dak: { on: 0.6, to: 0.2, label: 'Dak of zoldervloer isoleren' }
};
const VENT_SYS = {
  A: 'A · natuurlijke toe- en afvoer',
  C: 'C · natuurlijke toevoer, mechanische afvoer',
  D: 'D · balansventilatie met WTW'
};
const RHOC = 0.335; // W per (m³/h)·K  (1,2 kg/m³ × 1005 J/kgK / 3600)

const rid = () => Math.random().toString(36).slice(2, 10);
const esc = s =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const fmt = (v, d = 2) =>
  Number.isFinite(v) ? v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
const fmtW = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('nl-NL') : '–');
const nv = (v, d = 3) =>
  Number.isFinite(v) ? v.toLocaleString('nl-NL', { maximumFractionDigits: d, useGrouping: false }) : '';
const num = s => {
  if (s == null) return null;
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const r3 = v => Math.round(v * 1000) / 1000;
const clone = o => JSON.parse(JSON.stringify(o));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const $ = id => document.getElementById(id);

/* ---------- example project ---------- */
function rectPts(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ];
}
function seg(cid, adj, openings) {
  return { cid: cid || '', adj: adj || 'auto', adjT: 20, openings: openings || [] };
}
function opening(name, w, h, cid) {
  return { id: rid(), name, w, h, cid };
}
// an ordinary inner door (hollow core or thin solid wood): about 2,2 W/m²K with room air on both sides. Indicative.
const INNER_DOOR = {
  id: 'c10',
  name: 'Binnendeur, niet geïsoleerd',
  kind: 'raam',
  U: 2.2,
  color: '#9F1239',
  inner: true
};
function exampleProject() {
  const Ly = (mid, d, extra) => Object.assign({ id: rid(), mid, d, vent: 'niet', mix: null }, extra || {});
  const C = [
    {
      id: 'c1',
      name: 'Spouwmuur kalkzandsteen + 100 mm PIR',
      kind: 'wand',
      U: 0.21,
      color: PALETTE[1],
      mode: 'lagen',
      layers: [
        Ly('m-pleister', 10),
        Ly('m-kzs', 100),
        Ly('m-pir', 100),
        Ly('m-spouw', 40, { vent: 'zwak' }),
        Ly('m-baksteen', 100)
      ]
    },
    {
      id: 'c2',
      name: 'Houtskeletwand 140 mm glaswol',
      kind: 'wand',
      U: 0.27,
      color: PALETTE[4],
      mode: 'lagen',
      layers: [
        Ly('m-gips', 12.5),
        Ly('m-dampremmend', 0),
        Ly('m-glaswol', 140, { mix: { mid: 'm-hout', pct: 12 } }),
        Ly('m-osb', 12),
        Ly('m-dampopen', 0),
        Ly('m-spouw', 25, { vent: 'sterk' }),
        Ly('m-hout', 18)
      ]
    },
    {
      id: 'c3',
      name: 'Binnenwand kalkzandsteen 100 mm',
      kind: 'wand',
      U: 2.4,
      color: PALETTE[6],
      inner: true,
      mode: 'lagen',
      layers: [Ly('m-pleister', 10), Ly('m-kzs', 100), Ly('m-pleister', 10)]
    },
    { id: 'c7', name: 'Woningscheidende wand kalkzandsteen', kind: 'wand', U: 1.9, color: PALETTE[2] },
    { id: 'c4', name: 'HR++ glas in houten kozijn', kind: 'raam', U: 1.8, color: PALETTE[0] },
    { id: 'c8', name: 'Geïsoleerde voordeur', kind: 'raam', U: 1.4, color: PALETTE[5] },
    clone(INNER_DOOR),
    { id: 'c5', name: 'Begane grondvloer Rc 3,7', kind: 'vloer', U: 0.26, color: PALETTE[3] },
    { id: 'c6', name: 'Houten verdiepingsvloer', kind: 'dak', U: 1.6, color: PALETTE[7] },
    { id: 'c9', name: 'Hellend dak 160 mm minerale wol', kind: 'dak', U: 0.24, color: PALETTE[8] }
  ];
  const fl = () => ({ cid: 'c5', adj: 'grond', t: 20 }),
    ce = t => ({ cid: 'c6', adj: 'temp', t: t });
  const rooms = [
    {
      id: 'r1',
      name: 'Woonkamer',
      temp: 20,
      height: 2.6,
      sup: 100,
      ext: 0,
      pts: rectPts(0, 0, 6, 4.5),
      floor: fl(),
      ceil: ce(20),
      walls: [
        { cuts: [2.4], segs: [seg('c2', 'buiten'), seg('c1', 'buiten', [opening('Raam voorgevel', 2.4, 1.5, 'c4')])] },
        { cuts: [], segs: [seg('c3', 'auto')] },
        { cuts: [], segs: [seg('c1', 'buiten', [opening('Schuifpui', 2.4, 2.1, 'c4')])] },
        { cuts: [], segs: [seg('c7', 'buurwoning')] }
      ]
    },
    {
      id: 'r2',
      name: 'Keuken',
      temp: 20,
      height: 2.6,
      sup: 0,
      ext: 100,
      pts: rectPts(6, 0, 9, 3),
      floor: fl(),
      ceil: ce(20),
      walls: [
        { cuts: [], segs: [seg('c1', 'buiten', [opening('Keukenraam', 1.2, 1.2, 'c4')])] },
        { cuts: [], segs: [seg('c1', 'buiten')] },
        { cuts: [], segs: [seg('c3', 'auto')] },
        { cuts: [], segs: [seg('c3', 'auto')] }
      ]
    },
    {
      id: 'r3',
      name: 'Hal',
      temp: 15,
      height: 2.6,
      sup: 0,
      ext: 0,
      pts: rectPts(6, 3, 9, 4.5),
      floor: fl(),
      ceil: ce(18),
      walls: [
        { cuts: [], segs: [seg('c3', 'auto')] },
        { cuts: [], segs: [seg('c1', 'buiten')] },
        { cuts: [], segs: [seg('c1', 'buiten', [opening('Voordeur', 1.0, 2.3, 'c8')])] },
        { cuts: [], segs: [seg('c3', 'auto')] }
      ]
    }
  ];
  const up = (id, name, temp, pts, walls) => ({
    id,
    name,
    temp,
    height: 2.5,
    sup: id === 'r5' ? 0 : id === 'r4' ? 50 : 25,
    ext: id === 'r5' ? 75 : 0,
    pts,
    floorId: 'f1',
    floor: { cid: 'c6', adj: 'temp', t: 20 },
    ceil: { cid: 'c6', adj: 'temp', t: 18 },
    walls
  });
  rooms.push(
    up('r4', 'Slaapkamer 1', 18, rectPts(0, 0, 4.5, 4.5), [
      { cuts: [], segs: [seg('c1', 'buiten', [opening('Raam', 1.6, 1.3, 'c4')])] },
      { cuts: [], segs: [seg('c3', 'auto')] },
      { cuts: [], segs: [seg('c1', 'buiten')] },
      { cuts: [], segs: [seg('c7', 'buurwoning')] }
    ]),
    up('r5', 'Badkamer', 22, rectPts(4.5, 0, 9, 2.5), [
      { cuts: [], segs: [seg('c1', 'buiten', [opening('Raam', 0.8, 0.8, 'c4')])] },
      { cuts: [], segs: [seg('c1', 'buiten')] },
      { cuts: [], segs: [seg('c3', 'auto')] },
      { cuts: [], segs: [seg('c3', 'auto')] }
    ]),
    up('r6', 'Slaapkamer 2', 18, rectPts(4.5, 2.5, 9, 4.5), [
      { cuts: [], segs: [seg('c3', 'auto')] },
      { cuts: [], segs: [seg('c1', 'buiten')] },
      { cuts: [], segs: [seg('c1', 'buiten', [opening('Raam', 1.2, 1.3, 'c4')])] },
      { cuts: [], segs: [seg('c3', 'auto')] }
    ])
  );
  rooms.push({
    id: 'r7',
    name: 'Zolder',
    temp: 18,
    height: 2.4,
    sup: 0,
    ext: 0,
    floorId: 'f2',
    pts: rectPts(0, 0, 9, 4.5),
    floor: { cid: 'c6', adj: 'temp', t: 18 },
    ceil: { cid: 'c6', adj: 'onverwarmd', t: 5 },
    roof: { type: 'zadel', pitch: 45, knee: 0.6, edge: 0, low: 'min', cid: 'c9', adj: 'buiten', t: 20 },
    walls: [
      { cuts: [], segs: [seg('c1', 'buiten')] },
      { cuts: [], segs: [seg('c1', 'buiten', [opening('Raam topgevel', 0.8, 1.0, 'c4')])] },
      { cuts: [], segs: [seg('c1', 'buiten')] },
      { cuts: [], segs: [seg('c7', 'buurwoning')] }
    ]
  });
  rooms.slice(0, 3).forEach(r => (r.floorId = 'f0'));
  const rad = (name, ax, ay, bx, by, p, kind, dn) => ({
    id: rid(),
    kind: kind || 'rad',
    name,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    p,
    n: { rad: 1.3, conv: 1.4, fan: 1 }[kind || 'rad'],
    pipe: { mat: 'koper', dn: dn || '15' }
  });
  const byId = id => rooms.find(r => r.id === id);
  byId('r1').emitters = [
    {
      id: rid(),
      kind: 'vv',
      name: 'Vloerverwarming',
      pts: rectPts(0.3, 0.3, 5.7, 4.2),
      spacing: 15,
      cover: 'tegels',
      p: 0,
      n: 1,
      pipe: { mat: 'pex', dn: '16' }
    }
  ];
  byId('r2').emitters = [rad('Radiator keuken', 6.6, 0.2, 8.4, 0.2, 1400)];
  byId('r3').emitters = [rad('Convector hal', 7.4, 4.3, 8.2, 4.3, 600, 'conv', '12')];
  byId('r4').emitters = [rad('Radiator onder raam', 0.8, 0.2, 2.6, 0.2, 1800)];
  byId('r5').emitters = [rad('Handdoekradiator', 8.8, 0.5, 8.8, 1.3, 700)];
  byId('r6').emitters = [rad('Radiator', 5.5, 4.3, 6.9, 4.3, 1100)];
  return normalizeProject({
    id: 'p' + rid(),
    name: 'Voorbeeldwoning',
    example: true,
    updatedAt: 0,
    settings: { ...DEFAULT_SETTINGS },
    materials: presetMaterials(),
    floors: [
      { id: 'f0', name: 'Begane grond' },
      { id: 'f1', name: '1e verdieping' },
      { id: 'f2', name: 'Zolder' }
    ],
    constructions: C,
    rooms,
    transfers: [
      { id: 't1', from: 'r1', to: 'r2', q: 100 },
      { id: 't2', from: 'r4', to: 'r5', q: 50 },
      { id: 't3', from: 'r6', to: 'r5', q: 25 }
    ]
  });
}
function emptyProject(name) {
  const p = exampleProject();
  return normalizeProject({
    id: 'p' + rid(),
    name: name || 'Nieuw project',
    example: false,
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    materials: p.materials,
    constructions: p.constructions,
    floors: [{ id: 'f' + rid(), name: 'Begane grond' }],
    rooms: []
  });
}
function normalizeProject(p) {
  if (!p || typeof p !== 'object') return null;
  p.id = String(p.id || 'p' + rid()).replace(/[^A-Za-z0-9_-]/g, '') || 'p' + rid();
  p.name = String(p.name || 'Project');
  const legacy = p.settings && !p.settings.ventSys; // projects from before ventilation per room: keep their results
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}) };
  const adv = p.settings.advice || {};
  p.settings.advice = {};
  Object.keys(ADVICE_DEFAULT).forEach(k => {
    p.settings.advice[k] = { ...ADVICE_DEFAULT[k], ...(adv[k] || {}) };
  });
  p.advSel = p.advSel && typeof p.advSel === 'object' ? p.advSel : {};
  if (legacy) {
    const S = p.settings;
    S.infMode = 'n';
    S.ventSys = 'C';
    if (S.tSupply > S.te) {
      S.ventSys = 'D';
      S.eta = Math.max(0, Math.min(1, Math.round(((S.tSupply - S.te) / (S.tRet - S.te)) * 1000) / 1000));
    }
  }
  p.constructions = Array.isArray(p.constructions) ? p.constructions : [];
  // constructions added to the presets later: added once to existing projects (removing them afterwards is respected)
  if ((p.conPresetV | 0) < 1) {
    [INNER_DOOR].forEach(c => {
      if (!p.constructions.some(x => x.id === c.id || x.name === c.name)) p.constructions.push(clone(c));
    });
    p.conPresetV = 1;
  }
  p.materials = Array.isArray(p.materials) && p.materials.length ? p.materials : presetMaterials();
  {
    const v = p.matPresetV | 0;
    Object.keys(MAT_ADDED)
      .map(Number)
      .filter(k => k > v)
      .forEach(k =>
        MAT_ADDED[k].forEach(id => {
          if (!p.materials.some(m => m.id === id)) p.materials.push(presetMaterials().find(m => m.id === id));
        })
      );
    p.matPresetV = Math.max(v, ...Object.keys(MAT_ADDED).map(Number));
  }
  p.materials.forEach(m => {
    m.id = m.id || rid();
    m.type = ['lambda', 'R', 'spouw'].includes(m.type) ? m.type : 'lambda';
    m.lambda = +m.lambda || 0;
    m.R = +m.R || 0;
    m.color = m.color || '#BBBBBB';
    m.name = String(m.name || 'Materiaal');
  });
  p.constructions.forEach((c, i) => {
    c.id = c.id || rid();
    c.kind = KINDS[c.kind] ? c.kind : 'wand';
    c.U = Number(c.U) || 0;
    c.color = c.color || PALETTE[i % PALETTE.length];
    c.name = String(c.name || 'Constructie');
    c.mode = c.mode === 'lagen' ? 'lagen' : 'U';
    c.inner = !!c.inner;
    c.layers = Array.isArray(c.layers)
      ? c.layers.map(l => ({
          id: l.id || rid(),
          mid: l.mid || '',
          d: +l.d || 0,
          vent: ['niet', 'zwak', 'sterk'].includes(l.vent) ? l.vent : 'niet',
          mix: l.mix && l.mix.mid ? { mid: l.mix.mid, pct: +l.mix.pct || 0 } : null
        }))
      : [];
    syncU(c, p);
  });
  p.rooms = Array.isArray(p.rooms) ? p.rooms.filter(r => r && Array.isArray(r.pts) && r.pts.length >= 3) : [];
  p.floors = Array.isArray(p.floors) && p.floors.length ? p.floors.filter(f => f && f.id) : [];
  if (!p.floors.length) p.floors = [{ id: 'f' + rid(), name: 'Begane grond' }];
  p.floors.forEach(f => (f.name = String(f.name || 'Verdieping')));
  const rids = new Set(p.rooms.map(r => r.id));
  p.transfers = (Array.isArray(p.transfers) ? p.transfers : [])
    .map(t => ({ id: t.id || rid(), from: t.from, to: t.to, q: Math.max(0, +t.q || 0) }))
    .filter(t => rids.has(t.from) && rids.has(t.to));
  p.rooms.forEach(r => {
    if (!p.floors.some(f => f.id === r.floorId)) r.floorId = p.floors[0].id;
  });
  // where the heat pump stands (start of the pipe network)
  p.hpPos =
    p.hpPos &&
    p.floors.some(f => f.id === p.hpPos.floorId) &&
    Number.isFinite(+p.hpPos.x) &&
    Number.isFinite(+p.hpPos.y)
      ? { floorId: p.hpPos.floorId, x: +p.hpPos.x, y: +p.hpPos.y }
      : null;
  p.pipes = (Array.isArray(p.pipes) ? p.pipes : [])
    .filter(x => x && Array.isArray(x.pts) && x.pts.length >= 2 && p.floors.some(f => f.id === x.floorId))
    .map(x => {
      const mat = PIPES[x.mat] ? x.mat : 'pex';
      let dn = String(x.dn || '');
      if (mat === 'staal' && OLD_STEEL[dn]) dn = OLD_STEEL[dn];
      if (!PIPES[mat].d[dn]) dn = Object.keys(PIPES[mat].d)[0];
      return {
        id: x.id || rid(),
        floorId: x.floorId,
        pts: x.pts.map(q => ({ x: +q.x || 0, y: +q.y || 0 })),
        mat,
        dn,
        extra: Math.max(0, +x.extra || 0),
        name: String(x.name || 'Leiding')
      };
    });
  p.rooms.forEach(r => {
    r.id = r.id || rid();
    r.name = String(r.name || 'Ruimte');
    r.temp = Number.isFinite(+r.temp) ? +r.temp : 20;
    r.height = +r.height > 0 ? +r.height : p.settings.height;
    if (r.sup == null && r.ext == null) {
      r.sup = r3((Number(r.qv) || 0) * 3.6);
      r.ext = 0;
    }
    delete r.qv;
    r.sup = Math.max(0, +r.sup || 0);
    r.ext = Math.max(0, +r.ext || 0);
    r.floor = r.floor || { cid: '', adj: 'grond', t: 20 };
    r.ceil = r.ceil || { cid: '', adj: 'temp', t: 20 };
    const dakC = (p.constructions.find(c => c.kind === 'dak') || {}).id || '';
    r.emitters = (Array.isArray(r.emitters) ? r.emitters : [])
      .filter(e => e && (e.kind === 'vv' ? Array.isArray(e.pts) && e.pts.length >= 3 : e.a && e.b))
      .map(e => {
        const kind = EM_KINDS[e.kind] ? e.kind : 'rad';
        const mat = PIPES[e.pipe && e.pipe.mat] ? e.pipe.mat : kind === 'vv' ? 'pex' : 'koper';
        let dn = String((e.pipe && e.pipe.dn) || (kind === 'vv' ? '16' : '15'));
        if (mat === 'staal' && OLD_STEEL[dn]) dn = OLD_STEEL[dn];
        if (!PIPES[mat].d[dn]) dn = Object.keys(PIPES[mat].d)[1];
        return {
          id: e.id || rid(),
          kind,
          name: String(e.name || EM_KINDS[kind]),
          a: e.a,
          b: e.b,
          pts: e.pts,
          p: Math.max(0, +e.p || 0),
          n: +e.n || EM_N[kind] || 1.3,
          spacing: [10, 15, 20].includes(+e.spacing) ? +e.spacing : 15,
          cover: VV_COVER[e.cover] ? e.cover : 'tegels',
          boost: !!e.boost && (kind === 'rad' || kind === 'conv'),
          boostPct: Number.isFinite(+e.boostPct) && +e.boostPct >= 0 ? +e.boostPct : 40,
          pipe: { mat, dn },
          rt: RAD_TYPES[e.rt] ? e.rt : '',
          rh: +e.rh > 0 ? +e.rh : 600,
          rl: +e.rl > 0 ? +e.rl : 0,
          loops: [1, 2, 3, 4].includes(+e.loops) ? +e.loops : 1
        };
      });
    r.emitters.forEach(syncRad);
    r.kind = ['normaal', 'trap', 'vide'].includes(r.kind) ? r.kind : 'normaal';
    if (r.stair && typeof r.stair === 'object')
      r.stair = {
        shape: STAIR_SHAPES[r.stair.shape] ? r.stair.shape : 'recht',
        edge: r.stair.edge | 0,
        side: r.stair.side === 'b' ? 'b' : 'a',
        w: +r.stair.w > 0 ? +r.stair.w : 0.85
      };
    else delete r.stair;
    {
      const bi = p.floors.findIndex(x => x.id === r.floorId),
        ti = p.floors.findIndex(x => x.id === r.spanTo);
      if (!(ti > bi)) r.spanTo = null;
    }
    r.roof = Object.assign(
      { type: 'plat', pitch: 45, knee: 0.6, edge: 0, low: 'min', cid: dakC, adj: 'buiten', t: 20 },
      r.roof || {}
    );
    if (!ROOF_TYPES[r.roof.type]) r.roof.type = 'plat';
    if (typeof r.roof.flat !== 'boolean') r.roof.flat = true; // older projects: the room height always acted as a flat ceiling under a sloped roofr.roof.edge=Math.max(0,Math.min(r.pts.length-1,r.roof.edge|0));
    r.walls = Array.isArray(r.walls) ? r.walls : [];
    while (r.walls.length < r.pts.length) r.walls.push({ cuts: [], segs: [seg('', 'auto')] });
    r.walls.length = r.pts.length;
    r.walls.forEach(w => {
      w.cuts = (w.cuts || [])
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      w.segs = w.segs || [];
      while (w.segs.length < w.cuts.length + 1) w.segs.push(seg('', 'auto'));
      w.segs.length = w.cuts.length + 1;
      w.segs.forEach(s => {
        s.adj = s.adj || 'auto';
        s.adjT = Number.isFinite(+s.adjT) ? +s.adjT : 20;
        s.openings = (s.openings || []).map(o => ({
          id: o.id || rid(),
          name: o.name || 'Raam',
          w: +o.w || 0,
          h: +o.h || 0,
          cid: o.cid || '',
          ...(o.lk ? { lk: String(o.lk) } : {}),
          ...(typeof o.at === 'number' && isFinite(o.at) ? { at: o.at } : {}),
          ...(typeof o.sill === 'number' && isFinite(o.sill) && o.sill >= 0 ? { sill: o.sill } : {})
        }));
      });
    });
  });
  return p;
}

/* ---------- state ---------- */
let all = {}; // id -> project
let P = null; // current project
let tab = 'sel',
  sel = null,
  tool = 'select';
let view = { s: 60, tx: 60, ty: 70 };
let drawPts = [],
  hover = null,
  drag = null,
  pan = null,
  spaceDown = false,
  hoverSplit = null,
  cursorW = null;
let undoStack = [],
  redoStack = [],
  undoArmed = false;
let confirmDel = false,
  hoverSeg = null;
let curFloor = null,
  showUnder = true;
try {
  showUnder = localStorage.getItem('wvt.under') !== '0';
} catch (_) {}
const floorIdx = id => P.floors.findIndex(f => f.id === id);
const curRooms = () => P.rooms.filter(r => r.floorId === curFloor);
function underFloor() {
  const i = floorIdx(curFloor);
  return i > 0 ? P.floors[i - 1] : null;
}
const underRooms = () => {
  const f = underFloor();
  return showUnder && f ? P.rooms.filter(r => r.floorId === f.id && !presentOn(r, curFloor)) : [];
};
// a room spans from its own floor up to spanTo (stairwell, void)
function levelsOf(r) {
  const a = floorIdx(r.floorId),
    b = r.spanTo ? floorIdx(r.spanTo) : -1;
  return [a, b > a ? b : a];
}
const spans = r => {
  const l = levelsOf(r);
  return l[1] > l[0];
};
function presentOn(r, fid) {
  const i = floorIdx(fid),
    l = levelsOf(r);
  return i >= l[0] && i <= l[1];
}
function levelsMeet(r, o) {
  const a = levelsOf(r),
    b = levelsOf(o);
  return a[0] <= b[1] && b[0] <= a[1];
}
const videRooms = () => P.rooms.filter(r => r.floorId !== curFloor && presentOn(r, curFloor));
const snapRooms = () => curRooms().concat(underRooms(), videRooms());
function setFloor(id, keepSel) {
  if (!P.floors.some(f => f.id === id)) id = P.floors[0].id;
  if (curFloor === id) return;
  if (pendSplit) closeAsk();
  curFloor = id;
  if (!keepSel) sel = null;
  drawPts = [];
  drag = null;
  try {
    localStorage.setItem('wvt.floor.' + P.id, id);
  } catch (_) {}
  renderAll();
}
function renderFloorbar() {
  const uf = underFloor();
  $('floorbar').innerHTML =
    `<div class="floors" role="group" aria-label="Verdieping">${P.floors.map(f => `<button data-floor="${f.id}" aria-pressed="${f.id === curFloor}">${esc(f.name)} <span style="opacity:.7">${P.rooms.filter(r => r.floorId === f.id).length}</span></button>`).join('')}<button data-floor="__add" title="Verdieping toevoegen" aria-label="Verdieping toevoegen">+</button></div>
  <button class="btn small undbtn" id="btn-under" aria-pressed="${!!(showUnder && uf)}" ${uf ? '' : 'disabled'} title="${uf ? 'Toon ' + esc(uf.name) + ' lichtgrijs als ondergrond (O)' : 'Er is geen verdieping onder deze'}">Ondergrond${uf ? ': ' + esc(uf.name) : ''}</button>`;
}
$('floorbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.id === 'btn-under') {
    showUnder = !showUnder;
    try {
      localStorage.setItem('wvt.under', showUnder ? '1' : '0');
    } catch (_) {}
    renderFloorbar();
    renderCanvas();
    return;
  }
  if (b.dataset.floor === '__add') {
    addFloor();
    return;
  }
  setFloor(b.dataset.floor);
  requestAnimationFrame(fitIfEmptyView);
});
function addFloor() {
  pushUndo();
  const n = P.floors.length;
  const f = {
    id: 'f' + rid(),
    name: n === 1 ? '1e verdieping' : n === 2 ? '2e verdieping' : n === 3 ? 'Zolder' : n + 'e verdieping'
  };
  P.floors.push(f);
  markDirty();
  showUnder = true;
  setFloor(f.id);
  toast(`${f.name} toegevoegd. De verdieping eronder staat lichtgrijs als ondergrond.`);
}
function fitIfEmptyView() {}

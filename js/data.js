// Gegevens uit de map data/ (JSON-bestanden die je zelf kunt aanpassen). Ze worden bij het opstarten geladen met loadData().
// Daarvoor moet de app via een webserver draaien (GitHub Pages, of lokaal bijvoorbeeld `python3 -m http.server`):
// browsers laden geen JSON-bestanden als je index.html direct opent (file://).
'use strict';
let HP_DEFAULT = null; // data/warmtepompen.json
let MAT_PRESETS = []; // data/materialen.json, als [id, naam, soort, waarde, kleur]
let PIPES = {}; // data/leidingen.json: {koper: {label, d: {buitendiameter: binnendiameter}}, ...}
let RAD_TYPES = {}; // data/radiatoren.json: {T22: [watt per meter bij 600 mm, omschrijving], ...}
let RAD_L = {}; // data/radiatoren.json: {T22: liter per meter bij 600 mm, ...}
let VV_COVER = {}; // data/vloerverwarming.json: {tegels: [naam, R], ...}
let VV_KH = {}; // data/vloerverwarming.json: {15: [afgiftecoëfficiënt bij R = 0 / 0,05 / 0,10 / 0,15], ...}

async function loadData() {
  const get = f =>
    fetch('data/' + f, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(f + ' (' + r.status + ')');
      return r.json();
    });
  const [hp, mat, pipes, rad, vv] = await Promise.all([
    get('warmtepompen.json'),
    get('materialen.json'),
    get('leidingen.json'),
    get('radiatoren.json'),
    get('vloerverwarming.json')
  ]);
  HP_DEFAULT = hp;
  MAT_PRESETS = mat.materialen.map(m => [m.id, m.naam, m.soort, +m.waarde || 0, m.kleur]);
  PIPES = Object.fromEntries(
    Object.entries(pipes.leidingen).map(([k, v]) => [k, { label: v.naam, d: v.binnendiameter }])
  );
  RAD_TYPES = Object.fromEntries(
    Object.entries(rad.paneelradiatoren).map(([k, v]) => [k, [v.wattPerMeter, v.omschrijving]])
  );
  RAD_L = Object.fromEntries(Object.entries(rad.paneelradiatoren).map(([k, v]) => [k, v.literPerMeter]));
  VV_COVER = Object.fromEntries(Object.entries(vv.vloerafwerkingen).map(([k, v]) => [k, [v.naam, v.R]]));
  VV_KH = vv.afgifteCoefficient;
}

function showDataError(err) {
  const local = location.protocol === 'file:';
  const msg = local
    ? 'De gegevens in de map data/ kunnen niet worden geladen omdat index.html direct is geopend. Start een webserver in de map van de app, bijvoorbeeld met `python3 -m http.server`, en open http://localhost:8000.'
    : 'De gegevens in de map data/ konden niet worden geladen: ' +
      (err && err.message ? err.message : err) +
      '. Controleer of de JSON-bestanden geldig zijn.';
  const s = document.getElementById('status');
  if (s) {
    s.textContent = 'Fout bij laden';
    s.className = 'pill bad';
  }
  const b = document.getElementById('pbody');
  if (b)
    b.innerHTML =
      '<div class="sec"><h2>Kan niet starten</h2><div class="warnbox">' +
      msg.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) +
      '</div></div>';
  console.error(err);
}

// Zijpaneel: ruimte, wanddeel, constructies en materialen.
'use strict';
/* ---------- panel ---------- */
const pbody = $('pbody');
function conOptions(selected, prefer) {
  const order = [prefer, ...Object.keys(KINDS).filter(k => k !== prefer)];
  let h = `<option value="">— kies een constructie —</option>`;
  order.forEach(k => {
    const cs = P.constructions.filter(c => c.kind === k);
    if (!cs.length) return;
    h +=
      `<optgroup label="${KINDS[k]}">` +
      cs
        .map(
          c =>
            `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)} · U ${nv(c.U, 3)}</option>`
        )
        .join('') +
      `</optgroup>`;
  });
  return h;
}
function adjOptions(selected, withAuto, withOpen) {
  if (withOpen === undefined) withOpen = withAuto;
  let h = '';
  if (withAuto)
    h += `<option value="auto" ${selected === 'auto' ? 'selected' : ''}>Automatisch (uit tekening)</option>`;
  Object.entries(ADJ).forEach(
    ([k, v]) => (h += `<option value="${k}" ${selected === k ? 'selected' : ''}>${v}</option>`)
  );
  if (withOpen)
    h += `<option value="open" ${selected === 'open' ? 'selected' : ''}>Open verbinding (geen wand)</option>`;
  return h;
}
function numField(id, f, label, unit, val, d) {
  return `<label class="f" for="${id}">${label} <span class="u">${unit}</span><input class="in num" id="${id}" data-f="${f}" inputmode="decimal" value="${nv(val, d == null ? 3 : d)}"></label>`;
}
function wallBar(room, i, curS) {
  const b = bounds(room, i);
  const L = b[b.length - 1] || 1;
  const w = room.walls[i];
  return (
    `<div class="wallbar">` +
    w.segs
      .map((sg, j) => {
        const len = b[j + 1] - b[j];
        const c = conById(sg.cid);
        const pct = Math.max(0, (len / L) * 100);
        const op = sg.adj === 'open';
        return `<button class="segbtn ${c || op ? '' : 'none'} ${curS === j ? 'cur' : ''}" style="flex:${pct} 0 0;${op ? 'background:none;color:var(--muted);outline:1.5px dashed var(--muted);outline-offset:-3px' : c ? 'background:' + esc(c.color) : ''}" data-act="selseg" data-r="${room.id}" data-w="${i}" data-s="${j}" title="${esc((c ? c.name : 'Geen constructie') + ' · ' + fmt(len) + ' m')}">${w.segs.length > 1 ? (LET[j] || j) + ' ' : ''}${fmt(len)}</button>`;
      })
      .join('') +
    `</div>`
  );
}
function calcTable(lines, extra) {
  let h = `<div class="tablewrap"><table class="calc"><thead><tr><th>Onderdeel</th><th>A m²</th><th>U</th><th>Δθ K</th><th>Φ W</th></tr></thead><tbody>`;
  lines.forEach(l => {
    h += `<tr class="${l.miss && l.A > 0.0001 ? 'miss' : ''}"><td>${esc(l.label)}<small>${esc(l.sub || '')}</small></td><td>${fmt(l.A)}</td><td>${Number.isFinite(l.Ueff) ? nv(l.Ueff, 3) : '?'}</td><td>${nv(l.dT, 1)}</td><td>${fmtW(l.phi)}</td></tr>`;
  });
  (extra || []).forEach(
    x => (h += `<tr><td>${x[0]}<small>${x[1]}</small></td><td></td><td></td><td></td><td>${fmtW(x[2])}</td></tr>`)
  );
  return h + `</tbody></table></div>`;
}
// intersection of the line s = c with the room outline, as a segment ordered along the ridge direction
function lineAcross(room, R, c) {
  const hits = [];
  const pts = room.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      sa = R.sOf(a),
      sb = R.sOf(b);
    if ((sa - c) * (sb - c) <= 0 && Math.abs(sb - sa) > 1e-9) {
      const t = (c - sa) / (sb - sa);
      hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (hits.length < 2) return null;
  const key = p => p.x * R.u.x + p.y * R.u.y;
  hits.sort((p, q) => key(p) - key(q));
  return [hits[0], hits[hits.length - 1]];
}
function roofLines(R) {
  return R.type === 'zadel'
    ? R.wc > 0
      ? [R.sr - R.wc, R.sr + R.wc]
      : [R.sr]
    : R.sc > R.smin && R.sc < R.smax
      ? [R.sc]
      : [];
}
function isoSvg(room) {
  const R = wallRoof(room),
    pts = room.pts,
    zAt = p => (R ? R.z(R.sOf(p)) : room.height);
  const pr = (p, z) => ({ X: (p.x - p.y) * 0.866, Y: (p.x + p.y) * 0.5 - z });
  const walls = pts.map((a, i) => {
    const e = edge(room, i);
    const ts = [0, e.L];
    if (R) {
      const sa = R.sOf(e.a),
        ds = e.ux * R.v.x + e.uy * R.v.y;
      if (Math.abs(ds) > 1e-9)
        R.crit.forEach(c => {
          const t = (c - sa) / ds;
          if (t > 0 && t < e.L) ts.push(t);
        });
    }
    ts.sort((x, y) => x - y);
    const Q = ts.map(t => ({ x: e.a.x + e.ux * t, y: e.a.y + e.uy * t }));
    return { bottom: Q.map(p => pr(p, 0)), top: Q.map(p => pr(p, zAt(p))), depth: (e.a.x + e.b.x + e.a.y + e.b.y) / 2 };
  });
  const extra = [];
  if (R)
    roofLines(R).forEach(c => {
      const sg = lineAcross(room, R, c);
      if (sg) {
        const z = R.z(c);
        extra.push([pr(sg[0], z), pr(sg[1], z)]);
      }
    });
  const all = walls.flatMap(w => w.bottom.concat(w.top)).concat(extra.flat());
  const X0 = Math.min(...all.map(p => p.X)),
    X1 = Math.max(...all.map(p => p.X)),
    Y0 = Math.min(...all.map(p => p.Y)),
    Y1 = Math.max(...all.map(p => p.Y));
  const W = 340,
    H = 200,
    pad = 14,
    sc = Math.min((W - 2 * pad) / Math.max(0.1, X1 - X0), (H - 2 * pad) / Math.max(0.1, Y1 - Y0));
  const T = p =>
    `${(pad + (p.X - X0) * sc + (W - 2 * pad - (X1 - X0) * sc) / 2).toFixed(1)},${(pad + (p.Y - Y0) * sc + (H - 2 * pad - (Y1 - Y0) * sc) / 2).toFixed(1)}`;
  let o = `<polygon points="${pts.map(p => T(pr(p, 0))).join(' ')}" fill="var(--surface-2)" stroke="var(--line)"/>`;
  walls
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .forEach(w => {
      o += `<polygon points="${w.bottom.map(T).concat(w.top.slice().reverse().map(T)).join(' ')}" fill="var(--accent-soft-2)" stroke="var(--wall)" stroke-width="1.2" stroke-linejoin="round"/>`;
    });
  extra.forEach(
    ([a, b]) =>
      (o += `<line x1="${T(a).split(',')[0]}" y1="${T(a).split(',')[1]}" x2="${T(b).split(',')[0]}" y2="${T(b).split(',')[1]}" stroke="var(--heat)" stroke-width="2" stroke-linecap="round"/>`)
  );
  return `<div class="xsec"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="3D-weergave van ${esc(room.name)}">${o}</svg></div>`;
}
// a vide or stairwell that runs up to the roof: it has no ceiling, but the roof
function videRoofHtml(room, vt) {
  const cands = roofCandidates(room),
    top = P.floors[levelsOf(room)[1]];
  const line = calcRoom(room).lines.find(l => l.group === 'roof' || (l.group === 'ceil' && l.label === 'Dak'));
  if (vt.src) {
    const sr = vt.src.roof,
      con = conById(sr.cid);
    return `<div class="card"><b>Dak boven de ${room.kind === 'trap' ? 'trap' : 'vide'}</b>
      <p class="note">De ${room.kind === 'trap' ? 'trap' : 'vide'} loopt door tot onder het dak. Er zit dus geen plafond, maar het dak van <b>${esc(vt.src.name)}</b>: ${esc((con || {}).name || 'geen constructie')}, helling ${nv(sr.pitch, 0)}°.</p>
      ${
        cands.length > 1
          ? `<label class="f" for="f-room-roofsrc">Zelfde dak als<select class="in" id="f-room-roofsrc" data-f="room.roofFrom"><option value="">automatisch (de ruimte ernaast)</option>${cands.map(o => `<option value="${o.id}" ${room.roofFrom === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`
          : ''
      }
      ${line ? `<div class="det">${fmt(line.A, 1)} m² dakvlak (${fmt(Math.abs(polyArea(room.pts)), 1)} m² horizontaal)</div>` : ''}
      <div class="row"><button class="btn small" data-act="selroom" data-r="${vt.src.id}">Dak wijzigen bij ${esc(vt.src.name)}</button></div></div>`;
  }
  return `<div class="card"><b>Dak boven de ${room.kind === 'trap' ? 'trap' : 'vide'}</b>
    <p class="note">De ${room.kind === 'trap' ? 'trap' : 'vide'} loopt door tot onder het dak${top ? ' van ' + esc(top.name) : ''}. Er ligt geen ruimte met een schuin dak naast, dus de app rekent met een plat dak.</p>
    <label class="f" for="f-ceil-cid">Constructie dak<select class="in" id="f-ceil-cid" data-f="ceil.cid">${conOptions(room.ceil.cid, 'dak')}</select></label>
    ${line ? `<div class="det">${fmt(line.A, 1)} m² plat dak → buiten</div>` : ''}</div>`;
}
// roof windows and dormers on the sloped roof of a room
function roofItemsHtml(room) {
  const R = roofOf(room),
    items = room.roof.items || [],
    nSlopes = R && R.type === 'zadel' ? 2 : 1,
    lines = calcRoom(room).lines,
    geo = roofItemGeom(room);
  const posFields = it => {
    const g = geo.find(x => x.it === it) || {};
    return `<div class="fields">${numField('f-ri-' + it.id + '-u', 'ri.' + it.id + '.u', 'Midden langs de nok', 'm vanaf begin', g.uc, 2)}${numField('f-ri-' + it.id + '-d', 'ri.' + it.id + '.d', it.kind === 'raam' ? 'Onderkant vanaf de goot' : 'Voorkant vanaf de goot', it.kind === 'raam' ? 'm langs de helling' : 'm horizontaal', g.d, 2)}</div>`;
  };
  const slopeSel = it =>
    nSlopes > 1
      ? `<label class="f" for="f-ri-${it.id}-sl">Op<select class="in" id="f-ri-${it.id}-sl" data-f="ri.${it.id}.slope">${[0, 1].map(n => `<option value="${n}" ${(it.slope | 0) === n ? 'selected' : ''}>Dakvlak ${n + 1}</option>`).join('')}</select></label>`
      : '';
  const card = it => {
    const sum = lines.filter(l => l.ri && l.label.includes(' · ' + it.name)).reduce((a, l) => a + l.phi, 0);
    const head = `<div class="row"><input class="in grow" id="f-ri-${it.id}-n" data-f="ri.${it.id}.name" value="${esc(it.name)}" aria-label="Naam"><button class="btn small" data-act="delri" data-i="${it.id}" aria-label="Verwijder ${esc(it.name)}">✕</button></div>`;
    if (it.kind === 'raam')
      return `<div class="card">${head}<div class="fields">${numField('f-ri-' + it.id + '-w', 'ri.' + it.id + '.w', 'Breedte', 'm', it.w, 2)}${numField('f-ri-' + it.id + '-h', 'ri.' + it.id + '.h', 'Lengte langs de helling', 'm', it.h, 2)}${slopeSel(it)}</div>
        <label class="f" for="f-ri-${it.id}-c">Constructie<select class="in" id="f-ri-${it.id}-c" data-f="ri.${it.id}.cid">${conOptions(it.cid, 'raam')}</select></label>
        ${posFields(it)}
        <div class="det">${fmt(it.w * it.h, 2)} m² dakraam · ${fmtW(sum)} W. Dit oppervlak gaat van het dakvlak af.</div></div>`;
    const D = dormerDepth(room, it);
    return `<div class="card">${head}<div class="fields">${numField('f-ri-' + it.id + '-w', 'ri.' + it.id + '.w', 'Breedte', 'm', it.w, 2)}${numField('f-ri-' + it.id + '-hf', 'ri.' + it.id + '.hf', 'Hoogte voorkant', 'm', it.hf, 2)}${slopeSel(it)}</div>
      <div class="fields"><label class="f" for="f-ri-${it.id}-cw">Wanden (voorkant en zijwangen)<select class="in" id="f-ri-${it.id}-cw" data-f="ri.${it.id}.cidW">${conOptions(it.cidW, 'wand')}</select></label><label class="f" for="f-ri-${it.id}-cr">Plat dak<select class="in" id="f-ri-${it.id}-cr" data-f="ri.${it.id}.cidR">${conOptions(it.cidR, 'dak')}</select></label></div>
      <div class="fields">${numField('f-ri-' + it.id + '-ww', 'ri.' + it.id + '.winw', 'Raam breedte', 'm', it.winw, 2)}${numField('f-ri-' + it.id + '-wh', 'ri.' + it.id + '.winh', 'Raam hoogte', 'm', it.winh, 2)}<label class="f" for="f-ri-${it.id}-wc">Raam<select class="in" id="f-ri-${it.id}-wc" data-f="ri.${it.id}.wincid">${conOptions(it.wincid, 'raam')}</select></label></div>
      ${posFields(it)}
      <div class="det">Diepte ${fmt(D, 2)} m (volgt uit de hoogte en de dakhelling)<br>Voorkant ${fmt(it.w * it.hf, 1)} m² (waarvan raam ${fmt(Math.min(it.winw * it.winh, it.w * it.hf), 1)} m²) · zijwangen ${fmt(D * it.hf, 1)} m² · plat dak ${fmt(it.w * D, 1)} m²<br>Gaat van het dakvlak af: ${fmt((it.w * D) / R.cosA, 1)} m² · samen ${fmtW(sum)} W</div></div>`;
  };
  return `<div class="sec"><h3>Dakramen en dakkapellen</h3>${items.map(card).join('') || '<p class="note">Nog geen dakramen of dakkapellen in dit dakvlak.</p>'}
    <div class="row"><button class="btn small" data-act="addri" data-k="raam">+ Dakraam</button><button class="btn small" data-act="addri" data-k="kapel">+ Dakkapel</button></div>
    <p class="note">Een dakraam (bijvoorbeeld een Velux) gaat met zijn oppervlak van het schuine dakvlak af. Een dakkapel heeft een voorkant met raam, twee driehoekige zijwangen en een plat dak. Zijn diepte volgt uit de hoogte van de voorkant en de dakhelling, en het stuk schuin dak eronder gaat eraf. De plek (langs de nok en vanaf de goot) bepaalt alleen waar ze in de tekening en in 2,5D staan.</p></div>`;
}
function roofEditor(room, surfCard) {
  const r = room.roof,
    R = roofOf(room),
    rp = roofParts(room);
  const typeSel = `<label class="f" for="f-roof-type">Vorm<select class="in" id="f-roof-type" data-f="roof.type">${Object.entries(
    ROOF_TYPES
  )
    .map(([k, v]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${v}</option>`)
    .join('')}</select></label>`;
  if (!R)
    return `<div class="card">${typeSel}<p class="note">Kies Zadeldak of Lessenaarsdak voor een ruimte onder een schuin dak, zoals een zolder.</p></div>${surfCard('ceil', 'Plafond', 'dak')}${isoSvg(room)}`;
  const slopeA = rp.parts.filter(p => p.kind === 'slope').reduce((a, p) => a + p.A, 0),
    capA = rp.parts.filter(p => p.kind === 'cap').reduce((a, p) => a + p.A, 0);
  let h = `<div class="card">${typeSel}
    <div class="fields">${numField('f-roof-p', 'roof.pitch', 'Dakhelling', '°', r.pitch, 1)}${numField('f-roof-k', 'roof.knee', 'Hoogte muurplaat', 'm', r.knee, 2)}
    <label class="f" for="f-roof-e">Nok evenwijdig aan<select class="in" id="f-roof-e" data-f="roof.edge">${room.pts.map((_, i) => `<option value="${i}" ${(r.edge | 0) === i ? 'selected' : ''}>Wand ${i + 1} (${fmt(edge(room, i).L)} m)</option>`).join('')}</select></label>
    ${R.type === 'lessenaar' ? `<label class="f" for="f-roof-l">Lage kant<select class="in" id="f-roof-l" data-f="roof.low"><option value="min" ${r.low !== 'max' ? 'selected' : ''}>Aan de ene kant</option><option value="max" ${r.low === 'max' ? 'selected' : ''}>Aan de andere kant</option></select></label>` : ''}</div>
    <label class="chk"><input type="checkbox" id="f-roof-flat" data-f="roof.flat" ${r.flat ? 'checked' : ''}> Vlak plafond (zoldervloer of hanenbalk)</label>
    ${r.flat ? `<div class="fields">${numField('f-room-h2', 'room.height', 'Plafondhoogte', 'm', room.height, 2)}</div>` : ''}
    <label class="chk"><input type="checkbox" id="f-roof-knee-on" data-f="roof.kneeOn" ${r.kneeOn ? 'checked' : ''}> Knieschot (schot onder de schuine kap)</label>
    ${
      r.kneeOn
        ? (() => {
            const K = kneeLines(room);
            return `<div class="fields">${numField('f-roof-kh', 'roof.kneeH', 'Hoogte knieschot', 'm', r.kneeH, 2)}</div>
      ${
        K.cs.length
          ? `<div class="det">Knieschot op ${fmt(K.d, 2)} m van de gevel${R.type === 'zadel' ? ' (aan beide kanten)' : ' (aan de lage kant)'}</div>`
          : `<p class="note" style="color:var(--warn)">⚠ Het knieschot moet hoger zijn dan de muurplaat (${fmt(R.knee, 2)} m) en lager dan de nok.</p>`
      }
      <p class="note">Het knieschot staat als stippellijn in de tekening en telt niet mee in de berekening: de bergruimte erachter ligt binnen de schil. Wil je de zolder opdelen, trek dan met <b>Wand</b> een lijn van knieschot naar knieschot; de wand loopt door tot de gevels.</p>`;
          })()
        : ''
    }
    <div class="det">${R.type === 'zadel' ? 'Nokhoogte' : 'Hoogste punt'} ${fmt(R.nok)} m${!r.flat ? ' · open tot in de nok' : R.nok > R.cap ? ` · vlak plafond op ${fmt(R.cap)} m` : ' · plafond ligt boven de nok, dus open tot in de nok'}<br>Dakvlak ${fmt(slopeA / R.cosA, 1)} m² (${fmt(slopeA, 1)} m² horizontaal)${capA > 0 ? ` · vlak plafond ${fmt(capA, 1)} m²` : ''}<br>Inhoud ${fmt(roomVolume(room), 1)} m³</div>
    <p class="note"><b>Hoogte muurplaat</b> is de hoogte boven de vloer waar het schuine dak begint, meestal de bovenkant van de gevelmuur. Teken je de ruimte tot een laag wandje op zolder, vul dan de hoogte van dat wandje in. De nokhoogte volgt uit de dakhelling, deze hoogte en de breedte van de ruimte. Zonder vlak plafond loopt het dak door tot in de nok. Met een vlak plafond wordt alleen het stuk boven de plafondhoogte afgevlakt. Ligt de nok lager dan het plafond, dan blijft het gewoon een punt.</p></div>
  ${isoSvg(room)}
  ${surfCard('roof', 'Dakvlak', 'dak')}
  ${roofItemsHtml(room)}`;
  if (capA > 0) h += surfCard('ceil', 'Vlak plafond', 'dak');
  return h;
}
function roomCard(x) {
  return `<button class="roomcard" data-act="selroom" data-r="${x.room.id}"><span class="rn">${esc(x.room.name)}</span><span class="rk">${x.c.unheated ? 'onverwarmd' : fmt(x.c.total / 1000, 2) + ' kW'}</span>${segHtml(x.c, false)}<span class="rs">${fmt(x.c.Af, 1)} m² · ${nv(x.room.temp, 1)} °C${x.c.missing ? ' · ⚠ constructie ontbreekt' : ''}</span></button>`;
}
// ventilation, transfer air and infiltration as extra rows below the transmission table
function airRows(room, c) {
  const S = P.settings;
  return [
    [
      'Ventilatie toevoer',
      `${nv(room.sup, 0)} m³/h van ${fmt(c.ts, 1)} °C${S.ventSys === 'D' ? ` (na WTW, η ${nv(S.eta, 2)})` : ' (buitenlucht)'}`,
      c.phiS
    ],
    ...c.tin.map(t => [`Overstroom uit ${esc(t.room.name)}`, `${nv(t.q, 0)} m³/h van ${nv(t.room.temp, 1)} °C`, t.phi]),
    ...(c.qo > 0
      ? [
          [
            'Aanvulling uit de woning',
            `${nv(c.qo, 0)} m³/h van ${nv(S.tRet, 1)} °C · herkomst niet opgegeven`,
            RHOC * c.qo * (room.temp - S.tRet)
          ]
        ]
      : []),
    [
      'Infiltratie',
      S.infMode === 'qv10'
        ? `${fmt(c.qi, 1)} m³/h · aandeel via ${fmt(c.env, 1)} m² buitenschil`
        : `n = ${nv(S.nInf, 2)} /h × ${fmt(c.V, 1)} m³`,
      c.inf
    ]
  ];
}
function roomCalcHtml(room) {
  const c = calcRoom(room);
  const S = P.settings;
  if (c.unheated)
    return `<div class="kcard"><div class="kh"><span>${esc(room.name)}</span><b>onverwarmd</b></div><span class="note">Deze ruimte telt niet mee in het warmteverlies. Ruimtes ernaast, erboven of eronder rekenen met de temperatuur hier (${nv(room.temp, 1)} °C). Typisch: kruipruimte 8 à 12 °C, kelder 10 à 15 °C, onverwarmde berging 5 à 10 °C.</span></div>`;
  return `<div class="kcard"><div class="kh"><span>${esc(room.name)}</span><b>${fmt(c.total / 1000, 2)} kW</b></div>${segHtml(c, true)}
    <div class="seglegend"><span style="--c:transparent">${fmtW(c.trans)} W transmissie</span><span style="--c:transparent">${fmtW(c.vent + c.inf)} W lucht</span><span style="--c:transparent">${c.Af > 0 ? fmtW(c.total / c.Af) : '–'} W/m²</span></div></div>
  ${c.missing ? `<div class="warnbox">${c.missing} onderdeel${c.missing > 1 ? 'en hebben' : ' heeft'} nog geen constructie. Die tellen nu als 0 W.</div>` : ''}
  ${innerOutsideHtml(innerOutside(room), 'room')}
  ${calcTable(c.lines, airRows(room, c))}`;
}
function viewNone() {
  const c = calcAll();
  const fl = P.floors[floorIdx(curFloor)] || P.floors[0];
  const per = c.per.filter(x => x.room.floorId === curFloor);
  return `${sanityHtml(c)}<div class="sec"><h2>${esc(P.name)}</h2><p class="note">Klik in de tekening op een ruimte of een wanddeel. Een nieuwe ruimte teken je met <b>Rechthoek</b> (R) of <b>Veelhoek</b> (P). Een wand die uit twee materialen bestaat, splits je met <b>Splits</b> (S). Een ruimte opdelen doe je met <b>Wand</b> (W): trek een lijn van rand naar rand. Wissel van verdieping met de knoppen boven de tekening of met PageUp en PageDown.</p></div>
  <div class="sec"><h3>Ruimtes op ${esc(fl.name)}</h3>${per.length ? `<div class="roomcards">${per.map(roomCard).join('')}</div>` : '<p class="note">Nog geen ruimtes. Kies Rechthoek en sleep in het tekenvlak.</p>'}</div>
  ${P.example ? `<div class="sec"><p class="note">Dit is een voorbeeldproject met verzonnen waarden. Pas het aan, of start een leeg project onder <b>Project</b>.</p></div>` : ''}`;
}
function viewRoom(room) {
  let h = `<div class="sec"><button class="crumb" data-act="desel">← Alle ruimtes</button><input class="title" id="f-room-name" data-f="room.name" value="${esc(room.name)}" aria-label="Naam ruimte"></div>
  <label class="chk"><input type="checkbox" id="f-room-heated" data-f="room.heated" ${room.heated === false ? '' : 'checked'}> Verwarmde ruimte</label>
  <label class="chk" title="Meterkast, technische ruimtes en kruipruimtes tellen niet mee. Onder een schuin dak telt alleen het deel dat minstens 1,5 m hoog is."><input type="checkbox" id="f-room-go" data-f="room.go" ${inLiving(room) ? 'checked' : ''}> Telt mee voor woonoppervlak</label>${(() => {
    const go = livingArea(room),
      Af = Math.abs(polyArea(room.pts));
    return inLiving(room) && go < Af - 0.05
      ? `<p class="note" style="margin-top:2px">Woonoppervlak ${fmt(go, 1)} van ${fmt(Af, 1)} m²: de rest is lager dan 1,5 m.</p>`
      : '';
  })()}
  <div class="fields">${numField('f-room-temp', 'room.temp', room.heated === false ? 'Temperatuur (aangenomen)' : 'Ontwerptemperatuur θi', '°C', room.temp, 1)}${(roofOf(room) && !spans(room)) || videRoof(room) ? '' : numField('f-room-h', 'room.height', spans(room) ? 'Totale hoogte' : 'Hoogte', 'm', room.height, 2)}${numField('f-room-sup', 'room.sup', P.settings.ventSys === 'D' ? 'Inblaas' : 'Toevoer (roosters)', 'm³/h', room.sup, 0)}${numField('f-room-ext', 'room.ext', 'Afzuiging', 'm³/h', room.ext, 0)}</div>
  <div class="fields">${floorSelect('f-room-fl', 'room.floorId', room.floorId)}</div>
  <div class="fields"><label class="f" for="f-room-kind">Soort ruimte<select class="in" id="f-room-kind" data-f="room.kind">${[
    ['normaal', 'Normale ruimte'],
    ['trap', 'Trappenhuis'],
    ['vide', 'Vide']
  ]
    .map(([k, l]) => `<option value="${k}" ${room.kind === k ? 'selected' : ''}>${l}</option>`)
    .join('')}</select></label>
    <label class="f" for="f-room-span">Loopt door tot<select class="in" id="f-room-span" data-f="room.spanTo"><option value="">Alleen ${esc((P.floors[floorIdx(room.floorId)] || {}).name || 'deze verdieping')}</option>${P.floors
      .slice(floorIdx(room.floorId) + 1)
      .map(fl => `<option value="${fl.id}" ${room.spanTo === fl.id ? 'selected' : ''}>${esc(fl.name)}</option>`)
      .join('')}</select></label></div>
  ${spans(room) ? `<p class="note">Deze ruimte loopt door tot ${esc(P.floors[levelsOf(room)[1]].name)}. Vul bij Totale hoogte de hoogte over alle verdiepingen in. Wanden van ruimtes op de verdiepingen erboven grenzen nu aan deze ruimte, en op die verdiepingen staat hij gearceerd. Warme lucht stijgt hier vrij op: geef onder <button class="crumb" data-act="gotab" data-tab="vent">Ventilatie</button> de overstroom van en naar deze ruimte op.</p>` : room.kind !== 'normaal' && P.floors.length <= floorIdx(room.floorId) + 1 ? '<p class="note">Er is geen verdieping boven deze. Voeg eerst een verdieping toe om de ruimte te laten doorlopen.</p>' : ''}
  ${
    room.kind === 'trap'
      ? (() => {
          const st = stairOf(room),
            n = room.pts.length;
          const opt = (k, v, cur) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`;
          return `<div class="card"><b>Trap</b>
      <div class="fields"><label class="f" for="f-st-shape">Vorm<select class="in" id="f-st-shape" data-f="room.stair.shape">${Object.entries(
        STAIR_SHAPES
      )
        .map(([k, v]) => opt(k, v, st.shape))
        .join('')}</select></label>
      <label class="f" for="f-st-edge">Begint bij<select class="in" id="f-st-edge" data-f="room.stair.edge">${room.pts.map((_, i) => opt(String(i), 'Wand ' + (i + 1) + ' (' + fmt(edge(room, i).L) + ' m)', String(st.edge))).join('')}</select></label>
      <label class="f" for="f-st-side">Langs de kant van<select class="in" id="f-st-side" data-f="room.stair.side">${opt('a', 'hoek ' + (st.edge + 1), st.side)}${opt('b', 'hoek ' + (((st.edge + 1) % n) + 1), st.side)}</select></label>
      ${numField('f-st-w', 'room.stair.w', 'Breedte', 'm', st.w, 2)}</div>
      <p class="note">Alleen voor de tekening en de 2,5D-weergave. De trap loopt van wand ${st.edge + 1} de ruimte in${st.shape === 'kwart' ? ' en draait aan het eind de hoek om' : st.shape === 'half' ? ', draait op een bordes en komt terug' : ''}. De app gaat uit van een rechthoekig trapgat.${spans(room) ? '' : ' Laat de ruimte doorlopen tot de verdieping erboven om de trap te zien.'}</p></div>`;
        })()
      : ''
  }
  ${roomAirHtml(room)}
  <p class="note">Ventilatiesysteem ${esc(VENT_SYS[P.settings.ventSys])}${P.settings.ventSys === 'D' ? `, WTW-rendement ${nv(P.settings.eta * 100, 0)}%` : ''}. <button class="crumb" data-act="gotab" data-tab="vent">Ventilatie en WTW instellen</button></p>
  <div class="sec" id="calc-out">${roomCalcHtml(room)}</div>
  <div class="sec">${roomEmitHtml(room)}</div>
  <div class="sec"><h3>Wanden</h3><p class="note">Klik een wand om de constructie, ramen en deuren en wat erachter ligt in te stellen.</p>`;
  room.pts.forEach((_, i) => {
    const w = room.walls[i];
    const b = bounds(room, i);
    w.segs.forEach((sg, j) => {
      const len = b[j + 1] - b[j];
      if (len < 1e-4) return;
      const c = conById(sg.cid);
      let to;
      if (sg.adj === 'open') {
        const ps = sharedParts(room, i, b[j], b[j + 1]);
        to =
          'open naar ' +
          (ps
            .map(p => esc(p.o.name))
            .filter((v, k, a) => a.indexOf(v) === k)
            .join(', ') || '?');
      } else if (sg.adj === 'auto') {
        const ps = sharedParts(room, i, b[j], b[j + 1]);
        const used = ps.reduce((a, p) => a + p.t1 - p.t0, 0);
        to = ps.map(p => esc(p.o.name)).filter((v, k, a) => a.indexOf(v) === k);
        if (len - used > 0.01) to.push('buiten');
        to = to.join(', ');
      } else to = esc(ADJ[sg.adj].toLowerCase());
      const nop = sg.openings.length;
      h += `<button class="segrow" data-act="selseg" data-r="${room.id}" data-w="${i}" data-s="${j}"><span class="sw" style="${sg.adj === 'open' ? 'background:none;border:1.5px dashed var(--muted)' : 'background:' + (c ? esc(c.color) : 'var(--warn)')}"></span><span class="sr-t"><b>${sg.adj === 'open' ? 'Open' : 'Wand'} ${i + 1}${w.segs.length > 1 ? LET[j] || j : ''}</b> · ${fmt(len)} m${nop && sg.adj !== 'open' ? ' · ' + nop + (nop > 1 ? ' openingen' : ' opening') : ''}<small>${sg.adj === 'open' ? 'geen wand, geen warmteverlies' : c ? esc(c.name) : '⚠ geen constructie'} → ${to}</small></span><span aria-hidden="true">›</span></button>`;
    });
  });
  const surfCard = (k, lab, kind, extra) => {
    const s = room[k],
      auto = s.adj === 'auto' && k !== 'roof',
      // ceilings, and floors of an upper storey, can have a second construction for the part with nothing above / below
      two = k === 'ceil' || (k === 'floor' && levelsOf(room)[0] > 0),
      ls = auto ? calcRoom(room).lines.filter(l => l.group === k) : [];
    return `<div class="card"><b>${lab}</b>${extra || ''}<label class="f" for="f-${k}-cid">${two ? (k === 'ceil' ? 'Constructie onder een ruimte erboven' : 'Constructie boven een ruimte eronder') : 'Constructie'}<select class="in" id="f-${k}-cid" data-f="${k}.cid">${conOptions(s.cid, kind)}</select></label>
    ${
      two
        ? `<label class="f" for="f-${k}-cidout">${k === 'ceil' ? 'Constructie waar niets boven ligt (bijv. plat dak van een uitbouw)' : 'Constructie waar niets onder ligt (bijv. overstek)'}<select class="in" id="f-${k}-cidout" data-f="${k}.cidOut">${conOptions(s.cidOut, kind).replace('— kies een constructie —', 'Zelfde als hierboven')}</select></label>`
        : ''
    }
    <div class="row"><label class="f grow" for="f-${k}-adj">Grenst aan<select class="in" id="f-${k}-adj" data-f="${k}.adj">${adjOptions(s.adj, k !== 'roof', false)}</select></label>${s.adj === 'temp' ? `<label class="f" style="width:110px" for="f-${k}-t">Temperatuur <span class="u">°C</span><input class="in num" id="f-${k}-t" data-f="${k}.t" inputmode="decimal" value="${nv(s.t, 1)}"></label>` : ''}</div>
    ${
      auto
        ? `<div class="det">${ls.map(l => `${fmt(l.A, 1)} m² ${esc(l.sub)} (${nv(l.t, 1)} °C)`).join('<br>') || '–'}</div><p class="note">Welk deel ${k === 'floor' ? 'boven een ruimte ligt' : 'onder een ruimte ligt'} en welk niet, volgt uit de tekening van de verdieping ${k === 'floor' ? 'eronder' : 'erboven'}.</p>`
        : two
          ? `<p class="note">De tweede constructie werkt als <i>Grenst aan</i> op <b>Automatisch (uit tekening)</b> staat. Dan verdeelt de app het ${k === 'ceil' ? 'plafond' : 'de vloer'} zelf.</p>`
          : ''
    }</div>`;
  };
  h += `</div><div class="sec"><h3>Vloer</h3>${surfCard('floor', 'Vloer', 'vloer')}</div>`;
  const vt = videTop(room);
  h += vt
    ? `<div class="sec"><h3>Dak</h3>${videRoofHtml(room, vt)}`
    : `<div class="sec"><h3>Dak en plafond</h3>${roofEditor(room, surfCard)}`;
  h += `</div><div class="row"><button class="btn danger" data-act="delroom">Ruimte verwijderen</button></div>`;
  return h;
}
function viewSeg(room, i, j) {
  const e = edge(room, i);
  const w = room.walls[i];
  const sg = w.segs[j];
  const b = bounds(room, i);
  const s0 = b[j],
    s1 = b[j + 1];
  const con = conById(sg.cid);
  const nm = 'Wand ' + (i + 1) + (w.segs.length > 1 ? ' · deel ' + (LET[j] || j) : '');
  let h = `<div class="sec"><button class="crumb" data-act="selroom" data-r="${room.id}">← ${esc(room.name)}</button><h2>${nm}</h2>
    <p class="note">Wand van hoek ${i + 1} naar hoek ${((i + 1) % room.pts.length) + 1}, totaal ${fmt(e.L)} m. Dit deel: ${fmt(s0)} – ${fmt(s1)} m (${fmt(s1 - s0)} m × ${fmt(room.height)} m hoog).</p>
    ${wallBar(room, i, j)}<div class="scale"><span>0</span><span>${fmt(e.L)} m</span></div></div>
  <div class="sec" ${sg.adj === 'open' ? 'style="display:none"' : ''}><h3>Constructie</h3><select class="in" id="f-seg-cid" data-f="seg.cid">${conOptions(sg.cid, 'wand')}</select>
    ${con ? `<p class="note">U = ${nv(con.U, 3)} W/m²K${DU_TYPES.has(sg.adj === 'auto' ? 'buiten' : sg.adj) ? ` + ΔU koudebrug ${nv(P.settings.dU, 3)}` : ''}. Wijzig de waarde onder <button class="crumb" data-act="gocon" data-c="${con.id}">Constructies</button>.</p>` : `<p class="note">Nog geen constructie. Maak er een aan onder <button class="crumb" data-act="gocon">Constructies</button> met de U-waarde uit ubakus.de.</p>`}</div>
  <div class="sec"><h3>Grenst aan</h3><div class="row"><select class="in grow" id="f-seg-adj" data-f="seg.adj">${adjOptions(sg.adj, true)}</select>${sg.adj === 'temp' ? `<label class="f" style="width:110px" for="f-seg-t">Temp. <span class="u">°C</span><input class="in num" id="f-seg-t" data-f="seg.adjT" inputmode="decimal" value="${nv(sg.adjT, 1)}"></label>` : ''}</div>`;
  h += innerOutsideHtml(
    innerOutside(room).filter(x => x.w === i && x.s === j),
    'seg'
  );
  if (sg.adj === 'open') {
    const ps = partnersOf(room, i, j);
    const dT = ps.filter(p => Math.abs(p.o.temp - room.temp) > 0.05);
    h += `<p class="note">Hier zit geen wand: deze ruimte loopt open over in ${ps.length ? ps.map(p => '<b>' + esc(p.o.name) + '</b>').join(' en ') : 'een andere ruimte'}, bijvoorbeeld een hal die overgaat in een trapvide. Er gaat geen warmte door dit stuk en het heeft geen constructie nodig. De andere ruimte heeft hier ook een open verbinding.</p>
      ${ps.length ? '' : `<p class="note" style="color:var(--warn)">⚠ Er ligt hier geen andere ruimte tegenaan. Een open verbinding naar buiten telt niet mee in het warmteverlies.</p>`}
      ${dT.length ? `<p class="note" style="color:var(--warn)">⚠ ${esc(room.name)} (${nv(room.temp, 1)} °C) en ${dT.map(p => esc(p.o.name) + ' (' + nv(p.o.temp, 1) + ' °C)').join(', ')} hebben een andere temperatuur. Bij een open verbinding is dat in de praktijk ongeveer gelijk.</p>` : ''}
      <p class="note">Lucht stroomt hier vrij. Geef onder <button class="crumb" data-act="gotab" data-tab="vent">Ventilatie</button> de overstroom op als de ene ruimte lucht toevoert en de andere afzuigt.</p>`;
  }
  if (sg.adj === 'auto') {
    const nb = neighbourIntervals(room, i);
    let rows = [],
      used = 0;
    nb.forEach(n => {
      let l = 0;
      n.ivs.forEach(iv => (l += Math.max(0, Math.min(s1, iv[1]) - Math.max(s0, iv[0]))));
      if (l > 0.005) {
        rows.push(`${fmt(l)} m → ${esc(n.room.name)} (${nv(n.room.temp, 1)} °C)`);
        used += l;
      }
    });
    const rest = s1 - s0 - used;
    if (rest > 0.005) rows.push(`${fmt(rest)} m → buiten (${nv(P.settings.te, 1)} °C)`);
    h += `<div class="det">${rows.join('<br>')}</div><p class="note">Herkend uit de tekening: wanden van andere ruimtes die evenwijdig liggen binnen ${fmt(P.settings.maxWall)} m wanddikte.</p>`;
    const ps = partnersOf(room, i, j);
    if (ps.length) {
      const diff = ps.filter(p => {
        const sgs = p.o.walls[p.k].segs,
          bo = bounds(p.o, p.k);
        return sgs.some((x, q) => bo[q + 1] > p.u0 + 0.01 && bo[q] < p.u1 - 0.01 && x.cid !== sg.cid);
      });
      const one = ps.length === 1 && ps[0].whole;
      h += `<div class="card"><b>Gedeelde wand</b><p class="note">Dit stuk wand hoort ook bij ${ps.map(p => '<b>' + esc(p.o.name) + '</b> (' + fmt(p.t1 - p.t0) + ' m)').join(' en ')}. Een andere constructie geldt meteen voor beide kanten.${one ? ' Een raam of deur die je hier toevoegt, komt ook in ' + esc(ps[0].o.name) + '.' : ''}</p>
        ${diff.length ? `<p class="note" style="color:var(--warn)">⚠ In ${diff.map(p => esc(p.o.name)).join(' en ')} heeft dit stuk nu een andere constructie.</p><div class="row"><button class="btn small" data-act="syncseg">Constructie gelijk trekken</button></div>` : ''}
        ${!one ? `<p class="note">Dit deel grenst ${ps.length > 1 ? 'aan meer dan één ruimte' : 'maar voor een deel aan ' + esc(ps[0].o.name)}. Splits het op de grens om ramen en deuren in het gedeelde stuk te zetten.</p><div class="row"><button class="btn small" data-act="alignseg">Splitsen op de grens</button></div>` : ''}</div>`;
    }
  }
  h += `</div><div class="sec"><h3>Splitsingen in wand ${i + 1}</h3>`;
  if (w.cuts.length) {
    w.cuts.forEach((c, ci) => {
      h += `<div class="row"><label class="f grow" for="f-cut-${ci}">Grens ${LET[ci] || ci}|${LET[ci + 1] || ci + 1} op <span class="u">m vanaf hoek ${i + 1}</span><input class="in num" id="f-cut-${ci}" data-f="cut.${ci}" inputmode="decimal" value="${nv(c, 3)}"></label><button class="btn small" data-act="delcut" data-c="${ci}" style="align-self:flex-end">Weghalen</button></div>`;
    });
  } else h += `<p class="note">Deze wand bestaat uit één deel.</p>`;
  h += `<div class="row"><label class="f grow" for="f-newcut">Nieuwe splitsing op <span class="u">m vanaf hoek ${i + 1}</span><input class="in num" id="f-newcut" inputmode="decimal" placeholder="${nv(r3((s0 + s1) / 2), 2)}"></label><button class="btn small" data-act="addcut" style="align-self:flex-end">Splitsen</button><button class="btn small" data-act="splitmid" style="align-self:flex-end">In het midden</button></div></div>`;
  h += `<div class="sec" ${sg.adj === 'open' ? 'style="display:none"' : ''}><h3>Ramen en deuren in dit deel</h3>`;
  sg.openings.forEach(o => {
    h += `<div class="card"><div class="opgrid"><label class="f" for="f-op-${o.id}-n">Naam<input class="in" id="f-op-${o.id}-n" data-f="op.${o.id}.name" value="${esc(o.name)}"></label>${numField('f-op-' + o.id + '-w', 'op.' + o.id + '.w', 'Breedte', 'm', o.w, 2)}${numField('f-op-' + o.id + '-h', 'op.' + o.id + '.h', 'Hoogte', 'm', o.h, 2)}<button class="btn small" data-act="delop" data-o="${o.id}" aria-label="Verwijder ${esc(o.name)}">✕</button></div>
    ${(() => {
      const it = opLayout(room, i, j).find(x => x.o === o),
        R = wallRoof(room),
        mid = it ? (it.t0 + it.t1) / 2 : (s0 + s1) / 2,
        top = R ? R.z(R.sOf({ x: e.a.x + e.ux * mid, y: e.a.y + e.uy * mid })) : room.height,
        sl = opSill(o, top);
      return `<div class="fields">${numField('f-op-' + o.id + '-at', 'op.' + o.id + '.at', 'Begint op', 'm vanaf hoek ' + (i + 1), it ? it.t0 : NaN, 2)}${numField('f-op-' + o.id + '-sill', 'op.' + o.id + '.sill', 'Onderkant', 'm boven vloer', sl, 2)}</div>${sl + o.h > top + 0.01 ? `<p class="note" style="color:var(--warn)">⚠ De bovenkant (${fmt(sl + o.h)} m) komt boven de wand uit (${fmt(top)} m hoog op deze plek).</p>` : ''}`;
    })()}
    <select class="in" id="f-op-${o.id}-c" data-f="op.${o.id}.cid" aria-label="Constructie opening">${conOptions(o.cid, 'raam')}</select></div>`;
  });
  h += `<div class="row"><button class="btn small" data-act="addop">+ Raam of deur</button><span class="note">Het oppervlak gaat van de wand af. Sleep een raam of deur in de tekening om het te verplaatsen.</span></div></div>`;
  const c = calcRoom(room);
  const mine = c.lines.filter(l => l.w === i && l.s === j);
  h += `<div class="sec" id="calc-out"><h3>Verlies van dit deel</h3>${calcTable(mine)}<p class="note">Subtotaal ${fmtW(mine.reduce((a, l) => a + l.phi, 0))} W van ${fmtW(c.total)} W voor ${esc(room.name)}.</p></div>`;
  return h;
}
let conOpen = null;
const rseOf = c => (c.inner ? RS[c.kind][0] : RS[c.kind][1]);
function matOptions(sel) {
  return (
    `<option value="">— materiaal —</option>` +
    P.materials
      .map(
        m =>
          `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.type === 'lambda' ? ' · λ ' + nv(m.lambda, 3) : m.type === 'R' ? ' · R ' + nv(m.R, 2) : ''}</option>`
      )
      .join('')
  );
}
function xsecSvg(c, r) {
  const L = c.layers;
  if (!L.length) return '';
  const W = 360,
    H = 118,
    pl = 34,
    pr = 34,
    top = 16,
    hh = H - top - 26;
  const th = L.map(l => {
    const m = matById(l.mid);
    return m && m.type === 'R' ? 0 : Math.max(0, l.d);
  });
  const tot = th.reduce((a, b) => a + b, 0) || 1;
  let ws = th.map(t => Math.max(3, (t / tot) * (W - pl - pr)));
  const sc = (W - pl - pr) / ws.reduce((a, b) => a + b, 0);
  ws = ws.map(w => w * sc);
  let x = pl,
    out = '';
  const xs = [x];
  L.forEach((l, i) => {
    const m = matById(l.mid);
    const w = ws[i];
    const op = r.layers[i].active ? 1 : 0.35;
    if (m && m.type === 'spouw')
      out += `<rect x="${x}" y="${top}" width="${w}" height="${hh}" fill="none" stroke="var(--muted)" stroke-dasharray="2 2" opacity="${op}"/>`;
    else
      out += `<rect x="${x}" y="${top}" width="${w}" height="${hh}" fill="${esc(m ? m.color : '#999999')}" opacity="${op}"/>`;
    if (l.mix && m && m.type === 'lambda') {
      const mm = matById(l.mix.mid);
      const bh = (hh * Math.max(0, Math.min(100, l.mix.pct))) / 100;
      if (mm && bh > 0)
        out += `<rect x="${x}" y="${top + (hh - bh) / 2}" width="${w}" height="${bh}" fill="${esc(mm.color)}" opacity="${op}"/>`;
    }
    x += w;
    xs.push(x);
  });
  const ti = 20,
    te = P.settings.te,
    y = t => top + ((ti - t) / Math.max(1, ti - te)) * hh;
  const q = (ti - te) / r.Rlo;
  let cur = ti - q * r.rsi;
  const pts = [
    [6, ti],
    [pl, cur]
  ];
  L.forEach((l, i) => {
    if (r.layers[i].active) cur -= q * r.layers[i].r;
    else cur = te;
    pts.push([xs[i + 1], cur]);
  });
  pts.push([W - 6, te]);
  out += `<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="var(--heat)" stroke-width="2"/>`;
  out += `<text x="4" y="${H - 8}">binnen ${nv(ti, 0)} °C</text><text x="${W - 4}" y="${H - 8}" text-anchor="end">buiten ${nv(te, 0)} °C</text>`;
  out += `<text x="${pl + 3}" y="11">${nv(pts[1][1], 1)} °C</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Doorsnede met temperatuurverloop">${out}</svg>`;
}
function layerSummary(c, r) {
  if (!c.layers.length) return '';
  const notes = [];
  if (r.mode === 'sterk')
    notes.push(
      'Sterk geventileerde spouw: de spouw en alle lagen erbuiten tellen niet mee. Aan de buitenkant geldt dan Rse = Rsi.'
    );
  if (r.mode === 'zwak')
    notes.push(
      'Zwak geventileerde spouw: de spouw telt voor de helft, de lagen erbuiten samen voor maximaal 0,15 m²K/W.'
    );
  if (r.mixed)
    notes.push(
      `Inhomogene laag (stijlen of regels): gemiddelde van bovengrens ${fmt(r.Rup, 2)} en ondergrens ${fmt(r.Rlo, 2)} m²K/W.`
    );
  return `<div class="xsec">${xsecSvg(c, r)}</div>
    <div class="det">Rsi ${fmt(r.rsi, 2)} + lagen ${fmt(r.Rc, 2)} + Rse ${fmt(r.rse, 2)} = RT ${fmt(r.RT, 2)} m²K/W<br><b>Rc = ${fmt(r.Rc, 2)} m²K/W · U = ${nv(r.U, 3)} W/m²K</b></div>
    ${notes.map(n => `<p class="note">${n}</p>`).join('')}`;
}
function layersEditor(c) {
  const r = calcLayers(c);
  let h = `<div id="lsum-${c.id}" class="sec">${layerSummary(c, r)}</div><div class="layers"><span class="layside">Binnen</span>`;
  if (!c.layers.length) h += `<p class="note">Nog geen lagen. Begin met de binnenste laag.</p>`;
  c.layers.forEach((l, i) => {
    const m = matById(l.mid);
    const li = r.layers[i];
    const pre = `lay.${c.id}.${l.id}.`;
    h += `<div class="layer ${li.active ? '' : 'ign'}"><div class="lrow">
      <div class="lmove"><button data-act="laymove" data-c="${c.id}" data-l="${l.id}" data-dir="-1" aria-label="Laag naar binnen" ${i === 0 ? 'disabled' : ''}>▲</button><button data-act="laymove" data-c="${c.id}" data-l="${l.id}" data-dir="1" aria-label="Laag naar buiten" ${i === c.layers.length - 1 ? 'disabled' : ''}>▼</button></div>
      <select class="in" id="f-lay-${l.id}-m" data-f="${pre}mid" aria-label="Materiaal">${matOptions(l.mid)}</select>
      ${m && m.type === 'R' ? `<span class="mmwrap">vaste R</span>` : `<span class="mmwrap"><input class="in num" id="f-lay-${l.id}-d" data-f="${pre}d" inputmode="decimal" value="${nv(l.d, 1)}" aria-label="Dikte in mm">mm</span>`}
      <span class="rd" id="rd-${l.id}">${li.active ? 'R ' + fmt(li.r, 2) : 'telt niet'}</span>
      <button class="xbtn" data-act="laydel" data-c="${c.id}" data-l="${l.id}" aria-label="Laag verwijderen">✕</button></div>`;
    if (m && m.type === 'spouw')
      h += `<div class="subrow"><select class="in" id="f-lay-${l.id}-v" data-f="${pre}vent" aria-label="Ventilatie spouw">${[
        ['niet', 'niet geventileerd'],
        ['zwak', 'zwak geventileerd'],
        ['sterk', 'sterk geventileerd']
      ]
        .map(([v, t]) => `<option value="${v}" ${l.vent === v ? 'selected' : ''}>${t}</option>`)
        .join('')}</select></div>`;
    else if (m && m.type === 'lambda') {
      if (l.mix)
        h += `<div class="subrow">waarvan <input class="in num" style="width:56px" id="f-lay-${l.id}-p" data-f="${pre}mixpct" inputmode="decimal" value="${nv(l.mix.pct, 2)}" aria-label="Aandeel in procent"> % <select class="in" id="f-lay-${l.id}-mm" data-f="${pre}mixmid" aria-label="Materiaal stijlen">${matOptions(l.mix.mid)}</select><button class="linkbtn" data-act="delmix" data-c="${c.id}" data-l="${l.id}">weghalen</button></div>${(matById(l.mix.mid) || {}).lambda >= 10 ? `<p class="note">Metal stud: vul het aandeel staal in. Een profiel van 0,6 mm dik op 600 mm hart-op-hart is ongeveer 0,1 %. De uitkomst is een schatting, want NEN-EN-ISO 6946 is niet bedoeld voor metaal dat door de isolatie heen loopt.</p>` : ''}`;
      else
        h += `<div class="subrow"><button class="linkbtn" data-act="addmix" data-c="${c.id}" data-l="${l.id}">+ stijlen, regels of metal studs in deze laag</button></div>`;
    }
    h += `</div>`;
  });
  return (
    h +
    `<span class="layside">Buiten</span></div><div class="row"><button class="btn small" data-act="addlayer" data-c="${c.id}">+ Laag</button></div>`
  );
}
function conCard(c, uses) {
  const open = conOpen === c.id;
  const r = c.mode === 'lagen' && c.layers.length ? calcLayers(c) : null;
  const Rc = r ? r.Rc : c.U > 0 ? 1 / c.U - RS[c.kind][0] - rseOf(c) : NaN;
  let h = `<div class="concard ${open ? 'open' : ''}" id="card-${c.id}"><button class="consum" data-act="togglecon" data-c="${c.id}" aria-expanded="${open}"><span class="sw" style="background:${esc(c.color)}"></span><span class="nm">${esc(c.name)}</span><span class="val">Rc ${Number.isFinite(Rc) ? fmt(Rc, 2) : '–'} · U ${nv(c.U, 3)}</span><span aria-hidden="true">${open ? '▴' : '▾'}</span></button>`;
  if (open) {
    h += `<div class="conbody">
    <div class="row"><input type="color" class="colorin" id="f-con-${c.id}-col" data-f="con.${c.id}.color" value="${esc(c.color)}" aria-label="Kleur"><input class="in grow" id="f-con-${c.id}-n" data-f="con.${c.id}.name" value="${esc(c.name)}" aria-label="Naam constructie"></div>
    <div class="fields"><label class="f" for="f-con-${c.id}-k">Soort<select class="in" id="f-con-${c.id}-k" data-f="con.${c.id}.kind">${Object.entries(
      KINDS
    )
      .map(([kk, v]) => `<option value="${kk}" ${kk === c.kind ? 'selected' : ''}>${v}</option>`)
      .join('')}</select></label>
    <label class="f" for="f-con-${c.id}-mode">Invoer<select class="in" id="f-con-${c.id}-mode" data-f="con.${c.id}.mode"><option value="lagen" ${c.mode === 'lagen' ? 'selected' : ''}>Opbouw in lagen</option><option value="U" ${c.mode === 'U' ? 'selected' : ''}>U-waarde invullen</option></select></label></div>
    <label class="chk"><input type="checkbox" id="f-con-${c.id}-inner" data-f="con.${c.id}.inner" ${c.inner ? 'checked' : ''}> Aan beide kanten binnen (binnenwand of verdiepingsvloer, Rse = Rsi)</label>
    ${c.mode === 'U' ? `<div class="fields">${numField('f-con-' + c.id + '-u', 'con.' + c.id + '.U', 'U-waarde', 'W/m²K', c.U, 3)}${numField('f-con-' + c.id + '-rc', 'con.' + c.id + '.Rc', 'Rc', 'm²K/W', Rc, 2)}</div><p class="note">Bijvoorbeeld de U-waarde uit <a href="https://www.ubakus.de/u-wert-rechner/" target="_blank" rel="noopener">ubakus.de</a> of van de leverancier.</p>` : layersEditor(c)}
    <div class="row"><span class="note grow">${uses[c.id] ? `Gebruikt op ${uses[c.id].length} plek${uses[c.id].length > 1 ? 'ken' : ''}` : 'Nog niet gebruikt'}</span><button class="btn small" data-act="dupcon" data-c="${c.id}">Kopie</button><button class="btn small danger" data-act="delcon" data-c="${c.id}" ${uses[c.id] ? 'disabled title="Nog in gebruik: kies op de plekken hieronder eerst een andere constructie"' : ''}>Verwijderen</button></div>
    ${
      uses[c.id]
        ? `<div class="uselist">${uses[c.id]
            .map(
              u =>
                `<button class="linkrow" data-act="${u.act}" data-r="${u.room.id}" ${u.act === 'selseg' ? `data-w="${u.w}" data-s="${u.s}"` : ''}><span>${esc(u.room.name)} · ${esc(u.label)}</span><span class="note">${esc(u.fl)}</span></button>`
            )
            .join(
              ''
            )}</div><p class="note">Klik een plek om daar een andere constructie te kiezen. Is hij nergens meer in gebruik, dan kun je hem verwijderen.</p>`
        : ''
    }</div>`;
  }
  return h + `</div>`;
}
function viewMats() {
  // which constructions use each material (as a layer, or as studs in a layer)
  const usedIn = {};
  P.constructions.forEach(c =>
    c.layers.forEach(l => {
      [l.mid, l.mix && l.mix.mid].forEach(id => {
        if (id && !(usedIn[id] = usedIn[id] || []).includes(c)) usedIn[id].push(c);
      });
    })
  );
  const used = { has: id => !!usedIn[id] };
  let h = `<div class="sec"><h3>Materialen</h3><p class="note">De λ-waarden zijn indicatieve rekenwaarden in W/mK. Gebruik voor isolatie de λD van het productblad of de waarde uit ubakus.</p>`;
  P.materials.forEach(m => {
    h += `<div class="matrow"><input type="color" class="colorin" id="f-mat-${m.id}-c" data-f="mat.${m.id}.color" value="${esc(m.color)}" aria-label="Kleur"><input class="in grow" style="flex-basis:150px" id="f-mat-${m.id}-n" data-f="mat.${m.id}.name" value="${esc(m.name)}" aria-label="Naam materiaal">
    <select class="in" id="f-mat-${m.id}-t" data-f="mat.${m.id}.type" aria-label="Soort"><option value="lambda" ${m.type === 'lambda' ? 'selected' : ''}>λ</option><option value="R" ${m.type === 'R' ? 'selected' : ''}>vaste R</option><option value="spouw" ${m.type === 'spouw' ? 'selected' : ''}>luchtspouw</option></select>
    ${m.type === 'lambda' ? `<input class="in num" style="width:78px" id="f-mat-${m.id}-l" data-f="mat.${m.id}.lambda" inputmode="decimal" value="${nv(m.lambda, 4)}" aria-label="Lambda in W/mK" title="λ in W/mK">` : m.type === 'R' ? `<input class="in num" style="width:78px" id="f-mat-${m.id}-r" data-f="mat.${m.id}.R" inputmode="decimal" value="${nv(m.R, 3)}" aria-label="R in m²K/W" title="R in m²K/W">` : `<span class="note" style="width:78px">uit tabel</span>`}
    <button class="xbtn" data-act="delmat" data-m="${m.id}" ${used.has(m.id) ? 'disabled title="In gebruik: zie de constructies eronder"' : ''} aria-label="Verwijder ${esc(m.name)}">✕</button></div>${
      usedIn[m.id]
        ? `<div class="matuse note">In gebruik bij ${usedIn[m.id].map(c => `<button class="crumb" data-act="gocon" data-c="${c.id}">${esc(c.name)}</button>`).join(', ')}</div>`
        : ''
    }`;
  });
  return h + `<div class="row"><button class="btn small" data-act="addmat">+ Materiaal</button></div></div>`;
}
// every place a construction is used: wall parts, windows and doors, floors, ceilings and sloped roof surfaces
function conUses() {
  const uses = {},
    add = (cid, place) => {
      if (cid) (uses[cid] = uses[cid] || []).push(place);
    };
  P.rooms.forEach(r => {
    const fl = (P.floors[floorIdx(r.floorId)] || {}).name || '';
    r.walls.forEach((w, i) =>
      w.segs.forEach((sg, j) => {
        const nm = 'Wand ' + (i + 1) + (w.segs.length > 1 ? LET[j] || j : '');
        add(sg.cid, { room: r, fl, label: nm, act: 'selseg', w: i, s: j });
        sg.openings.forEach(o =>
          add(o.cid, { room: r, fl, label: nm + ' · ' + (o.name || 'opening'), act: 'selseg', w: i, s: j })
        );
      })
    );
    add(r.floor.cid, { room: r, fl, label: 'Vloer', act: 'selroom' });
    add(r.floor.cidOut, { room: r, fl, label: 'Vloer (waar niets onder ligt)', act: 'selroom' });
    add(r.ceil.cid, { room: r, fl, label: 'Plafond', act: 'selroom' });
    add(r.ceil.cidOut, { room: r, fl, label: 'Plafond (waar niets boven ligt)', act: 'selroom' });
    if (r.roof && r.roof.type !== 'plat') add(r.roof.cid, { room: r, fl, label: 'Dakvlak', act: 'selroom' });
  });
  return uses;
}
function viewCon(focusId) {
  if (focusId) conOpen = focusId;
  const uses = conUses();
  let h = `<div class="sec"><h2>Constructies</h2><p class="note">Stel de opbouw samen uit lagen van binnen naar buiten, zoals op <a href="https://www.ubakus.de/u-wert-rechner/" target="_blank" rel="noopener">ubakus.de</a>. Per laag rekent de app R = d / λ uit, en daarmee de Rc en de U-waarde van de hele constructie. Voor ramen en deuren vul je meestal direct de U-waarde van de leverancier in.</p></div>`;
  Object.keys(KINDS).forEach(k => {
    const cs = P.constructions.filter(c => c.kind === k);
    h += `<div class="sec"><h3>${KINDS[k]}</h3>`;
    if (!cs.length) h += `<p class="note">Nog geen ${KINDS[k].toLowerCase()}.</p>`;
    cs.forEach(c => (h += conCard(c, uses)));
    h += `<div class="row"><button class="btn small" data-act="addcon" data-kind="${k}">+ ${KINDS[k]}</button></div></div>`;
  });
  return h + viewMats();
}

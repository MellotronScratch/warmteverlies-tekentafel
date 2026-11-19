// Rapport: één printbare pagina met uitgangspunten, plattegronden, warmteverlies, constructies, afgifte,
// leidingnet en warmtepompkeuze. Afdrukken of bewaren als PDF via de printfunctie van de browser.
'use strict';

// floor plan of one storey as a plain SVG (same scale for all floors)
function reportPlanSvg(fl, box, N) {
  const W = 680,
    pad = 14,
    sc = Math.min((W - 2 * pad) / Math.max(1, box.w), 300 / Math.max(1, box.h)),
    H = box.h * sc + 2 * pad + 18;
  const X = p => (pad + (p.x - box.x0) * sc).toFixed(1),
    Y = p => (pad + (p.y - box.y0) * sc).toFixed(1),
    pts = a => a.map(p => X(p) + ',' + Y(p)).join(' ');
  const rooms = P.rooms.filter(r => r.floorId === fl.id),
    fi = floorIdx(fl.id),
    through = P.rooms.filter(r => r.floorId !== fl.id && presentOn(r, fl.id)), // stairwells and voids from below
    el = floorElev();
  // stair treads with the walking line and an arrow pointing up; on the top storey the flight that arrives there
  const stair = r => {
    if (r.kind !== 'trap' || !spans(r)) return '';
    const l = levelsOf(r),
      i = Math.min(fi, l[1] - 1),
      sg = stairTreads(r, el[P.floors[i + 1].id] - el[P.floors[i].id]);
    if (!sg) return '';
    let o = sg.treads
      .map(q => `<polygon points="${pts(q.poly)}" fill="none" stroke="#8a9a9f" stroke-width=".8"/>`)
      .join('');
    const mids = sg.treads.map(q => centroid(q.poly)).map(p => ({ x: +X(p), y: +Y(p) })),
      a = mids[mids.length - 2] || mids[0],
      b = mids[mids.length - 1],
      ang = Math.atan2(b.y - a.y, b.x - a.x),
      hd = 6;
    o += `<polyline points="${mids.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}" fill="none" stroke="#5b6f76" stroke-width="1"/>`;
    o += `<path d="M${b.x} ${b.y}L${(b.x - hd * Math.cos(ang - 0.45)).toFixed(1)} ${(b.y - hd * Math.sin(ang - 0.45)).toFixed(1)}M${b.x} ${b.y}L${(b.x - hd * Math.cos(ang + 0.45)).toFixed(1)} ${(b.y - hd * Math.sin(ang + 0.45)).toFixed(1)}" stroke="#5b6f76" stroke-width="1"/><circle cx="${mids[0].x}" cy="${mids[0].y}" r="2" fill="#5b6f76"/>`;
    return o;
  };
  let s =
    '<defs><pattern id="rephatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8a9a9f" stroke-width="1"/></pattern></defs>';
  through.forEach(r => {
    s += `<polygon points="${pts(r.pts)}" fill="${r.kind === 'trap' ? '#fff' : 'url(#rephatch)'}" stroke="#1f3b44" stroke-width="1.6"/>`;
    s += stair(r);
  });
  rooms.forEach(r => {
    const un = r.heated === false;
    s += `<polygon points="${pts(r.pts)}" fill="${un ? '#eef1f1' : '#fff'}" stroke="#1f3b44" stroke-width="1.6" ${un ? 'stroke-dasharray="5 3"' : ''}/>`;
    s += stair(r);
  });
  rooms.forEach(r =>
    (r.emitters || []).forEach(em => {
      if (em.kind === 'vv')
        s += `<polygon points="${pts(em.pts)}" fill="rgba(0,121,184,.10)" stroke="#0079b8" stroke-width="1" stroke-dasharray="4 3"/>`;
      else if (em.a && em.b)
        s += `<line x1="${X(em.a)}" y1="${Y(em.a)}" x2="${X(em.b)}" y2="${Y(em.b)}" stroke="#0079b8" stroke-width="4" stroke-linecap="round"/>`;
    })
  );
  (P.pipes || [])
    .filter(pp => pp.floorId === fl.id)
    .forEach(pp => {
      const idx = N && N.edges.some(e => e.pp === pp && N.indexEdges.has(e));
      s += `<polyline points="${pts(pp.pts)}" fill="none" stroke="${idx ? '#F59E0B' : '#DC2626'}" stroke-width="2" stroke-linejoin="round"/>`;
    });
  (P.risers || [])
    .filter(rs => floorIdx(fl.id) >= floorIdx(rs.from) && floorIdx(fl.id) <= floorIdx(rs.to))
    .forEach(
      rs => (s += `<circle cx="${X(rs)}" cy="${Y(rs)}" r="5" fill="#fff" stroke="#DC2626" stroke-width="1.6"/>`)
    );
  if (P.hpPos && P.hpPos.floorId === fl.id)
    s += `<rect x="${+X(P.hpPos) - 13}" y="${+Y(P.hpPos) - 9}" width="26" height="18" rx="3" fill="#fff" stroke="#DC2626" stroke-width="1.6"/><text x="${X(P.hpPos)}" y="${+Y(P.hpPos) + 3.5}" font-size="9" font-weight="700" text-anchor="middle" fill="#DC2626">WP</text>`;
  through.forEach(r => {
    const c = centroid(r.pts),
      xs = r.pts.map(p => p.x),
      wPx = (Math.max(...xs) - Math.min(...xs)) * sc,
      kw = r.kind === 'trap' ? 'Trap' : 'Vide',
      lab = r.name.toLowerCase().startsWith(kw.toLowerCase()) ? r.name : `${kw} · ${r.name}`;
    if (wPx < lab.length * 5.5) return; // too narrow for a label, e.g. a duct
    s += `<text x="${X(c)}" y="${+Y(c) - 2}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#15313a" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(lab)}</text><text x="${X(c)}" y="${+Y(c) + 11}" font-size="9" text-anchor="middle" fill="#5b6f76" paint-order="stroke" stroke="#fff" stroke-width="3">vanaf ${esc(P.floors[floorIdx(r.floorId)].name)}</text>`;
  });
  rooms.forEach(r => {
    const c = centroid(r.pts),
      k = calcRoom(r);
    s += `<text x="${X(c)}" y="${+Y(c) - 2}" font-size="11" font-weight="600" text-anchor="middle" fill="#15313a" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(r.name)}</text><text x="${X(c)}" y="${+Y(c) + 11}" font-size="9.5" text-anchor="middle" fill="#5b6f76" paint-order="stroke" stroke="#fff" stroke-width="3">${k.unheated ? 'onverwarmd' : fmtW(k.total) + ' W · ' + fmt(k.Af, 1) + ' m²'}</text>`;
  });
  // scale bar
  const m = box.w > 12 ? 5 : 1,
    y = H - 10;
  s += `<line x1="${pad}" y1="${y}" x2="${pad + m * sc}" y2="${y}" stroke="#15313a" stroke-width="2"/><text x="${pad + m * sc + 6}" y="${y + 3.5}" font-size="9" fill="#5b6f76">${m} m</text>`;
  return `<svg class="repplan" viewBox="0 0 ${W} ${H.toFixed(0)}" width="${W}" role="img" aria-label="Plattegrond ${esc(fl.name)}">${s}</svg>`;
}

function reportHpHtml(c) {
  if (!hpList || !hpList.length || c.total <= 0) return '';
  const save = adviceSaving(c),
    L = lossLine(c, save),
    L0 = save > 0 ? lossLine(c) : null,
    rows = hpList.map(h => ({ h, j: hpJudge(h, L) })).sort((a, b) => a.j.score - b.j.score),
    cur = rows.find(r => r.h.id === hpSel) || rows[0],
    te = L.te;
  const good = rows.filter(r => r.j.covers && r.j.mod),
    fits = rows.filter(r => r.j.covers);
  // the suitable ones; when there are few, also the next best that cover the loss but cycle in mild weather
  const list = good.slice(0, 8);
  fits.forEach(r => {
    if (list.length < 4 && !list.includes(r)) list.push(r);
  });
  if (cur && !list.includes(cur)) list.unshift(cur);
  let h = `<section class="rsec"><h2>Warmtepomp</h2>
    <p>${save > 0 ? `Beoordeeld op het warmteverlies na de gekozen maatregelen. ` : ''}Warmteverlies bij ${nv(te, 0)} °C: <b>${fmt(L.at(te), 2)} kW</b>; bij +10 °C: <b>${fmt(L.at(10), 2)} kW</b>. Een geschikte warmtepomp levert bij ${nv(te, 0)} °C minstens het warmteverlies, en kan bij +10 °C terugregelen tot onder het warmteverlies, zodat hij niet pendelt.</p>`;
  if (cur)
    h += `<h3>Gekozen: ${esc(cur.h.merk)} ${esc(cur.h.model)}</h3>${hpChartHtml(cur.h, cur.j, L, L0)}${cur.h.bron ? `<p class="note">Bron: ${esc(cur.h.bron)}</p>` : ''}`;
  h += `<div class="repblock"><h3>${good.length ? 'Geschikte warmtepompen en alternatieven' : 'Warmtepompen die het verlies dekken'}</h3>
    ${good.length ? '' : '<p>Geen enkele warmtepomp in de lijst dekt het verlies en regelt bij +10 °C ver genoeg terug. Hieronder de warmtepompen die het verlies wel dekken.</p>'}
    <table class="calc"><thead><tr><th>Warmtepomp</th><th>Max bij ${nv(te, 0)} °C</th><th>Min bij +10 °C</th><th>Pendelt boven</th><th>Oordeel</th></tr></thead><tbody>
    ${list
      .map(
        ({ h: hp, j }) =>
          `<tr${hp === cur.h ? ' class="sum"' : ''}><td>${esc(hp.merk)} ${esc(hp.model)}${hp === cur.h ? ' <small>gekozen</small>' : ''}</td><td>${fmt(j.max, 1)} kW${j.covers ? ` (+${fmtW(j.over * 100)}%)` : ' ⚠'}</td><td>${fmt(j.min10, 1)} kW${j.ex10 ? '*' : ''}</td><td>${j.cyc != null ? fmtT(j.cyc) : '–'}</td><td class="txt">${!j.covers ? `tekort ${fmt(j.need - j.max, 1)} kW` : j.mod ? 'geschikt' : 'pendelt bij zacht weer'}</td></tr>`
      )
      .join('')}
    </tbody></table></div>
    <p class="note">Gesorteerd op hoe goed de warmtepomp past: hoeveel te groot bij de ontwerptemperatuur, en hoeveel het minimum bij +10 °C boven het verlies ligt. <i>Pendelt boven</i>: vanaf die buitentemperatuur is het minimale vermogen groter dan het warmteverlies. * doorgerekend buiten de opgegeven meetpunten.</p></section>`;
  return h;
}

function reportHtml() {
  const S = P.settings,
    c = calcAll(),
    heated = c.per.filter(x => !x.c.unheated),
    Af = heated.reduce((a, x) => a + x.c.Af, 0),
    N = (P.pipes || []).length || P.hpPos ? network() : null,
    date = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  // common bounding box of all rooms
  const all = P.rooms.flatMap(r => r.pts);
  const box = all.length
    ? (() => {
        const xs = all.map(p => p.x),
          ys = all.map(p => p.y),
          x0 = Math.min(...xs),
          y0 = Math.min(...ys);
        return { x0, y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
      })()
    : null;
  let h = `<header class="rephead"><h1>${esc(P.name)}</h1><p>Warmteverliesberekening · ${esc(date)}</p>
    <div class="repkpi"><div><span>Warmteverlies</span><b>${fmt(c.total / 1000, 2)} kW</b></div><div><span>Verwarmd oppervlak</span><b>${fmt(Af, 1)} m²</b></div><div><span>Woonoppervlak</span><b>${fmt(
      P.rooms.reduce((a, r) => a + livingArea(r), 0),
      1
    )} m²</b></div><div><span>Per m²</span><b>${Af > 0 ? fmtW(c.total / Af) : '–'} W/m²</b></div><div><span>Ontwerp</span><b>${nv(S.te, 0)} °C buiten</b></div></div></header>`;
  const warn = sanityHtml(c);
  if (warn) h += `<section class="rsec"><h2>Aandachtspunten</h2>${warn}</section>`;
  // uitgangspunten
  const it = infTotal();
  h += `<section class="rsec"><h2>Uitgangspunten</h2><table class="calc kv"><tbody>
    <tr><td>Ontwerp-buitentemperatuur</td><td>${nv(S.te, 1)} °C</td></tr>
    <tr><td>Grond / onverwarmde ruimte / buurwoning</td><td>${nv(S.tGround, 1)} / ${nv(S.tUnheated, 1)} / ${nv(S.tNeighbour, 1)} °C</td></tr>
    <tr><td>Toeslag koudebruggen ΔU</td><td>${nv(S.dU, 2)} W/m²K</td></tr>
    <tr><td>Ventilatie</td><td>${esc(VENT_SYS[S.ventSys] || S.ventSys)}${S.ventSys === 'D' ? `, WTW-rendement ${nv(S.eta, 2)} (toevoer ${fmt(supplyTemp(), 1)} °C)` : ''}</td></tr>
    <tr><td>Infiltratie</td><td>${S.infMode === 'qv10' ? `qv10 = ${nv(S.qv10, 2)} dm³/s·m², correctiefactor ${nv(S.fInf, 2)} → ${fmtW(it.q)} m³/h` : `n = ${nv(S.nInf, 2)} /h`}</td></tr>
    <tr><td>Aanvoer / retour (ontwerp)</td><td>${nv(S.twSup, 1)} / ${fmt(tRet(), 1)} °C${+S.flow > 0 ? ` (debiet ${fmtW(S.flow)} l/h)` : ` (debiet ${fmtW(sysFlow())} l/h)`}, maximaal ${nv(S.tMax, 0)} °C</td></tr>
    </tbody></table>${balanceHtml()}</section>`;
  // plattegronden
  if (box)
    h += `<section class="rsec"><h2>Plattegronden</h2>${P.floors
      .filter(f => P.rooms.some(r => r.floorId === f.id))
      .map(f => `<figure class="repfig"><figcaption>${esc(f.name)}</figcaption>${reportPlanSvg(f, box, N)}</figure>`)
      .join(
        ''
      )}<p class="note">Blauw: radiatoren, convectoren en vloerverwarming. Rood: leidingen${N && N.index ? ', oranje het indexcircuit' : ''}. Gestippeld: onverwarmde ruimte.</p></section>`;
  // overzicht
  h += `<section class="rsec"><h2>Warmteverlies per ruimte</h2><table class="calc"><thead><tr><th>Ruimte</th><th>θi °C</th><th>A m²</th><th>Transmissie W</th><th>Lucht W</th><th>Totaal W</th><th>W/m²</th></tr></thead><tbody>`;
  P.floors.forEach(f => {
    const per = c.per.filter(x => x.room.floorId === f.id);
    if (!per.length) return;
    if (P.floors.length > 1)
      h += `<tr class="grp"><td colspan="7">${esc(f.name)} · ${fmtW(per.reduce((a, x) => a + x.c.total, 0))} W</td></tr>`;
    per.forEach(
      x =>
        (h += `<tr><td>${esc(x.room.name)}${x.c.missing ? '<small>constructie ontbreekt</small>' : ''}</td><td>${nv(x.room.temp, 1)}</td><td>${fmt(x.c.Af, 1)}</td><td>${x.c.unheated ? '–' : fmtW(x.c.trans)}</td><td>${x.c.unheated ? '–' : fmtW(x.c.vent + x.c.inf)}</td><td>${x.c.unheated ? 'onverwarmd' : fmtW(x.c.total)}</td><td>${!x.c.unheated && x.c.Af ? fmtW(x.c.total / x.c.Af) : '–'}</td></tr>`)
    );
  });
  h += `<tr class="sum"><td>Totaal</td><td></td><td>${fmt(Af, 1)}</td><td>${fmtW(c.per.reduce((a, x) => a + x.c.trans, 0))}</td><td>${fmtW(c.per.reduce((a, x) => a + x.c.vent + x.c.inf, 0))}</td><td>${fmtW(c.total)}</td><td>${Af > 0 ? fmtW(c.total / Af) : ''}</td></tr></tbody></table>
    <p class="note">Vereenvoudigde methode naar NEN-EN 12831 / ISSO 51: transmissie A × (U + ΔU) × Δθ, ventilatie 0,335 × q × (θi − θtoevoer), infiltratie 0,335 × qi × (θi − θe). Zonder opwarmtoeslag. De som is een bovengrens voor de opwekker.</p></section>`;
  // per ruimte
  h += `<section class="rsec"><h2>Berekening per ruimte</h2><p class="note">Alleen onderdelen met warmteverlies of -winst. Wanden en vloeren naar ruimtes met dezelfde temperatuur zijn weggelaten.</p>`;
  P.floors.forEach(f =>
    c.per
      .filter(x => x.room.floorId === f.id && !x.c.unheated)
      .forEach(
        x =>
          (h += `<div class="repblock"><h3>${esc(x.room.name)} <small>${esc(f.name)} · ${nv(x.room.temp, 1)} °C · ${fmt(x.c.Af, 1)} m² · ${fmt(x.c.V, 1)} m³</small><b>${fmtW(x.c.total)} W</b></h3>${calcTable(
            x.c.lines.filter(l => Math.abs(l.phi) >= 0.5 || (l.miss && l.A > 0.0001)),
            airRows(x.room, x.c).filter(r => Math.abs(r[2]) >= 0.5)
          )}</div>`)
      )
  );
  h += `</section>`;
  // constructies
  const uses = conUses(),
    used = P.constructions.filter(k => uses[k.id]);
  if (used.length) {
    h += `<section class="rsec"><h2>Constructies</h2>`;
    used.forEach(k => {
      const r = k.mode === 'lagen' && k.layers.length ? calcLayers(k) : null;
      const Rc = r ? r.Rc : k.U > 0 ? 1 / k.U - RS[k.kind][0] - rseOf(k) : NaN;
      h += `<div class="repblock"><h3><span class="sw" style="background:${esc(k.color)}"></span>${esc(k.name)} <small>${esc(KINDS[k.kind] || k.kind)} · ${uses[k.id].length} plek${uses[k.id].length > 1 ? 'ken' : ''}</small><b>${Number.isFinite(Rc) && Rc > 0 ? 'Rc ' + fmt(Rc, 2) + ' · ' : ''}U ${nv(k.U, 3)}</b></h3>`;
      if (r) {
        h += `<table class="calc"><thead><tr><th>Laag</th><th>d mm</th><th>λ W/mK</th><th>R m²K/W</th></tr></thead><tbody><tr><td>Rsi</td><td></td><td></td><td>${fmt(r.rsi, 2)}</td></tr>`;
        k.layers.forEach((l, i) => {
          const m = P.materials.find(x => x.id === l.mid),
            mm = l.mix ? P.materials.find(x => x.id === l.mix.mid) : null,
            row = r.layers[i];
          h += `<tr${row && !row.active ? ' class="off"' : ''}><td>${esc(m ? m.name : '?')}${mm && l.mix.pct > 0 ? `<small>met ${nv(l.mix.pct, 0)}% ${esc(mm.name)}</small>` : ''}${row && !row.active ? '<small>telt niet mee (buiten geventileerde spouw)</small>' : ''}</td><td>${nv(l.d, 0)}</td><td>${m && m.type === 'lambda' ? nv(m.lambda, 3) : '–'}</td><td>${row ? fmt(row.r, 2) : '–'}</td></tr>`;
        });
        h += `<tr><td>Rse</td><td></td><td></td><td>${fmt(r.rse, 2)}</td></tr></tbody></table>`;
      }
      h += `</div>`;
    });
    h += `</section>`;
  }
  // afgifte
  const ems = P.rooms.flatMap(r => (r.emitters || []).map(em => ({ r, em })));
  if (ems.length) {
    h += `<section class="rsec"><h2>Afgifte</h2><table class="calc"><thead><tr><th>Ruimte / element</th><th>Soort</th><th>Nominaal</th><th>Bij ${nv(S.twSup, 0)}/${fmt(tRet(), 0)} °C</th><th>Aansluitleiding</th></tr></thead><tbody>`;
    ems.forEach(({ r, em }) => {
      const o = emOutput(em, r),
        pc = pipeCheck(em, o, N);
      h += `<tr><td>${esc(r.name)}<small>${esc(em.name)}</small></td><td class="txt">${EM_KINDS[em.kind]}${em.kind === 'rad' && RAD_TYPES[em.rt] ? ` ${esc(em.rt)} ${fmtW(em.rh)}×${fmtW(em.rl)}` : ''}${em.boost ? ' + boosters' : ''}</td><td>${em.kind === 'vv' ? fmt(emArea(em), 1) + ' m², h.o.h. ' + nv(em.spacing, 0) + ' cm' : fmtW(em.p) + ' W'}</td><td>${fmtW(o)} W</td><td class="txt">${pc.pp ? `${esc(pc.pp.name)} · ${esc(dnLabel(pc.pp.mat, pc.pp.dn))}<small>${fmtW(pc.lh)} l/h · ${fmt(pc.v, 2)} m/s${pipeBad(pc) ? ' ⚠ ' + pc.state : ''}</small>` : (P.pipes || []).length ? 'niet aangesloten' : '–'}</td></tr>`;
    });
    h += `</tbody></table>${emitOverviewHtml(c)
      .replace(twFieldsHtml(), '')
      .replace('<h3>Afgifte</h3>', '')}${curveHtml()}</section>`;
  }
  // leidingnet
  if (N && N.root)
    h += `<section class="rsec"><h2>Leidingnet</h2><div class="repschema">${schemaSvg(N)}</div>${networkHtml(true)}${volumeHtml()}</section>`;
  // verbeteradviezen
  const adv = computeAdvice(c),
    chosen = adv.filter(a => P.advSel[a.con.id]);
  if (adv.length)
    h += `<section class="rsec"><h2>Verbeteradviezen</h2><table class="calc"><thead><tr><th>Maatregel</th><th>U nu → na</th><th>A m²</th><th>Besparing W</th></tr></thead><tbody>${adv
      .map(
        a =>
          `<tr${P.advSel[a.con.id] ? ' class="sum"' : ''}><td>${esc(a.rule.label)}${P.advSel[a.con.id] ? ' <small>meegenomen</small>' : ''}<small>${esc(a.con.name)} · ${[...a.rooms].map(esc).join(', ')}</small></td><td>${nv(a.con.U, 2)} → ${nv(a.rule.to, 2)}</td><td>${fmt(a.A, 1)}</td><td>${fmtW(a.dW)}</td></tr>`
      )
      .join(
        ''
      )}</tbody></table>${chosen.length ? `<p>Met de meegenomen maatregelen: ${fmt((c.total - adviceSaving(c, adv)) / 1000, 2)} kW in plaats van ${fmt(c.total / 1000, 2)} kW.</p>` : ''}</section>`;
  h += reportHpHtml(c);
  const yr = annualHtml(c);
  if (yr)
    h += `<section class="rsec"><h2>Jaarverbruik en kosten</h2>${yr.replace('<h3>Jaarverbruik</h3>', '').replace(/ Wat dit verbruik kost, staat onder <button[^>]*>Kosten<\/button>\./, '')}<h3>Kosten per jaar</h3>${costTableHtml(c, true)}<p class="note">Gerekend met stroom € ${fmt(priceEl(), 3)} per kWh, gas € ${fmt(priceGas(), 3)} per m³${S.pEl == null || S.pGas == null ? ` (${S.pEl == null && S.pGas == null ? '' : 'deels '}gemiddelde van het CBS${PRICES.maandNaam ? ' over ' + esc(PRICES.maandNaam) : ''})` : ''}${S.gasFix > 0 ? `, vaste kosten gas € ${fmt(S.gasFix, 0)} per jaar` : ''}, een cv-ketel met ${fmt(S.etaGas * 100, 0)}% rendement en een stookgrens van ${nv(S.stook, 1)} °C.</p></section>`;
  h += `<footer class="repfoot">Gemaakt met Warmtepomp Tekentafel · ${esc(date)}. Indicatieve berekening; controleer de uitkomst voordat je erop dimensioneert.</footer>`;
  return h;
}

/* ---------- inregelstaat: per element de voorinstelling en het debiet, om mee langs de radiatoren te lopen ---------- */
function balanceSheetHtml() {
  const S = P.settings,
    N = network(),
    date = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
    kraan = (TRV.kranen[S.trv] || TRV.kranen.onbekend || {}).naam || '';
  let h = `<header class="rephead"><h1>Inregelstaat · ${esc(P.name)}</h1><p>Waterzijdig inregelen · ${esc(date)}</p></header>`;
  if (!N || !N.root || !N.index)
    return (
      h +
      `<p>Er is nog geen leidingnet met een aangesloten warmtepomp en afgifte. Teken de leidingen en plaats de warmtepomp; dan rekent de app de voorinstellingen uit.</p>`
    );
  const reached = N.ems.filter(o => o.reach && o.lh > 0);
  const hp = hpList && hpList.find(x => x.id === hpSel);
  h += `<div class="repkpi"><div><span>Aanvoer / retour</span><b>${nv(S.twSup, 0)} / ${fmt(tRet(), 1)} °C</b></div><div><span>Totaal debiet</span><b>${fmtW(N.total)} l/h</b></div><div><span>Pomp moet leveren</span><b>${fmt(N.dpPump, 1)} kPa</b></div><div><span>Elementen</span><b>${reached.length}</b></div></div>
  <section class="rsec"><h2>Zo werk je</h2><ol class="steps">
    <li>Zet de warmtepomp op ${nv(S.twSup, 0)} °C aanvoer${+S.flow > 0 ? ` en een debiet van ${fmtW(+S.flow)} l/h` : ''}${hp ? ` (${esc(hp.merk)} ${esc(hp.model)})` : ''}. De pomp moet bij ${fmtW(N.total)} l/h nog ${fmt(N.dpPump, 1)} kPa overhouden.</li>
    <li>Haal de thermostaatkoppen van de kranen en zet alle kranen open.</li>
    <li>${
      (TRV.kranen[S.trv] || {}).soort === 'debiet'
        ? 'Stel per element het debiet uit de tabel in. De kranen houden dat debiet zelf vast.'
        : `Stel per element de voorinstelling uit de tabel in. ${esc(N.index.em.name)} in ${esc(N.index.room.name)} is het indexcircuit: die kraan blijft helemaal open.`
    }</li>
    <li>Zet de thermostaatkoppen terug; de voorinstelling blijft staan.</li>
    <li>Controleer na een paar dagen stoken de retourleidingen met een thermometer: bij ${nv(S.twSup, 0)} °C aanvoer hoort de retour ongeveer ${fmt(tRet(), 0)} °C te zijn. Is hij warmer, dan krijgt dat element te veel water: kraan een stand lager. Is hij kouder, een stand hoger.</li>
  </ol><p class="note">Kranen: ${esc(kraan)}. Vloerverwarming stel je in op de verdeler, met het debiet per groep.</p></section>`;
  P.floors.forEach(f => {
    const rows = reached.filter(o => o.room.floorId === f.id);
    if (!rows.length) return;
    h += `<section class="rsec"><h2>${esc(f.name)}</h2><table class="calc"><thead><tr><th class="txt">Ruimte · element</th><th class="txt">Kraan</th><th class="txt">Instellen</th><th>Debiet</th><th>Vermogen</th><th>Gedaan</th></tr></thead><tbody>${rows
      .slice()
      .sort((a, b) => a.room.name.localeCompare(b.room.name, 'nl'))
      .map(o => {
        const vv = o.em.kind === 'vv';
        const loops = vv ? Math.max(1, +o.em.loops || 1) : 1;
        const isIndex = N.index === o;
        const set = vv
          ? `${fmtW(o.lh / loops)} l/h per groep${loops > 1 ? ` (${loops} groepen)` : ''}`
          : isIndex && !(o.preset && o.preset.kind === 'debiet')
            ? `helemaal open${o.preset && o.preset.kind === 'kv' ? ` (stand ${esc(String(o.preset.s))})` : ''}`
            : presetText(o, N);
        const valve = vv ? 'verdeler' : o.trv ? o.trv.naam : kraan;
        const pr = o.preset;
        const warn =
          pr && pr.kind === 'debiet' && pr.over
            ? `<small class="warn">vraagt ${fmtW(o.lh)} l/h: meer dan deze kraan doorlaat</small>`
            : pr && pr.kind === 'debiet' && pr.under
              ? '<small>minimum van deze kraan</small>'
              : pr && pr.kind === 'kv' && pr.low
                ? '<small>kleinste stand is nog te ruim</small>'
                : '';
        return `<tr><td class="txt">${esc(o.room.name)} · ${esc(o.em.name)}${isIndex ? '<small>indexcircuit</small>' : ''}</td><td class="txt">${esc(valve || '')}</td><td class="txt"><b>${set}</b>${warn}</td><td class="nw">${fmtW(o.lh)} l/h</td><td class="nw">${fmtW(o.W)} W</td><td>☐</td></tr>`;
      })
      .join('')}</tbody></table></section>`;
  });
  h += `<footer class="repfoot">Gemaakt met Warmtepomp Tekentafel · ${esc(date)}. De voorinstellingen volgen uit de berekende leidingen en kv-waarden; regel in de praktijk bij op de retourtemperatuur.</footer>`;
  return h;
}

function openReport(kind) {
  const el = $('report');
  el.innerHTML = `<div class="reptools"><button class="btn primary" id="rep-print">Afdrukken of bewaren als PDF</button><button class="btn" id="rep-close">Sluiten ✕</button></div><article class="repdoc">${kind === 'inregel' ? balanceSheetHtml() : reportHtml()}</article>`;
  el.hidden = false;
  document.body.classList.add('rep-open');
  el.scrollTop = 0;
  $('rep-close').focus();
}
function closeReport() {
  const el = $('report');
  if (el.hidden) return;
  el.hidden = true;
  el.innerHTML = '';
  document.body.classList.remove('rep-open');
}
$('report').addEventListener('click', e => {
  if (e.target.closest('#rep-close')) return closeReport();
  if (e.target.closest('#rep-print')) return window.print();
});
document.addEventListener(
  'keydown',
  e => {
    if (e.key === 'Escape' && !$('report').hidden) {
      e.stopPropagation();
      e.preventDefault();
      closeReport();
    }
  },
  true
);
// print in the light theme, also when the screen is dark
let _theme = null;
window.addEventListener('beforeprint', () => {
  _theme = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', 'light');
});
window.addEventListener('afterprint', () => {
  if (_theme == null) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', _theme);
});

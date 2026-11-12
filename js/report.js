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
  const rooms = P.rooms.filter(r => r.floorId === fl.id);
  let s = '';
  rooms.forEach(r => {
    const un = r.heated === false;
    s += `<polygon points="${pts(r.pts)}" fill="${un ? '#eef1f1' : '#fff'}" stroke="#1f3b44" stroke-width="1.6" ${un ? 'stroke-dasharray="5 3"' : ''}/>`;
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
  if (P.hpPos && P.hpPos.floorId === fl.id)
    s += `<rect x="${+X(P.hpPos) - 13}" y="${+Y(P.hpPos) - 9}" width="26" height="18" rx="3" fill="#fff" stroke="#DC2626" stroke-width="1.6"/><text x="${X(P.hpPos)}" y="${+Y(P.hpPos) + 3.5}" font-size="9" font-weight="700" text-anchor="middle" fill="#DC2626">WP</text>`;
  rooms.forEach(r => {
    const c = centroid(r.pts),
      k = calcRoom(r);
    s += `<text x="${X(c)}" y="${+Y(c) - 2}" font-size="11" font-weight="600" text-anchor="middle" fill="#15313a">${esc(r.name)}</text><text x="${X(c)}" y="${+Y(c) + 11}" font-size="9.5" text-anchor="middle" fill="#5b6f76">${k.unheated ? 'onverwarmd' : fmtW(k.total) + ' W · ' + fmt(k.Af, 1) + ' m²'}</text>`;
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
    <div class="repkpi"><div><span>Warmteverlies</span><b>${fmt(c.total / 1000, 2)} kW</b></div><div><span>Verwarmd oppervlak</span><b>${fmt(Af, 1)} m²</b></div><div><span>Per m²</span><b>${Af > 0 ? fmtW(c.total / Af) : '–'} W/m²</b></div><div><span>Ontwerp</span><b>${nv(S.te, 0)} °C buiten</b></div></div></header>`;
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
    <tr><td>Aanvoer / retour (ontwerp)</td><td>${nv(S.twSup, 1)} / ${nv(S.twRet, 1)} °C, maximaal ${nv(S.tMax, 0)} °C</td></tr>
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
    h += `<section class="rsec"><h2>Afgifte</h2><table class="calc"><thead><tr><th>Ruimte / element</th><th>Soort</th><th>Nominaal</th><th>Bij ${nv(S.twSup, 0)}/${nv(S.twRet, 0)} °C</th><th>Aansluitleiding</th></tr></thead><tbody>`;
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
    h += `<section class="rsec"><h2>Leidingnet</h2><div class="repschema">${schemaSvg(N)}</div>${networkHtml()}${volumeHtml()}</section>`;
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
  h += `<footer class="repfoot">Gemaakt met Warmteverlies Tekentafel · ${esc(date)}. Indicatieve berekening; controleer de uitkomst voordat je erop dimensioneert.</footer>`;
  return h;
}

function openReport() {
  const el = $('report');
  el.innerHTML = `<div class="reptools"><button class="btn primary" id="rep-print">Afdrukken of bewaren als PDF</button><button class="btn" id="rep-close">Sluiten ✕</button></div><article class="repdoc">${reportHtml()}</article>`;
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

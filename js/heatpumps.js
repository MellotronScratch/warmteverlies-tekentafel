// Warmtepompen, verbeteradviezen en de grafiek.
'use strict';
/* ---------- heat pumps ---------- */
let hpList = null,
  hpSource = 'laden',
  hpSel = null,
  hpErr = '';
const HP_LS = 'wvt.hp.v1';
function hpValid(list) {
  return Array.isArray(list)
    ? list
        .filter(
          h =>
            h &&
            Array.isArray(h.punten) &&
            h.punten.filter(p => Number.isFinite(+p.buiten) && Number.isFinite(+p.max)).length >= 2
        )
        .map((h, i) => ({
          ...h, // keep optional fields (minInhoud, restopvoerhoogte, punten55, koelen)
          id: String(h.id || 'hp' + i),
          merk: String(h.merk || ''),
          model: String(h.model || 'Warmtepomp'),
          type: String(h.type || ''),
          aanvoer: Number.isFinite(+h.aanvoer) ? +h.aanvoer : null,
          bron: String(h.bron || ''),
          punten: h.punten
            .map(p => ({ buiten: +p.buiten, min: Number.isFinite(+p.min) ? +p.min : 0, max: +p.max }))
            .sort((a, b) => a.buiten - b.buiten)
        }))
    : [];
}
function hpAt(h, t, key) {
  const p = h.punten;
  let i = 1;
  while (i < p.length - 1 && t > p[i].buiten) i++;
  const a = p[i - 1],
    b = p[i];
  const v = a[key] + ((b[key] - a[key]) * (t - a.buiten)) / (b.buiten - a.buiten || 1);
  return Math.max(0, v);
}
const hpExtra = (h, t) => t < h.punten[0].buiten - 1e-9 || t > h.punten[h.punten.length - 1].buiten + 1e-9;
async function loadHpList() {
  try {
    const own = localStorage.getItem(HP_LS);
    if (own) {
      const l = hpValid(JSON.parse(own));
      if (l.length) {
        hpList = l;
        hpSource = 'eigen';
        rerenderHp();
        return;
      }
    }
  } catch (_) {}
  try {
    hpList = hpValid(HP_DEFAULT.warmtepompen);
    hpSource = 'standaard';
  } catch (_) {
    hpList = [];
    hpSource = 'fout';
    hpErr = 'De standaardlijst met warmtepompen kon niet worden geladen.';
  }
  rerenderHp();
}
async function loadHpFromAccount() {
  if (storeMode !== 'db') return;
  try {
    const d = await db
      .collection('data/users/' + uid)
      .doc('hplist')
      .get();
    if (d.exists) {
      const l = hpValid((d.data() || {}).warmtepompen);
      if (l.length) {
        hpList = l;
        hpSource = 'eigen';
        try {
          localStorage.setItem(HP_LS, JSON.stringify(l));
        } catch (_) {}
        rerenderHp();
      }
    }
  } catch (_) {}
}
async function saveHpOwn(list) {
  try {
    localStorage.setItem(HP_LS, JSON.stringify(list));
  } catch (_) {}
  if (storeMode === 'db') {
    try {
      await db
        .collection('data/users/' + uid)
        .doc('hplist')
        .set({ warmtepompen: JSON.parse(JSON.stringify(list)) });
    } catch (_) {}
  }
}
function rerenderHp() {
  if (tab === 'res') renderPanel();
}
// design heat loss as a straight line: zero at the loss-weighted indoor temperature
// improvement measures: per construction, the drop in heat loss when its U goes from the current value to the target
function computeAdvice(c) {
  const R = P.settings.advice,
    map = {};
  c.per.forEach(x =>
    x.c.lines.forEach(l => {
      if (!l.cid || !DU_TYPES.has(l.type) || l.dT <= 0 || l.A <= 0) return;
      const con = conById(l.cid);
      if (!con) return;
      const r = R[con.kind];
      if (!r || !(con.U > r.on) || !(r.to < con.U)) return;
      const m = map[con.id] || (map[con.id] = { con, rule: r, A: 0, dW: 0, rooms: new Set() });
      const d = l.A * (con.U - r.to) * l.dT;
      m.A += l.A;
      m.dW += d;
      m.rooms.add(x.room.name);
    })
  );
  return Object.values(map).sort((a, b) => b.dW - a.dW);
}
function adviceSaving(c, list) {
  return (list || computeAdvice(c)).filter(a => P.advSel[a.con.id]).reduce((s, a) => s + a.dW, 0);
}
function lossLine(c, save) {
  const S = P.settings,
    tot = c.total - (save || 0);
  const w = c.per.reduce((a, x) => a + Math.max(0, x.c.total), 0);
  const tref = w > 0 ? c.per.reduce((a, x) => a + Math.max(0, x.c.total) * x.room.temp, 0) / w : 20;
  return {
    tref,
    te: S.te,
    at: t => (tot <= 0 || tref <= S.te ? 0 : Math.max(0, (tot * (tref - t)) / (tref - S.te)) / 1000)
  };
}
function hpJudge(h, L) {
  const te = P.settings.te,
    need = L.at(te),
    need10 = L.at(10),
    max = hpAt(h, te, 'max'),
    min10 = hpAt(h, 10, 'min');
  const covers = max >= need - 1e-9,
    mod = min10 <= need10 + 1e-9;
  // bivalent point: where the max capacity line meets the loss line
  let biv = null;
  if (!covers) {
    for (let t = te; t <= 20; t += 0.1) {
      if (hpAt(h, t, 'max') >= L.at(t)) {
        biv = t;
        break;
      }
    }
  }
  const score = covers ? max / need - 1 + (mod ? 0 : 1) : 10 + (need - max);
  return {
    need,
    need10,
    max,
    min10,
    covers,
    mod,
    biv,
    score,
    over: need > 0 ? max / need - 1 : 0,
    ex10: hpExtra(h, 10)
  };
}
let advRulesOpen = false;
function adviceHtml(c) {
  const list = computeAdvice(c),
    save = adviceSaving(c, list),
    R = P.settings.advice;
  let h = `<div class="sec"><h3>Verbeteradviezen</h3>`;
  if (!list.length)
    h += `<p class="note">Geen adviezen: alle constructies aan de buitenkant, de grond of een onverwarmde ruimte zijn al beter dan de uitgangspunten hieronder.</p>`;
  else {
    h += `<p class="note">Constructies aan de buitenkant met een slechtere U-waarde dan de drempel. Vink een maatregel aan om hem mee te nemen; de warmtepompkeuze hieronder rekent dan met het warmteverlies na de maatregelen.</p>`;
    list.forEach(a => {
      const pct = c.total > 0 ? (a.dW / c.total) * 100 : 0;
      const on = !!P.advSel[a.con.id];
      h += `<div class="card ${on ? 'cur' : ''}"><div class="kh" style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><b>${esc(a.rule.label)}</b><b style="font-family:var(--font-display);font-size:18px;color:var(--ok);white-space:nowrap">−${fmtW(a.dW)} W</b></div>
        <span class="note">${esc(a.con.name)}: U ${nv(a.con.U, 2)} → ${nv(a.rule.to, 2)} W/m²K · ${fmt(a.A, 1)} m² in ${[...a.rooms].map(esc).join(', ')} · ${fmt(pct, 0)}% van het totaal</span>
        <label class="chk"><input type="checkbox" id="f-adv-${a.con.id}" data-f="advsel.${a.con.id}" ${on ? 'checked' : ''}> Meenemen in de berekening</label></div>`;
    });
    const after = c.total - save;
    h += `<div class="kcard"><div class="kh"><span>${save > 0 ? 'Na de aangevinkte maatregelen' : 'Vink maatregelen aan om het effect te zien'}</span><b>${fmt(after / 1000, 2)} kW</b></div>
      <div class="seglegend"><span style="--c:transparent">Nu ${fmt(c.total / 1000, 2)} kW</span>${save > 0 ? `<span style="--c:var(--ok)">besparing ${fmt(save / 1000, 2)} kW (−${fmt((save / c.total) * 100, 0)}%)</span>` : ''}</div></div>`;
  }
  h += `<button class="linkbtn" data-act="advrules" aria-expanded="${advRulesOpen}">${advRulesOpen ? '▴' : '▾'} Uitgangspunten voor de adviezen</button>`;
  if (advRulesOpen)
    h += `<div class="tablewrap"><table class="calc"><thead><tr><th>Maatregel</th><th>Advies als U boven</th><th>Nieuwe U</th></tr></thead><tbody>
    ${Object.entries(R)
      .map(
        ([k, r]) =>
          `<tr><td>${esc(r.label)}<small>${KINDS[k]}</small></td><td><input class="in num" style="width:64px" id="f-advr-${k}-on" data-f="adv.${k}.on" inputmode="decimal" value="${nv(r.on, 2)}" aria-label="Drempel ${esc(KINDS[k])}"></td><td><input class="in num" style="width:64px" id="f-advr-${k}-to" data-f="adv.${k}.to" inputmode="decimal" value="${nv(r.to, 2)}" aria-label="Nieuwe U ${esc(KINDS[k])}"></td></tr>`
      )
      .join('')}
    </tbody></table></div><p class="note">Richtwaarden: HR++ glas in een nieuw kozijn ca. U 1,1–1,4, triple glas ca. 0,7–0,9; spouwvulling ca. U 0,4–0,5; Rc 3,5 komt overeen met U ≈ 0,27, Rc 6 met U ≈ 0,16.</p>`;
  return h + `</div>`;
}
function hpSectionHtml(c) {
  const save = adviceSaving(c),
    L = lossLine(c, save),
    L0 = save > 0 ? lossLine(c) : null;
  if (c.total <= 0) return '';
  if (!hpList) return `<div class="sec"><h3>Warmtepomp</h3><p class="note">Lijst met warmtepompen laden…</p></div>`;
  const rows = hpList.map(h => ({ h, j: hpJudge(h, L) })).sort((a, b) => a.j.score - b.j.score);
  if (!hpSel || !hpList.some(h => h.id === hpSel)) hpSel = rows.length ? rows[0].h.id : null;
  const cur = rows.find(r => r.h.id === hpSel);
  let h = `<div class="sec"><h3>Warmtepomp</h3>
    <p class="note">${save > 0 ? `<b>Beoordeeld op het warmteverlies na de aangevinkte maatregelen.</b> ` : ''}Bij ${nv(L.te, 0)} °C is het warmteverlies ${fmt(L.at(L.te), 2)} kW; bij +10 °C nog ${fmt(L.at(10), 2)} kW. Een geschikte warmtepomp levert bij ${nv(L.te, 0)} °C minstens dat vermogen, en kan bij +10 °C terugregelen tot onder het warmteverlies, zodat hij niet steeds aan- en afslaat.</p>`;
  if (hpErr) h += `<div class="warnbox">${esc(hpErr)}</div>`;
  if (cur) h += hpChartHtml(cur.h, cur.j, L, L0);
  h += rows
    .map(
      ({
        h: hp,
        j
      }) => `<button class="hprow ${hp.id === hpSel ? 'cur' : ''}" data-act="hpsel" data-h="${esc(hp.id)}" aria-pressed="${hp.id === hpSel}">
      <span class="hn">${esc(hp.merk)} ${esc(hp.model)}<small>${hp.aanvoer ? 'aanvoer ' + nv(hp.aanvoer, 0) + ' °C · ' : ''}${esc(hp.bron)}</small></span>
      <span class="hk">${fmt(j.max, 1)} kW</span>
      <span class="hs">${j.covers ? `<span class="chip ok">✓ dekt ${nv(L.te, 0)} °C${j.over > 0.005 ? ` (+${fmtW(j.over * 100)}%)` : ''}</span>` : `<span class="chip bad">⚠ tekort ${fmt(j.need - j.max, 1)} kW${j.biv != null ? ` · bijverwarming nodig onder ${fmt(j.biv, 1)} °C` : ''}</span>`}
      ${j.mod ? `<span class="chip ok">✓ min. ${fmt(j.min10, 1)} kW bij +10 °C</span>` : `<span class="chip bad">⚠ min. ${fmt(j.min10, 1)} kW bij +10 °C: slaat vaak aan en af</span>`}${j.ex10 ? '<span class="chip">+10 °C doorgerekend</span>' : ''}</span></button>`
    )
    .join('');
  h += `<div class="row"><button class="btn small" data-act="hpexport">Lijst downloaden (.json)</button><button class="btn small" data-act="hpimport">Eigen lijst importeren</button>${hpSource === 'eigen' ? '<button class="btn small" data-act="hpreset">Standaardlijst terugzetten</button>' : ''}</div>
    <p class="note">${hpSource === 'eigen' ? 'Je gebruikt je eigen lijst.' : 'Dit is de standaardlijst.'} Download de lijst, vul hem aan in een teksteditor en importeer hem weer. Per warmtepomp geef je het minimale en maximale vermogen bij een paar buitentemperaturen; daartussen rekent de app rechtlijnig door. Staan er alleen gegevens bij −10 en +7 °C in, dan is de waarde bij +10 °C doorgerekend. De voorbeelden met 'fictief' in de naam zijn verzonnen.</p></div>`;
  return h;
}
function hpChartHtml(hp, j, L, L0) {
  const W = 380,
    H = 230,
    ml = 40,
    mr = 14,
    mt = 14,
    mb = 32,
    x0 = -10,
    x1 = 15;
  const te = L.te < x0 ? L.te : x0;
  const xs = t => ml + ((t - te) / (x1 - te)) * (W - ml - mr);
  let ymax = Math.max(L.at(te), L0 ? L0.at(te) : 0, hpAt(hp, x1, 'max'), hpAt(hp, te, 'max')) * 1.1;
  const step = ymax <= 4 ? 1 : ymax <= 10 ? 2 : ymax <= 20 ? 4 : 5;
  ymax = Math.ceil(ymax / step) * step;
  const ys = v => H - mb - (v / ymax) * (H - mt - mb);
  let o = '';
  for (let v = 0; v <= ymax + 1e-9; v += step)
    o += `<line x1="${ml}" x2="${W - mr}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)" stroke-width="1"/><text x="${ml - 6}" y="${ys(v) + 3.5}" text-anchor="end">${nv(v, 0)}</text>`;
  for (let t = Math.ceil(te / 5) * 5; t <= x1; t += 5)
    o += `<text x="${xs(t)}" y="${H - mb + 15}" text-anchor="middle">${t > 0 ? '+' : ''}${t}</text>`;
  o += `<text x="${(ml + W - mr) / 2}" y="${H - 4}" text-anchor="middle">buitentemperatuur °C</text><text x="${ml - 6}" y="${mt - 4}" text-anchor="end">kW</text>`;
  // check lines at design temperature and +10 °C
  [te, 10].forEach(
    t =>
      (o += `<line x1="${xs(t)}" x2="${xs(t)}" y1="${mt}" y2="${H - mb}" stroke="var(--muted)" stroke-opacity=".35" stroke-dasharray="3 4"/>`)
  );
  const N = 50,
    ts = [...Array(N + 1)].map((_, i) => te + ((x1 - te) * i) / N);
  const path = f => ts.map((t, i) => `${i ? 'L' : 'M'}${xs(t).toFixed(1)} ${ys(f(t)).toFixed(1)}`).join('');
  // capacity band between min and max
  o += `<path d="${path(t => hpAt(hp, t, 'max'))}${ts
    .slice()
    .reverse()
    .map(t => `L${xs(t).toFixed(1)} ${ys(hpAt(hp, t, 'min')).toFixed(1)}`)
    .join('')}Z" fill="var(--c-hp)" fill-opacity=".10"/>`;
  o += `<path d="${path(t => hpAt(hp, t, 'max'))}" fill="none" stroke="var(--c-hp)" stroke-width="2.4" stroke-linejoin="round"/>`;
  o += `<path d="${path(t => hpAt(hp, t, 'min'))}" fill="none" stroke="var(--c-hp)" stroke-width="2" stroke-dasharray="6 4"/>`;
  if (L0)
    o += `<path d="${path(t => L0.at(t))}" fill="none" stroke="var(--c-loss)" stroke-opacity=".4" stroke-width="2" stroke-dasharray="2 4"/>`;
  o += `<path d="${path(t => L.at(t))}" fill="none" stroke="var(--c-loss)" stroke-width="2.4"/>`;
  // the two check points
  const dot = (t, v, col) =>
    `<circle cx="${xs(t)}" cy="${ys(v)}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
  o +=
    dot(te, L.at(te), 'var(--c-loss)') +
    dot(te, j.max, 'var(--c-hp)') +
    dot(10, L.at(10), 'var(--c-loss)') +
    dot(10, j.min10, 'var(--c-hp)');
  // direct labels at the right end
  o += `<text x="${W - mr}" y="${ys(hpAt(hp, x1, 'max')) - 6}" text-anchor="end" style="fill:var(--ink);font-weight:600">max</text><text x="${W - mr}" y="${ys(hpAt(hp, x1, 'min')) - 6}" text-anchor="end" style="fill:var(--ink);font-weight:600">min</text>`;
  o += `<line id="hp-x" y1="${mt}" y2="${H - mb}" stroke="var(--ink)" stroke-opacity=".5" visibility="hidden"/><rect id="hp-hit" x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>`;
  window.__hpChart = { hp, L, te, x1, ml, mr, W, H };
  return `<div class="chartleg"><span><i style="background:var(--c-loss)"></i>Warmteverlies${L0 ? ' na maatregelen' : ''}</span>${L0 ? `<span><i style="background:repeating-linear-gradient(90deg,var(--c-loss) 0 2px,transparent 2px 6px);opacity:.6"></i>nu</span>` : ''}<span><i style="background:var(--c-hp)"></i>${esc(hp.merk)} ${esc(hp.model)} max</span><span><i style="background:repeating-linear-gradient(90deg,var(--c-hp) 0 6px,transparent 6px 9px)"></i>min</span></div>
    <div class="chart" id="hpchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Warmteverlies en vermogen van ${esc(hp.merk)} ${esc(hp.model)} tegen de buitentemperatuur">${o}</svg><div class="tip" id="hp-tip" hidden></div></div>
    <div class="tablewrap"><table class="calc"><thead><tr><th>Buiten</th><th>Warmteverlies kW</th><th>Max kW</th><th>Min kW</th></tr></thead><tbody>
    ${[te, -5, 0, 5, 10]
      .filter((t, i, a) => a.indexOf(t) === i)
      .map(
        t =>
          `<tr><td>${t > 0 ? '+' : ''}${nv(t, 0)} °C</td><td>${fmt(L.at(t), 2)}</td><td>${fmt(hpAt(hp, t, 'max'), 2)}${hpExtra(hp, t) ? '*' : ''}</td><td>${fmt(hpAt(hp, t, 'min'), 2)}${hpExtra(hp, t) ? '*' : ''}</td></tr>`
      )
      .join('')}
    </tbody></table></div>${[te, 10].some(t => hpExtra(hp, t)) ? '<p class="note">* doorgerekend buiten de opgegeven meetpunten</p>' : ''}`;
}
function bindHpChart() {
  const box = $('hpchart'),
    C = window.__hpChart;
  if (!box || !C) return;
  const svgEl = box.querySelector('svg'),
    tip = $('hp-tip'),
    xl = svgEl.querySelector('#hp-x');
  const move = e => {
    const r = svgEl.getBoundingClientRect();
    const X = ((e.clientX - r.left) / r.width) * C.W;
    const t = Math.round(C.te + ((X - C.ml) / (C.W - C.ml - C.mr)) * (C.x1 - C.te));
    if (t < C.te || t > C.x1) {
      tip.hidden = true;
      xl.setAttribute('visibility', 'hidden');
      return;
    }
    const xx = C.ml + ((t - C.te) / (C.x1 - C.te)) * (C.W - C.ml - C.mr);
    xl.setAttribute('x1', xx);
    xl.setAttribute('x2', xx);
    xl.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${t > 0 ? '+' : ''}${t} °C</b><br>verlies ${fmt(C.L.at(t), 2)} kW<br>max ${fmt(hpAt(C.hp, t, 'max'), 2)} · min ${fmt(hpAt(C.hp, t, 'min'), 2)} kW`;
    tip.style.left = (xx / C.W) * r.width + 'px';
    tip.style.top = e.clientY - r.top + 'px';
    tip.hidden = false;
  };
  svgEl.addEventListener('pointermove', move);
  svgEl.addEventListener('pointerleave', () => {
    tip.hidden = true;
    xl.setAttribute('visibility', 'hidden');
  });
}

// Resultaten, ventilatie en project, het paneel tekenen, invoer verwerken en knoppen.
'use strict';
// warnings for input that makes the results meaningless
function sanityHtml(c) {
  const S = P.settings,
    w = [];
  if (S.tRet < 5 || S.tRet > 35)
    w.push(
      `De temperatuur van de afvoer- en overstroomlucht staat op ${nv(S.tRet, 1)} °C. Dat is vrijwel zeker een tikfout (bedoeld is meestal 20 à 22 °C). Pas het aan onder <button class="crumb" data-act="gotab" data-tab="vent">Ventilatie</button>.`
    );
  if (!(+S.flow > 0) && S.twSup <= S.twRet)
    w.push('De aanvoertemperatuur is niet hoger dan de retourtemperatuur. Controleer het afgiftesysteem.');
  const neg = c.per.filter(x => x.c.total < -1);
  if (neg.length)
    w.push(
      `Negatief warmteverlies in ${neg.map(x => `<button class="crumb" data-act="selroom" data-r="${x.room.id}">${esc(x.room.name)}</button>`).join(', ')}. Dat wijst op een invoerfout, bijvoorbeeld een te hoge temperatuur van een buurruimte of van de ventilatielucht.`
    );
  const io = innerOutside();
  return w.length || io.length
    ? `<div class="sec">${w.map(t => `<div class="warnbox">${t}</div>`).join('')}${innerOutsideHtml(io, 'all')}</div>`
    : '';
}
function viewRes() {
  const c = calcAll();
  const tb = {
    lines: c.per.flatMap(x => x.c.lines),
    vent: c.per.reduce((a, x) => a + x.c.vent, 0),
    inf: c.per.reduce((a, x) => a + x.c.inf, 0)
  };
  let h = `<div class="sec"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Resultaten</h2><button class="btn small" data-act="report">Rapport (PDF)</button></div><div class="kcard"><div class="kh"><span>Som van alle ruimtes</span><b>${fmt(c.total / 1000, 2)} kW</b></div>${segHtml(tb, true)}</div></div>
  ${sanityHtml(c)}
  ${P.floors
    .map(f => {
      const per = c.per.filter(x => x.room.floorId === f.id);
      return per.length
        ? `<div class="sec"><h3>${esc(f.name)}</h3><div class="roomcards">${per.map(roomCard).join('')}</div></div>`
        : '';
    })
    .join('')}
  ${emitOverviewHtml(c)}
  ${shortageSummaryHtml(c)}
  ${curveHtml()}
  ${adviceHtml(c)}
  ${hpSectionHtml(c)}
  ${volumeHtml()}
  ${networkHtml()}
  <div class="sec"><h3>Tabel</h3></div>
  <div class="tablewrap"><table class="calc"><thead><tr><th>Ruimte</th><th>θi</th><th>A m²</th><th>Transm.</th><th>Vent.+inf.</th><th>Totaal W</th><th>W/m²</th></tr></thead><tbody>`;
  P.floors.forEach(f => {
    const per = c.per.filter(x => x.room.floorId === f.id);
    if (!per.length) return;
    if (P.floors.length > 1)
      h += `<tr><td colspan="7" style="font-family:var(--font-body);font-weight:600;padding-top:10px">${esc(f.name)} <span class="note">· ${fmtW(per.reduce((a, x) => a + x.c.total, 0))} W</span></td></tr>`;
    per.forEach(x => {
      h += `<tr class="${x.c.missing ? 'miss' : ''}"><td><button class="crumb" data-act="selroom" data-r="${x.room.id}">${esc(x.room.name)}</button>${x.c.missing ? '<small>constructie ontbreekt</small>' : ''}</td><td>${nv(x.room.temp, 1)}</td><td>${fmt(x.c.Af, 1)}</td><td>${fmtW(x.c.trans)}</td><td>${fmtW(x.c.vent + x.c.inf)}</td><td>${fmtW(x.c.total)}</td><td>${x.c.Af ? fmtW(x.c.total / x.c.Af) : '–'}</td></tr>`;
    });
  });
  h += `<tr class="sum"><td>Totaal</td><td></td><td>${fmt(
    c.per.reduce((a, x) => a + x.c.Af, 0),
    1
  )}</td><td>${fmtW(c.per.reduce((a, x) => a + x.c.trans, 0))}</td><td>${fmtW(c.per.reduce((a, x) => a + x.c.vent + x.c.inf, 0))}</td><td>${fmtW(c.total)}</td><td></td></tr></tbody></table></div>
  <div class="sec"><h3>Ventilatie</h3>${balanceHtml()}</div>
  <div class="row"><button class="btn small" data-act="csv">Download als CSV</button><button class="btn small" data-act="export-hljs">Exporteren naar heatlossjs</button></div>
  <p class="note">Het totaal per ruimte is het vermogen dat de radiator of vloerverwarming daar moet leveren. De som is een bovengrens voor de opwekker: verlies tussen verwarmde ruimtes onderling valt in de praktijk deels tegen elkaar weg.</p>
  <p class="note">Vereenvoudigde methode: transmissie (A × (U + ΔU) × Δθ), ventilatie (0,335 × q × (θi − θtoevoer)) en infiltratie (0,335 × qi × (θi − θe)). Grond rekent met een vaste vervangende temperatuur. Opwarmtoeslag en de exacte factoren uit ISSO 51 / NEN-EN 12831 zitten er nog niet in. Controleer de uitkomst voordat je erop dimensioneert.</p>`;
  return h;
}
function ventBalance() {
  const sup = P.rooms.reduce((a, r) => a + r.sup, 0),
    ext = P.rooms.reduce((a, r) => a + r.ext, 0);
  return { sup, ext, off: Math.max(sup, ext) > 0 ? Math.abs(sup - ext) / Math.max(sup, ext) : 0 };
}
function balanceHtml() {
  const S = P.settings,
    b = ventBalance();
  let h = `<div class="det">Toevoer ${fmtW(b.sup)} m³/h · afvoer ${fmtW(b.ext)} m³/h${S.ventSys === 'D' ? ` · toevoertemperatuur na WTW ${fmt(supplyTemp(), 1)} °C` : ''}</div>`;
  if (S.ventSys === 'D' && b.off > 0.1)
    h += `<div class="warnbox">Balansventilatie is niet in balans: toevoer en afvoer verschillen ${fmtW(b.off * 100)}%. Het verschil gaat in werkelijkheid via kieren naar binnen of buiten.</div>`;
  if (S.ventSys !== 'D' && b.ext > 0 && b.sup < b.ext * 0.9)
    h += `<div class="warnbox">Er wordt meer afgevoerd dan je aan toevoer (roosters) hebt ingevuld. Vul per ruimte de toevoer via roosters in, anders ontbreekt dat verlies.</div>`;
  return h;
}
function ventSettingsHtml() {
  const S = P.settings,
    it = infTotal();
  return `<div class="sec"><h3>Ventilatie</h3>
    <label class="f" for="f-s-vs">Systeem<select class="in" id="f-s-vs" data-f="set.ventSys">${Object.entries(VENT_SYS)
      .map(([k, v]) => `<option value="${k}" ${S.ventSys === k ? 'selected' : ''}>${v}</option>`)
      .join('')}</select></label>
    <div class="fields">${S.ventSys === 'D' ? numField('f-s-eta', 'set.eta', 'WTW-rendement η', '0–1', S.eta, 3) : ''}${numField('f-s-tr', 'set.tRet', 'Afvoer- en overstroomlucht', '°C', S.tRet, 1)}</div>
    ${balanceHtml()}
    <p class="note">Per ruimte vul je inblaas (of toevoer via roosters) en afzuiging in m³/h in. Een ruimte met inblaas verliest warmte omdat de lucht kouder binnenkomt: bij WTW op ${fmt(supplyTemp(), 1)} °C, anders op de buitentemperatuur. Een ruimte met alleen afzuiging krijgt lucht uit de rest van het huis, op de temperatuur van de afvoerlucht; een warme badkamer verliest daardoor nog iets. Gebruik voor η het rendement uit de productspecificatie; in de praktijk ligt het vaak lager dan het opgegeven maximum.</p></div>
  <div class="sec"><h3>Infiltratie</h3>
    <label class="f" for="f-s-im">Methode<select class="in" id="f-s-im" data-f="set.infMode"><option value="qv10" ${S.infMode === 'qv10' ? 'selected' : ''}>Uit de luchtdoorlatendheid qv10</option><option value="n" ${S.infMode === 'n' ? 'selected' : ''}>Vast luchtwisselingsgetal n</option></select></label>
    ${
      S.infMode === 'qv10'
        ? `<div class="fields">${numField('f-s-qv10', 'set.qv10', 'qv10 (specifiek)', 'dm³/s·m²', S.qv10, 2)}${numField('f-s-finf', 'set.fInf', 'Correctiefactor', '–', S.fInf, 2)}</div>
    <div class="det">qi = 0,46 × ${nv(S.qv10, 2)} × ${fmt(it.Ag, 1)} m² × ${nv(S.fInf, 2)} = ${fmt(it.q / 3.6, 1)} dm³/s (${fmtW(it.q)} m³/h)</div>
    <p class="note">qv10 is de lekkage bij 10 Pa drukverschil, per m² vloeroppervlak. Bij gewone omstandigheden is het drukverschil kleiner; daarom rekent de norm met 0,46 × qv10 en correctiefactoren voor wind, gebouwtype en ventilatiesysteem. Die factoren staan in ISSO 51 en zijn niet openbaar; met 1 zit je aan de veilige kant. De infiltratie wordt over de ruimtes verdeeld naar hun oppervlak aan de buitenschil. Richtwaarden qv10: nieuwbouw na 2010 ca. 0,4–1,0, woning 1990–2010 ca. 1,0–1,5, ouder dan 1970 ca. 2–4.</p>`
        : `<div class="fields">${numField('f-s-n', 'set.nInf', 'Infiltratie n', '1/h', S.nInf, 2)}</div>`
    }</div>`;
}
// <option>s of all rooms (per floor) as a destination for air from room
function flowOptions(room, selected) {
  return (
    `<option value="">— nergens heen —</option>` +
    P.floors
      .map(f => {
        const rs = P.rooms.filter(r => r.floorId === f.id && r !== room);
        return rs.length
          ? `<optgroup label="${esc(f.name)}">${rs.map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>`
          : '';
      })
      .join('')
  );
}
function roomAirHtml(room) {
  const a = airBalance(room);
  const ins = [`toevoer ${nv(room.sup, 0)}`, ...a.tin.map(t => `uit ${esc(t.room.name)} ${nv(t.q, 0)}`)];
  if (a.rest > 0) ins.push(`aanvulling ${nv(a.rest, 0)}`);
  const outs = [`afzuiging ${nv(room.ext, 0)}`, ...a.tout.map(t => `naar ${esc(t.room.name)} ${nv(t.q, 0)}`)];
  return `<label class="f" for="f-room-flow">Lucht stroomt over naar<select class="in" id="f-room-flow" data-f="room.flowTo">${flowOptions(room, room.flowTo)}</select></label>
  <div class="det">Lucht in: ${ins.join(' + ')} = ${nv(a.inn + a.rest, 0)} m³/h<br>Lucht uit: ${outs.join(' + ')} = ${nv(a.out, 0)} m³/h</div>
  ${
    a.surplus > 1
      ? `<div class="warnbox">Er komt ${nv(a.surplus, 0)} m³/h meer binnen dan er weggaat (in: ${ins.join(' + ')}; uit: ${outs.join(' + ')}). ${
          room.flowTo
            ? 'Controleer de handmatige overstroom onder Ventilatie.'
            : `Kies hierboven bij <i>Lucht stroomt over naar</i> waar de rest heen gaat${a.tout.length ? '. Dat werkt samen met de handmatige overstroom: die ruimte krijgt automatisch wat er overblijft' : ''}.`
        }</div>`
      : ''
  }
  ${a.rest > 1 && (a.tin.length || room.sup > 0) ? `<div class="warnbox">Er gaat ${nv(a.rest, 0)} m³/h meer weg dan er binnenkomt. De app rekent het verschil als lucht uit de woning op ${nv(P.settings.tRet, 1)} °C.</div>` : ''}`;
}
function transferRow(t) {
  const opts = sel =>
    P.floors
      .map(f => {
        const rs = P.rooms.filter(r => r.floorId === f.id);
        return rs.length
          ? `<optgroup label="${esc(f.name)}">${rs.map(r => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>`
          : '';
      })
      .join('');
  return `<div class="matrow" style="flex-wrap:nowrap"><select class="in" style="flex:1 1 0;min-width:0" id="f-tr-${t.id}-f" data-f="tr.${t.id}.from" aria-label="Van ruimte">${opts(t.from)}</select><span class="note">→</span>
    <select class="in" style="flex:1 1 0;min-width:0" id="f-tr-${t.id}-t" data-f="tr.${t.id}.to" aria-label="Naar ruimte">${opts(t.to)}</select>
    <span class="mmwrap"><input class="in num" style="width:52px" id="f-tr-${t.id}-q" data-f="tr.${t.id}.q" inputmode="decimal" value="${nv(t.q, 0)}" aria-label="Debiet in m³/h">m³/h</span>
    <button class="xbtn" data-act="deltr" data-t="${t.id}" aria-label="Overstroom verwijderen">✕</button></div>`;
}
function viewVent() {
  const S = P.settings;
  let h = `<div class="sec"><h2>Ventilatie</h2><p class="note">Kies het ventilatiesysteem en vul per ruimte de luchthoeveelheden in. Dat kan hieronder in één overzicht, of per ruimte onder Selectie.</p></div>
  ${sanityHtml(calcAll())}
  ${ventSettingsHtml()}
  <div class="sec"><h3>Debieten per ruimte</h3><div class="tablewrap"><table class="calc"><thead><tr><th>Ruimte</th><th>θi</th><th>${S.ventSys === 'D' ? 'Inblaas' : 'Toevoer'} m³/h</th><th>Afzuig m³/h</th><th>Stroomt naar</th><th>Over&shy;stroom in/uit</th><th>Φ W</th></tr></thead><tbody>`;
  P.floors.forEach(f => {
    const rs = P.rooms.filter(r => r.floorId === f.id);
    if (!rs.length) return;
    if (P.floors.length > 1)
      h += `<tr><td colspan="7" style="font-family:var(--font-body);font-weight:600;padding-top:10px">${esc(f.name)}</td></tr>`;
    rs.forEach(r => {
      const c = calcRoom(r),
        a = c.air;
      const st =
        a.surplus > 1
          ? `<small style="color:var(--warn)">${nv(a.surplus, 0)} m³/h blijft over (in ${nv(r.sup + a.qin, 0)}, uit ${nv(r.ext + a.qout, 0)}): kies <i>Stroomt naar</i></small>`
          : a.rest > 1
            ? `<small>${nv(a.rest, 0)} m³/h aanvulling uit woning</small>`
            : '';
      h += `<tr><td><button class="crumb" data-act="selroom" data-r="${r.id}">${esc(r.name)}</button>${st}</td><td>${nv(r.temp, 1)}</td>
      <td><input class="in num" style="width:56px" id="f-vr-${r.id}-s" data-f="vr.${r.id}.sup" inputmode="decimal" value="${nv(r.sup, 0)}" aria-label="${S.ventSys === 'D' ? 'Inblaas' : 'Toevoer'} ${esc(r.name)}"></td>
      <td><input class="in num" style="width:56px" id="f-vr-${r.id}-e" data-f="vr.${r.id}.ext" inputmode="decimal" value="${nv(r.ext, 0)}" aria-label="Afzuiging ${esc(r.name)}"></td><td><select class="in" style="min-width:90px" id="f-vr-${r.id}-to" data-f="vr.${r.id}.flowTo" aria-label="Lucht van ${esc(r.name)} stroomt naar">${flowOptions(r, r.flowTo)}</select></td><td style="white-space:nowrap">${nv(a.qin, 0)}/${nv(a.qout, 0)}</td><td id="vphi-${r.id}">${fmtW(c.vent)}</td></tr>`;
    });
  });
  h += `</tbody></table></div></div>
  <div class="sec"><p class="note">Bij <i>Stroomt naar</i> kies je per ruimte waar de lucht heen gaat, via een spleet onder de deur, een overstroomrooster of een open verbinding (bijvoorbeeld slaapkamer → overloop → badkamer). Hoeveel het is, rekent de app zelf uit: wat er na de afzuiging in die ruimte overblijft, plus wat er uit andere ruimtes binnenkomt. De ontvangende ruimte rekent met de temperatuur van de ruimte waar de lucht vandaan komt. De pijlen in de tekening laten de luchtstromen zien.</p></div>
  <div class="sec"><h3>Handmatige overstroom (geavanceerd)</h3><p class="note">Voor een vaste aftakking, bijvoorbeeld als lucht uit de hal naar twee ruimtes gaat: vul hier de vaste hoeveelheid in (hal → toilet 20 m³/h) en kies bij <i>Stroomt naar</i> de ruimte die de rest krijgt (hal → woonkamer). Die krijgt dan automatisch wat er overblijft. Gaat er uit een ruimte meer lucht weg dan er binnenkomt, dan rekent de app het verschil als lucht uit de woning op ${nv(S.tRet, 1)} °C.</p>
  ${(P.transfers || []).map(transferRow).join('') || '<p class="note">Geen handmatige overstroom.</p>'}
  <div class="row"><button class="btn small" data-act="addtr" ${P.rooms.length < 2 ? 'disabled' : ''}>+ Handmatige overstroom</button></div></div>`;
  return h;
}
function viewSet() {
  const S = P.settings;
  const list = Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return `<div class="sec"><h2>Project</h2><label class="f" for="f-proj-name">Projectnaam<input class="in" id="f-proj-name" data-f="proj.name" value="${esc(P.name)}"></label></div>
  <div class="sec"><h3>Verdiepingen</h3><p class="note">Van onder naar boven. Boven de tekening kies je welke verdieping lichtgrijs als ondergrond staat; standaard is dat de verdieping eronder.</p>
    ${P.floors
      .map((f, i) => {
        const n = P.rooms.filter(r => r.floorId === f.id).length;
        return `<div class="row"><div class="lmove"><button data-act="floormove" data-f="${f.id}" data-dir="1" aria-label="Hoger" ${i === P.floors.length - 1 ? 'disabled' : ''}>▲</button><button data-act="floormove" data-f="${f.id}" data-dir="-1" aria-label="Lager" ${i === 0 ? 'disabled' : ''}>▼</button></div>
      <input class="in grow" id="f-fl-${f.id}" data-f="fl.${f.id}.name" value="${esc(f.name)}" aria-label="Naam verdieping"><span class="note">${n} ruimte${n === 1 ? '' : 's'}</span>
      <button class="xbtn" data-act="delfloor" data-f="${f.id}" ${P.floors.length < 2 ? 'disabled title="Er moet minstens één verdieping blijven"' : `title="${esc(f.name)} verwijderen${n ? ' met ' + n + (n === 1 ? ' ruimte' : ' ruimtes') : ''} (ongedaan maken kan)"`} aria-label="Verwijder ${esc(f.name)}">✕</button></div>`;
      })
      .reverse()
      .join('')}
    <div class="row"><button class="btn small" data-act="addfloor">+ Verdieping</button>${P.floors[0] && P.floors[0].below ? '' : '<button class="btn small" data-act="addbelow" data-k="kruip">+ Kruipruimte</button><button class="btn small" data-act="addbelow" data-k="kelder">+ Kelder</button>'}</div>
    <p class="note">Een kruipruimte of kelder komt onder de laagste verdieping. Ruimtes daar zijn onverwarmd: ze tellen niet mee in het warmteverlies, maar de vloer erboven rekent met hun temperatuur. Je kunt er ook leidingen, de warmtepomp of een boilervat tekenen.</p></div>
  ${bgPanelHtml()}
  <div class="sec"><h3>Rekenwaarden</h3><div class="fields">
    ${numField('f-s-te', 'set.te', 'Buitentemperatuur θe', '°C', S.te, 1)}${numField('f-s-tg', 'set.tGround', 'Grond / kruipruimte', '°C', S.tGround, 1)}
    ${numField('f-s-tu', 'set.tUnheated', 'Onverwarmde ruimte', '°C', S.tUnheated, 1)}${numField('f-s-tn', 'set.tNeighbour', 'Buurwoning', '°C', S.tNeighbour, 1)}
    ${numField('f-s-du', 'set.dU', 'Koudebrugtoeslag ΔU', 'W/m²K', S.dU, 3)}${numField('f-s-h', 'set.height', 'Standaard hoogte', 'm', S.height, 2)}</div>
    <p class="note">ΔU geldt voor delen die aan buiten, grond of een onverwarmde ruimte grenzen. Ventilatiesysteem, WTW en infiltratie stel je in onder <button class="crumb" data-act="gotab" data-tab="vent">Ventilatie</button>.</p></div>
  <div class="sec"><h3>Vloeren en plafonds</h3><p class="note">Met <i>Automatisch</i> leidt de app uit de tekening af welke ruimtes onder een vloer en boven een plafond liggen.</p>
    <div class="row"><button class="btn small" data-act="autoall">Alle vloeren en plafonds op automatisch</button></div></div>
  <div class="sec"><h3>Tekenen</h3><div class="fields">${numField('f-s-snap', 'set.snap', 'Snapraster', 'm', S.snap, 3)}${numField('f-s-mw', 'set.maxWall', 'Max. wanddikte aangrenzing', 'm', S.maxWall, 2)}</div>
    <p class="note">Teken ruimtes hart-op-hart (wanden vallen samen) of op binnenmaat. Twee evenwijdige wanden binnen de maximale wanddikte gelden als gedeelde wand.</p></div>
  <div class="sec"><h3>Projecten</h3>${list.map(p => `<button class="linkrow" data-act="openproj" data-p="${p.id}"><span>${esc(p.name)}${p.id === P.id ? ' <span class="note">· geopend</span>' : ''}</span><span class="note">${p.rooms.length} ruimte${p.rooms.length === 1 ? '' : 's'}</span></button>`).join('')}
    <div class="row"><button class="btn small" data-act="newproj">+ Leeg project</button><button class="btn small" data-act="dupproj">Kopie maken</button><button class="btn small" data-act="import">Importeren (.json)</button><button class="btn small" data-act="export">Exporteren (.json)</button></div>
    <div class="row"><button class="btn small" data-act="export-hljs">Exporteren naar heatlossjs</button></div>
    <p class="note">Het heatlossjs-bestand open je in <a href="https://github.com/trystanLea/heatlossjs" target="_blank" rel="noopener">heatlossjs</a> met Open. Daar kun je radiatoren, vloerverwarming en de warmtepomp doorrekenen. De tekening zit in het bestand: importeer je het hier weer, dan komt alles terug en worden in heatlossjs gewijzigde temperaturen en U-waarden overgenomen. Een heatlossjs-bestand zonder tekening levert alleen de constructietypen op.</p>
    <div class="row">${confirmDel ? `<span class="note">“${esc(P.name)}” definitief verwijderen?</span><button class="btn small danger" data-act="delproj-yes">Ja, verwijderen</button><button class="btn small" data-act="delproj-no">Annuleren</button>` : `<button class="btn small danger" data-act="delproj" ${list.length < 2 ? 'disabled title="Er moet minstens één project blijven"' : ''}>Project verwijderen</button>`}</div>
    <p class="note" id="store-note">${storeNote()}</p></div>`;
}
let conFocus = null;
let panelKey = '';
function renderPanel() {
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  // keep the scroll position while editing the same thing; start at the top when something else is shown
  const key = tab + '|' + (tab === 'sel' && sel ? [sel.t, sel.r, sel.w, sel.s, sel.e, sel.i].join(':') : '');
  const st = key === panelKey ? pbody.scrollTop : 0;
  panelKey = key;
  let h = '';
  if (tab === 'sel' && sel && sel.t === 'pipe' && (validateSel(), sel)) {
    h = viewPipe(P.pipes.find(x => x.id === sel.p));
  } else if (tab === 'sel' && sel && sel.t === 'hp' && (validateSel(), sel)) {
    h = viewHp();
  } else if (tab === 'sel') {
    validateSel();
    const room = sel && getRoom(sel.r);
    if (!room) h = viewNone();
    else if (sel.t === 'seg') h = viewSeg(room, sel.w, sel.s);
    else if (sel.t === 'em' && selEm()) h = viewEm(room, selEm());
    else h = viewRoom(room);
  } else if (tab === 'con') h = viewCon(conFocus);
  else if (tab === 'vent') h = viewVent();
  else if (tab === 'res') h = viewRes();
  else h = viewSet();
  pbody.innerHTML = h;
  pbody.scrollTop = st;
  bindHpChart();
  if (tab === 'con' && conFocus) {
    const el = $('card-' + conFocus);
    if (el) el.scrollIntoView({ block: 'nearest' });
    conFocus = null;
  }
}
function renderHeader() {
  const c = calcAll();
  $('total').innerHTML = `Warmteverlies <b>${fmt(c.total / 1000, 2)} kW</b>`;
  const sel_ = $('proj-sel');
  const list = Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sel_.innerHTML = list
    .map(p => `<option value="${p.id}" ${p.id === P.id ? 'selected' : ''}>${esc(p.name)}</option>`)
    .join('');
  updateUndoBtns();
}
function renderAll() {
  renderCanvas();
  renderFloorbar();
  renderPanel();
  renderHeader();
}
let panelTimer = null;
function schedulePanel() {
  clearTimeout(panelTimer);
  panelTimer = setTimeout(() => {
    const a = document.activeElement;
    const id = a && pbody.contains(a) ? a.id : null;
    renderPanel();
    renderHeader();
    if (id) {
      const el = $(id);
      if (el) {
        el.focus({ preventScroll: true });
      }
    }
  }, 0);
}
function liveUpdate() {
  if (tab === 'vent')
    P.rooms.forEach(r => {
      const el = $('vphi-' + r.id);
      if (el) el.textContent = fmtW(calcRoom(r).vent);
    });
  if (tab === 'con' && conOpen) {
    const c = conById(conOpen);
    if (c && c.mode === 'lagen') {
      const r = calcLayers(c);
      const el = $('lsum-' + c.id);
      if (el) el.innerHTML = layerSummary(c, r);
      c.layers.forEach((l, i) => {
        const s = $('rd-' + l.id);
        if (s) s.textContent = r.layers[i].active ? 'R ' + fmt(r.layers[i].r, 2) : 'telt niet';
      });
      const v = document.querySelector(`#card-${c.id} .consum .val`);
      if (v) v.textContent = `Rc ${fmt(r.Rc, 2)} · U ${nv(c.U, 3)}`;
    }
  }
  const out = $('calc-out');
  if (out && tab === 'sel' && sel) {
    const room = getRoom(sel.r);
    if (room && sel.t !== 'seg') out.innerHTML = roomCalcHtml(room);
  }
  const c = calcAll();
  $('total').innerHTML = `Warmteverlies <b>${fmt(c.total / 1000, 2)} kW</b>`;
}

function selRoom() {
  return sel && getRoom(sel.r);
}
function selSeg() {
  const r = selRoom();
  return r && sel.t === 'seg' && r.walls[sel.w] ? r.walls[sel.w].segs[sel.s] : null;
}
function applyField(el, final) {
  const f = el.dataset.f;
  if (!f) return;
  const parts = f.split('.');
  const v = el.value;
  const room = selRoom();
  let changed = false;
  if (undoArmed) {
    pushUndo();
    undoArmed = false;
  }
  switch (parts[0]) {
    case 'room': {
      if (!room) return;
      const k = parts[1];
      if (k === 'kind') {
        room.kind = ['trap', 'vide'].includes(v) ? v : 'normaal';
        if (room.kind !== 'normaal' && !spans(room)) {
          const nf = P.floors[floorIdx(room.floorId) + 1];
          if (nf) {
            room.spanTo = nf.id;
            room.height = r3(room.height * 2);
          }
        }
        if (clipAbove(room)) {
          toast('De vide is uitgeknipt uit de ruimtes op de verdieping(en) erboven.');
          renderAll();
        }
        changed = true;
        break;
      }
      if (k === 'spanTo') {
        const was = spans(room);
        room.spanTo = v || null;
        if (!spans(room)) room.spanTo = null;
        else if (!was) {
          const l = levelsOf(room);
          room.height = r3(room.height * (l[1] - l[0] + 1));
        }
        if (clipAbove(room)) {
          toast('De vide is uitgeknipt uit de ruimtes op de verdieping(en) erboven.');
          renderAll();
        }
        changed = true;
        break;
      }
      if (k === 'stair') {
        const st = (room.stair = stairOf(room)),
          f2 = parts[2];
        if (f2 === 'shape') {
          if (!STAIR_SHAPES[v]) return;
          st.shape = v;
        } else if (f2 === 'side') st.side = v === 'b' ? 'b' : 'a';
        else if (f2 === 'edge') st.edge = Math.max(0, Math.min(room.pts.length - 1, parseInt(v, 10) || 0));
        else if (f2 === 'w') {
          const n = num(v);
          if (n == null || n < 0.5 || n > 3) return;
          st.w = n;
        }
        changed = true;
        break;
      }
      if (k === 'name') {
        room.name = v;
        changed = true;
      } else if (k === 'floorId') {
        if (!P.floors.some(f => f.id === v) || v === room.floorId) return;
        room.floorId = v;
        if (room.spanTo && floorIdx(room.spanTo) <= floorIdx(v)) room.spanTo = null;
        setFloor(v, true);
        markDirty();
        renderAll();
        toast(`${room.name} staat nu op ${P.floors[floorIdx(v)].name}.`, true);
        return;
      } else if (k === 'heated') {
        room.heated = el.checked;
        changed = true;
      } else if (k === 'roofFrom') {
        room.roofFrom = v && getRoom(v) && v !== room.id ? v : '';
        changed = true;
      } else if (k === 'flowTo') {
        room.flowTo = v && getRoom(v) && v !== room.id ? v : '';
        changed = true;
      } else {
        const n = num(v);
        if (n == null) return;
        if (k === 'height' && n <= 0) return;
        if ((k === 'sup' || k === 'ext') && n < 0) return;
        room[k] = n;
        changed = true;
      }
      break;
    }
    case 'ri': {
      const it = room && (room.roof.items || []).find(x => x.id === parts[1]);
      if (!it) return;
      const k = parts[2];
      if (k === 'name' || k === 'cid' || k === 'cidW' || k === 'cidR' || k === 'wincid') it[k] = v;
      else if (k === 'slope') it.slope = parseInt(v, 10) || 0;
      else {
        const n = num(v);
        if (n == null || n < 0 || n > 100) return;
        if ((k === 'w' || k === 'h' || k === 'hf') && (n <= 0 || n > 30)) return;
        it[k] = n;
      }
      changed = true;
      break;
    }
    case 'hp': {
      if (!P.hpPos || parts[1] !== 'floorId' || !P.floors.some(f => f.id === v)) return;
      P.hpPos = { ...P.hpPos, floorId: v };
      setFloor(v, true);
      markDirty();
      renderAll();
      toast(`De warmtepomp staat nu op ${P.floors[floorIdx(v)].name}.`, true);
      return;
    }
    case 'pipe': {
      const pp = sel && sel.t === 'pipe' && P.pipes.find(x => x.id === sel.p);
      if (!pp) return;
      const k = parts[1];
      if (k === 'floorId') {
        // to another floor: the drawing follows, so the pipe stays selected
        if (!P.floors.some(f => f.id === v) || v === pp.floorId) return;
        pp.floorId = v;
        setFloor(v, true);
        markDirty();
        renderAll();
        toast(`${pp.name} staat nu op ${P.floors[floorIdx(v)].name}.`, true);
        return;
      }
      if (k === 'name') pp.name = v;
      else if (k === 'mat') {
        if (!PIPES[v]) return;
        pp.mat = v;
        if (!PIPES[v].d[pp.dn]) pp.dn = v === 'pex' ? '26' : '22';
      } else if (k === 'dn') {
        if (!PIPES[pp.mat].d[v]) return;
        pp.dn = v;
      } else if (k === 'extra') {
        const n = num(v);
        if (n == null || n < 0) return;
        pp.extra = n;
      }
      lastPipeSpec = { mat: pp.mat, dn: pp.dn };
      changed = true;
      break;
    }
    case 'seg': {
      const sg = selSeg();
      if (!sg) return;
      const wasOpen = sg.adj === 'open';
      if (parts[1] === 'adjT') {
        const n = num(v);
        if (n == null) return;
        sg.adjT = n;
      } else sg[parts[1]] = v;
      if (parts[1] === 'adj' && (v === 'open' || wasOpen)) {
        // an open connection is the same on both sides
        sg.adj = 'open';
        const ps = isolatePartners(room, sel.w, sel.s);
        sg.adj = v;
        ps.forEach(p => {
          const x = p.o.walls[p.k].segs[p.jj];
          if (v === 'open') x.adj = 'open';
          else if (x.adj === 'open') x.adj = 'auto';
        });
      }
      if (parts[1] === 'cid' && final)
        isolatePartners(room, sel.w, sel.s).forEach(p => (p.o.walls[p.k].segs[p.jj].cid = v));
      changed = true;
      break;
    }
    case 'cut': {
      if (!final) return;
      const r = room;
      const w = r.walls[sel.w];
      const ci = +parts[1];
      let n = num(v);
      if (n == null) return;
      const L = edge(r, sel.w).L;
      const lo = (ci > 0 ? w.cuts[ci - 1] : 0) + 0.02,
        hi = (ci < w.cuts.length - 1 ? w.cuts[ci + 1] : L) - 0.02;
      n = Math.max(lo, Math.min(hi, n));
      w.cuts[ci] = r3(n);
      changed = true;
      break;
    }
    case 'op': {
      const sg = selSeg();
      const o = sg && sg.openings.find(o => o.id === parts[1]);
      if (!o) return;
      const k = parts[2];
      if (k === 'name' || k === 'cid') o[k] = v;
      else {
        const n = num(v);
        if (n == null || n < 0) return;
        o[k] = n;
      }
      if (k === 'at') {
        if (!final) return;
        const b = bounds(room, sel.w);
        freezeOpenings(room, sel.w, sel.s);
        o.at = r3(Math.max(b[sel.s], Math.min(b[sel.s + 1] - Math.min(o.w, b[sel.s + 1] - b[sel.s]), o.at)));
        syncLinkedAt(o, room, sel.w);
        changed = true;
        break;
      }
      linkedOpenings(o.lk, x => {
        x[k] = o[k];
      });
      if (k === 'w') syncLinkedAt(o, room, sel.w);
      changed = true;
      break;
    }
    case 'roof': {
      if (!room) return;
      const r = room.roof,
        k = parts[1];
      if (k === 'pitch' || k === 'knee' || k === 'kneeH') {
        const n = num(v);
        if (n == null || n < 0) return;
        if (k === 'pitch' && (n < 1 || n > 80)) return;
        if (k === 'kneeH' && (n < 0.2 || n > 3)) return;
        r[k] = n;
        changed = true;
        break;
      }
      if (k === 'edge') {
        r.edge = Math.max(0, Math.min(room.pts.length - 1, parseInt(v, 10) || 0));
        changed = true;
        break;
      }
      if (k === 'type') {
        if (r.type === 'plat' && v !== 'plat') r.flat = false;
        r.type = v;
        changed = true;
        break;
      } // a new sloped roof starts open to the ridge
      if (k === 'low') {
        r[k] = v;
        changed = true;
        break;
      }
      if (k === 'flat') {
        r.flat = el.checked;
        changed = true;
        break;
      }
      if (k === 'kneeOn') {
        r.kneeOn = el.checked;
        changed = true;
        break;
      }
    }
    // falls through for cid / adj / t, which work the same as floor and ceiling
    case 'floor':
    case 'ceil': {
      if (!room) return;
      const s = room[parts[0]];
      if (parts[1] === 't') {
        const n = num(v);
        if (n == null) return;
        s.t = n;
      } else s[parts[1]] = v;
      changed = true;
      break;
    }
    case 'con': {
      const c = conById(parts[1]);
      if (!c) return;
      const k = parts[2];
      if (k === 'name' || k === 'kind' || k === 'color') c[k] = v;
      else if (k === 'inner') c.inner = el.checked;
      else if (k === 'mode') c.mode = v === 'lagen' ? 'lagen' : 'U';
      else if (k === 'U') {
        if (c.mode === 'lagen') return;
        const n = num(v);
        if (n == null || n <= 0) return;
        c.U = n;
      } else if (k === 'Rc') {
        if (c.mode === 'lagen') return;
        const n = num(v);
        if (n == null || n < 0) return;
        c.U = Math.round(10000 / (RS[c.kind][0] + n + rseOf(c))) / 10000;
      }
      syncU(c);
      changed = true;
      break;
    }
    case 'lay': {
      const c = conById(parts[1]);
      const l = c && c.layers.find(x => x.id === parts[2]);
      if (!l) return;
      const k = parts[3];
      if (k === 'mid' || k === 'vent') l[k] = v;
      else if (k === 'mixmid') {
        if (l.mix) l.mix.mid = v;
      } else {
        const n = num(v);
        if (n == null || n < 0) return;
        if (k === 'd') l.d = n;
        else if (k === 'mixpct') {
          if (n > 100 || !l.mix) return;
          l.mix.pct = n;
        }
      }
      syncU(c);
      changed = true;
      break;
    }
    case 'mat': {
      const m = matById(parts[1]);
      if (!m) return;
      const k = parts[2];
      if (k === 'name' || k === 'color') m[k] = v;
      else if (k === 'type') m.type = ['lambda', 'R', 'spouw'].includes(v) ? v : 'lambda';
      else {
        const n = num(v);
        if (n == null || n < 0) return;
        if (k === 'lambda' && n === 0) return;
        m[k] = n;
      }
      P.constructions.forEach(c => syncU(c));
      changed = true;
      break;
    }
    case 'set': {
      const k = parts[1];
      if (k === 'ventSys' || k === 'infMode') {
        P.settings[k] = v;
        changed = true;
        break;
      }
      const n = num(v);
      if (n == null) return;
      if ((k === 'eta' && (n < 0 || n > 1)) || ((k === 'qv10' || k === 'fInf') && n < 0)) return;
      if ((k === 'snap' || k === 'height') && n <= 0) return;
      if (k === 'maxWall' && n < 0) return;
      // temperatures that only make sense in a small range (a typo like 225 instead of 22,5 turns every result upside down)
      const RANGE = {
        tRet: [5, 35],
        te: [-30, 15],
        tGround: [-10, 25],
        tUnheated: [-20, 30],
        tNeighbour: [0, 30],
        twSup: [20, 90],
        twRet: [15, 85],
        tMax: [30, 80],
        flow: [0, 5000]
      };
      if (RANGE[k] && (n < RANGE[k][0] || n > RANGE[k][1])) {
        toast(
          `Die waarde valt buiten ${RANGE[k][0]} tot ${RANGE[k][1]} ${k === 'flow' ? 'l/h' : '°C'} en is niet overgenomen.`
        );
        return;
      }
      P.settings[k] = n;
      changed = true;
      break;
    }
    case 'proj': {
      P.name = v;
      changed = true;
      break;
    }
    case 'tr': {
      const t = (P.transfers || []).find(x => x.id === parts[1]);
      if (!t) return;
      const k = parts[2];
      if (k === 'from' || k === 'to') {
        if (!getRoom(v)) return;
        t[k] = v;
      } else {
        const n = num(v);
        if (n == null || n < 0) return;
        t.q = n;
      }
      changed = true;
      break;
    }
    case 'advsel': {
      if (el.checked) P.advSel[parts[1]] = true;
      else delete P.advSel[parts[1]];
      changed = true;
      break;
    }
    case 'adv': {
      const r = P.settings.advice[parts[1]];
      if (!r) return;
      const n = num(v);
      if (n == null || n <= 0) return;
      r[parts[2]] = n;
      changed = true;
      break;
    }
    case 'em': {
      const em = selEm();
      if (!em) return;
      const k = parts[1];
      if (k === 'name') em.name = v;
      else if (k === 'boost') em.boost = el.checked;
      else if (k === 'kind') {
        if (!EM_KINDS[v] || v === 'vv') return;
        em.kind = v;
        em.n = EM_N[v];
        syncRad(em);
      } else if (k === 'rt') {
        if (v && !RAD_TYPES[v]) return;
        em.rt = v;
        if (v) em.rl = Math.max(100, Math.round(emLen(em) * 1000));
        syncRad(em);
      } else if (k === 'loops') {
        const n = parseInt(v, 10);
        if (![1, 2, 3, 4].includes(n)) return;
        em.loops = n;
      } else if (k === 'len') {
        if (!final) return;
        const n = num(v);
        if (n == null || n < 200 || n > 6000) return;
        setEmLen(em, n);
        if (RAD_TYPES[em.rt]) em.rl = n;
        syncRad(em);
      } else if (k === 'rh' || k === 'rl') {
        const n = num(v);
        if (n == null || n < 100 || n > (k === 'rh' ? 1500 : 6000)) return;
        em[k] = n;
        if (k === 'rl' && final && n >= 200) setEmLen(em, n);
        syncRad(em);
      } else if (k === 'cover') {
        if (!VV_COVER[v]) return;
        em.cover = v;
      } else if (k === 'spacing') em.spacing = [10, 15, 20].includes(+v) ? +v : 15;
      else if (k === 'pipe') {
        if (parts[2] === 'mat') {
          if (!PIPES[v]) return;
          em.pipe.mat = v;
          if (!PIPES[v].d[em.pipe.dn]) em.pipe.dn = v === 'pex' ? '16' : '15';
        } else {
          if (!PIPES[em.pipe.mat].d[v]) return;
          em.pipe.dn = v;
        }
      } else {
        const n = num(v);
        if (n == null || n < 0) return;
        if (k === 'n' && (n < 0.8 || n > 2)) return;
        if (k === 'boostPct' && n > 300) return;
        em[k] = n;
      }
      changed = true;
      break;
    }
    case 'vr': {
      const r = getRoom(parts[1]);
      if (!r) return;
      if (parts[2] === 'flowTo') {
        r.flowTo = v && getRoom(v) && v !== r.id ? v : '';
        changed = true;
        break;
      }
      const n = num(v);
      if (n == null || n < 0) return;
      r[parts[2]] = n;
      changed = true;
      break;
    }
    case 'bg': {
      const bg = curBg(),
        n = num(v);
      if (!bg || n == null) return;
      bg.op = Math.min(1, Math.max(0.1, n / 100));
      changed = true;
      break;
    }
    case 'fl': {
      const f = P.floors.find(x => x.id === parts[1]);
      if (!f) return;
      f.name = v;
      renderFloorbar();
      changed = true;
      break;
    }
  }
  if (!changed) return;
  markDirty();
  renderCanvas();
  if (final) schedulePanel();
  else liveUpdate();
}
pbody.addEventListener('focusin', () => {
  undoArmed = true;
});
pbody.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-act="selseg"]');
  const h = t ? { r: t.dataset.r, w: +t.dataset.w, s: +t.dataset.s } : null;
  if (JSON.stringify(h) !== JSON.stringify(hoverSeg)) {
    hoverSeg = h;
    renderCanvas();
  }
});
pbody.addEventListener('mouseleave', () => {
  if (hoverSeg) {
    hoverSeg = null;
    renderCanvas();
  }
});
pbody.addEventListener('input', e => {
  if (e.target.tagName === 'SELECT' || e.target.type === 'color') return;
  applyField(e.target, false);
});
pbody.addEventListener('change', e => {
  applyField(e.target, true);
});
pbody.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    if (e.target.id === 'f-newcut') {
      act('addcut', e.target);
      return;
    }
    e.target.blur();
  }
});
/* side panel width: drag the handle on its left edge; remembered in this browser */
(() => {
  const handle = $('panel-resize'),
    main = document.querySelector('.main'),
    KEY = 'wvt.panelw',
    DEF = 390;
  if (!handle || !main) return;
  const clampW = w => Math.round(Math.max(320, Math.min(w, Math.min(1000, main.clientWidth - 64 - 20 - 320))));
  const setW = (w, save) => {
    const v = clampW(w);
    main.style.setProperty('--panel-w', v + 'px');
    handle.setAttribute('aria-valuenow', String(v));
    if (save)
      try {
        localStorage.setItem(KEY, String(v));
      } catch (_) {}
  };
  try {
    const saved = +localStorage.getItem(KEY);
    if (saved > 0) setW(saved, false);
  } catch (_) {}
  let drag = null;
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    drag = { x: e.clientX, w: handle.parentElement.getBoundingClientRect().width };
    handle.classList.add('dragging');
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  handle.addEventListener('pointermove', e => {
    if (drag) setW(drag.w + (drag.x - e.clientX), false);
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    handle.classList.remove('dragging');
    setW(handle.parentElement.getBoundingClientRect().width, true);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => setW(DEF, true));
  handle.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setW(handle.parentElement.getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 20 : -20), true);
  });
  window.addEventListener('resize', () => {
    const cur = parseFloat(getComputedStyle(main).getPropertyValue('--panel-w'));
    if (cur > 0) setW(cur, false);
  });
})();
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  confirmDel = false;
  renderPanel();
  renderCanvas(); // the air flow arrows depend on the tab
});
pbody.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  act(b.dataset.act, b);
});
function act(a, b) {
  const room = selRoom();
  switch (a) {
    case 'desel':
      sel = null;
      renderAll();
      break;
    case 'selem': {
      const r = getRoom(b.dataset.r);
      if (!r) return;
      if (r.floorId !== curFloor) {
        curFloor = r.floorId;
      }
      sel = { t: 'em', r: r.id, e: b.dataset.e };
      tab = 'sel';
      closeSchema();
      renderAll();
      break;
    }
    case 'delem':
      deleteSelection();
      break;
    case 'addtr': {
      if (P.rooms.length < 2) return;
      pushUndo();
      // sensible default: from a room with air to spare to a room that is short of air
      const bal = P.rooms.map(r => ({ r, a: airBalance(r) }));
      const from = (bal.find(x => x.a.surplus > 0) || bal.find(x => x.r.sup > 0) || bal[0]).r;
      const to = (
        bal.find(x => x.r !== from && x.a.rest > 0) ||
        bal.find(x => x.r !== from && x.r.ext > 0) ||
        bal.find(x => x.r !== from)
      ).r;
      const q = Math.max(5, Math.round(Math.min(airBalance(from).surplus || 25, airBalance(to).rest || 25)));
      P.transfers.push({ id: rid(), from: from.id, to: to.id, q });
      markDirty();
      renderAll();
      break;
    }
    case 'deltr': {
      pushUndo();
      P.transfers = P.transfers.filter(t => t.id !== b.dataset.t);
      markDirty();
      renderAll();
      break;
    }
    case 'gotab':
      tab = b.dataset.tab;
      confirmDel = false;
      renderPanel();
      renderCanvas();
      pbody.scrollTop = 0;
      break;
    case 'selroom':
    case 'selseg': {
      const r = getRoom(b.dataset.r);
      if (!r) return;
      // a room that runs through the current floor can be shown here; for one of its walls go to its own floor
      if (r.floorId !== curFloor && !(a === 'selroom' && presentOn(r, curFloor))) {
        curFloor = r.floorId;
        try {
          localStorage.setItem('wvt.floor.' + P.id, curFloor);
        } catch (_) {}
      }
      sel = a === 'selroom' ? { t: 'room', r: r.id } : { t: 'seg', r: r.id, w: +b.dataset.w, s: +b.dataset.s };
      tab = 'sel';
      renderAll();
      break;
    }
    case 'fixinner': {
      const r = b.dataset.r && getRoom(b.dataset.r);
      let list = innerOutside(r || null);
      if (b.dataset.w != null) list = list.filter(x => x.w === +b.dataset.w && x.s === +b.dataset.s);
      pushUndo();
      const n = innerToNeighbour(list);
      validateSel();
      markDirty();
      renderAll();
      toast(
        n ? `${n} ${n > 1 ? 'wanddelen staan' : 'wanddeel staat'} nu op Buurwoning.` : 'Er is niets veranderd.',
        !!n
      );
      break;
    }
    case 'addri': {
      if (!room) return;
      pushUndo();
      const raam = b.dataset.k === 'raam',
        wall = (P.constructions.find(c => c.kind === 'wand' && !c.inner) || {}).id || defaultCid('wand');
      room.roof.items = room.roof.items || [];
      const n = room.roof.items.filter(x => x.kind === (raam ? 'raam' : 'kapel')).length + 1;
      room.roof.items.push(
        raam
          ? { id: rid(), kind: 'raam', name: 'Dakraam ' + n, slope: 0, w: 0.78, h: 1.4, cid: defaultCid('raam') }
          : {
              id: rid(),
              kind: 'kapel',
              name: 'Dakkapel ' + n,
              slope: 0,
              w: 2.4,
              hf: 1.5,
              cidW: wall,
              cidR: room.roof.cid || defaultCid('dak'),
              winw: 1.8,
              winh: 1.0,
              wincid: defaultCid('raam')
            }
      );
      markDirty();
      renderAll();
      break;
    }
    case 'delri': {
      if (!room) return;
      pushUndo();
      room.roof.items = (room.roof.items || []).filter(x => x.id !== b.dataset.i);
      markDirty();
      renderAll();
      break;
    }
    case 'delhp':
      deleteSelection();
      break;
    case 'selpipe': {
      const pp = (P.pipes || []).find(x => x.id === b.dataset.p);
      if (!pp) return;
      curFloor = pp.floorId;
      sel = { t: 'pipe', p: pp.id };
      tab = 'sel';
      closeSchema();
      renderAll();
      break;
    }
    case 'schema':
      openSchema();
      break;
    case 'bgpick':
      $('bg-in').value = '';
      $('bg-in').click();
      break;
    case 'bgscale':
      setBgMode(bgMode === 'scale' ? null : 'scale');
      break;
    case 'bgmove':
      setBgMode(bgMode === 'move' ? null : 'move');
      break;
    case 'bgdel':
      removeBg();
      break;
    case 'report':
      openReport();
      break;
    case 'addfloor':
      addFloor();
      break;
    case 'addbelow':
      addBelow(b.dataset.k);
      break;
    case 'vvfill': {
      const r = getRoom(b.dataset.r);
      if (!r) return;
      const pts = insetPoly(r.pts, 0.1) || r.pts.map(p => ({ x: p.x, y: p.y }));
      pushUndo();
      r.emitters = r.emitters || [];
      const n = r.emitters.filter(x => x.kind === 'vv').length + 1;
      const em = {
        id: rid(),
        kind: 'vv',
        name: 'Vloerverwarming' + (n > 1 ? ' ' + n : ''),
        pts,
        spacing: 15,
        cover: 'tegels',
        p: 0,
        n: 1,
        pipe: { mat: 'pex', dn: '16' }
      };
      r.emitters.push(em);
      sel = { t: 'em', r: r.id, e: em.id };
      tab = 'sel';
      markDirty();
      renderAll();
      toast(
        `Vloerverwarming over de hele ${r.name} (10 cm van de wanden). Sleep de hoekpunten om de vorm aan te passen.`
      );
      break;
    }
    case 'delpipe': {
      pushUndo();
      P.pipes = P.pipes.filter(x => x.id !== sel.p);
      sel = null;
      markDirty();
      renderAll();
      toast('Leiding verwijderd.', true);
      break;
    }
    case 'autoall': {
      pushUndo();
      let n = 0;
      P.rooms.forEach(r =>
        ['floor', 'ceil'].forEach(k => {
          if (r[k] && r[k].adj !== 'auto') {
            r[k].adj = 'auto';
            n++;
          }
        })
      );
      markDirty();
      renderAll();
      toast(
        n ? `${n} vloeren en plafonds staan nu op automatisch.` : 'Alle vloeren en plafonds stonden al op automatisch.',
        !!n
      );
      break;
    }
    case 'floormove': {
      const i = floorIdx(b.dataset.f),
        j = i + +b.dataset.dir;
      if (i < 0 || j < 0 || j >= P.floors.length) return;
      pushUndo();
      [P.floors[i], P.floors[j]] = [P.floors[j], P.floors[i]];
      markDirty();
      renderAll();
      break;
    }
    case 'delfloor': {
      // remove a floor with everything on it: rooms, pipes, the heat pump; can be undone
      const fid = b.dataset.f,
        i = floorIdx(fid);
      if (i < 0 || P.floors.length < 2) return;
      const fl = P.floors[i],
        gone = new Set(P.rooms.filter(r => r.floorId === fid).map(r => r.id)),
        np = (P.pipes || []).filter(x => x.floorId === fid).length;
      pushUndo();
      P.rooms = P.rooms.filter(r => !gone.has(r.id));
      P.pipes = (P.pipes || []).filter(x => x.floorId !== fid);
      if (P.hpPos && P.hpPos.floorId === fid) P.hpPos = null;
      P.transfers = (P.transfers || []).filter(t => !gone.has(t.from) && !gone.has(t.to));
      P.floors.splice(i, 1);
      P.rooms.forEach(r => {
        if (gone.has(r.flowTo)) r.flowTo = '';
        if (gone.has(r.roofFrom)) r.roofFrom = '';
        // a stairwell or vide that ran up to this floor now stops one floor lower
        if (r.spanTo === fid) {
          const below = P.floors[i - 1];
          r.spanTo = below && below.id !== r.floorId ? below.id : null;
        }
      });
      if (curFloor === fid) curFloor = P.floors[Math.max(0, i - 1)].id;
      if (sel && !getRoom(sel.r) && sel.t !== 'hp' && sel.t !== 'pipe') sel = null;
      validateSel();
      markDirty();
      renderAll();
      toast(
        `${fl.name} verwijderd${gone.size || np ? ` met ${[gone.size ? gone.size + (gone.size === 1 ? ' ruimte' : ' ruimtes') : '', np ? np + (np === 1 ? ' leiding' : ' leidingen') : ''].filter(Boolean).join(' en ')}` : ''}.`,
        true
      );
      break;
    }
    case 'delroom':
      deleteSelection();
      break;
    case 'gocon':
      tab = 'con';
      conFocus = b.dataset.c || null;
      renderPanel();
      break;
    case 'addcut': {
      const inp = $('f-newcut');
      const n = num(inp && inp.value !== '' ? inp.value : inp && inp.placeholder);
      if (n == null || !room) return;
      addCut(room, sel.w, n);
      break;
    }
    case 'splitmid': {
      if (!room) return;
      const bb = bounds(room, sel.w);
      addCut(room, sel.w, r3((bb[sel.s] + bb[sel.s + 1]) / 2));
      break;
    }
    case 'delcut':
      if (room) removeCut(room, sel.w, +b.dataset.c);
      break;
    case 'addop': {
      const sg = selSeg();
      if (!sg) return;
      pushUndo();
      const o = opening('Raam ' + (sg.openings.length + 1), 1.2, 1.4, defaultCid('raam'));
      sg.openings.push(o);
      const m = mirrorPartner(room, sel.w, sel.s);
      if (m) {
        o.name = 'Binnendeur ' + sg.openings.length;
        o.w = 0.9;
        o.h = 2.1;
        o.lk = rid();
        o.cid = (P.constructions.find(c => c.kind === 'raam' && c.inner) || {}).id || o.cid;
        m.o.walls[m.k].segs[m.jj].openings.push({ ...o, id: rid() });
      }
      markDirty();
      renderAll();
      break;
    }
    case 'delop': {
      const sg = selSeg();
      if (!sg) return;
      pushUndo();
      const o = sg.openings.find(x => x.id === b.dataset.o);
      sg.openings = sg.openings.filter(x => x.id !== b.dataset.o);
      if (o && o.lk)
        P.rooms.forEach(r =>
          r.walls.forEach(w =>
            w.segs.forEach(s2 => {
              s2.openings = s2.openings.filter(x => x.lk !== o.lk);
            })
          )
        );
      markDirty();
      renderAll();
      break;
    }
    case 'syncseg': {
      const sg = selSeg();
      if (!sg) return;
      pushUndo();
      isolatePartners(room, sel.w, sel.s).forEach(p => (p.o.walls[p.k].segs[p.jj].cid = sg.cid));
      markDirty();
      renderAll();
      toast('Constructie overgenomen in de aangrenzende ruimte.');
      break;
    }
    case 'alignseg': {
      const sg = selSeg();
      if (!sg) return;
      pushUndo();
      const ps = partnersOf(room, sel.w, sel.s);
      const t0 = ps.length ? ps[0].t0 : 0,
        t1 = ps.length ? ps[0].t1 : 0;
      ps.forEach(p => {
        cutAt(room, sel.w, p.t0);
        cutAt(room, sel.w, p.t1);
      });
      const bb = bounds(room, sel.w),
        mid = (t0 + t1) / 2;
      let jj = 0;
      while (jj < bb.length - 2 && mid > bb[jj + 1]) jj++;
      sel.s = jj;
      isolatePartners(room, sel.w, sel.s).forEach(
        p => (p.o.walls[p.k].segs[p.jj].cid = room.walls[sel.w].segs[sel.s].cid)
      );
      markDirty();
      renderAll();
      toast('Wand gesplitst op de grens met de aangrenzende ruimte.');
      break;
    }
    case 'addcon': {
      pushUndo();
      const k = b.dataset.kind;
      const c = {
        id: rid(),
        name: 'Nieuwe ' + KINDS[k].toLowerCase(),
        kind: k,
        U: k === 'raam' ? 1.8 : 0.25,
        color: PALETTE[P.constructions.length % PALETTE.length],
        mode: k === 'raam' ? 'U' : 'lagen',
        inner: false,
        layers: []
      };
      P.constructions.push(c);
      conFocus = c.id;
      markDirty();
      renderAll();
      setTimeout(() => {
        const el = $('f-con-' + c.id + '-n');
        if (el) {
          el.focus();
          el.select();
        }
      }, 0);
      break;
    }
    case 'dupcon': {
      const src = conById(b.dataset.c);
      if (!src) return;
      pushUndo();
      const c = clone(src);
      c.id = rid();
      c.name = src.name + ' (kopie)';
      c.color = PALETTE[P.constructions.length % PALETTE.length];
      c.layers.forEach(l => (l.id = rid()));
      P.constructions.push(c);
      conFocus = c.id;
      markDirty();
      renderAll();
      break;
    }
    case 'togglecon':
      conOpen = conOpen === b.dataset.c ? null : b.dataset.c;
      renderPanel();
      break;
    case 'addlayer': {
      const c = conById(b.dataset.c);
      if (!c) return;
      pushUndo();
      const def =
        P.materials.find(m => m.id === 'm-glaswol') || P.materials.find(m => m.type === 'lambda') || P.materials[0];
      c.layers.push({ id: rid(), mid: def ? def.id : '', d: 100, vent: 'niet', mix: null });
      syncU(c);
      markDirty();
      renderAll();
      break;
    }
    case 'laydel':
    case 'laymove':
    case 'addmix':
    case 'delmix': {
      const c = conById(b.dataset.c);
      const i = c ? c.layers.findIndex(l => l.id === b.dataset.l) : -1;
      if (i < 0) return;
      pushUndo();
      const l = c.layers[i];
      if (a === 'laydel') c.layers.splice(i, 1);
      else if (a === 'laymove') {
        const j = i + +b.dataset.dir;
        if (j < 0 || j >= c.layers.length) return;
        [c.layers[i], c.layers[j]] = [c.layers[j], c.layers[i]];
      } else if (a === 'addmix') {
        const mm = P.materials.find(m => m.id === 'm-hout') || P.materials.find(m => m.type === 'lambda');
        l.mix = { mid: mm ? mm.id : '', pct: 12 };
      } else l.mix = null;
      syncU(c);
      markDirty();
      renderAll();
      break;
    }
    case 'addmat': {
      pushUndo();
      const m = { id: rid(), name: 'Nieuw materiaal', type: 'lambda', lambda: 0.04, R: 0, color: '#BBBBBB' };
      P.materials.push(m);
      markDirty();
      renderAll();
      setTimeout(() => {
        const el = $('f-mat-' + m.id + '-n');
        if (el) {
          el.focus();
          el.select();
        }
      }, 0);
      break;
    }
    case 'delmat': {
      pushUndo();
      P.materials = P.materials.filter(m => m.id !== b.dataset.m);
      markDirty();
      renderAll();
      break;
    }
    case 'delcon': {
      pushUndo();
      P.constructions = P.constructions.filter(c => c.id !== b.dataset.c);
      markDirty();
      renderAll();
      break;
    }
    case 'csv':
      exportCsv();
      break;
    case 'newproj': {
      const p = emptyProject('Nieuw project');
      all[p.id] = p;
      openProject(p.id);
      tab = 'set';
      renderAll();
      toast('Leeg project aangemaakt. De constructies van het voorbeeld zijn meegekopieerd.');
      markDirty();
      break;
    }
    case 'dupproj': {
      const p = clone(P);
      p.id = 'p' + rid();
      p.name = P.name + ' (kopie)';
      p.example = false;
      all[p.id] = p;
      openProject(p.id);
      markDirty();
      renderAll();
      toast('Kopie gemaakt.');
      break;
    }
    case 'openproj':
      openProject(b.dataset.p);
      renderAll();
      break;
    case 'delproj':
      confirmDel = true;
      renderPanel();
      break;
    case 'delproj-no':
      confirmDel = false;
      renderPanel();
      break;
    case 'delproj-yes': {
      confirmDel = false;
      const id = P.id;
      delete all[id];
      removeRemote(id);
      const next = Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      openProject(next.id);
      saveLocal();
      renderAll();
      toast('Project verwijderd.');
      break;
    }
    case 'import':
      $('file-in').click();
      break;
    case 'export':
      exportJson();
      break;
    case 'export-hljs':
      exportHeatlossjs();
      break;
    case 'advrules':
      advRulesOpen = !advRulesOpen;
      renderPanel();
      break;
    case 'hpsel':
      hpSel = b.dataset.h;
      renderPanel();
      break;
    case 'hpexport':
      saveFile(
        'warmtepompen.json',
        JSON.stringify(
          {
            versie: 1,
            toelichting:
              "Per warmtepomp: minimaal en maximaal verwarmingsvermogen (kW) bij een buitentemperatuur (°C), bij de aanvoertemperatuur in 'aanvoer'. Minimaal twee punten, bij voorkeur -10 en +7 of +10 °C. Kopieer een blok om er een toe te voegen.",
            warmtepompen: hpList || []
          },
          null,
          2
        )
      );
      break;
    case 'hpimport':
      $('file-in').click();
      break;
    case 'hpreset': {
      try {
        localStorage.removeItem(HP_LS);
      } catch (_) {}
      if (storeMode === 'db') {
        db.collection('data/users/' + uid)
          .doc('hplist')
          .delete()
          .catch(() => {});
      }
      hpList = null;
      hpErr = '';
      loadHpList();
      toast('Standaardlijst met warmtepompen teruggezet.');
      break;
    }
  }
}
$('proj-sel').onchange = e => {
  openProject(e.target.value);
  renderAll();
};
function openProject(id) {
  if (!all[id]) return;
  P = normalizeProject(all[id]);
  all[id] = P;
  sel = null;
  curFloor = null;
  undoStack = [];
  redoStack = [];
  drawPts = [];
  try {
    localStorage.setItem(LS_LAST, id);
  } catch (_) {}
  requestAnimationFrame(fit);
}

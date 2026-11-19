// Jaarverbruik en kosten: hoeveel warmte het huis per jaar vraagt, hoeveel stroom de gekozen warmtepomp daarvoor
// gebruikt en wat dat kost tegenover een cv-ketel op gas.
'use strict';
/* Bin-methode: voor elke buitentemperatuur (per graad) het aantal uren per jaar uit data/klimaat.json.
   - Warmtevraag bij temperatuur t: het warmteverlies (de lijn van de warmtepompkeuze, met de aangevinkte
     verbeteradviezen) min de interne en zonnewinst. Die winst stellen we gelijk aan het verlies bij de stookgrens:
     boven de stookgrens is er geen warmte nodig.
   - Aanvoertemperatuur bij t: de berekende stooklijn.
   - COP bij t: uit het temperatuurverschil tussen aanvoer en buitenlucht, met de gemiddelde lijn voor lucht/water-
     warmtepompen van Staffell e.a. (2012): COP = 6,08 − 0,09·ΔT + 0,0005·ΔT² (inclusief ontdooien). Heeft de warmtepomp
     in data/warmtepompen.json eigen 'cop'-punten, dan schaalt de app die lijn naar die punten.
   - Wat boven het maximale vermogen uitkomt, levert een elektrisch element (COP 1). Ligt de vraag onder het minimale
     vermogen, dan pendelt de warmtepomp; dat kost ongeveer 10% rendement.
   - Warm tapwater (als de warmtepomp dat maakt): de warmte per bewoner plus het stilstandsverlies van de boiler, gelijk
     verdeeld over alle uren van het jaar, met een COP uit boilertemperatuur + 5 K tegen de buitenlucht. Terwijl hij
     tapwater maakt, verwarmt hij niet: voor verwarming is zijn maximum dus (24 − uren tapwater) / 24 van de opgave.
     Bij gas rekent de app met een combiketel (geen boiler, wel een lager rendement voor tapwater). */
const GAS_KWH = 9.77; // kWh per m³ aardgas (bovenwaarde, 35,17 MJ/m³)
const CYCLE_LOSS = 0.9;
const copLift = dT => Math.max(1.5, 6.08 - 0.09 * dT + 0.0005 * dT * dT);

// scale factor from the heat pump's own COP points (cop: [{buiten, aanvoer, cop}]), else 1
function copFactor(h) {
  const pts = Array.isArray(h && h.cop)
    ? h.cop.filter(p => +p.cop > 0 && Number.isFinite(+p.buiten) && Number.isFinite(+p.aanvoer))
    : [];
  if (!pts.length) return { f: 1, own: false };
  return { f: pts.reduce((a, p) => a + +p.cop / copLift(+p.aanvoer - +p.buiten), 0) / pts.length, own: true };
}

// supply temperature at an outdoor temperature, from the calculated heating curve
function supplyFn() {
  const pts = heatingCurve().pts.filter(p => p.ts != null);
  const S = P.settings;
  if (!pts.length) {
    // no emitters drawn: straight from the design supply temperature at θe to 20 °C at the heating limit
    return t => 20 + (S.twSup - 20) * Math.max(0, Math.min(1, (S.stook - t) / (S.stook - S.te || 1)));
  }
  return t => {
    if (t <= pts[0].t) return pts[0].ts;
    const last = pts[pts.length - 1];
    if (t >= last.t) return last.ts;
    const i = pts.findIndex(p => p.t >= t);
    const a = pts[i - 1],
      b = pts[i];
    return a.ts + ((b.ts - a.ts) * (t - a.t)) / (b.t - a.t || 1);
  };
}

// standby loss of the tank in kWh per day: the label value (W at 65 °C, room 20 °C) scaled to the tank temperature
function boilerLossDay() {
  const S = P.settings;
  return (Math.max(0, +S.dhwLossW || 0) * 24 * Math.max(0, S.dhwTemp - 20)) / BOILER_LABEL_DT / 1000;
}
function annualCalc(c, hp) {
  const S = P.settings,
    L = lossLine(c, adviceSaving(c)),
    gain = L.at(S.stook),
    ts = supplyFn(),
    cf = copFactor(hp),
    avail = 1 / dhwFactor(hp || null); // share of the hours left for space heating
  const R = {
    heat: 0,
    el: 0,
    backup: 0,
    backupCold: 0, // the part in the hours colder than the design temperature θe: expected, not a sign of a too small heat pump
    coldHours: 0,
    hpHeat: 0,
    hours: 0,
    cycHours: 0,
    tsW: 0, // supply temperature × heat, for the weighted average
    groups: [],
    cf,
    stook: S.stook,
    gain
  };
  const edges = [-Infinity, -5, 0, 5, 10, Infinity];
  const G = edges.slice(1).map((hi, i) => ({ lo: edges[i], hi, hours: 0, heat: 0, el: 0 }));
  Object.entries(CLIMATE.uren || {}).forEach(([k, hours]) => {
    const t = +k;
    const q = Math.max(0, L.at(t) - gain); // kW
    if (q <= 0 || !(hours > 0)) return;
    const heat = q * hours;
    let el = 0; // without a heat pump: no electricity
    if (hp) {
      const max = hpAt(hp, t, 'max') * avail,
        min = hpAt(hp, t, 'min');
      const byHp = Math.min(q, max),
        backup = q - byHp;
      let cop = copLift(ts(t) - t) * cf.f;
      if (q < min) {
        cop *= CYCLE_LOSS;
        R.cycHours += hours;
      }
      el = (byHp / cop + backup) * hours;
      R.backup += backup * hours;
      if (t < S.te) {
        R.backupCold += backup * hours;
        R.coldHours += hours;
      }
      R.hpHeat += byHp * hours;
    }
    R.heat += heat;
    R.tsW += ts(t) * heat;
    R.el += el;
    R.hours += hours;
    const g = G.find(g => t >= g.lo && t < g.hi);
    g.hours += hours;
    g.heat += heat;
    g.el += el;
  });
  R.groups = G.filter(g => g.hours > 0);
  R.scop = R.el > 0 ? R.heat / R.el : null;
  R.tsAvg = R.heat > 0 ? R.tsW / R.heat : null;
  R.atMax = R.heat > 0 && ts(S.te) >= Math.max(30, +S.tMax || 55) - 0.05;
  R.gasHeat = R.heat / (GAS_KWH * S.etaGas);
  // domestic hot water
  R.dhw = !!S.dhwOn;
  R.dhwUse = R.dhw ? Math.max(0, S.dhwPers) * Math.max(0, S.dhwKwh) : 0; // kWh heat at the tap
  R.dhwLossDay = boilerLossDay(); // kWh per day at the tank temperature
  R.dhwHeat = R.dhw ? R.dhwUse + R.dhwLossDay * 365 : 0; // plus the standby loss of the tank
  R.dhwEl = 0;
  if (R.dhw && hp && R.dhwHeat > 0) {
    const all = Object.entries(CLIMATE.uren || {}),
      tot = all.reduce((a, [, h]) => a + h, 0) || 8760;
    all.forEach(([k, hours]) => {
      R.dhwEl += (R.dhwHeat * hours) / tot / (copLift(S.dhwTemp + 5 - +k) * cf.f);
    });
  }
  R.dhwCop = R.dhwEl > 0 ? R.dhwHeat / R.dhwEl : null;
  R.dhwGas = R.dhw ? R.dhwUse / (GAS_KWH * Math.max(0.3, S.etaTap)) : 0;
  R.elHeat = R.el;
  R.el += R.dhwEl;
  R.gas = R.gasHeat + R.dhwGas;
  R.costHp = R.el * priceEl();
  R.costGas = R.gas * priceGas() + S.gasFix;
  return R;
}

// choice of the gas network operator (data/netbeheer.json); fills in the fixed costs of the gas connection
function gridField(S) {
  const ops = Object.entries(GRID.gas || {});
  if (!ops.length) return '';
  return `<label class="f" for="f-s-gnet">Netbeheerder gas <span class="u">vult vaste kosten in</span><select class="in" id="f-s-gnet" data-f="set.gasNet"><option value="">Zelf invullen</option>${ops
    .map(
      ([k, g]) =>
        `<option value="${esc(k)}" ${S.gasNet === k ? 'selected' : ''}>${esc(g.naam)} (€ ${fmt(+g.perJaar, 0)})</option>`
    )
    .join('')}</select></label>`;
}

function annualHtml(c) {
  if (c.total <= 0 || !CLIMATE.uren || !Object.keys(CLIMATE.uren).length) return '';
  const S = P.settings,
    hp = curHp(c),
    R = annualCalc(c, hp),
    kwh = v => fmt(v, 0) + ' kWh';
  let h = `<div class="sec"><h3>Jaarverbruik</h3>
    <p class="note">Een schatting voor een gemiddeld jaar in De Bilt (KNMI, 2011–2025)${hp ? `, met de ${esc(hp.merk)} ${esc(hp.model)} die hierboven is gekozen` : ''}. ${S.dhwOn ? 'Verwarming en warm tapwater' : 'Alleen ruimteverwarming (warm tapwater staat uit)'}; nachtverlaging en je eigen stookgedrag zitten er niet in.</p>`;
  if (R.heat <= 0) return h + `<p class="note">Geen warmtevraag boven de stookgrens.</p></div>`;
  h += `<div class="kcard"><div class="kh"><span>Warmtevraag per jaar</span><b>${kwh(R.heat)}</b></div><span class="note">Voor verwarming. Zoveel warmte als ${fmt(R.gasHeat, 0)} m³ gas in een cv-ketel met ${fmt(S.etaGas * 100, 0)}% rendement.${R.dhw ? ` Daarbij komt ${kwh(R.dhwHeat)} voor warm tapwater (${fmt(S.dhwPers, 0)} ${+S.dhwPers === 1 ? 'bewoner' : 'bewoners'}, met het warmhoudverlies van de boiler).` : ''}</span></div>`;
  h += `<div class="tablewrap"><table class="calc"><tbody>`;
  if (hp) {
    h += `<tr><td>Stroom voor de warmtepomp${R.dhwEl > 0 ? `<small>verwarming ${kwh(R.elHeat)}, warm tapwater ${kwh(R.dhwEl)}</small>` : ''}</td><td>${kwh(R.el)}</td></tr>
      ${
        R.backup - R.backupCold > 0.5
          ? `<tr class="miss"><td>Waarvan elektrische bijverwarming<small>de warmtepomp is te klein op de koudste dagen</small></td><td>${kwh(R.backup)}</td></tr>`
          : R.backup > 0.5
            ? `<tr><td>Waarvan elektrische bijverwarming<small>alleen in de ${R.coldHours >= 0.5 ? `ongeveer ${fmt(R.coldHours, 0)} ` : 'enkele '}uur per jaar dat het kouder is dan ${fmtT(S.te)} (de ontwerptemperatuur)</small></td><td>${kwh(R.backup)}</td></tr>`
            : ''
      }
      <tr><td>Seizoensrendement verwarming (SCOP)<small>warmte gedeeld door stroom over het hele jaar</small></td><td>${fmt(R.scop, 1)}</td></tr>
      ${R.dhwCop ? `<tr><td>Rendement warm tapwater (COP)<small>boiler op ${nv(S.dhwTemp, 0)} °C, over het hele jaar</small></td><td>${fmt(R.dhwCop, 1)}</td></tr>` : ''}
      <tr><td>Gemiddelde aanvoertemperatuur<small>gewogen naar de geleverde warmte</small></td><td>${fmt(R.tsAvg, 0)} °C</td></tr>
      ${R.cycHours > 0 ? `<tr><td>Uren waarin hij pendelt<small>vraag onder het minimale vermogen</small></td><td>${fmt(R.cycHours, 0)} uur</td></tr>` : ''}`;
  }
  h += `<tr><td>Gas bij een cv-ketel<small>ter vergelijking${R.dhwGas > 0 ? `, waarvan ${fmt(R.dhwGas, 0)} m³ voor tapwater met een combiketel` : ''}</small></td><td>${fmt(R.gas, 0)} m³</td></tr>`;
  h += `</tbody></table></div>`;
  if (!hp) h += `<p class="note">Kies hierboven een warmtepomp om het stroomverbruik te zien.</p>`;
  if (hp && R.atMax)
    h += `<div class="warnbox">De stooklijn staat bij de koudste dagen op het maximum van ${nv(S.tMax, 0)} °C, omdat de afgifte in een of meer ruimtes te klein is (zie de stooklijn hierboven). Een hoge aanvoertemperatuur kost rendement: meer of grotere radiatoren verlagen de stooklijn en de stroomrekening.</div>`;
  if (hp && R.groups.length) {
    h += `<div class="tablewrap"><table class="calc"><thead><tr><th>Buiten</th><th>Uren</th><th>Warmte</th><th>COP</th><th>Stroom</th></tr></thead><tbody>${R.groups
      .map(
        g =>
          `<tr><td>${g.lo === -Infinity ? `onder ${fmtT(g.hi)}` : g.hi === Infinity ? `vanaf ${fmtT(g.lo)}` : `${fmtT(g.lo)} tot ${fmtT(g.hi)}`}</td><td>${fmt(g.hours, 0)}</td><td>${fmt(g.heat, 0)} kWh</td><td>${g.el > 0 ? fmt(g.heat / g.el, 1) : '–'}</td><td>${fmt(g.el, 0)} kWh</td></tr>`
      )
      .join('')}</tbody></table></div>`;
  }
  h += `<div class="fields">${numField('f-s-stook', 'set.stook', 'Stookgrens', '°C buiten', S.stook, 1)}</div>
    <p class="note">De stookgrens is de buitentemperatuur waarboven je huis geen verwarming meer nodig heeft door warmte van mensen, apparaten en zon: in een goed geïsoleerd huis lager (13–15 °C), in een oud huis hoger (16–18 °C). Wat dit verbruik kost, staat onder <button class="crumb" data-act="gotab" data-tab="kost">Kosten</button>.</p>
    <p class="note">De COP volgt uit het verschil tussen de aanvoertemperatuur van de stooklijn hierboven en de buitenlucht${R.cf.own ? `, geschaald naar de opgegeven COP-waarden van deze warmtepomp (factor ${fmt(R.cf.f, 2)})` : ', met een gemiddelde lijn voor lucht/water-warmtepompen. Staan er COP-waarden van de fabrikant bij de warmtepomp in de lijst, dan rekent de app daarmee'}. Een lagere stooklijn geeft een hogere COP.</p></div>`;
  return h;
}

// tab Kosten: what the annual use costs with the heat pump and with gas, and the prices
// the cost table: heat pump against gas (also in the report)
function costTableHtml(c, rep) {
  const S = P.settings,
    hp = curHp(c),
    ok = c.total > 0 && CLIMATE.uren && Object.keys(CLIMATE.uren).length,
    R = ok ? annualCalc(c, hp) : null,
    eur = v => '€ ' + fmt(v, 0);
  let h = '';
  if (!R || R.heat <= 0)
    h += `<p class="note">Teken eerst ruimtes; de kosten volgen uit het jaarverbruik onder <button class="crumb" data-act="gotab" data-tab="wp">Warmtepomp</button>.</p>`;
  else {
    if (!rep)
      h += `<p class="note">Voor een gemiddeld jaar, met het verbruik onder <button class="crumb" data-act="gotab" data-tab="wp">Warmtepomp</button>${hp ? ` (${esc(hp.merk)} ${esc(hp.model)})` : ''}.</p>`;
    h += `<div class="tablewrap"><table class="calc"><tbody>`;
    if (hp)
      h += `<tr><td>Warmtepomp<small>${fmt(R.el, 0)} kWh stroom × € ${fmt(priceEl(), 3)}</small></td><td>${eur(R.costHp)}</td></tr>`;
    h += `<tr><td>Gas met een cv-ketel<small>${fmt(R.gas, 0)} m³ × € ${fmt(priceGas(), 3)}${S.gasFix > 0 ? ` + ${eur(S.gasFix)} vaste kosten` : ''}</small></td><td>${eur(R.costGas)}</td></tr>`;
    if (hp)
      h += `<tr class="sum"><td>${R.costGas >= R.costHp ? 'Goedkoper met de warmtepomp' : 'Duurder met de warmtepomp'}</td><td>${eur(Math.abs(R.costGas - R.costHp))} per jaar</td></tr>`;
    h += `</tbody></table></div>`;
    if (!hp)
      h += `<p class="note">Kies onder <button class="crumb" data-act="gotab" data-tab="wp">Warmtepomp</button> een warmtepomp om de kosten met de warmtepomp te zien.</p>`;
  }
  return h;
}
function costHtml(c) {
  const S = P.settings;
  return `<div class="sec"><h3>Kosten per jaar</h3>${costTableHtml(c)}</div><div class="sec"><h3>Prijzen</h3><div class="fields">
      ${numField('f-s-pel', 'set.pEl', 'Stroomprijs', S.pEl != null ? '€ per kWh, eigen prijs' : '€ per kWh, gemiddeld', priceEl(), 3)}
      ${numField('f-s-pgas', 'set.pGas', 'Gasprijs', S.pGas != null ? '€ per m³, eigen prijs' : '€ per m³, gemiddeld', priceGas(), 3)}
    </div>
    <p class="note">${
      S.pEl == null && S.pGas == null
        ? `De stroom- en gasprijs zijn het gemiddelde van het CBS${PRICES.maandNaam ? ` over ${esc(PRICES.maandNaam)}` : ''}: het leveringstarief van een vast of variabel contract plus energiebelasting, inclusief btw. De app werkt ze elke maand bij. Vul de prijzen van je eigen contract in als je die weet (inclusief belastingen); leeg maken zet het gemiddelde terug.`
        : `${S.pEl != null ? 'De stroomprijs' : ''}${S.pEl != null && S.pGas != null ? ' en de gasprijs zijn' : S.pEl != null ? ' is' : 'De gasprijs is'} je eigen prijs. Het gemiddelde van het CBS${PRICES.maandNaam ? ` over ${esc(PRICES.maandNaam)}` : ''} is € ${fmt(PRICES.stroom, 3)} per kWh en € ${fmt(PRICES.gas, 3)} per m³. <button class="crumb" data-act="pricesavg">Actuele prijzen gebruiken</button>`
    }</p></div>
    <div class="sec"><h3>Vergelijking met gas</h3><div class="fields">
      ${gridField(S)}
      ${numField('f-s-gfix', 'set.gasFix', 'Vaste kosten gas', '€ per jaar', S.gasFix, 2)}
      ${numField('f-s-eta', 'set.etaGas', 'Rendement cv-ketel', '0 tot 1', S.etaGas, 2)}
      ${S.dhwOn ? numField('f-s-etat', 'set.etaTap', 'Tapwater met een combiketel', 'rendement 0 tot 1', S.etaTap, 2) : ''}
    </div>
    <p class="note">Bij <i>Vaste kosten gas</i> vul je in wat je bespaart als de gasaansluiting eruit gaat. Kies je je netbeheerder, dan vult de app de netbeheerkosten voor gas${GRID.jaar ? ` van ${GRID.jaar}` : ''} in (gewone huisaansluiting, 500 tot 4.000 m³ per jaar, inclusief btw). Tel daar de vaste leveringskosten van je energieleverancier bij op: die vervallen ook. Beide staan op je energierekening. Met gas rekent de app met een combiketel voor het tapwater; die heeft geen boiler, maar wel een lager rendement voor tapwater dan voor verwarming.</p></div>`;
}

// settings for domestic hot water (tab Warmtepomp): the heat pump's pause while it heats the tank, and the annual energy
function dhwHtml() {
  const S = P.settings,
    hp = curHp(),
    hrs = dhwHoursOn(hp),
    pct = (dhwFactor(hp) - 1) * 100,
    full = (Math.max(0, +S.dhwVol || 0) * 1.163 * Math.max(0, S.dhwTemp - 10)) / 1000, // kWh: the whole tank from 10 °C
    pw = dhwPower(hp);
  let h = `<div class="sec"><h3>Warm tapwater</h3>
    <label class="chk"><input type="checkbox" id="f-s-dhw" data-f="set.dhwOn" ${S.dhwOn ? 'checked' : ''}> De warmtepomp maakt ook het warme tapwater (met een boiler)</label>`;
  if (!S.dhwOn)
    return (
      h +
      `<p class="note">Uit: bijvoorbeeld bij een hybride warmtepomp, waarbij de cv-ketel het tapwater maakt, of bij een losse elektrische boiler. De warmtepompkeuze en het jaarverbruik rekenen dan alleen met verwarming.</p></div>`
    );
  return (
    h +
    `<div class="fields">
      ${numField('f-s-dhwp', 'set.dhwPers', 'Bewoners', 'personen', S.dhwPers, 0)}
      ${numField('f-s-dhwk', 'set.dhwKwh', 'Warmte per bewoner', 'kWh per jaar', S.dhwKwh, 0)}
      ${numField('f-s-dhwh', 'set.dhwHours', 'Tapwater op een koude dag', S.dhwHours != null ? 'uur per dag, eigen waarde' : 'uur per dag, berekend', hrs, 1)}
      ${numField('f-s-dhwv', 'set.dhwVol', 'Inhoud boiler', 'liter', S.dhwVol, 0)}
      ${numField('f-s-dhwt', 'set.dhwTemp', 'Boilertemperatuur', '°C', S.dhwTemp, 0)}
      ${numField('f-s-dhwl', 'set.dhwLossW', 'Warmhoudverlies boiler', 'W, zoals op het label', S.dhwLossW, 0)}
    </div>
    <p class="note">Terwijl de warmtepomp de boiler opwarmt, verwarmt hij het huis niet. ${
      S.dhwHours != null
        ? `Je rekent met ${nv(hrs, 1)} uur per dag op een koude dag; maak het vakje leeg om het te laten berekenen.`
        : pw > 0
          ? `Per dag is ${fmt(dhwDayKwh(), 1)} kWh warmte nodig voor tapwater (bewoners plus warmhoudverlies). De ${esc(hp.model)} levert bij ${nv(S.te, 0)} °C buiten voor tapwater ongeveer ${fmt(pw, 1)} kW${Array.isArray(hp.punten55) && hp.punten55.length >= 2 ? ' (opgave bij 55 °C aanvoer)' : ' (80% van zijn vermogen, omdat hij voor de boiler warmer water maakt)'}: dat is ${nv(hrs, 1)} uur per dag. De hele boiler van ${fmt(S.dhwVol, 0)} liter opwarmen van 10 naar ${nv(S.dhwTemp, 0)} °C (${fmt(full, 1)} kWh) duurt ${fmt((full / pw) * 60, 0)} minuten. De spiraal in de boiler kan het langzamer maken; die rekent de app niet mee. Vul zelf een aantal uren in als je dat weet.`
          : `Kies een warmtepomp, dan rekent de app uit hoe lang hij per dag tapwater maakt. Tot die tijd geldt ${nv(hrs, 1)} uur.`
    } In de overige uren moet hij dat inhalen: met ${nv(hrs, 1)} uur per dag is ${fmt(pct, 0)}% meer vermogen nodig. Daarmee rekenen de warmtepompkeuze hieronder en het jaarverbruik.</p>
    <p class="note">Voor het jaarverbruik telt de warmte voor tapwater (gemiddeld zo'n 800 kWh per bewoner per jaar, met het leidingverlies) plus het warmhoudverlies van de boiler. Dat staat in watt op het energielabel of in de datasheet (een boiler van 200 liter zit meestal tussen 35 en 70 W). Die waarde is gemeten met de boiler op 65 °C; op ${nv(S.dhwTemp, 0)} °C verliest hij ${fmtW((boilerLossDay() * 1000) / 24)} W, ${fmt(boilerLossDay(), 2)} kWh per dag. De COP volgt uit de boilertemperatuur: hoe warmer de boiler, hoe lager.</p></div>`
  );
}

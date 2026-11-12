// Onderlegger: een afbeelding (bijvoorbeeld een bouwtekening) onder de plattegrond van een verdieping, om over te tekenen.
// Per verdieping: floor.bg = { img, x, y, w, h, op } in meters en een dekking 0–1. De afbeelding zelf staat in P.images[img]
// (data-URL), zodat de stappen voor ongedaan maken hem niet telkens meekopiëren.
'use strict';
const BG_MAX_PX = 2000; // longest side after downscaling
let bgMode = null, // 'move' | 'scale'
  bgPts = [];

const floorBg = f => (f && f.bg && P.images && P.images[f.bg.img] ? f.bg : null);
const curBg = () => floorBg(P.floors.find(f => f.id === curFloor));

function bgSvg() {
  const bg = curBg();
  if (!bg || !layerOn('bg')) return '';
  const a = S({ x: bg.x, y: bg.y });
  let s = `<image href="${P.images[bg.img]}" x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${(bg.w * view.s).toFixed(1)}" height="${(bg.h * view.s).toFixed(1)}" opacity="${bg.op}" preserveAspectRatio="none" pointer-events="none"/>`;
  if (bgMode === 'move')
    s += `<rect x="${a.x}" y="${a.y}" width="${bg.w * view.s}" height="${bg.h * view.s}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="8 5" pointer-events="none"/>`;
  return s;
}
// the measuring line while setting the scale
function bgScaleSvg() {
  if (bgMode !== 'scale' || !bgPts.length) return '';
  const q = bgPts.map(S),
    end = q[1] || (cursorW ? S(cursorW) : q[0]);
  return `<line x1="${q[0].x}" y1="${q[0].y}" x2="${end.x}" y2="${end.y}" stroke="var(--heat)" stroke-width="2" pointer-events="none"/>${q
    .map(
      p =>
        `<circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--surface)" stroke="var(--heat)" stroke-width="2" pointer-events="none"/>`
    )
    .join('')}`;
}

function setBgMode(m) {
  bgMode = m;
  bgPts = [];
  if (m) setTool('select');
  $('hint').textContent =
    m === 'move'
      ? 'Sleep de afbeelding naar de goede plek. Esc of Klaar als je klaar bent.'
      : m === 'scale'
        ? 'Klik twee punten op de afbeelding waarvan je de afstand weet, bijvoorbeeld de uiteinden van een maatlijn of een gevel. Esc annuleert.'
        : HINTS[tool];
  stage.classList.toggle('bgedit', !!m);
  renderCanvas();
  renderPanel();
}

// read an image file, scale it down and place it on the current floor (10 m wide, at the top left of the view)
function loadBgFile(file) {
  if (!file || !/^image\//.test(file.type)) {
    toast(
      'Kies een afbeelding (jpg, png of webp). Een pdf kun je eerst als afbeelding opslaan of er een schermafbeelding van maken.'
    );
    return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, BG_MAX_PX / Math.max(im.width, im.height)),
        cv = document.createElement('canvas');
      cv.width = Math.round(im.width * k);
      cv.height = Math.round(im.height * k);
      const g = cv.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(im, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/jpeg', 0.8);
      pushUndo();
      const f = P.floors.find(x => x.id === curFloor),
        id = 'img' + rid();
      P.images = P.images || {};
      P.images[id] = url;
      const w = 10,
        tl = { x: -view.tx / view.s + 1, y: -view.ty / view.s + 1 };
      f.bg = { img: id, x: r3(tl.x), y: r3(tl.y), w, h: r3((w * cv.height) / cv.width), op: 0.5 };
      track('onderlegger');
      if (!layerOn('bg')) setLayer('bg', true);
      if (tab === 'set') renderPanel();
      markDirty();
      setBgMode('scale');
      toast(
        `Afbeelding geplaatst (${fmtW(url.length / 1365)} kB). Klik nu twee punten met een bekende afstand om de schaal in te stellen.`
      );
    };
    im.onerror = () => toast('Deze afbeelding kon niet worden gelezen.');
    im.src = rd.result;
  };
  rd.readAsDataURL(file);
}

function removeBg() {
  const f = P.floors.find(x => x.id === curFloor);
  if (!f || !f.bg) return;
  pushUndo();
  delete f.bg; // the image itself stays until the project is opened again, so undo can bring it back
  bgMode = null;
  markDirty();
  renderAll();
}

// pointer handling while moving the image or setting its scale; returns true when handled
function bgPointerDown(e, wp) {
  if (!bgMode) return false;
  const bg = curBg();
  if (!bg) {
    setBgMode(null);
    return false;
  }
  if (bgMode === 'move') {
    pushUndo();
    drag = { type: 'bgmove', p0: wp, x0: bg.x, y0: bg.y, moved: false };
    capture(e);
    return true;
  }
  bgPts.push(wp);
  if (bgPts.length === 2) askBgDistance();
  renderCanvas();
  return true;
}
function bgPointerMove(wp) {
  if (drag && drag.type === 'bgmove') {
    const bg = curBg();
    bg.x = r3(drag.x0 + wp.x - drag.p0.x);
    bg.y = r3(drag.y0 + wp.y - drag.p0.y);
    drag.moved = true;
    renderCanvas();
    return true;
  }
  if (bgMode === 'scale' && bgPts.length === 1) {
    renderCanvas();
    return false;
  }
  return false;
}
function askBgDistance() {
  const d = dist(bgPts[0], bgPts[1]);
  if (d < 1e-6) {
    bgPts = [];
    return;
  }
  const box = $('ask');
  box.innerHTML = `<b>Schaal instellen</b>
    <p>De lijn is nu ${fmt(d, 2)} m lang in de tekening. Hoe lang is hij in werkelijkheid?</p>
    <label class="f" for="ask-dist">Werkelijke afstand <span class="u">m</span><input class="in num" id="ask-dist" inputmode="decimal" value="${nv(d, 2)}"></label>
    <div class="row"><button class="btn primary" id="ask-ok">Schaal toepassen</button><button class="btn" id="ask-no">Annuleren</button></div>`;
  box.hidden = false;
  const ok = () => {
    const v = num($('ask-dist').value);
    closeAsk();
    if (!(v > 0)) {
      setBgMode(null);
      return;
    }
    // scale around the first point, so that point stays where it is
    const bg = curBg(),
      k = v / d,
      p = bgPts[0];
    pushUndo();
    bg.x = r3(p.x + (bg.x - p.x) * k);
    bg.y = r3(p.y + (bg.y - p.y) * k);
    bg.w = r3(bg.w * k);
    bg.h = r3(bg.h * k);
    markDirty();
    setBgMode(null);
    toast(
      `Schaal ingesteld: de afbeelding is nu ${fmt(bg.w, 2)} × ${fmt(bg.h, 2)} m. Met Verplaatsen leg je hem op de goede plek.`
    );
  };
  $('ask-ok').onclick = ok;
  $('ask-no').onclick = () => {
    closeAsk();
    setBgMode(null);
  };
  box.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ok();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeAsk();
      setBgMode(null);
    }
  };
  const inp = $('ask-dist');
  inp.focus();
  inp.select();
}

// panel section in Project, for the current floor
function bgPanelHtml() {
  const f = P.floors.find(x => x.id === curFloor),
    bg = floorBg(f);
  let h = `<div class="sec"><h3>Onderlegger: ${esc(f.name)}</h3>
    <p class="note">Leg een afbeelding van een bouwtekening of plattegrond onder deze verdieping en teken de ruimtes erop na. Stel eerst de schaal in met twee punten waarvan je de afstand weet, en verplaats hem daarna naar de goede plek. Je kunt een afbeelding ook op de tekening slepen of plakken (Ctrl/Cmd+V), bijvoorbeeld een schermafbeelding. Een nieuwe afbeelding vervangt de huidige.</p>
    <div class="row"><button class="btn small" data-act="bgpick">${bg ? 'Andere afbeelding' : 'Afbeelding kiezen'}</button>${bg ? `<button class="btn small" data-act="bgscale" aria-pressed="${bgMode === 'scale'}">Schaal instellen</button><button class="btn small" data-act="bgmove" aria-pressed="${bgMode === 'move'}">${bgMode === 'move' ? 'Klaar' : 'Verplaatsen'}</button><button class="btn small danger" data-act="bgdel">Weghalen</button>` : ''}</div>`;
  if (bg)
    h += `<label class="f" for="f-bg-op">Dekking <span class="u">${fmtW(bg.op * 100)}%</span><input type="range" id="f-bg-op" data-f="bg.op" min="10" max="100" step="5" value="${Math.round(bg.op * 100)}"></label>
    <p class="note">${fmt(bg.w, 2)} × ${fmt(bg.h, 2)} m. Onder <b>Lagen</b> zet je de onderlegger aan of uit. De afbeelding wordt verkleind opgeslagen in het project (ook in de export).</p>`;
  return h + `</div>`;
}
$('bg-in').addEventListener('change', e => loadBgFile(e.target.files && e.target.files[0]));
// drop an image file on the drawing, or paste one (for example a screenshot) with Ctrl/Cmd+V
stage.addEventListener('dragover', e => {
  if ([...(e.dataTransfer.items || [])].some(i => i.kind === 'file')) {
    e.preventDefault();
    stage.classList.add('dropping');
  }
});
stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
stage.addEventListener('drop', e => {
  stage.classList.remove('dropping');
  const f = [...(e.dataTransfer.files || [])][0];
  if (!f) return;
  e.preventDefault();
  loadBgFile(f);
});
document.addEventListener('paste', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(
    i => i.kind === 'file' && /^image\//.test(i.type)
  );
  if (!it) return;
  e.preventDefault();
  loadBgFile(it.getAsFile());
});

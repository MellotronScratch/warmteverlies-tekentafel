// Delen via een link: kort (versleuteld bewaard op de server) of lang (het hele project in de link zelf).
'use strict';
/* Korte link (standaard): het project wordt als JSON gecomprimeerd (deflate-raw) en in de browser versleuteld met
   AES-GCM. Alleen die onleesbare bytes gaan naar api/share.php op warmtepomptekentafel.nl, die er een korte code voor
   teruggeeft. De link wordt …/#s=code.sleutel. Alles na het # stuurt een browser nooit naar een server: de sleutel
   komt dus nooit bij de server, en zonder de link kan niemand het project lezen.
   Lange link (terugval, of als iemand geen server wil): het gecomprimeerde project staat als base64url achter #p=.
   In beide gevallen krijgt wie de link opent een kopie in de eigen browser. Onderleggers (afbeeldingen) gaan niet mee. */
const SHARE_PREFIX = '#p=';
const SHORT_PREFIX = '#s=';
const SHARE_API = 'https://warmtepomptekentafel.nl/api/share.php';
let shareInfo = null; // { url, short, failed, hadBg, id } after making a link, shown in the Project tab

const b64url = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = str => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const pipeBytes = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

async function packBytes(p) {
  const o = JSON.parse(JSON.stringify(p));
  delete o.images;
  (o.floors || []).forEach(f => delete f.bg);
  delete o.updatedAt;
  delete o.shared;
  o.example = false;
  return pipeBytes(new TextEncoder().encode(JSON.stringify(o)), new CompressionStream('deflate-raw'));
}
const packProject = async p => b64url(await packBytes(p));
// unpacking stops at 20 MB: a few kB in a crafted link could otherwise grow into gigabytes and freeze the tab
const MAX_UNPACKED = 20e6;
async function unpackBytes(bytes) {
  const rd = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),
    dec = new TextDecoder();
  let n = 0,
    txt = '';
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > MAX_UNPACKED) {
      rd.cancel();
      throw new Error('te groot');
    }
    txt += dec.decode(value, { stream: true });
  }
  return JSON.parse(txt + dec.decode());
}
const unpackProject = code => unpackBytes(unb64url(code));

// short link: encrypt in the browser, store the bytes on the server, return "code.key"
async function storeShare(p) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await packBytes(p)));
  const body = new Uint8Array(iv.length + ct.length);
  body.set(iv);
  body.set(ct, iv.length);
  const r = await fetch(SHARE_API, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('status ' + r.status);
  const { id } = await r.json();
  if (!/^[\w-]{6,16}$/.test(id || '')) throw new Error('geen code');
  return id + '.' + b64url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}
async function fetchShare(code) {
  const [id, k] = code.split('.');
  if (!/^[\w-]{6,16}$/.test(id || '') || !k) throw new Error('kapot');
  const r = await fetch(SHARE_API + '?id=' + encodeURIComponent(id), { signal: AbortSignal.timeout(15000) });
  if (r.status === 404) throw new Error('weg');
  if (!r.ok) throw new Error('server');
  const buf = new Uint8Array(await r.arrayBuffer());
  const key = await crypto.subtle.importKey('raw', unb64url(k), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, key, buf.subarray(12));
  return unpackBytes(new Uint8Array(plain));
}
const canShort = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof AbortSignal.timeout === 'function';

// short fingerprint of a link, so opening the same link twice opens the same copy
function shareTag(code) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

async function makeShareLink(long = false) {
  if (typeof CompressionStream === 'undefined') {
    toast('Deze browser kan geen deellink maken. Gebruik Exporteren (.json).');
    return;
  }
  const base = location.origin + location.pathname;
  let url = null,
    failed = false;
  if (!long && canShort()) {
    try {
      url = base + SHORT_PREFIX + (await storeShare(P));
    } catch (_) {
      failed = true;
    }
  }
  const short = !!url;
  if (!url) url = base + SHARE_PREFIX + (await packProject(P));
  shareInfo = { url, short, failed, hadBg: P.floors.some(f => f.bg), id: P.id };
  try {
    await navigator.clipboard.writeText(url);
    shareInfo.copied = true;
  } catch (_) {
    shareInfo.copied = false;
  }
  renderPanel();
}

function shareHtml() {
  let h = `<div class="sec"><h3>Delen via een link</h3>
    <p class="note">Maak een link naar een kopie van dit project, om het te laten zien op een forum of aan een installateur. Wie de link opent, krijgt een kopie in de eigen browser; jouw project verandert niet.</p>
    <div class="row"><button class="btn small" data-act="share">Link maken</button><button class="btn small" data-act="share-long">Lange link zonder server</button></div>`;
  if (shareInfo && shareInfo.id === P.id) {
    const long = shareInfo.url.length > 8000;
    h += `<label class="f" for="f-share">Link${shareInfo.copied ? ' <span class="u">gekopieerd naar het klembord</span>' : ''}<input class="in" id="f-share" readonly value="${esc(shareInfo.url)}"></label>`;
    if (shareInfo.failed)
      h += `<div class="warnbox">De server voor korte links was niet bereikbaar. Dit is daarom de lange link, met het hele project erin.</div>`;
    h += `<p class="note">${
      shareInfo.short
        ? 'Het project is in je browser versleuteld en zo bewaard op de server. De sleutel staat alleen in de link, achter het #, en komt nooit op de server: zonder de link kan niemand het lezen. Een link die meer dan een jaar niet is geopend, wordt verwijderd.'
        : `${fmt(shareInfo.url.length, 0)} tekens. Het project zit in de link zelf; er wordt niets opgeslagen.${long ? ' Sommige fora en chat-apps knippen zo’n lange link af; stuur dan het .json-bestand.' : ''}`
    }${shareInfo.hadBg ? ' De onderlegger gaat niet mee.' : ''} Iedereen met de link ziet alles in het project, ook de naam: haal daar je adres uit als je dat niet wilt delen.</p>`;
  }
  return h + `</div>`;
}

// opening a link: import the project as a copy (or open the copy made earlier from the same link)
async function openSharedLink() {
  const h = location.hash,
    isShort = h.startsWith(SHORT_PREFIX);
  if (!isShort && !h.startsWith(SHARE_PREFIX)) return;
  const code = h.slice(SHARE_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  if (typeof DecompressionStream === 'undefined' || (isShort && !canShort())) {
    toast('Deze browser kan de gedeelde link niet openen. Vraag om het .json-bestand.');
    return;
  }
  const tag = (isShort ? 's' : '') + shareTag(code);
  const known = Object.values(all).find(p => p.shared === tag);
  if (known) {
    openProject(known.id);
    renderAll();
    toast(`“${known.name}” uit deze link stond er al en is geopend.`);
    return;
  }
  let p;
  try {
    p = normalizeProject(await (isShort ? fetchShare(code) : unpackProject(code)));
    if (!p) throw 0;
  } catch (e) {
    const why = e && e.message;
    toast(
      why === 'weg'
        ? 'Dit gedeelde project bestaat niet meer: de link is verlopen of verkeerd overgenomen. Vraag om een nieuwe link.'
        : isShort && (why === 'server' || (e && (e.name === 'TypeError' || e.name === 'TimeoutError')))
          ? 'Het gedeelde project kon niet worden opgehaald. Controleer je internetverbinding en open de link opnieuw.'
          : 'Deze link is niet compleet of beschadigd. Vraag om een nieuwe link of het .json-bestand.'
    );
    return;
  }
  p.id = 'p' + rid();
  p.example = false;
  p.shared = tag;
  all[p.id] = p;
  openProject(p.id);
  markDirty();
  renderAll();
  track(isShort ? 'korte-link-geopend' : 'link-geopend');
  toast(`Gedeeld project “${p.name}” geopend als kopie. Je eigen projecten staan onder Project.`);
}
window.addEventListener('hashchange', openSharedLink);

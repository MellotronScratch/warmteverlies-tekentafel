// Delen via een link: het hele project zit ingepakt in de link zelf.
'use strict';
/* Het project wordt als JSON gecomprimeerd (deflate, met CompressionStream van de browser) en als base64url achter
   #p= in de link gezet. Alles na het # stuurt een browser nooit naar de server; GitHub Pages en de bezoekersteller zien
   het dus niet. Er wordt nergens iets opgeslagen: wie de link opent, krijgt een kopie van het project in de eigen browser.
   Onderleggers (afbeeldingen) gaan niet mee: die maken de link te lang. */
const SHARE_PREFIX = '#p=';
let shareInfo = null; // { url, hadBg } after making a link, shown in the Project tab

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

async function packProject(p) {
  const o = JSON.parse(JSON.stringify(p));
  delete o.images;
  (o.floors || []).forEach(f => delete f.bg);
  delete o.updatedAt;
  delete o.shared;
  o.example = false;
  return b64url(await pipeBytes(new TextEncoder().encode(JSON.stringify(o)), new CompressionStream('deflate-raw')));
}
async function unpackProject(code) {
  const json = new TextDecoder().decode(await pipeBytes(unb64url(code), new DecompressionStream('deflate-raw')));
  return JSON.parse(json);
}
// short fingerprint of a link, so opening the same link twice opens the same copy
function shareTag(code) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

async function makeShareLink() {
  if (typeof CompressionStream === 'undefined') {
    toast('Deze browser kan geen deellink maken. Gebruik Exporteren (.json).');
    return;
  }
  const code = await packProject(P);
  const url = location.origin + location.pathname + SHARE_PREFIX + code;
  shareInfo = { url, hadBg: P.floors.some(f => f.bg), id: P.id };
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
    <p class="note">Maak een link waarin het hele project zit, om het te laten zien op een forum of aan een installateur. Wie de link opent, krijgt een kopie in de eigen browser; jouw project verandert niet. De link gaat niet langs een server: het project staat in de link zelf.</p>
    <div class="row"><button class="btn small" data-act="share">Link maken</button></div>`;
  if (shareInfo && shareInfo.id === P.id) {
    const long = shareInfo.url.length > 8000;
    h += `<label class="f" for="f-share">Link${shareInfo.copied ? ' <span class="u">gekopieerd naar het klembord</span>' : ''}<input class="in" id="f-share" readonly value="${esc(shareInfo.url)}" onfocus="this.select()"></label>
      <p class="note">${fmt(shareInfo.url.length, 0)} tekens.${long ? ' Sommige fora en chat-apps knippen zo’n lange link af; stuur dan het .json-bestand.' : ''}${shareInfo.hadBg ? ' De onderlegger gaat niet mee.' : ''} Iedereen met de link ziet alles in het project, ook de naam: haal daar je adres uit als je dat niet wilt delen.</p>`;
  }
  return h + `</div>`;
}

// opening a link: import the project as a copy (or open the copy made earlier from the same link)
async function openSharedLink() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const code = location.hash.slice(SHARE_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  if (typeof DecompressionStream === 'undefined') {
    toast('Deze browser kan de gedeelde link niet openen. Vraag om het .json-bestand.');
    return;
  }
  const tag = shareTag(code);
  const known = Object.values(all).find(p => p.shared === tag);
  if (known) {
    openProject(known.id);
    renderAll();
    toast(`“${known.name}” uit deze link stond er al en is geopend.`);
    return;
  }
  let p;
  try {
    p = normalizeProject(await unpackProject(code));
    if (!p) throw 0;
  } catch (_) {
    toast('Deze link is niet compleet of beschadigd. Vraag om een nieuwe link of het .json-bestand.');
    return;
  }
  p.id = 'p' + rid();
  p.example = false;
  p.shared = tag;
  all[p.id] = p;
  openProject(p.id);
  markDirty();
  renderAll();
  track('link-geopend');
  toast(`Gedeeld project “${p.name}” geopend als kopie. Je eigen projecten staan onder Project.`);
}
window.addEventListener('hashchange', openSharedLink);

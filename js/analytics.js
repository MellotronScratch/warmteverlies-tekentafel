// Anonieme bezoekersstatistiek met GoatCounter (goatcounter.com): geen cookies, geen persoonsgegevens, geen projectinhoud.
// Vul hieronder je GoatCounter-code in (het deel vóór .goatcounter.com). Leeg = er wordt niets geladen of geteld.
'use strict';
const GOATCOUNTER_CODE = 'mellotronscratch';

// Niet tellen: lokaal draaien, bij "Do Not Track", of als de gebruiker zich heeft afgemeld (Project → Statistiek).
const statsOptOut = () => {
  try {
    return localStorage.getItem('skipgc') === 't'; // the key GoatCounter's script itself checks as well
  } catch (_) {
    return false;
  }
};
const statsAllowed = () =>
  !!GOATCOUNTER_CODE &&
  /^https?:$/.test(location.protocol) &&
  !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) &&
  navigator.doNotTrack !== '1' &&
  !statsOptOut();

(function loadGoatCounter() {
  if (!statsAllowed()) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = 'https://' + GOATCOUNTER_CODE + '.goatcounter.com/count';
  // only the page itself: no query string (it could contain anything) and no referrer details beyond the domain
  s.dataset.goatcounterSettings = JSON.stringify({ path: location.pathname });
  document.head.appendChild(s);
})();

// count a use of a feature (no project data): track('rapport'), track('export-json'), …
function track(name) {
  if (!statsAllowed() || !window.goatcounter || !window.goatcounter.count) return;
  try {
    window.goatcounter.count({ path: 'actie/' + name, title: name, event: true });
  } catch (_) {}
}
function setStatsOptOut(off) {
  try {
    if (off) localStorage.setItem('skipgc', 't');
    else localStorage.removeItem('skipgc');
  } catch (_) {}
}

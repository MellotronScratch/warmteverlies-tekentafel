// Weergave: automatisch (volgt het systeem), licht of donker. De keuze staat in de browser (wvt.theme); een klein
// script in de <head> van index.html past haar al toe voordat de pagina getekend wordt.
'use strict';
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'automatisch (volgt je systeem)', light: 'licht', dark: 'donker' };
const THEME_SHORT = { auto: 'Auto', light: 'Licht', dark: 'Donker' };
const THEME_ICON = {
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>'
};
function themeNow() {
  try {
    const t = localStorage.getItem('wvt.theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch (_) {
    return 'auto';
  }
}
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try {
    if (t === 'auto') localStorage.removeItem('wvt.theme');
    else localStorage.setItem('wvt.theme', t);
  } catch (_) {}
  const b = $('btn-theme');
  if (b) {
    b.innerHTML = THEME_ICON[t] + `<span>${THEME_SHORT[t]}</span>`;
    b.title = `Weergave: ${THEME_LABEL[t]}. Klik om te wisselen.`;
    b.setAttribute('aria-label', b.title);
  }
}
$('btn-theme').onclick = () => {
  const t = THEMES[(THEMES.indexOf(themeNow()) + 1) % THEMES.length];
  applyTheme(t);
  toast('Weergave: ' + THEME_LABEL[t] + '.');
};
applyTheme(themeNow());

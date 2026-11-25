// Runs in the <head>, before the page is drawn: the chosen theme (js/theme.js), so it does not flash in the wrong
// colours. A separate file instead of an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('wvt.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

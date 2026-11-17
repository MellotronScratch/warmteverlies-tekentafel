// Het knopje linksonder: een venster met uitleg en links naar de handleiding en contact.
'use strict';
const CONTACT_MAIL = ''; // e-mailadres voor "Mail sturen"; leeg = die regel staat er niet
const REPO_URL = 'https://github.com/MellotronScratch/warmteverlies-tekentafel';

function aboutHtml() {
  const ext = 'target="_blank" rel="noopener"';
  return `<div class="about-in">
    <h2 id="about-h">Warmtepomp Tekentafel</h2>
    <p>Teken je huis en bereken per ruimte het warmteverlies, de afgifte van radiatoren en vloerverwarming, en welke warmtepomp past. Gratis en zonder account: je projecten blijven in je eigen browser.</p>
    <p class="note">De berekening is een vereenvoudigde versie van NEN-EN 12831 en ISSO 51. Goed om te vergelijken en je huis te leren kennen, maar geen vervanging van een berekening door een installateur.</p>
    <div class="about-links">
      <a class="linkrow" href="https://warmtepomptekentafel.nl/handleiding/" ${ext}><span>Handleiding</span><span>warmtepomptekentafel.nl</span></a>
      <a class="linkrow" href="${REPO_URL}/issues" ${ext}><span>Fout melden of idee delen</span><span>GitHub</span></a>
      ${CONTACT_MAIL ? `<a class="linkrow" href="mailto:${esc(CONTACT_MAIL)}?subject=${encodeURIComponent('Warmtepomp Tekentafel')}"><span>Mail sturen</span><span>${esc(CONTACT_MAIL)}</span></a>` : ''}
    </div>
    <div class="row"><button class="btn" id="about-close">Sluiten</button></div>
  </div>`;
}

$('tool-about').onclick = () => {
  const d = $('about');
  d.innerHTML = aboutHtml();
  $('about-close').onclick = () => d.close();
  d.showModal();
  track('over');
};
// a click on the dark backdrop closes the window too
$('about').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

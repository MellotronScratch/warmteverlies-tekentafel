// Zet README.md en docs/*.md om naar de handleiding op de site (handleiding/…/index.html) en maakt sitemap.xml.
// Draait alleen bij het uitrollen (.github/workflows/deploy.yml); de uitvoer staat niet in git.
// Lokaal proberen: npm install --no-save --no-package-lock marked@15.0.12 && node tools/handleiding.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Marked } from 'marked';

const SITE = 'https://warmtepomptekentafel.nl';
const REPO = 'https://github.com/MellotronScratch/warmteverlies-tekentafel';
const OUT = 'handleiding';
const ROOT = process.cwd();

// pages in the order of the table of contents in README.md
const readme = fs.readFileSync('README.md', 'utf8');
const order = [...readme.matchAll(/\]\(docs\/([\w-]+)\.md\)/g)].map(m => m[1]).filter((s, i, a) => a.indexOf(s) === i);
const pages = [{ slug: '', file: 'README.md' }, ...order.map(slug => ({ slug, file: `docs/${slug}.md` }))];
// the summary per page in the README's table of contents: "**[Titel](docs/x.md)**: samenvatting."
const summary = Object.fromEntries(
  [...readme.matchAll(/\*\*\[([^\]]+)\]\(docs\/([\w-]+)\.md\)\*\*:\s*(.+)/g)].map(m => [
    m[2],
    `${m[1]}: ${m[3].replace(/`/g, '')}`
  ])
);

const url = slug => `/${OUT}/${slug ? slug + '/' : ''}`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = html =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
// heading anchors like GitHub, so links with #kop keep working
const slugify = t =>
  t
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');

// a link in the markdown → the address on the site
function mapHref(href, fromDocs) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [p, hash] = href.split('#');
  const h = hash ? '#' + hash : '';
  const rel = path.normalize(path.join(fromDocs ? 'docs' : '.', p)).replace(/\\/g, '/');
  if (rel === 'README.md') return url('') + h;
  const md = rel.match(/^docs\/([\w-]+)\.md$/);
  if (md) return url(md[1]) + h;
  if (rel.startsWith('docs/img/')) return `/${OUT}/img/${rel.slice(9)}`;
  if (rel === 'docs/screenshot.png') return `/${OUT}/img/screenshot.png`;
  return `${REPO}/blob/main/${rel}${h}`; // data/*.json, LICENSE and the rest: on GitHub
}

function render(page) {
  const fromDocs = page.file.startsWith('docs/');
  const used = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        let id = slugify(strip(html));
        const n = used.get(id) || 0;
        used.set(id, n + 1);
        if (n) id += '-' + n;
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const to = mapHref(href, fromDocs);
        const ext = /^https?:/.test(to) && !to.startsWith(SITE);
        return `<a href="${esc(to)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, title, text }) {
        return `<img src="${esc(mapHref(href, fromDocs))}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''}>`;
      }
    }
  });
  let src = fs.readFileSync(page.file, 'utf8');
  let html = marked.parse(src);
  // raw HTML in the markdown: <img src="img/…">
  html = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)"/g, (m, a, s) => `${a}${esc(mapHref(s, fromDocs))}"`);
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const title = h1 ? strip(h1) : 'Handleiding';
  // description: the first real paragraph (not the navigation line)
  const para = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map(m => strip(m[1]))
    .find(t => t.length > 60 && !t.startsWith('←'));
  let desc = summary[page.slug] || para || title;
  if (desc.length > 158) desc = desc.slice(0, 155).replace(/\s+\S*$/, '') + '…';
  return { html, title, desc };
}

function lastmod(file) {
  try {
    return execSync(`git log -1 --format=%cs -- "${file}"`, { cwd: ROOT }).toString().trim() || today;
  } catch (_) {
    return today;
  }
}
const today = new Date().toISOString().slice(0, 10);

const rendered = pages.map(p => ({ ...p, ...render(p) }));
const nav = cur =>
  rendered
    .map(
      p =>
        `<li><a href="${url(p.slug)}"${p.slug === cur ? ' aria-current="page"' : ''}>${esc(p.slug ? p.title : 'Overzicht')}</a></li>`
    )
    .join('');

const page = p => {
  const full = p.slug ? `${p.title} · Warmtepomp Tekentafel` : 'Handleiding · Warmtepomp Tekentafel';
  const canon = SITE + url(p.slug);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: p.title,
    description: p.desc,
    inLanguage: 'nl',
    url: canon,
    isPartOf: { '@type': 'WebSite', name: 'Warmtepomp Tekentafel', url: SITE + '/' }
  };
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Warmtepomp Tekentafel">
<meta property="og:locale" content="nl_NL">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${SITE}/${OUT}/img/screenshot.png">
<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="/${OUT}/handleiding.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="top"><a class="brand" href="/">Warmtepomp Tekentafel<small>Handleiding</small></a><a class="btn" href="/">Open de app</a></header>
<div class="wrap">
<nav class="toc" aria-label="Inhoud van de handleiding"><ol>${nav(p.slug)}</ol></nav>
<main class="doc">
${p.html}
</main>
</div>
<footer class="foot"><a href="/">Warmtepomp Tekentafel</a> · <a href="${REPO}">Broncode op GitHub</a> · <a href="${REPO}/issues">Fout melden of idee delen</a> · <a href="${REPO}/blob/main/${p.file}">Deze pagina op GitHub</a></footer>
</body>
</html>
`;
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
for (const p of rendered) {
  const dir = path.join(OUT, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(p));
}
for (const f of fs.readdirSync('docs/img')) fs.copyFileSync(path.join('docs/img', f), path.join(OUT, 'img', f));
fs.copyFileSync('docs/screenshot.png', path.join(OUT, 'img', 'screenshot.png'));
fs.copyFileSync('tools/handleiding.css', path.join(OUT, 'handleiding.css'));

const urls = [
  { loc: SITE + '/', mod: lastmod('index.html') },
  ...rendered.map(p => ({ loc: SITE + url(p.slug), mod: lastmod(p.file) }))
];
fs.writeFileSync(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.mod}</lastmod></url>`).join('\n')}\n</urlset>\n`
);
console.log(`handleiding: ${rendered.length} pagina's, sitemap met ${urls.length} adressen`);

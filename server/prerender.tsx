// Renders the public pages to static HTML after `vite build`, so search engines
// and link previews get each page's content, title and description. In the
// browser the app takes over and renders the same page. Also writes the
// sitemap and robots.txt. Each page is <path>.html, which Netlify serves at
// the bare path without adding a trailing slash.
//   node --import tsx server/prerender.tsx [dist/web]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { AuthProvider } from '../web/src/auth';
import { SITE_URL, pageMeta, publicPaths } from '../web/src/marketing/content';
import { Landing } from '../web/src/pages/Landing';
import { DpaPage, PrivacyPage, TrustPage } from '../web/src/pages/Legal';
import { RolePage, RolesPage, RoiPage, VersusPage } from '../web/src/pages/Marketing';

const ROUTES: [string, ReactElement][] = [
  ['/', <Landing />],
  ['/roles', <RolesPage />],
  ['/roles/:id', <RolePage />],
  ['/compare/:slug', <VersusPage />],
  ['/roi', <RoiPage />],
  ['/trust', <TrustPage />],
  ['/privacy', <PrivacyPage />],
  ['/dpa', <DpaPage />],
];

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The page's markup, as the app renders it for a visitor who isn't signed in. */
export function renderPage(pathname: string) {
  return renderToString(
    <StaticRouter location={pathname}>
      <AuthProvider>
        <Routes>
          {ROUTES.map(([pattern, element]) => (
            <Route key={pattern} path={pattern} element={element} />
          ))}
        </Routes>
      </AuthProvider>
    </StaticRouter>,
  );
}

/** The built app shell with this page's title, description, link-preview tags and markup. */
export function pageHtml(shell: string, pathname: string) {
  const meta = pageMeta(pathname);
  if (!meta) throw new Error(`No title or description for ${pathname}`);
  const url = `${SITE_URL}${pathname === '/' ? '' : pathname}`;
  const head = [
    `<title>${escape(meta.title)}</title>`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Proofwork" />`,
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    `<meta property="og:description" content="${escape(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].join('\n    ');
  const withDescription = shell.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escape(meta.description)}" />`,
  );
  if (withDescription === shell) throw new Error('The app shell has no description tag to replace');
  return withDescription
    .replace('<title>Proofwork</title>', head)
    .replace('<body>', '<body class="is-landing">')
    .replace('<div id="root"></div>', `<div id="root">${renderPage(pathname)}</div>`);
}

export function sitemap(paths: string[]) {
  const urls = paths.map((p) => `  <url><loc>${SITE_URL}${p === '/' ? '/' : p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const ROBOTS = (sitemapUrl: string) =>
  [
    'User-agent: *',
    'Disallow: /app',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /c/',
    'Disallow: /apply/',
    'Disallow: /candidate',
    'Disallow: /demo',
    'Disallow: /preview',
    'Allow: /',
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n');

/**
 * Writes every public page as <path>.html (the landing page as index.html),
 * keeps the plain app shell as app.html for every other route, and adds the
 * sitemap and robots.txt.
 */
export function buildSite(dir: string) {
  const shell = readFileSync(path.join(dir, 'index.html'), 'utf8');
  if (!shell.includes('<div id="root"></div>'))
    throw new Error('Run vite build first: index.html is not the app shell');
  writeFileSync(path.join(dir, 'app.html'), shell);
  const paths = publicPaths();
  for (const pathname of paths) {
    const file = pathname === '/' ? 'index.html' : `${pathname.slice(1)}.html`;
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), pageHtml(shell, pathname));
  }
  writeFileSync(path.join(dir, 'sitemap.xml'), sitemap(paths));
  writeFileSync(path.join(dir, 'robots.txt'), ROBOTS(`${SITE_URL}/sitemap.xml`));
  return paths.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.resolve(process.argv[2] ?? path.join(root, 'dist', 'web'));
  console.log(`Rendered ${buildSite(dir)} public pages to static HTML.`);
}

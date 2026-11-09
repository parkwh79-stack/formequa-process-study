// Renders the link-preview image (og:image, 1200×630) into dist/og-image.png.
// 1) serves dist/, renders the real 2° elevation of the mid-size building, 2) places it in og/card.html.
// Runs in GitHub Actions after `npm run build` with playwright-core and the runner's Chrome (OG_CHROME=<path>).
// Usage: node scripts/og-image.mjs   (local: `playwright` or `playwright-core` + any Chromium)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import('playwright-core').catch(() => import('playwright'));

const root = path.resolve('dist'), port = 4173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  try { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(port);

const browser = await chromium.launch({ executablePath: process.env.OG_CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 630 }, deviceScaleFactor: 2 });
  // Offline testing only: OG_THREE_DIR=<node_modules/three> serves three.js from disk instead of the CDN.
  if (process.env.OG_THREE_DIR) await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, async route => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//, '');
    route.fulfill({ path: path.join(process.env.OG_THREE_DIR, rel), contentType: 'text/javascript' });
  });
  page.on('pageerror', e => console.warn('page error:', e.message));
  await page.goto(`http://localhost:${port}/index.html?type=midsize&p=0.001&q=low&nointro&mobile`);
  await page.waitForFunction(() => window.__ksReady, null, { timeout: 300000 });
  await page.addStyleTag({ content: 'body > *:not(#gl):not(.track){display:none!important}' });
  await page.waitForTimeout(2500);
  const elevation = await page.screenshot({ type: 'png', timeout: 300000 });
  if (process.env.OG_DEBUG) await fs.writeFile(process.env.OG_DEBUG, elevation);
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const html = (await fs.readFile('og/card.html', 'utf8')).replace('src="ELEV_SRC"', `src="data:image/png;base64,${elevation.toString('base64')}"`);
  await card.setContent(html, { waitUntil: 'networkidle' });
  await card.evaluate(() => document.fonts.ready);
  await card.screenshot({ path: path.join(root, 'og-image.png') });
  console.log('og-image.png written to dist/');
} finally {
  await browser.close();
  server.close();
}

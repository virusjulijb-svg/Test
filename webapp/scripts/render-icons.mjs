// Erzeugt icon-192.png und icon-512.png aus public/icon.svg (mit Playwright/Chromium).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const pub = new URL('../public/', import.meta.url).pathname;
const svg = readFileSync(path.join(pub, 'icon.svg'), 'utf8');
const browser = await playwright.chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:#0d1117">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(pub, `icon-${size}.png`) });
  await page.close();
}
await browser.close();
console.log('Icons erzeugt.');

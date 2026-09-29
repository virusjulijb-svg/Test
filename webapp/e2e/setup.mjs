// Gemeinsame Test-Umgebung: startet `vite preview` und beantwortet API-Aufrufe mit dem Testdatensatz.
import { spawn, execSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

export const root = new URL('..', import.meta.url).pathname;
const fixture = readFileSync(path.join(root, 'e2e/fixtures/cardinfo.json'), 'utf8');
const fixtureDe = readFileSync(path.join(root, 'e2e/fixtures/cardinfo-de.json'), 'utf8');
export const shots = path.join(root, 'e2e/screenshots');
mkdirSync(shots, { recursive: true });

export async function startServer(port) {
  const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' });
  await new Promise((res, rej) => {
    server.stdout.on('data', (d) => d.toString().includes(String(port)) && res());
    server.on('exit', (c) => rej(new Error(`preview beendet (${c})`)));
    setTimeout(() => rej(new Error('preview startet nicht')), 20000);
  });
  return server;
}

export async function launch(contextOptions) {
  const launchOpts = process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' };
  const browser = await playwright.chromium.launch(launchOpts);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  await context.route('https://db.ygoprodeck.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('checkDBVer')) return route.fulfill({ json: [{ database_version: 'test-1', last_update: '2026-09-01' }] });
    if (url.includes('language=de')) return route.fulfill({ body: fixtureDe, contentType: 'application/json' });
    return route.fulfill({ body: fixture, contentType: 'application/json' });
  });
  await context.route('https://images.ygoprodeck.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  return { browser, context, page, errors };
}

export const ydk = (main, extra = []) => ['#main', ...main, '#extra', ...extra, '!side', ''].join('\n');
export const rep = (id, n) => Array(n).fill(id);

/** Spielerdeck aus dem Testdatensatz (40 Karten, regelkonform) */
export const PLAYER_MAIN = [
  ...rep(7084129, 3), ...rep(14824019, 3), ...rep(14824020, 3), ...rep(46986414, 3), ...rep(97631303, 3),
  ...rep(24224830, 3), ...rep(5318639, 3), ...rep(48680970, 3), 83764718, ...rep(65681983, 3),
  ...rep(14558127, 3), ...rep(97268402, 3), ...rep(10045474, 3), ...rep(59438930, 3),
];
export const PLAYER_EXTRA = [1861629, 84013237];

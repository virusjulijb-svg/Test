// Lädt die Kartenbilder einmalig nach public/images/, damit eine öffentlich gehostete
// Version keine Bilder direkt bei YGOPRODeck verlinkt (siehe deren API-Richtlinien).
// Aufruf: npm run mirror-images [-- deck.ydk]   (ohne Datei: alle Karten)
// Danach mit VITE_IMAGE_BASE=./images bauen.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const IMG = 'https://images.ygoprodeck.com/images';
const out = new URL('../public/images/', import.meta.url).pathname;
const PER_SECOND = 10; // Limit der API: 20 Anfragen/s

const ydk = process.argv[2];
let ids;
if (ydk) {
  ids = [...new Set(readFileSync(ydk, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\d+$/.test(l)))];
} else {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`cardinfo: HTTP ${res.status}`);
  const { data } = await res.json();
  ids = data.flatMap((c) => (c.card_images ?? [{ id: c.id }]).map((i) => String(i.id)));
}

const jobs = ids.flatMap((id) => ['cards_small', 'cards'].map((dir) => ({ id, dir })));
for (const d of ['cards_small', 'cards']) mkdirSync(path.join(out, d), { recursive: true });
console.log(`${jobs.length} Bilder (${ids.length} Karten) …`);

let done = 0, skipped = 0, failed = 0;
for (let i = 0; i < jobs.length; i += PER_SECOND) {
  const started = Date.now();
  await Promise.all(jobs.slice(i, i + PER_SECOND).map(async ({ id, dir }) => {
    const file = path.join(out, dir, `${id}.jpg`);
    if (existsSync(file)) { skipped++; return; }
    try {
      const res = await fetch(`${IMG}/${dir}/${id}.jpg`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      done++;
    } catch (e) {
      failed++;
      console.warn(`${dir}/${id}: ${e.message}`);
    }
  }));
  const wait = 1000 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
console.log(`fertig: ${done} geladen, ${skipped} vorhanden, ${failed} Fehler`);

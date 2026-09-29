// End-to-End-Rauchtest (Desktop): klickt die vier Bereiche durch. Screenshots in e2e/screenshots/.
import path from 'node:path';
import { startServer, launch, shots, ydk, rep, PLAYER_MAIN, PLAYER_EXTRA } from './setup.mjs';

const PORT = 4179;
const server = await startServer(PORT);
const { browser, page, errors } = await launch({ viewport: { width: 1440, height: 1000 } });

const step = (msg) => console.log(`• ${msg}`);
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

async function importDeck(name, text) {
  await page.getByRole('button', { name: 'Importieren' }).click();
  await page.getByLabel('Deck importieren').locator('input').first().fill(name);
  await page.getByLabel('Deck importieren').locator('textarea').fill(text);
  await page.getByLabel('Deck importieren').getByRole('button', { name: 'Importieren' }).click();
}

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.getByText('Deckbuilder').first().waitFor();
  step('App geladen');

  // Deckbuilder: Suche + Hinzufügen
  await page.getByLabel('Kartensuche').fill('dark magician');
  await page.locator('.results [data-card="Dark Magician"]').click();
  await page.locator('.deck-view [data-card="Dark Magician"]').waitFor();
  step('Karte über die Suche hinzugefügt');

  // Spielerdeck importieren
  const main = PLAYER_MAIN;
  await importDeck('Testdeck', ydk(main, PLAYER_EXTRA));
  await page.getByText('Deck ist regelkonform').waitFor();
  step(`Spielerdeck importiert (${main.length} Karten, regelkonform)`);
  await shot('1-deckbuilder');

  await importDeck('Ash-Wand', ydk(rep(14558127, 40)));
  await page.locator('.deck-list li', { hasText: 'Testdeck' }).click();

  // Consistency Lab
  await page.getByRole('button', { name: 'Consistency Lab' }).click();
  for (const name of ["Magician's Rod", 'Test Starter']) {
    await page.locator('.cat-table tr', { hasText: name }).getByRole('button', { name: 'Starter' }).click();
  }
  const firstCell = page.locator('.results-table').first().locator('tbody tr').first().locator('td').nth(1);
  const txt = await firstCell.innerText();
  if (!txt.includes('57,7')) throw new Error(`Erwartet 57,7 % für 6 Starter in 40 Karten, erhalten: ${txt}`);
  step(`Consistency Lab: 6 Starter / 40 Karten → ${txt.trim()}`);
  await page.getByRole('button', { name: '5 Karten ziehen' }).click();
  await page.locator('.checklist li').first().waitFor();
  await shot('2-consistency');

  // Combo Lab
  await page.getByRole('button', { name: 'Combo Lab' }).click();
  await page.getByRole('button', { name: 'Neue Combo' }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Starthand festlegen').locator('.picker [data-card="Magician\'s Rod"]').click();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByRole('button', { name: '＋ Schritt hinzufügen' }).click();
  let dlg = page.getByLabel('Schritt hinzufügen');
  await dlg.locator('.picker [data-card="Magician\'s Rod"]').click();
  await dlg.locator('select').first().selectOption('normalSummon');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await page.locator('.add-step button').last().click();
  dlg = page.getByLabel('Schritt hinzufügen');
  await dlg.locator('.picker [data-card="Magician\'s Rod"]').click();
  await dlg.locator('select').nth(1).selectOption('field');
  await dlg.locator('.effect').first().click();
  await dlg.locator('select').nth(2).selectOption({ label: 'Eternal Soul' });
  await dlg.getByLabel(/Choke Point/).check();
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await page.locator('.badge.hit', { hasText: 'Ash Blossom' }).waitFor();
  await page.getByTitle('Alternative bei Unterbrechung').nth(1).click();
  await page.locator('.branch-new').getByRole('button', { name: 'Ash Blossom' }).click();
  await page.locator('.badge.covered', { hasText: 'Ash Blossom' }).waitFor();
  step('Combo Lab: Schritte, Choke Point und Alternative für Ash angelegt');
  await shot('3-combo');

  // Duell-Bot
  await page.getByRole('button', { name: 'Duell-Bot' }).click();
  await page.locator('label.field', { hasText: 'Gegner-Deck' }).locator('select').selectOption({ label: 'Ash-Wand' });
  await page.locator('label.field', { hasText: 'Schwierigkeit' }).locator('select').selectOption('hard');
  await page.locator('label.field', { hasText: 'Combo üben' }).locator('select').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Duell starten' }).click();
  await page.getByRole('button', { name: 'Schritt ausführen' }).click();
  await page.locator('.player-area .field-row [data-card="Magician\'s Rod"]').waitFor();
  await page.getByRole('button', { name: 'Schritt ausführen' }).click();
  await page.getByText('Der Bot unterbricht!').waitFor();
  step('Duell: Bot unterbricht die Suche von Magician’s Rod');
  await shot('4-duel-interrupt');
  await page.getByRole('button', { name: 'Zulassen' }).click();
  await page.locator('.log li', { hasText: 'Ash Blossom & Joyous Spring: annulliert' }).waitFor();
  await page.getByText('Combo abgeschlossen').waitFor();
  await page.getByRole('button', { name: 'Zug beenden' }).click();
  await page.getByText('Auswertung').waitFor();
  const summary = await page.locator('.summary').innerText();
  if (!summary.includes('durchgekommen')) throw new Error('Auswertung ohne Unterbrechung');
  step('Duell: Zug beendet, Auswertung angezeigt');
  await shot('5-duel-summary');

  // manuelles Spiel: Karte anklicken → Menü
  await page.getByRole('button', { name: 'Noch einmal' }).click();
  await page.locator('.player-area .hand .card').first().click();
  await page.locator('.modal').waitFor();
  await page.keyboard.press('Escape');
  step('Duell: Aktionsmenü für Handkarten');

  // Mobile Ansicht ohne horizontales Scrollen
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Deckbuilder' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Horizontales Scrollen auf dem Handy: ${overflow}px`);
  await shot('6-mobile');
  step('Handy-Breite ohne horizontales Scrollen');

  // Installierbarkeit: Manifest und Service Worker
  const pwa = await page.evaluate(async () => {
    const manifest = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
    return { name: manifest.name, icons: manifest.icons.length, sw: !!reg?.active };
  });
  if (!pwa.sw || pwa.icons < 3) throw new Error(`App nicht installierbar: ${JSON.stringify(pwa)}`);
  step('Manifest und Service Worker aktiv (installierbar)');

  if (errors.length) throw new Error(`Browser-Fehler:\n${errors.join('\n')}`);
  console.log('\nE2E: alles in Ordnung');
} catch (e) {
  await shot('error').catch(() => {});
  console.error('\nE2E fehlgeschlagen:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}

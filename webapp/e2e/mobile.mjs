// End-to-End-Test auf dem Handy: Touch-Bedienung, untere Navigation, Karten-Blatt, Duell.
import path from 'node:path';
import { startServer, launch, shots, ydk, rep, PLAYER_MAIN, PLAYER_EXTRA } from './setup.mjs';

const PORT = 4181;
const server = await startServer(PORT);
const { browser, page, errors } = await launch({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

const step = (msg) => console.log(`• ${msg}`);
const shot = (name) => page.screenshot({ path: path.join(shots, `mobile-${name}.png`) });
const nav = (label) => page.locator('.tabs').getByRole('button', { name: label }).tap();
async function noOverflow(where) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o > 1) throw new Error(`${where}: horizontales Scrollen (${o}px)`);
}
async function importDeck(name, text) {
  await page.getByRole('tab', { name: 'Decks' }).tap();
  await page.getByRole('button', { name: 'Importieren' }).tap();
  const dlg = page.getByLabel('Deck importieren');
  await dlg.locator('input').first().fill(name);
  await dlg.locator('textarea').fill(text);
  await dlg.getByRole('button', { name: 'Importieren' }).tap();
}

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator('.topbar').waitFor();

  // Navigation liegt am unteren Rand und ist mit dem Daumen erreichbar
  const navBox = await page.locator('.tabs').boundingBox();
  if (!navBox || navBox.y < 844 - 90 || navBox.width < 380) throw new Error(`Navigation nicht unten: ${JSON.stringify(navBox)}`);
  const tabBox = await page.locator('.tabs .tab').first().boundingBox();
  if (tabBox.height < 44) throw new Error(`Reiter zu klein zum Tippen (${tabBox.height}px)`);
  step('Untere Navigation mit ausreichend großen Tippflächen');

  await importDeck('Testdeck', ydk(PLAYER_MAIN, PLAYER_EXTRA));
  await page.getByText('Deck ist regelkonform').waitFor();
  await noOverflow('Deckbuilder');
  step('Deck über das Blatt „Deck importieren“ geladen');

  // Suche: Antippen öffnet das Karten-Blatt, dort Kopien ändern und ins Side Deck legen
  await page.getByRole('tab', { name: 'Suche' }).tap();
  await page.getByLabel('Kartensuche').fill('mystical');
  await page.locator('.results [data-card="Mystical Space Typhoon"]').tap();
  const sheet = page.getByRole('dialog', { name: 'Mystical Space Typhoon' });
  await sheet.getByLabel('Kopien im Main Deck').waitFor();
  if ((await sheet.getByLabel('Kopien im Main Deck').innerText()) !== '3') throw new Error('Kopienzahl im Blatt falsch');
  await sheet.getByRole('button', { name: '1 aus Main Deck entfernen' }).tap();
  await sheet.getByRole('button', { name: '1 ins Side Deck' }).tap();
  if ((await sheet.getByLabel('Kopien im Main Deck').innerText()) !== '2') throw new Error('Entfernen im Blatt fehlgeschlagen');
  if ((await sheet.getByLabel('Kopien im Side Deck').innerText()) !== '1') throw new Error('Side Deck im Blatt fehlgeschlagen');
  await shot('1-card-sheet');
  await sheet.getByRole('button', { name: 'Schließen' }).tap();
  await page.getByRole('tab', { name: /Deck 39\/2\/1/ }).waitFor();
  step('Karten-Blatt: Main −1, Side +1 per Antippen');

  // Filter sind eingeklappt und lassen sich öffnen
  if (await page.getByLabel('Kartenart').isVisible()) throw new Error('Filter sollten eingeklappt sein');
  await page.getByRole('button', { name: /Filter/ }).tap();
  await page.getByLabel('Kartenart').waitFor();
  step('Suchfilter ein- und ausklappbar');

  // Zurück auf 40 Karten
  await page.locator('.results [data-card="Mystical Space Typhoon"]').tap();
  await sheet.getByRole('button', { name: '1 aus Side Deck entfernen' }).tap();
  await sheet.getByRole('button', { name: '1 ins Main Deck' }).tap();
  if ((await sheet.getByLabel('Kopien im Main Deck').innerText()) !== '3') throw new Error('Zurücksetzen fehlgeschlagen');
  await sheet.getByRole('button', { name: 'Schließen' }).tap();

  await importDeck('Ash-Wand', ydk(rep(14558127, 40)));
  await page.getByRole('tab', { name: 'Decks' }).tap();
  await page.locator('.deck-list li', { hasText: 'Testdeck' }).tap();

  // Consistency Lab
  await nav('Consistency Lab');
  await page.locator('.cat-table tr', { hasText: 'Test Starter' }).getByRole('button', { name: 'Starter' }).tap();
  await page.locator('.cat-table tr', { hasText: "Magician's Rod" }).getByRole('button', { name: 'Starter' }).tap();
  const cell = await page.locator('.results-table').first().locator('tbody tr').first().locator('td').nth(1).innerText();
  if (!cell.includes('57,7')) throw new Error(`Consistency Lab: ${cell}`);
  await noOverflow('Consistency Lab');
  await shot('2-consistency');
  step(`Consistency Lab per Touch: ${cell.trim()}`);

  // Combo Lab
  await nav('Combo Lab');
  await page.getByRole('button', { name: 'Neue Combo' }).tap();
  await page.getByRole('button', { name: 'Bearbeiten' }).tap();
  await page.getByLabel('Starthand festlegen').locator('.picker [data-card="Magician\'s Rod"]').tap();
  await page.getByRole('button', { name: 'Übernehmen' }).tap();
  await page.getByRole('button', { name: '＋ Schritt hinzufügen' }).tap();
  let dlg = page.getByLabel('Schritt hinzufügen');
  await dlg.locator('.picker [data-card="Magician\'s Rod"]').tap();
  await dlg.locator('select').first().selectOption('normalSummon');
  await dlg.getByRole('button', { name: 'Speichern' }).tap();
  await page.locator('.add-step button').last().tap();
  dlg = page.getByLabel('Schritt hinzufügen');
  await dlg.locator('.picker [data-card="Magician\'s Rod"]').tap();
  await dlg.locator('select').nth(1).selectOption('field');
  await dlg.locator('.effect').first().tap();
  await dlg.getByRole('button', { name: 'Speichern' }).tap();
  await page.locator('.badge.hit', { hasText: 'Ash Blossom' }).waitFor();
  await noOverflow('Combo Lab');
  await shot('3-combo');
  step('Combo Lab per Touch angelegt');

  // Duell
  await nav('Duell-Bot');
  await page.locator('label.field', { hasText: 'Gegner-Deck' }).locator('select').selectOption({ label: 'Ash-Wand' });
  await page.locator('label.field', { hasText: 'Combo üben' }).locator('select').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Duell starten' }).tap();
  // Hand und „Zug beenden“ sind ohne Scrollen sichtbar
  const hand = await page.locator('.player-area .hand').boundingBox();
  const end = await page.getByRole('button', { name: 'Zug beenden' }).boundingBox();
  if (hand.y + hand.height > 844 - 64 || end.y + end.height > 844 - 64) {
    throw new Error(`Hand/Knöpfe liegen unter der Navigation (Hand bis ${hand.y + hand.height}px, Knopf bis ${end.y + end.height}px)`);
  }
  step('Spielfeld, Hand und „Zug beenden“ passen auf den Bildschirm');
  await shot('4-duel');

  // Karte manuell per Antippen spielen: Normalbeschwörung von Magician's Rod
  await page.locator('.player-area .hand [data-card="Magician\'s Rod"]').tap();
  await page.getByRole('dialog', { name: "Magician's Rod" }).getByRole('button', { name: 'Normalbeschwörung' }).tap();
  await page.locator('.player-area .field-row [data-card="Magician\'s Rod"]').waitFor();
  // Combo-Wiedergabe liegt unter dem Spielfeld: Schritt 1 überspringen, Schritt 2 ausführen
  await page.getByRole('button', { name: 'Überspringen' }).tap();
  await page.getByRole('button', { name: 'Schritt ausführen' }).tap();
  await page.getByText('Der Bot unterbricht!').waitFor();
  await shot('5-interrupt');
  await page.getByRole('button', { name: 'Zulassen' }).tap();
  await page.locator('.last-log').waitFor();
  await page.getByRole('button', { name: 'Zug beenden' }).tap();
  await page.getByText('Auswertung').waitFor();
  await page.waitForTimeout(600);
  const inView = await page.locator('.summary').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
  if (!inView) throw new Error('Auswertung wurde nicht in den sichtbaren Bereich gescrollt');
  await noOverflow('Duell');
  await shot('6-summary');
  step('Duell per Touch: Unterbrechung, Zugende, Auswertung sichtbar');

  // Querformat und Tablet
  for (const [w, h, name] of [[844, 390, 'Querformat'], [820, 1180, 'Tablet']]) {
    await page.setViewportSize({ width: w, height: h });
    for (const t of ['Deckbuilder', 'Consistency Lab', 'Combo Lab', 'Duell-Bot']) {
      await nav(t);
      await noOverflow(`${name} / ${t}`);
    }
  }
  await shot('7-landscape');
  step('Querformat (844×390) und Tablet (820×1180) ohne seitliches Scrollen');

  if (errors.length) throw new Error(`Browser-Fehler:\n${errors.join('\n')}`);
  console.log('\nE2E mobil: alles in Ordnung');
} catch (e) {
  await shot('error').catch(() => {});
  console.error('\nE2E mobil fehlgeschlagen:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}

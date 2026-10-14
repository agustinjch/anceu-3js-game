#!/usr/bin/env node
// End-to-end smoke test: boots a CPU vs CPU fight, checks for console errors and that both fighters
// take damage, and saves screenshots. Needs `npm run dev` (port 5174) or BASE_URL.
import { launch } from '../../tools/browser.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5174/';
const SECONDS = +(process.env.SECONDS || 40);
mkdirSync('test/e2e/out', { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let failed = false;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed = true; };

for (const [p1, p2, stage] of [['pepe', 'rosa', 'plaza'], ['se', 'agus', 'ponte'], ['victor', 'pepe', 'plaza']]) {
  await page.goto(`${BASE}?dev=fight&p1=${p1}&p2=${p2}&stage=${stage}&cpu=hard&p1cpu=hard&skip=1&seed=5`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  // headless WebGL is slow: wait for sim frames rather than wall time
  await page.waitForFunction(n => (window.__game.fight?.match.frame || 0) > n, 60 * SECONDS, { timeout: 600000, polling: 500 }).catch(() => {});
  const st = await page.evaluate(() => {
    const m = window.__game.fight.match;
    return { frame: m.frame, phase: m.phase, health: m.fighters.map(f => f.health), max: m.fighters.map(f => f.maxHealth), wins: m.wins };
  });
  await page.screenshot({ path: `test/e2e/out/${p1}-vs-${p2}-${stage}.png` });
  check(st.frame > 60 * 10, `${p1} vs ${p2}: sim ran ${st.frame} frames (${st.phase})`);
  check(st.health[0] < st.max[0] || st.wins[1] > 0, `${p1} took damage (${st.health[0]}/${st.max[0]}, wins ${st.wins})`);
  check(st.health[1] < st.max[1] || st.wins[0] > 0, `${p2} took damage (${st.health[1]}/${st.max[1]}, wins ${st.wins})`);
}

// the menus boot too
await page.goto(BASE);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await page.screenshot({ path: 'test/e2e/out/menu.png' });
await page.keyboard.press('KeyU');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'test/e2e/out/select.png' });
check(await page.locator('.select .card').count() === 5, 'character select shows 5 fighters');

check(errors.length === 0, `no page errors${errors.length ? ':\n  ' + errors.slice(0, 10).join('\n  ') : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);

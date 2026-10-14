#!/usr/bin/env node
// Screenshot every fighter's super mid-animation: node tools/supers.mjs
import { launch } from './browser.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('pageerror', e.message));
const ALL = [['pepe', 'victor'], ['victor', 'se'], ['se', 'agus'], ['agus', 'rosa'], ['rosa', 'pepe']];
const only = process.argv.slice(2);
for (const [p1, p2] of ALL.filter(([a]) => !only.length || only.includes(a))) {
  await page.goto(`http://localhost:5174/?dev=fight&p1=${p1}&p2=${p2}&stage=plaza&cpu=none&skip=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForFunction(() => window.__game.fight?.match.phase === 'fight', null, { timeout: 300000, polling: 100 });
  // put them close, fill P1's meter and press HP+HK through the keyboard
  await page.evaluate(() => { const m = window.__game.fight.match; m.fighters[0].x = -0.5; m.fighters[1].x = 0.5; m.fighters[0].meter = 300; });
  // both keys in the same tick (headless frames are slow enough to split two separate presses)
  await page.evaluate(() => { for (const code of ['KeyI', 'KeyK']) dispatchEvent(new KeyboardEvent('keydown', { code })); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const code of ['KeyI', 'KeyK']) dispatchEvent(new KeyboardEvent('keyup', { code })); });
  const ok = await page.waitForFunction(() => { const f = window.__game.fight.match.fighters[0]; return f.moveId === 'super' && f.mf >= 14; }, null, { timeout: 60000, polling: 30 }).then(() => true, () => false);
  await page.evaluate(() => { window.__game.fight.paused = true; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `.dev/super-${p1}.png` });
  await page.evaluate(() => { window.__game.fight.paused = false; });
  // a little later, for the cinematics
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `.dev/super-${p1}-b.png` });
  const st = await page.evaluate(() => window.__game.fight.match.fighters.map(f => `${f.def.id} ${f.state} ${f.health}`).join(' | '));
  console.log(p1, ok ? 'super fired' : 'NO SUPER', st);
}
await browser.close();

#!/usr/bin/env node
// Sequence of screenshots of a CPU fight: node tools/burst.mjs "<query>" prefix count everyFrames
import { launch } from './browser.mjs';

const [query, prefix = '.dev/burst', count = '8', every = '20', start = '200'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`http://localhost:5174/${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
for (let i = 0; i < +count; i++) {
  const target = +start + i * +every;
  await page.waitForFunction(n => (window.__game.fight?.match.frame || 0) >= n, target, { timeout: 300000, polling: 50 });
  await page.evaluate(() => { window.__game.fight.paused = true; });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => window.__game.fight.match.fighters.map(f => `${f.def.id}:${f.state}${f.moveId ? '/' + f.moveId + '@' + f.mf : ''}`).join('  '));
  await page.screenshot({ path: `${prefix}-${i}.png` });
  console.log(i, target, info);
  await page.evaluate(() => { window.__game.fight.paused = false; });
}
await browser.close();

#!/usr/bin/env node
// Contact sheets of every move clip, for tuning CLIP_TIMING: node tools/strips.mjs [fighter] [clip...]
import { launch } from './browser.mjs';
import { CLIP_SETS } from '../src/data/common.js';

const [fighter = 'victor', ...only] = process.argv.slice(2);
const clips = only.length ? only : [...new Set(Object.values(CLIP_SETS).flat())];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 360 } });
for (const clip of clips) {
  const set = Object.entries(CLIP_SETS).find(([, v]) => v.includes(clip))[0];
  const who = set === 'common' ? fighter : set;
  await page.goto(`http://localhost:5174/?dev=anim&strip=${who}&clip=${clip}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `.dev/strip-${clip}.png` });
  console.log('✓', clip);
}
await browser.close();

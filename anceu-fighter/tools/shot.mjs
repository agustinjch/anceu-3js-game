#!/usr/bin/env node
// Screenshot helper: node tools/shot.mjs "<query>" out.png [waitMs] [w] [h]
// Expects the dev server on http://localhost:5174.
import { launch } from './browser.mjs';

const [query = '', out = '.dev/shot.png', wait = '1500', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:5174/${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(e => errors.push('not ready: ' + e.message));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
await browser.close();
console.log('saved', out);

// Captura de pantallas del juego en Chromium sin cabeza (WebGL por software o GPU).
// Uso: node tools/shot.mjs <salida_dir> [script.json]
//   script.json: lista de pasos [{ "wait": ms } | { "eval": "js" } | { "shot": "nombre" } | { "key": "Space" } | { "click": "#sel" }]
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'shots';
const steps = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [{ wait: 8000 }, { shot: 'title' }];
const url = process.env.URL ?? 'http://localhost:5199/';
const mobile = process.env.MOBILE === '1';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  args: [
    ...(process.env.GPU === '1'
      ? ['--use-gl=angle', '--use-angle=gl-egl', '--enable-gpu', '--enable-features=Vulkan']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await browser.newContext(
  mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 } },
);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && logs.push(`[http ${r.status()}] ${r.url()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.eval) {
    try {
      const r = await page.evaluate(s.eval);
      if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`);
    } catch (e) {
      logs.push(`[eval-error] ${e.message}`);
    }
  }
  if (s.key) await page.keyboard.press(s.key);
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.click) await page.click(s.click).catch((e) => logs.push(`[click-error] ${e.message}`));
  if (s.shot) await page.screenshot({ path: `${out}/${s.shot}.png`, timeout: 120000 });
}
fs.writeFileSync(`${out}/console.log`, logs.join('\n'));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 30).join('\n'));
await browser.close();

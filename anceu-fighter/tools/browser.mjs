// Launch headless Chromium for screenshots / smoke tests. Falls back to any cached Playwright
// headless shell when the exact build for this Playwright version isn't downloaded.
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export async function launch() {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  try {
    return await chromium.launch({ args });
  } catch (e) {
    const cache = join(homedir(), '.cache/ms-playwright');
    const shells = existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
    for (const d of shells) {
      const exe = join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell');
      if (existsSync(exe)) return chromium.launch({ args, executablePath: exe });
    }
    throw e;
  }
}

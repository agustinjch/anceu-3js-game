import * as THREE from 'three';

/**
 * Texturas pintadas a mano (generadas en canvas, sin fotos): piedra de granito en
 * cachotería, teja curva, madera, losa y tierra. Todas tilean sin costuras.
 * Sustituyen a las texturas fotográficas: el estilo del juego es pintado.
 */

type Ctx = CanvasRenderingContext2D;

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Dibuja `fn` también desplazado ±tamaño para que lo que cruza el borde reaparezca al otro lado. */
function wrapDraw(size: number, x: number, y: number, w: number, h: number, fn: (dx: number, dy: number) => void) {
  for (const dx of [0, -size, size])
    for (const dy of [0, -size, size]) {
      if (x + dx + w < 0 || x + dx > size || y + dy + h < 0 || y + dy > size) continue;
      fn(dx, dy);
    }
}

/** Piedra redondeada irregular con volumen pintado: luz arriba-izquierda, sombra abajo. */
function stone(g: Ctx, x: number, y: number, w: number, h: number, base: [number, number, number], r: () => number) {
  const [hh, ss, ll] = base;
  const jit = () => (r() - 0.5) * Math.min(w, h) * 0.18;
  const pts: [number, number][] = [
    [x + w * 0.12 + jit(), y + jit()],
    [x + w * 0.88 + jit(), y + jit()],
    [x + w + jit(), y + h * 0.3 + jit()],
    [x + w + jit(), y + h * 0.75 + jit()],
    [x + w * 0.85 + jit(), y + h + jit()],
    [x + w * 0.15 + jit(), y + h + jit()],
    [x + jit(), y + h * 0.7 + jit()],
    [x + jit(), y + h * 0.25 + jit()],
  ];
  const path = () => {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if (i === 0) g.moveTo((ax + bx) / 2, (ay + by) / 2);
      const [cx, cy] = pts[(i + 1) % pts.length];
      const [dx, dy] = pts[(i + 2) % pts.length];
      g.quadraticCurveTo(cx, cy, (cx + dx) / 2, (cy + dy) / 2);
    }
    g.closePath();
  };
  // sombra
  g.fillStyle = hsl(hh, ss, ll - 14);
  path();
  g.fill();
  // cuerpo (algo desplazado hacia arriba-izquierda deja ver la sombra abajo)
  g.save();
  g.translate(-w * 0.03, -h * 0.06);
  g.fillStyle = hsl(hh, ss, ll);
  path();
  g.fill();
  g.restore();
  // luz
  g.save();
  path();
  g.clip();
  g.fillStyle = hsl(hh + 4, ss, ll + 9);
  g.beginPath();
  g.ellipse(x + w * 0.35, y + h * 0.22, w * 0.45, h * 0.28, -0.1, 0, Math.PI * 2);
  g.fill();
  // motas de granito
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = r() < 0.5 ? hsl(hh, ss, ll - 10) : hsl(hh, ss - 5, ll + 10);
    g.fillRect(x + r() * w, y + r() * h, 1.5, 1.5);
  }
  g.restore();
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Muro de granito gallego: hiladas irregulares de piedra con junta oscura. */
function granite(opts: { moss?: number; hue?: number; light?: number } = {}) {
  const S = 512;
  const [c, g] = canvas(S);
  const r = rng(42 + (opts.moss ?? 0) * 100);
  g.fillStyle = hsl(36, 10, 34);
  g.fillRect(0, 0, S, S);
  const rows = 7;
  const rh = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 60;
    while (x < S) {
      const w = rh * (1.1 + r() * 1.3);
      const h = rh * (0.82 + r() * 0.12);
      const y = row * rh + (rh - h) / 2;
      const hue = (opts.hue ?? 36) + (r() - 0.5) * 16;
      // granito gallego: gris cálido con piedras oxidadas, algunas casi ocres
      const sat = r() < 0.2 ? 26 + r() * 10 : 12 + r() * 10;
      const l = (opts.light ?? 66) + (r() - 0.5) * 14;
      const sx = x;
      wrapDraw(S, sx, y, w * 0.95, h, (dx, dy) => stone(g, sx + dx, y + dy, w * 0.95, h, [hue, sat, l], r));
      x += w;
    }
  }
  if (opts.moss) {
    // musgo: manchas verdes en las juntas de arriba de cada piedra
    for (let i = 0; i < 260 * opts.moss; i++) {
      const x = r() * S;
      const y = r() * S;
      g.fillStyle = hsl(78 + r() * 20, 35 + r() * 15, 34 + r() * 14);
      g.globalAlpha = 0.55;
      g.beginPath();
      g.ellipse(x, y, 4 + r() * 12, 2 + r() * 5, r(), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  return finish(c);
}

/** Tejado de teja curva: filas solapadas, la sombra de cada fila sobre la siguiente. */
function tiles(old = false) {
  const S = 512;
  const [c, g] = canvas(S);
  const r = rng(old ? 9 : 5);
  g.fillStyle = hsl(14, 40, 22);
  g.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  const cols = 8;
  const cw = S / cols;
  for (let row = rows; row >= -1; row--) {
    const off = row % 2 ? cw / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      const x = col * cw + off;
      const y = row * rh;
      const hue = 18 + (r() - 0.5) * 12;
      const l = (old ? 40 : 44) + (r() - 0.5) * 12;
      const sat = old ? 30 : 40;
      wrapDraw(S, x, y, cw, rh * 1.25, (dx, dy) => {
        const X = x + dx;
        const Y = y + dy;
        // canal de la teja: degradado de lado a lado (forma curva)
        const grd = g.createLinearGradient(X, 0, X + cw, 0);
        grd.addColorStop(0, hsl(hue, sat, l - 12));
        grd.addColorStop(0.45, hsl(hue + 4, sat, l + 8));
        grd.addColorStop(1, hsl(hue, sat, l - 14));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(X + 2, Y);
        g.lineTo(X + cw - 2, Y);
        g.lineTo(X + cw - 4, Y + rh * 1.18);
        g.quadraticCurveTo(X + cw / 2, Y + rh * 1.3, X + 4, Y + rh * 1.18);
        g.closePath();
        g.fill();
        // sombra del borde inferior
        g.fillStyle = 'rgba(40,15,10,0.35)';
        g.fillRect(X + 4, Y + rh * 1.12, cw - 8, 3);
        if (old && r() < 0.35) {
          g.fillStyle = r() < 0.5 ? 'rgba(70,80,40,0.5)' : 'rgba(220,210,170,0.35)';
          g.beginPath();
          g.ellipse(X + r() * cw, Y + r() * rh, 4 + r() * 8, 3 + r() * 5, 0, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
  }
  return finish(c);
}

/** Madera: tablas con vetas pintadas. */
function wood(opts: { weathered?: boolean; planks?: number } = {}) {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(opts.weathered ? 3 : 4);
  const n = opts.planks ?? 4;
  const pw = S / n;
  for (let i = 0; i < n; i++) {
    const l = (opts.weathered ? 52 : 46) + (r() - 0.5) * 10;
    const sat = opts.weathered ? 14 : 38;
    g.fillStyle = hsl(28, sat, l);
    g.fillRect(i * pw, 0, pw, S);
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = hsl(26, sat, l - 8 - r() * 8);
      g.lineWidth = 1 + r() * 1.5;
      const x0 = i * pw + r() * pw;
      g.beginPath();
      g.moveTo(x0, 0);
      g.bezierCurveTo(x0 + (r() - 0.5) * 10, S * 0.3, x0 + (r() - 0.5) * 10, S * 0.7, x0, S);
      g.stroke();
    }
    g.fillStyle = hsl(26, sat, l + 8);
    g.fillRect(i * pw + 2, 0, pw * 0.25, S);
    g.fillStyle = 'rgba(30,18,10,0.6)';
    g.fillRect(i * pw, 0, 2.5, S);
  }
  return finish(c);
}

/** Losas de piedra (suelo del muíño, interiores). */
function slates() {
  const S = 512;
  const [c, g] = canvas(S);
  const r = rng(77);
  g.fillStyle = hsl(30, 12, 30);
  g.fillRect(0, 0, S, S);
  const n = 4;
  const cs = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = i * cs + (j % 2 ? cs / 2 : 0);
      const y = j * cs;
      const hue = 30 + (r() - 0.5) * 12;
      wrapDraw(S, x, y, cs * 0.94, cs * 0.92, (dx, dy) => stone(g, x + dx + 3, y + dy + 3, cs * 0.94, cs * 0.92, [hue, 14, 58 + (r() - 0.5) * 10], r));
    }
  return finish(c);
}

/** Tierra de camino con piedrecillas. */
function dirt() {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(13);
  g.fillStyle = hsl(32, 26, 48);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = hsl(30 + r() * 8, 22 + r() * 10, 40 + r() * 16);
    g.globalAlpha = 0.5;
    const x = r() * S;
    const y = r() * S;
    wrapDraw(S, x - 20, y - 20, 40, 40, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 8 + r() * 18, 6 + r() * 12, r() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 90; i++) {
    const x = r() * S;
    const y = r() * S;
    g.fillStyle = hsl(35, 10, 30 + r() * 40);
    g.beginPath();
    g.ellipse(x, y, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

/** Revoco/encalado: base clara con manchas suaves de humedad y pinceladas. */
function plaster() {
  const S = 512;
  const [c, g] = canvas(S);
  const r = rng(21);
  g.fillStyle = hsl(40, 25, 86);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 20 + r() * 70;
    const h = 8 + r() * 26;
    g.fillStyle = r() < 0.6 ? hsl(38, 20, 80 + r() * 8) : hsl(40, 30, 90 + r() * 6);
    g.globalAlpha = 0.35;
    wrapDraw(S, x - w, y - h, w * 2, h * 2, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, w, h, (r() - 0.5) * 0.4, 0, Math.PI * 2);
      g.fill();
    });
  }
  // churretes de lluvia
  for (let i = 0; i < 18; i++) {
    const x = r() * S;
    g.fillStyle = hsl(35, 15, 70);
    g.globalAlpha = 0.18;
    g.fillRect(x, 0, 3 + r() * 6, S);
  }
  g.globalAlpha = 1;
  return finish(c);
}

/** Asfalto viejo de aldea: gris cálido con parches, grietas y bordes de tierra. */
function asphalt() {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(31);
  g.fillStyle = hsl(30, 6, 46);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) {
    const x = r() * S;
    const y = r() * S;
    g.fillStyle = hsl(30, 5 + r() * 6, 40 + r() * 14);
    g.globalAlpha = 0.45;
    wrapDraw(S, x - 30, y - 30, 60, 60, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 10 + r() * 30, 8 + r() * 18, r() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
  g.strokeStyle = hsl(30, 8, 30);
  g.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    let x = r() * S;
    let y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.5) * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // los bordes (u = 0 y 1 del camino) se comen de tierra y hierba
  const grd = g.createLinearGradient(0, 0, S, 0);
  grd.addColorStop(0, 'rgba(120,130,70,0.85)');
  grd.addColorStop(0.1, 'rgba(120,110,80,0)');
  grd.addColorStop(0.9, 'rgba(120,110,80,0)');
  grd.addColorStop(1, 'rgba(120,130,70,0.85)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return finish(c);
}

/** Grava del patio: piedrecillas claras sobre tierra. */
function gravel() {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(17);
  g.fillStyle = hsl(36, 18, 62);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const x = r() * S;
    const y = r() * S;
    const l = 50 + r() * 35;
    g.fillStyle = hsl(30 + r() * 15, 8 + r() * 12, l);
    g.beginPath();
    g.ellipse(x, y, 1.2 + r() * 2.4, 1 + r() * 1.8, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

/** Baldosa de barro (terraza): cuadrados terracota con junta clara. */
function terracotta() {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(23);
  g.fillStyle = hsl(30, 20, 72);
  g.fillRect(0, 0, S, S);
  const n = 4;
  const cs = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const l = 50 + (r() - 0.5) * 10;
      g.fillStyle = hsl(16 + (r() - 0.5) * 6, 48, l);
      g.fillRect(i * cs + 2, j * cs + 2, cs - 4, cs - 4);
      g.fillStyle = hsl(18, 45, l + 7);
      g.fillRect(i * cs + 4, j * cs + 4, cs * 0.5, cs * 0.18);
    }
  return finish(c);
}

/** Bolo de granito: superficie continua moteada, con líquenes y algo de musgo. */
function boulderTex() {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(61);
  g.fillStyle = hsl(36, 10, 64);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = r() * S;
    const y = r() * S;
    g.fillStyle = hsl(34 + r() * 10, 8 + r() * 10, 56 + r() * 16);
    g.globalAlpha = 0.5;
    wrapDraw(S, x - 40, y - 40, 80, 80, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 15 + r() * 35, 10 + r() * 25, r() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = r() < 0.5 ? hsl(30, 8, 38 + r() * 10) : hsl(40, 10, 82 + r() * 10);
    g.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  for (let i = 0; i < 22; i++) {
    const x = r() * S;
    const y = r() * S;
    const moss = r() < 0.45;
    g.fillStyle = moss ? hsl(80 + r() * 15, 38, 38 + r() * 10) : hsl(60 + r() * 20, 25, 78);
    g.globalAlpha = 0.6;
    wrapDraw(S, x - 20, y - 20, 40, 40, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 5 + r() * 16, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
  return finish(c);
}

const MAKERS: Record<string, () => THREE.Texture> = {
  boulder: () => boulderTex(),
  gravel: () => gravel(),
  terracotta: () => terracotta(),
  asphalt: () => asphalt(),
  plaster: () => plaster(),
  granite_light: () => granite({ light: 76, hue: 38 }),
  granite: () => granite(),
  drystone: () => granite({ light: 62, hue: 34 }),
  mossy_stone: () => granite({ moss: 1, light: 60 }),
  cobblestone: () => slates(),
  stone_slates: () => slates(),
  roof_tiles: () => tiles(false),
  roof_tiles_old: () => tiles(true),
  wood_weathered: () => wood({ weathered: true }),
  wood_planks: () => wood({ planks: 3 }),
  bark: () => wood({ weathered: true, planks: 6 }),
  dirt_path: () => dirt(),
  grass_path: () => dirt(),
};

const cache = new Map<string, THREE.Texture>();
/** Textura pintada por nombre (los mismos nombres que tenían las texturas fotográficas). */
export function painted(name: string): THREE.Texture | null {
  const make = MAKERS[name];
  if (!make) return null;
  let t = cache.get(name);
  if (!t) {
    t = make();
    cache.set(name, t);
  }
  return t;
}

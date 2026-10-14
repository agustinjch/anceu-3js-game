// Keyboard + gamepads → per-player raw input bits, plus edge-triggered menu navigation.
import { U, D, L, R, LP, HP, LK, HK } from './sim/input.js';

export const KEYMAP = [
  { KeyW: U, KeyS: D, KeyA: L, KeyD: R, KeyU: LP, KeyI: HP, KeyJ: LK, KeyK: HK },
  {
    ArrowUp: U, ArrowDown: D, ArrowLeft: L, ArrowRight: R,
    Numpad4: LP, Numpad5: HP, Numpad1: LK, Numpad2: HK,
    // laptops without a numpad
    KeyO: LP, KeyP: HP, KeyL: LK, Semicolon: HK,
  },
];
export const KEY_LABELS = [
  { move: 'W A S D', LP: 'U', HP: 'I', LK: 'J', HK: 'K' },
  { move: '← ↑ → ↓', LP: '4 / O', HP: '5 / P', LK: '1 / L', HK: '2 / Ñ' },
];

const held = new Set();
const menuPressed = new Set();
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!held.has(e.code)) menuPressed.add(e.code);
  held.add(e.code);
});
addEventListener('keyup', e => held.delete(e.code));
// a key released while the tab is hidden never fires keyup: drop everything on blur
addEventListener('blur', () => held.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) held.clear(); });

function pads() {
  return [...(navigator.getGamepads?.() || [])].filter(p => p && p.connected).sort((a, b) => a.index - b.index);
}

function padBits(p) {
  if (!p) return 0;
  const b = i => p.buttons[i]?.pressed;
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  let bits = 0;
  if (b(12) || ay < -0.5) bits |= U;
  if (b(13) || ay > 0.5) bits |= D;
  if (b(14) || ax < -0.5) bits |= L;
  if (b(15) || ax > 0.5) bits |= R;
  if (b(2)) bits |= LP;
  if (b(3)) bits |= HP;
  if (b(0)) bits |= LK;
  if (b(1)) bits |= HK;
  if (b(4) || b(6)) bits |= LP | LK; // shoulder: throw
  if (b(5) || b(7)) bits |= HP | HK; // shoulder: super
  return bits;
}

// Raw bits for a player (keyboard OR its gamepad).
export function readPlayer(i) {
  let bits = 0;
  for (const [code, bit] of Object.entries(KEYMAP[i])) if (held.has(code)) bits |= bit;
  bits |= padBits(pads()[i]);
  // opposite directions cancel out
  if ((bits & L) && (bits & R)) bits &= ~(L | R);
  if ((bits & U) && (bits & D)) bits &= ~U;
  return bits;
}

// Menu navigation, edge-triggered, from any player. Returns { up, down, left, right, ok, back, start, player }.
let prevPad = [0, 0], prevStart = [false, false];
export function readMenu() {
  const out = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false, any: menuPressed.size > 0, player: 0 };
  const kb = (codes, key, player = 0) => { for (const c of codes) if (menuPressed.has(c)) { out[key] = true; out.player = player; } };
  kb(['KeyW'], 'up'); kb(['KeyS'], 'down'); kb(['KeyA'], 'left'); kb(['KeyD'], 'right');
  kb(['ArrowUp'], 'up', 1); kb(['ArrowDown'], 'down', 1); kb(['ArrowLeft'], 'left', 1); kb(['ArrowRight'], 'right', 1);
  kb(['KeyU', 'KeyJ', 'Space'], 'ok'); kb(['Enter', 'Numpad4', 'Numpad1', 'NumpadEnter', 'KeyO', 'KeyL'], 'ok', 1);
  kb(['KeyI', 'KeyK', 'Backspace'], 'back'); kb(['Numpad5', 'Numpad2', 'KeyP', 'Semicolon'], 'back', 1);
  kb(['Escape'], 'start');
  menuPressed.clear();
  pads().slice(0, 2).forEach((p, i) => {
    const bits = padBits(p), was = prevPad[i] || 0, edge = bits & ~was;
    if (edge & U) { out.up = true; out.player = i; }
    if (edge & D) { out.down = true; out.player = i; }
    if (edge & L) { out.left = true; out.player = i; }
    if (edge & R) { out.right = true; out.player = i; }
    if (edge & (LK | LP)) { out.ok = true; out.player = i; }
    if (edge & HK) { out.back = true; out.player = i; }
    if (edge) out.any = true;
    const st = !!p.buttons[9]?.pressed;
    if (st && !prevStart[i]) { out.start = true; out.player = i; }
    prevPad[i] = bits; prevStart[i] = st;
  });
  return out;
}

export const anyInput = () => held.size > 0 || pads().some(p => p.buttons.some(b => b.pressed));

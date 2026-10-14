import { createWorld, stepFighters } from '../src/sim/moves.js';
import { FIGHTERS } from '../src/data/fighters/index.js';

export function world(a = 'pepe', b = 'pepe', xa = -1.5, xb = 1.5) {
  const w = createWorld(FIGHTERS[a], FIGHTERS[b]);
  w.fighters[0].x = xa; w.fighters[1].x = xb;
  return w;
}

// push one frame of raw input for each side and step; returns the frame's events
export function tick(w, a = 0, b = 0) {
  w.events = [];
  w.fighters[0].input.push(a, w.fighters[0].facing);
  w.fighters[1].input.push(b, w.fighters[1].facing);
  stepFighters(w);
  return w.events;
}

export function run(w, n, a = 0, b = 0) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...tick(w, typeof a === 'function' ? a(i) : a, typeof b === 'function' ? b(i) : b));
  return ev;
}

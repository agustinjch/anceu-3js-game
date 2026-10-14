import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, tick, run } from './helpers.js';
import { U, D, L, R, LP, HP, LK, HK } from '../src/sim/input.js';
import { SIM } from '../src/data/common.js';

const hits = ev => ev.filter(e => e.type === 'hit');
const blocks = ev => ev.filter(e => e.type === 'block');

test('standing LP connects on its active frames only', () => {
  const w = world('pepe', 'pepe', -0.4, 0.4);
  const ev = tick(w, LP, 0);
  assert.equal(w.fighters[0].state, 'attack');
  assert.equal(hits(ev).length, 0);
  // startup 4 → first active frame is mf 5
  const ev2 = run(w, 4);
  assert.equal(hits(ev2).length, 1);
  assert.equal(w.fighters[1].health, 1000 - 30);
});

test('a whiff out of range does nothing', () => {
  const w = world('pepe', 'pepe', -2, 2);
  const ev = run(w, 20, i => (i === 0 ? LP : 0));
  assert.equal(hits(ev).length, 0);
  assert.equal(w.fighters[1].health, 1000);
});

test('standing block stops mid, fails against a low', () => {
  const w = world('pepe', 'pepe', -0.4, 0.4);
  // P2 faces left, so holding R is back
  let ev = run(w, 10, i => (i === 0 ? LP : 0), R);
  assert.equal(blocks(ev).length, 1);
  assert.equal(w.fighters[1].health, 1000);
  const w2 = world('pepe', 'pepe', -0.4, 0.4);
  ev = run(w2, 24, i => (i === 10 ? D | LK : D), D | R);
  assert.equal(w2.fighters[1].health, 1000, 'crouch block stops the low');
  const w3 = world('pepe', 'pepe', -0.4, 0.4);
  ev = run(w3, 24, i => (i === 10 ? D | LK : D), R);
  assert.equal(hits(ev).length, 1, 'cLK is low');
});

test('crouching block fails against an overhead (jump-in)', () => {
  const w = world('pepe', 'pepe', -1.6, 0.4);
  // P1 jumps forward and presses HK near the top of the arc
  const ev = run(w, 60, i => (i < 2 ? U | R : i === 26 ? HK : 0), D | R);
  assert.ok(hits(ev).length >= 1, 'overhead should hit a crouch-blocker');
});

test('trade: both fighters hit on the same frame', () => {
  const w = world('pepe', 'pepe', -0.4, 0.4);
  const ev = run(w, 8, i => (i === 0 ? LP : 0), i => (i === 0 ? LP : 0));
  assert.equal(hits(ev).length, 2);
  assert.equal(w.fighters[0].health, 970);
  assert.equal(w.fighters[1].health, 970);
});

test('hitstop freezes both fighters', () => {
  const w = world('pepe', 'pepe', -0.4, 0.4);
  run(w, 5, i => (i === 0 ? LP : 0));
  assert.ok(w.hitstop > 0);
  const mf = w.fighters[0].mf, sf = w.fighters[1].sf;
  tick(w); tick(w);
  assert.equal(w.fighters[0].mf, mf);
  assert.equal(w.fighters[1].sf, sf);
});

test('corner pushback moves the attacker instead', () => {
  const lim = SIM.WALL - 0.3;
  const w = world('pepe', 'pepe', lim - 0.6, lim);
  const x0 = w.fighters[0].x;
  run(w, 30, i => (i === 0 ? HP : 0));
  assert.ok(w.fighters[0].x < x0 - 0.02, `attacker should be pushed back (${w.fighters[0].x} vs ${x0})`);
  assert.ok(w.fighters[1].x <= lim + 1e-9);
});

test('throw is unblockable and techable within 7 frames', () => {
  const w = world('pepe', 'pepe', -0.35, 0.35);
  run(w, 60, i => (i === 0 ? LP | LK : 0), R);
  assert.equal(w.fighters[1].health, 1000 - 120, 'throw beats block');
  const t = world('pepe', 'pepe', -0.35, 0.35);
  const ev = run(t, 40, i => (i === 0 ? LP | LK : 0), i => (i === 7 ? LP | LK : 0));
  assert.ok(ev.some(e => e.type === 'tech'));
  assert.equal(t.fighters[1].health, 1000);
});

test('combo damage scaling: 3rd hit at 90 %', () => {
  const w = world('victor', 'pepe', -0.4, 0.4);
  // sLP (32) → chain sLP (32) → chain sHP (80 * 0.9 = 72)
  const ev = run(w, 40, i => (i === 0 ? LP : i === 8 ? LP : i === 16 ? HP : 0));
  const dmg = hits(ev).map(e => e.damage);
  assert.deepEqual(dmg, [32, 32, 72]);
});

test('fighters face each other after crossing over', () => {
  const w = world('pepe', 'pepe', -0.6, 0.6);
  run(w, 70, i => (i < 2 ? U | R : 0));
  assert.ok(w.fighters[0].x > w.fighters[1].x, 'P1 jumped over');
  assert.equal(w.fighters[0].facing, -1);
  assert.equal(w.fighters[1].facing, 1);
});

test('Rosa command grab misses an airborne opponent', () => {
  const w = world('rosa', 'pepe', -0.5, 0.5);
  run(w, 6, 0, i => (i < 2 ? U : 0));
  assert.ok(w.fighters[1].airborne);
  run(w, 8, i => (i === 0 ? D : i === 1 ? D | LP : 0));
  assert.equal(w.fighters[0].grabbed, null);
  assert.equal(w.fighters[1].health, 1000);
});

test('Rosa command grab cannot be teched', () => {
  const w = world('rosa', 'pepe', -0.5, 0.5);
  run(w, 60, i => (i === 0 ? D : i === 1 ? D | LP : 0), i => (i === 6 ? LP | LK : 0));
  assert.equal(w.fighters[1].health, 1000 - 160);
});

test('Víctor Esquiva counters a strike in its window', () => {
  const w = world('victor', 'pepe', -0.45, 0.45);
  const ev = run(w, 30, i => (i === 0 ? D : i === 1 ? D | LK : 0), i => (i === 3 ? LP : 0));
  assert.ok(ev.some(e => e.type === 'counter'));
  assert.equal(w.fighters[0].health, 1000);
  assert.ok(w.fighters[1].health < 1000, 'counter punch lands');
});

test('Se teleports behind the rival', () => {
  const w = world('se', 'pepe', -2, 1);
  run(w, 20, i => (i === 0 ? D : i === 1 ? D | HK : 0));
  assert.ok(w.fighters[0].x > w.fighters[1].x);
});

test('projectile is destroyed on hit, one at a time per fighter', () => {
  const w = world('pepe', 'pepe', -3, 2);
  run(w, 2, i => (i === 0 ? D : D | LP));
  run(w, 12);
  assert.equal(w.projectiles.length, 1);
  run(w, 3, i => (i === 0 ? D : i === 1 ? D | LP : 0)); // a second bark is refused
  assert.equal(w.projectiles.length, 1);
  const ev = run(w, 80);
  assert.equal(hits(ev).length, 1);
  assert.equal(w.projectiles.length, 0);
});

test('two projectiles cancel each other out', () => {
  const w = world('pepe', 'se', -3, 3);
  const ev = run(w, 120, i => (i === 0 ? D : i === 1 ? D | LP : 0), i => (i === 0 ? L : i === 1 ? L | LP : 0));
  assert.ok(ev.some(e => e.type === 'clash'));
  assert.equal(hits(ev).length, 0);
});

test('super needs a full bar and spends it', () => {
  const w = world('pepe', 'pepe', -0.6, 0.6);
  tick(w, HP | HK);
  assert.notEqual(w.fighters[0].moveId, 'super');
  const w2 = world('pepe', 'pepe', -0.6, 0.6);
  run(w2, 30);
  w2.fighters[0].meter = 150;
  const ev = tick(w2, HP | HK);
  assert.ok(ev.some(e => e.type === 'super'));
  assert.equal(w2.fighters[0].meter, 50);
});

test('super / throw chords pressed a frame apart still come out (kara cancel)', () => {
  const w = world('se', 'pepe', -0.5, 0.5);
  run(w, 5);
  w.fighters[0].meter = 100;
  tick(w, HP); // starts sHP
  assert.equal(w.fighters[0].moveId, 'sHP');
  const ev = tick(w, HP | HK);
  assert.equal(w.fighters[0].moveId, 'super');
  assert.ok(ev.some(e => e.type === 'super'));
  const t = world('pepe', 'pepe', -0.35, 0.35);
  tick(t, LP); tick(t, LP);
  tick(t, LP | LK);
  assert.equal(t.fighters[0].moveId, 'throw');
});

test('Rosa caldiño heals but never above max', () => {
  const w = world('rosa', 'pepe', -3, 3);
  w.fighters[0].health = 1000;
  run(w, 80, i => (i === 0 ? D : i === 1 ? D | LK : 0));
  assert.equal(w.fighters[0].health, 1060);
  run(w, 80, i => (i === 0 ? D : i === 1 ? D | LK : 0));
  assert.equal(w.fighters[0].health, 1100);
});

test('Agus router zaps the rival who walks onto it', () => {
  const w = world('agus', 'pepe', -2, 1);
  run(w, 40, i => (i === 0 ? D : i === 1 ? D | LK : 0));
  assert.equal(w.objects.length, 1);
  const ev = run(w, 120, 0, L);
  assert.ok(ev.some(e => e.type === 'zap'));
  assert.ok(w.fighters[1].health < 1000);
});

test('nobody leaves the stage', () => {
  const w = world('pepe', 'pepe', 0, 1);
  run(w, 400, L, R);
  for (const f of w.fighters) assert.ok(Math.abs(f.x) <= SIM.WALL - 0.3 + 1e-9);
});

test('super chord pressed during hitstop still comes out', () => {
  const w = world('victor', 'pepe', -0.4, 0.4);
  w.fighters[0].meter = 100;
  run(w, 5, i => (i === 0 ? LP : 0));          // jab connects → hitstop
  assert.ok(w.hitstop > 0);
  run(w, 2, 0);
  run(w, 12, HP | HK);                          // press both during the freeze and hold
  assert.equal(w.fighters[0].moveId, 'super');
});

test('a single forward tap during a freeze is not a dash', () => {
  const w = world('victor', 'pepe', -1, 1);
  run(w, 5);
  w.fighters[0].meter = 100;
  tick(w, HP | HK);                             // Víctor's super: 30-frame freeze
  run(w, 22, 0, 0);
  run(w, 2, 0, L);                              // Pepe (facing left) taps forward once
  run(w, 12, 0, 0);
  assert.notEqual(w.fighters[1].state, 'dash');
});

test('Víctor Esquiva does not counter a router zap', () => {
  const w = world('agus', 'victor', -2, 1.2);
  run(w, 40, i => (i === 0 ? D : i === 1 ? D | LK : 0));
  const r = w.objects[0];
  assert.ok(r);
  w.fighters[1].x = r.x + 0.9;
  const ev = run(w, 40, 0, i => (i === 0 ? D : i === 1 ? D | LK : L));
  assert.ok(!ev.some(e => e.type === 'counter'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputBuffer, R, L, D, LP, HP, LK } from '../src/sim/input.js';

test('pressed only on the edge frame, held while down', () => {
  const b = new InputBuffer();
  b.push(LP, 1);
  assert.equal(b.pressed(LP), true);
  b.consume();
  b.push(LP, 1);
  assert.equal(b.pressed(LP), false);
  assert.equal(b.held(LP), true);
});

test('→+P: forward newly pressed within 8 frames', () => {
  const b = new InputBuffer();
  b.push(R, 1);
  for (let i = 0; i < 6; i++) { b.push(0, 1); b.consume(); }
  b.push(LP, 1);
  assert.equal(b.recentDir('fwd'), true);
  const c = new InputBuffer();
  c.push(R, 1);
  for (let i = 0; i < 9; i++) { c.push(0, 1); c.consume(); }
  c.push(LP, 1);
  assert.equal(c.recentDir('fwd'), false);
});

test('holding forward for a long time is not a special', () => {
  const b = new InputBuffer();
  for (let i = 0; i < 20; i++) { b.push(R, 1); b.consume(); }
  b.push(R | LP, 1);
  assert.equal(b.recentDir('fwd'), false);
  assert.equal(b.fwd, true);
});

test('back is relative to facing', () => {
  const b = new InputBuffer();
  b.push(R, -1);
  assert.equal(b.back, true);
  assert.equal(b.fwd, false);
  b.push(L, -1);
  assert.equal(b.fwd, true);
});

test('double tap forward', () => {
  const b = new InputBuffer();
  b.push(R, 1); b.push(R, 1); b.push(0, 1); b.push(0, 1); b.push(R, 1);
  assert.equal(b.doubleTap('fwd'), true);
});

test('chord accepts presses up to 3 frames apart', () => {
  const b = new InputBuffer();
  b.push(LP, 1); b.consume(); b.push(LP, 1); b.consume(); b.push(LP | LK, 1);
  assert.equal(b.chord(LP, LK), true);
  b.consume();
  b.push(LP | LK, 1);
  assert.equal(b.chord(LP, LK), false);
});

test('strength prefers heavy and down special detection', () => {
  const b = new InputBuffer();
  b.push(D, 1); b.push(D | HP | LP, 1);
  assert.equal(b.pressedStrength('P'), 'H');
  assert.equal(b.recentDir('down'), true);
});

test('a press made during hitstop is seen on the next read', () => {
  const b = new InputBuffer();
  b.push(0, 1); b.consume();
  b.push(LP, 1); b.push(LP, 1); b.push(LP, 1); // sim frozen, nobody read
  assert.equal(b.pressed(LP), true);
  b.consume();
  b.push(LP, 1);
  assert.equal(b.pressed(LP), false);
});

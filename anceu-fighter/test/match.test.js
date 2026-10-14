import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, PHASE_FRAMES } from '../src/sim/match.js';
import { FIGHTERS } from '../src/data/fighters/index.js';
import { SIM } from '../src/data/common.js';
import { D, LP, HP, HK, LK } from '../src/sim/input.js';

const mk = (a = 'pepe', b = 'pepe') => new Match({ p1: FIGHTERS[a], p2: FIGHTERS[b], skipIntro: true });
const toFight = m => { while (m.phase !== 'fight') m.step(); };
const until = (m, pred, inputs = () => [0, 0], max = 20000) => {
  for (let i = 0; i < max && !pred(); i++) m.step(inputs(i));
};

test('inputs are ignored before FIGHT', () => {
  const m = mk();
  for (let i = 0; i < 10; i++) m.step([LP, 0]);
  assert.equal(m.phase, 'roundStart');
  assert.equal(m.fighters[0].state, 'idle');
});

test('KO ends the round and awards a win', () => {
  const m = mk();
  toFight(m);
  m.fighters[1].health = 10;
  m.fighters[0].x = -0.4; m.fighters[1].x = 0.4;
  until(m, () => m.phase === 'ko', i => [i % 2 ? LP : 0, 0]);
  assert.equal(m.roundWinner, 0);
  until(m, () => m.phase === 'roundEnd');
  assert.deepEqual(m.wins, [1, 0]);
});

test('timeout gives the round to the higher health %', () => {
  const m = mk('rosa', 'pepe');
  toFight(m);
  m.fighters[0].health = 600; // 54 % of 1100
  m.fighters[1].health = 600; // 60 % of 1000
  m.timer = 5;
  until(m, () => m.phase === 'roundEnd');
  assert.equal(m.roundResult, 'time');
  assert.equal(m.roundWinner, 1);
});

test('double KO gives each a win', () => {
  const m = mk();
  toFight(m);
  m.fighters[0].health = 10; m.fighters[1].health = 10;
  m.fighters[0].x = -0.4; m.fighters[1].x = 0.4;
  until(m, () => m.phase !== 'fight', () => [LP, LP]);
  assert.equal(m.roundWinner, 'draw');
  until(m, () => m.phase === 'roundEnd');
  assert.deepEqual(m.wins, [1, 1]);
});

test('first to two wins the match; a 2–2 plays round 5', () => {
  const m = mk();
  m.wins = [1, 0];
  toFight(m);
  m.fighters[0].health = 0;
  until(m, () => m.phase === 'roundStart' || m.phase === 'matchEnd');
  assert.equal(m.phase, 'roundStart');
  assert.deepEqual(m.wins, [1, 1]);
  // a drawn round 4 from 1–1 makes it 2–2: round 5 decides
  const n = mk(); n.wins = [1, 1]; n.round = 4;
  toFight(n);
  n.fighters[0].health = 1; n.fighters[1].health = 1; n.timer = 1;
  until(n, () => n.phase === 'roundStart' || n.phase === 'matchEnd');
  assert.equal(n.phase, 'roundStart');
  assert.equal(n.round, 5);
  const o = mk(); o.wins = [1, 0];
  toFight(o);
  o.fighters[1].health = 0;
  until(o, () => o.phase === 'matchEnd');
  assert.equal(o.winner, 0);
  assert.equal(o.fighters[0].state, 'victory');
});

test('round reset clears projectiles, objects and states', () => {
  const m = mk('se', 'pepe');
  toFight(m);
  m.world.projectiles.push({ owner: 0, kind: 'queimada', x: 0, y: 1, vx: 0, vy: 0, gravity: 0, w: 1, h: 1, life: 999, hp: 1, move: {} });
  m.world.objects.push({ owner: 0, kind: 'fog', x: 0, w: 1, life: 999, age: 0 });
  m.fighters[1].health = 0;
  until(m, () => m.phase === 'roundStart');
  assert.equal(m.world.projectiles.length, 0);
  assert.equal(m.world.objects.length, 0);
  assert.equal(m.fighters[1].health, 1000);
  assert.equal(m.fighters[0].state, 'idle');
  assert.equal(m.timer, SIM.ROUND_FRAMES);
});

test('meter carries over between rounds', () => {
  const m = mk();
  toFight(m);
  m.fighters[0].meter = 180;
  m.fighters[1].health = 0;
  until(m, () => m.phase === 'roundStart');
  assert.equal(m.fighters[0].meter, 180);
});

test('deterministic replay: same inputs, same state', () => {
  const script = i => [(i * 7) % 13 === 0 ? LP : (i * 3) % 17 === 0 ? D | LK : 0, (i * 5) % 11 === 0 ? HP : 0];
  const play = () => { const m = mk('agus', 'se'); for (let i = 0; i < 3000; i++) m.step(script(i)); return m.snapshot(); };
  assert.equal(play(), play());
});

test('intro plays before round 1', () => {
  const m = new Match({ p1: FIGHTERS.pepe, p2: FIGHTERS.rosa });
  assert.equal(m.phase, 'intro');
  assert.equal(m.fighters[0].state, 'intro');
  for (let i = 0; i < PHASE_FRAMES.intro; i++) m.step();
  assert.equal(m.phase, 'roundStart');
});

test('nothing lands after the round is decided', () => {
  const m = mk('se', 'victor');
  toFight(m);
  const [se, vi] = m.fighters;
  se.x = -0.5; vi.x = 0.5; se.health = 20; vi.health = 150; se.meter = 100;
  m.step([HP | HK, 0]);                          // pot super is on its way
  until(m, () => se.health <= 0 || m.phase !== 'fight', i => [0, i % 3 === 0 ? LP : 0]);
  assert.equal(m.roundWinner, 1);
  until(m, () => m.phase === 'roundStart' || m.phase === 'matchEnd');
  assert.deepEqual(m.wins, [0, 1]);
});

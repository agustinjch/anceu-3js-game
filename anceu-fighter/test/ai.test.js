import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/sim/match.js';
import { AI } from '../src/sim/ai.js';
import { FIGHTERS, ROSTER } from '../src/data/fighters/index.js';
import { LP } from '../src/sim/input.js';

function cpuMatch(a, b, la, lb, frames, seed = 1) {
  const m = new Match({ p1: FIGHTERS[a], p2: FIGHTERS[b], skipIntro: true });
  const ais = [new AI(la, seed), new AI(lb, seed + 1)];
  const ev = [];
  for (let i = 0; i < frames && m.phase !== 'matchEnd'; i++) ev.push(...m.step([ais[0].think(m.world, 0), ais[1].think(m.world, 1)]));
  return { m, ev };
}

for (const id of ROSTER) {
  test(`hard CPU ${id} vs hard CPU deals and takes damage`, () => {
    const opp = id === 'rosa' ? 'pepe' : 'rosa';
    const { ev } = cpuMatch(id, opp, 'hard', 'hard', 60 * 60);
    const hits = ev.filter(e => e.type === 'hit');
    assert.ok(hits.some(h => h.side === 0), `${id} never hit`);
    assert.ok(hits.some(h => h.side === 1), `${id} never got hit`);
  });
}

test('a full CPU match finishes with a winner', () => {
  const { m } = cpuMatch('victor', 'agus', 'hard', 'normal', 60 * 60 * 8);
  assert.equal(m.phase, 'matchEnd');
  assert.ok(m.winner === 0 || m.winner === 1 || m.winner === 'draw');
});

test('easy blocks fewer jabs than hard', () => {
  const blockRate = level => {
    const m = new Match({ p1: FIGHTERS.pepe, p2: FIGHTERS.pepe, skipIntro: true });
    const ai = new AI(level, 3);
    let blocks = 0, hits = 0;
    for (let i = 0; i < 60 * 120; i++) {
      m.fighters[0].x = m.fighters[1].x - 0.75; m.fighters[0].health = 1000; m.fighters[1].health = 1000;
      const ev = m.step([i % 45 === 0 ? LP : 0, ai.think(m.world, 1)]);
      for (const e of ev) { if (e.type === 'block' && e.side === 0) blocks++; if (e.type === 'hit' && e.side === 0) hits++; }
    }
    return blocks / Math.max(1, blocks + hits);
  };
  const easy = blockRate('easy'), hard = blockRate('hard');
  assert.ok(hard > easy, `hard ${hard.toFixed(2)} should block more than easy ${easy.toFixed(2)}`);
});

test('CPU match is deterministic for a seed', () => {
  const a = cpuMatch('se', 'pepe', 'normal', 'normal', 3000, 9).m.snapshot();
  const b = cpuMatch('se', 'pepe', 'normal', 'normal', 3000, 9).m.snapshot();
  assert.equal(a, b);
});

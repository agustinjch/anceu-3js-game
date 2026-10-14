import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTERS, ROSTER, NORMALS } from '../src/data/fighters/index.js';
import { CLIP_TIMING, fighterClips } from '../src/data/common.js';

test('roster has the five fighters', () => {
  assert.deepEqual(ROSTER, ['pepe', 'victor', 'se', 'agus', 'rosa']);
});

for (const id of ROSTER) {
  const f = FIGHTERS[id];
  test(`${id}: complete move list with sane frame data`, () => {
    for (const n of NORMALS) assert.ok(f.moves[n], `${id} missing ${n}`);
    assert.equal(f.specials.length, 3);
    for (const s of f.specials) for (const st of ['L', 'H']) assert.ok(f.moves[`${s.move}_${st}`], `${id} missing ${s.move}_${st}`);
    assert.ok(f.moves[f.super]);
    for (const [k, m] of Object.entries(f.moves)) {
      assert.ok(m.startup >= 0 && m.active >= 0 && m.recovery >= 0, `${id}.${k} frames`);
      assert.ok(m.startup + m.active + m.recovery > 0, `${id}.${k} total`);
      if (m.clip) assert.ok(CLIP_TIMING[m.clip], `${id}.${k} clip ${m.clip} has no timing`);
    }
    assert.ok(CLIP_TIMING[f.intro.clip] && CLIP_TIMING[f.victory.clip]);
  });
  test(`${id}: every clip it uses is in its clip sets`, () => {
    const have = new Set(fighterClips(f).map(c => c.clip));
    const used = [...Object.values(f.moves).map(m => m.clip), f.intro.clip, f.victory.clip].filter(Boolean);
    for (const c of used) assert.ok(have.has(c), `${id} uses ${c} but does not load it`);
  });
}

test('Rosa has more health', () => {
  assert.equal(FIGHTERS.rosa.health, 1100);
  assert.equal(FIGHTERS.pepe.health, 1000);
});

// CPU opponent. It reads the world with a reaction delay and "presses" the same raw inputs a human
// would, so it obeys every rule (buffer windows, cancels, meter).
import { U, D, L, R, LP, HP, LK, HK } from './input.js';
import { SIM } from '../data/common.js';
import { mulberry32 } from './rng.js';

const F = 1 << 10, B = 1 << 11; // relative directions, converted to L/R at the end

export const LEVELS = {
  easy: { reaction: 30, think: 22, block: 0.3, antiAir: 0.15, punish: 0.1, combo: 0.15, aggro: 0.5, superRate: 0.2 },
  normal: { reaction: 18, think: 12, block: 0.6, antiAir: 0.45, punish: 0.4, combo: 0.5, aggro: 0.7, superRate: 0.5 },
  hard: { reaction: 10, think: 6, block: 0.85, antiAir: 0.8, punish: 0.8, combo: 0.85, aggro: 0.85, superRate: 0.85 },
};

function seen(world, me, op) {
  const m = op.move;
  return {
    x: op.x, dist: Math.abs(op.x - me.x),
    attacking: op.state === 'attack' && !!m && (!!m.box || !!m.grab) && op.movePhase !== 'recovery',
    recovering: op.state === 'attack' && op.movePhase === 'recovery' && op.moveTotal - op.mf > 8,
    low: op.state === 'attack' && m?.level === 'low',
    air: op.airborne && op.state !== 'knockdown' && op.state !== 'ko',
    approaching: Math.sign(op.vx) === Math.sign(me.x - op.x),
    proj: world.projectiles.some(p => p.owner === op.side && Math.abs(p.x - me.x) < 3 && Math.sign(p.vx) === Math.sign(me.x - p.x)),
    down: op.state === 'knockdown' || op.state === 'getup',
  };
}

export class AI {
  constructor(level = 'normal', seed = 7) {
    this.level = level;
    this.cfg = LEVELS[level];
    this.rng = mulberry32(seed);
    this.queue = [];
    this.history = [];
    this.hold = 0; this.holdBits = 0;
    this.wait = 0;
  }

  // bits for the special with this name, e.g. seq(def, 'bark', 'H') → [D, D|HP]
  specialSeq(def, name, st = this.rng() < 0.5 ? 'L' : 'H') {
    const s = def.specials.find(x => x.move === name);
    if (!s) return null;
    const dir = s.input === 'fwd' ? F : D;
    const btn = s.btn === 'P' ? (st === 'H' ? HP : LP) : (st === 'H' ? HK : LK);
    return [0, dir, dir | btn, 0];
  }

  think(world, idx) {
    const me = world.fighters[idx], op = world.fighters[1 - idx];
    this.history.push(seen(world, me, op));
    if (this.history.length > 64) this.history.shift();
    const s = this.history[Math.max(0, this.history.length - 1 - this.cfg.reaction)];
    // Guarding is a read, not a reaction (a 4-frame jab is faster than any reaction): when the rival
    // starts an attack nearby, the CPU "guessed right" with its level's block probability.
    const m = op.move;
    if (me.actionable && op.state === 'attack' && op.mf === 1 && m && (m.box || m.projectile) && !m.grab && Math.abs(op.x - me.x) < 2.8) {
      if (this.rng() < this.cfg.block) {
        this.queue = [];
        this.holdFor(B | (m.level === 'low' ? D : 0), m.startup + m.active + 6);
      }
    }
    return this.toRaw(this.choose(world, me, op, s), me.facing);
  }

  toRaw(bits, facing) {
    let out = bits & ~(F | B);
    if (bits & F) out |= facing > 0 ? R : L;
    if (bits & B) out |= facing > 0 ? L : R;
    return out;
  }

  push(seq) { this.queue.push(...seq); }
  holdFor(bits, n) { this.holdBits = bits; this.hold = n; return bits; }

  choose(world, me, op, s) {
    const r = this.rng, c = this.cfg, def = me.def, ai = def.ai || {};
    if (this.queue.length) return this.queue.shift();

    // keep blocking while in blockstun
    if (me.state === 'blockstun') return B | (me.crouchBlock ? D : 0);
    // combo: cancel a connected normal into a special
    if (me.state === 'attack') {
      if (me.connected && me.move.cancel && !this.cancelTried) {
        this.cancelTried = true;
        if (me.meter >= SIM.SUPER_COST && r() < c.superRate * 0.5) { this.push([HP | HK]); return 0; }
        if (r() < c.combo) {
          const name = ai.approach || ai.antiAir;
          const seq = name && this.specialSeq(def, name, 'H');
          if (seq) { this.push(seq.slice(1)); return seq[0]; }
        }
      }
      return 0;
    }
    this.cancelTried = false;
    if (me.state === 'jump') return !me.airAttackUsed && s.dist < 1.4 && r() < 0.35 ? (r() < 0.5 ? HK : HP) : 0;
    if (!me.actionable) return 0;

    if (this.hold > 0) { this.hold--; return this.holdBits; }

    // reactions (every frame, gated by probability so easy CPUs miss them)
    if (s.attacking && s.dist < 2.8 && r() < c.block * 0.5) return this.holdFor(B | (s.low ? D : 0), 10);
    if (s.proj) {
      const x = r();
      if (x < c.block * 0.4) return this.holdFor(B, 12);
      if (x < c.block * 0.5) return this.holdFor(U | F, 2);
    }
    if (s.air && s.approaching && s.dist < 2.4 && ai.antiAir && r() < c.antiAir * 0.25) {
      const seq = this.specialSeq(def, ai.antiAir, 'H');
      if (seq) { this.push(seq); return 0; }
    }
    if (s.recovering && s.dist < 1.8 && r() < c.punish * 0.3) {
      if (me.meter >= SIM.SUPER_COST && r() < c.superRate) { this.push([HP | HK]); return 0; }
      this.push([s.dist < 1.1 ? HP : HK]);
      return 0;
    }

    // deliberate decisions at the CPU's thinking pace
    if (this.wait > 0) { this.wait--; return this.holdBits; }
    this.wait = c.think;
    const d = s.dist, x = r();
    if (me.meter >= SIM.SUPER_COST && d < 1.3 && x < c.superRate * 0.2) { this.push([HP | HK]); return 0; }
    if (ai.heal && me.health < me.maxHealth * 0.6 && d > 3.5 && x < 0.3) { this.push(this.specialSeq(def, ai.heal)); return 0; }

    if (d > 3.2) {
      if (ai.projectile && x < 0.35 * c.aggro) { this.push(this.specialSeq(def, ai.projectile)); return 0; }
      if (ai.trap && x < 0.45 * c.aggro) { this.push(this.specialSeq(def, ai.trap, 'L')); return 0; }
      if (ai.zoner && x < 0.6) return this.holdBits = r() < 0.5 ? B : 0;
      if (x < 0.6 + 0.15 * c.aggro) return this.holdBits = F;
      return this.holdBits = r() < 0.15 ? B : 0;
    }
    if (d > 1.3) {
      if (x < 0.12 * c.aggro) { this.hold = 1; this.holdBits = U | F; return U | F; }
      if (ai.approach && x < 0.3 * c.aggro) { this.push(this.specialSeq(def, ai.approach)); return 0; }
      if (ai.projectile && x < 0.4) { this.push(this.specialSeq(def, ai.projectile)); return 0; }
      if (x < 0.5) { this.push([ai.poke === 'sHP' ? HP : HK]); return 0; }
      return this.holdBits = r() < 0.8 ? F : B;
    }
    // close range: good CPUs guard pre-emptively, jabs are too fast to react to
    if (r() < c.block * 0.55) return this.holdFor(B | (r() < 0.4 ? D : 0), c.think * 2);
    if (ai.grab && x < 0.25) { this.push(this.specialSeq(def, ai.grab)); return 0; }
    if (x < 0.12) { this.push([LP | LK]); return 0; }
    if (x < 0.5 * c.aggro + 0.15) {
      const str = r();
      if (str < 0.4) this.push([LP, 0, 0, 0, 0, 0, 0, 0, LP, 0, 0, 0, 0, 0, 0, 0, HP]);
      else if (str < 0.7) this.push([0, D, D, D, D, D, D, D, D, D, D, D | LK, D, D, D, D, D, D, D, D, D, D, D | HK]);
      else this.push([LK, 0, 0, 0, 0, 0, 0, 0, 0, HP]);
      return 0;
    }
    if (x < 0.75) return this.holdFor(0, 8);
    return this.holdBits = F;
  }
}

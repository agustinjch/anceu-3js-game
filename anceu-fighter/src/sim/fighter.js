// Fighter state. Pure data plus a few derived getters; the rules live in moves.js.
import { InputBuffer } from './input.js';
import { SIM } from '../data/common.js';

const ACTIONABLE = new Set(['idle', 'walkF', 'walkB', 'crouch']);
const INVULNERABLE = new Set(['knockdown', 'getup', 'ko', 'thrown', 'intro', 'victory']);

export class Fighter {
  constructor(def, side, x = side === 0 ? -1.5 : 1.5) {
    this.def = def;
    this.side = side;
    this.input = new InputBuffer();
    this.maxHealth = def.health;
    this.meter = 0;
    this.reset(x);
  }

  reset(x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.pvx = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.health = this.maxHealth;
    this.setState('idle');
    this.move = null; this.moveId = null; this.mf = 0;
    this.stun = 0; this.combo = 0; this.lastDamage = 0;
    this.airAttackUsed = false; this.jumpDir = 0; this.dashDir = 0;
    this.connected = false; this.hitCount = 0; this.lastHitFrame = -99;
    this.guard = false; this.crouchBlock = false;
    this.grabbed = null; this.thrownBy = null; this.throwMove = null; this.techable = false;
    this.input.reset();
  }

  setState(s) { this.state = s; this.sf = 0; }

  get airborne() { return this.y > 0 || this.state === 'jump' || (this.state === 'attack' && this.move?.air); }
  get actionable() { return ACTIONABLE.has(this.state); }
  get crouching() {
    return this.state === 'crouch' || (this.state === 'attack' && this.move?.crouch) || (this.state === 'blockstun' && this.crouchBlock);
  }
  get moveTotal() { const m = this.move; return m ? m.startup + m.active + m.recovery : 0; }
  get movePhase() {
    const m = this.move; if (!m) return null;
    if (this.mf <= m.startup) return 'startup';
    if (this.mf <= m.startup + m.active) return 'active';
    return 'recovery';
  }
  get invulnerable() {
    if (INVULNERABLE.has(this.state)) return true;
    const iv = this.state === 'attack' && this.move?.invuln;
    return !!(iv && this.mf >= iv[0] && this.mf <= iv[1]);
  }

  hurtbox() {
    if (this.invulnerable) return null;
    const w = 0.6;
    if (this.airborne) return { x: this.x - w / 2, y: this.y + 0.2, w, h: 1.3 };
    const h = this.crouching ? SIM.CROUCH_H : SIM.STAND_H;
    return { x: this.x - w / 2, y: this.y, w, h };
  }

  pushbox() {
    const w = SIM.PUSH_W;
    if (this.state === 'knockdown' || this.state === 'ko') return null;
    if (this.airborne) return { x: this.x - w / 2, y: this.y + 0.3, w, h: 1.1 };
    return { x: this.x - w / 2, y: 0, w, h: this.crouching ? SIM.CROUCH_H : SIM.STAND_H };
  }

  snapshot() {
    const r = n => Math.round(n * 1000) / 1000;
    return { x: r(this.x), y: r(this.y), facing: this.facing, health: this.health, meter: r(this.meter), state: this.state, sf: this.sf, moveId: this.moveId, mf: this.mf };
  }
}

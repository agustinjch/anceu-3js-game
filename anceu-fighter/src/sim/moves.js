// One simulation tick for both fighters: decide → advance → push apart → resolve hits.
// Deterministic: no randomness, no wall-clock time.
import { SIM, HITSTOP } from '../data/common.js';
import { LP, HP, LK, HK } from './input.js';
import { Fighter } from './fighter.js';
import { overlap, worldBox, boxCenter } from './collision.js';
import { spawnProjectile, stepProjectiles, projBox, placeObject, stepObjects, slowFactor } from './projectiles.js';

const BTN = { LP, HP, LK, HK };
const NORMAL_IDS = new Set(['sLP', 'sHP', 'sLK', 'sHK', 'cLP', 'cHP', 'cLK', 'cHK', 'jLP', 'jHP', 'jLK', 'jHK']);
const LIMIT = SIM.WALL - 0.3;
const MAX_SEP = 6.5;

export function createWorld(defA, defB) {
  return {
    fighters: [new Fighter(defA, 0), new Fighter(defB, 1)],
    projectiles: [], objects: [], hitstop: 0, frame: 0, events: [], roundOver: false,
  };
}

const emit = (world, e) => world.events.push(e);
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function stepFighters(world) {
  if (world.hitstop > 0) { world.hitstop--; return; }
  world.frame++;
  const fs = world.fighters;
  for (const f of fs) {
    const o = fs[1 - f.side];
    if (f.actionable && !f.airborne) f.facing = sign(o.x - f.x) || f.facing;
  }
  for (const f of fs) decide(world, f);
  for (const f of fs) advance(world, f);
  for (const f of fs) f.input.consume();
  stepProjectiles(world);
  stepObjects(world);
  pushApart(world);
  resolveHits(world);
}

// ---------------------------------------------------------------- decisions
function threat(world, f) {
  const o = world.fighters[1 - f.side];
  if (o.state === 'attack' && o.move && (o.move.box || o.move.grab) && Math.abs(o.x - f.x) < 3.2 && o.movePhase !== 'recovery') return true;
  return world.projectiles.some(p => p.owner !== f.side && Math.abs(p.x - f.x) < 3.2);
}

export function startMove(world, f, id) {
  const m = f.def.moves[id];
  if (!m) return false;
  if (m.superFreeze && f.meter < SIM.SUPER_COST) return false;
  if (m.projectile && !m.projectile.atOpponent && world.projectiles.some(p => p.owner === f.side && p.kind === m.projectile.kind)) return false;
  f.move = m; f.moveId = id; f.mf = 0;
  f.setState('attack');
  f.connected = false; f.hitCount = 0; f.lastHitFrame = -99; f.grabbed = null;
  if (!m.air) f.vx = 0;
  else f.airAttackUsed = true;
  if (m.superFreeze) {
    f.meter -= SIM.SUPER_COST;
    world.hitstop = SIM.SUPER_FREEZE;
    emit(world, { type: 'super', side: f.side, name: m.name, cinematic: m.cinematic });
  }
  emit(world, { type: 'move', side: f.side, id });
  return true;
}

function trySpecial(world, f) {
  const inp = f.input;
  for (const s of f.def.specials) {
    const st = inp.pressedStrength(s.btn);
    if (st && inp.recentDir(s.input) && startMove(world, f, `${s.move}_${st}`)) return true;
  }
  return false;
}

function pressedNormal(inp) {
  for (const b of ['HK', 'HP', 'LK', 'LP']) if (inp.pressed(BTN[b])) return b;
  return null;
}

function decide(world, f) {
  const inp = f.input;
  f.guard = false;
  if (f.state === 'attack') return tryCancel(world, f);
  if (f.state === 'jump') {
    const b = !f.airAttackUsed && pressedNormal(inp);
    if (b) startMove(world, f, 'j' + b);
    return;
  }
  if (!f.actionable) return;
  if (f.meter >= SIM.SUPER_COST && inp.chord(HP, HK) && startMove(world, f, f.def.super)) return;
  if (inp.chord(LP, LK) && startMove(world, f, 'throw')) return;
  if (trySpecial(world, f)) return;
  const b = pressedNormal(inp);
  if (b) { startMove(world, f, (inp.down ? 'c' : 's') + b); return; }

  const want = inp.up ? 'prejump'
    : inp.doubleTap('fwd') ? 'dashF'
    : inp.doubleTap('back') ? 'dashB'
    : inp.down ? 'crouch'
    : inp.fwd ? 'walkF'
    : inp.back ? 'walkB' : 'idle';
  if (want === 'prejump') { f.jumpDir = inp.fwd ? 1 : inp.back ? -1 : 0; f.setState('prejump'); return; }
  if (want === 'dashF' || want === 'dashB') { f.dashDir = want === 'dashF' ? 1 : -1; f.setState('dash'); return; }
  if (inp.back && threat(world, f)) f.guard = true;
  if (f.state !== want) f.setState(want);
}

function tryCancel(world, f) {
  const m = f.move;
  const inp = f.input;
  // Two buttons pressed "together" often arrive a frame or two apart: the first one starts a
  // normal, so a super / throw chord may replace a normal during its first 3 frames.
  if (NORMAL_IDS.has(f.moveId) && f.mf <= 3 && !m.air) {
    if (f.meter >= SIM.SUPER_COST && inp.chord(HP, HK) && startMove(world, f, f.def.super)) return;
    if (inp.chord(LP, LK) && startMove(world, f, 'throw')) return;
  }
  if (!f.connected || !m.cancel) return;
  if (f.meter >= SIM.SUPER_COST && inp.chord(HP, HK) && startMove(world, f, f.def.super)) return;
  if (m.cancel === 'super') return;
  if (trySpecial(world, f)) return;
  if (m.cancel === 'chain') {
    const b = pressedNormal(inp);
    if (b) startMove(world, f, (m.crouch || inp.down ? 'c' : 's') + b);
  }
}

// ---------------------------------------------------------------- physics / frames
function advance(world, f) {
  const o = world.fighters[1 - f.side];
  const slow = slowFactor(world, f);
  f.sf++;
  switch (f.state) {
    case 'idle': case 'crouch': f.vx = 0; break;
    case 'walkF': f.vx = f.def.walkF * f.facing * slow; break;
    case 'walkB': f.vx = f.guard ? 0 : -f.def.walkB * f.facing * slow; break;
    case 'prejump':
      f.vx = 0;
      if (f.sf >= SIM.PREJUMP) {
        f.setState('jump'); f.airAttackUsed = false;
        f.vy = SIM.JUMP_VY; f.vx = f.jumpDir * SIM.JUMP_VX * f.facing * slow;
        f.y = 0.001;
        emit(world, { type: 'jump', side: f.side });
      }
      break;
    case 'dash': {
      const k = 1 - f.sf / SIM.DASH_FRAMES;
      f.vx = f.dashDir * (f.dashDir > 0 ? SIM.DASH_V : SIM.BACKDASH_V) * f.facing * (0.4 + k) * slow;
      if (f.sf >= SIM.DASH_FRAMES) f.setState('idle');
      break;
    }
    case 'attack': advanceMove(world, f, o, slow); break;
    case 'hitstun': case 'blockstun':
      f.vx = 0;
      if (--f.stun <= 0) endStun(f);
      break;
    case 'thrown': advanceThrown(world, f, o); break;
    case 'knockdown':
      if (!f.airborne || f.y === 0) { f.vx *= 0.7; if (f.sf >= SIM.KD_FRAMES) f.setState('getup'); }
      break;
    case 'getup': f.vx = 0; if (f.sf >= SIM.GETUP_FRAMES) { f.combo = 0; f.setState('idle'); } break;
    case 'landing': f.vx = 0; if (f.sf >= SIM.LANDING) f.setState('idle'); break;
    case 'ko': if (f.y === 0) f.vx *= 0.7; break;
    default: break;
  }
  // integrate (pvx: pushback from hits and blocks, decays on its own)
  f.x += f.vx + f.pvx;
  f.pvx = Math.abs(f.pvx) < 1e-4 ? 0 : f.pvx * 0.8;
  if (f.y > 0 || f.vy > 0) {
    f.y += f.vy; f.vy -= SIM.GRAVITY;
    if (f.y <= 0) land(world, f);
  }
  f.x = Math.max(-LIMIT, Math.min(LIMIT, f.x));
}

function land(world, f) {
  f.y = 0; f.vy = 0;
  if (f.state === 'jump' || (f.state === 'attack' && f.move?.air)) {
    f.move = null; f.moveId = null; f.vx = 0;
    f.setState('landing');
    emit(world, { type: 'land', side: f.side });
  } else if (f.state === 'knockdown' || f.state === 'ko') {
    f.sf = 0;
    emit(world, { type: 'floor', side: f.side, x: f.x });
  }
}

function endStun(f) {
  f.combo = 0;
  f.setState(f.state === 'blockstun' && f.crouchBlock && f.input.down ? 'crouch' : 'idle');
}

function advanceMove(world, f, o, slow) {
  const m = f.move;
  f.mf++;
  if (m.moveVx) f.vx = f.mf >= m.moveVx.from && f.mf <= m.moveVx.to ? m.moveVx.v * f.facing * slow : (m.air ? f.vx : 0);
  else if (!m.air) f.vx = 0;
  if (m.projectile && f.mf === m.projectile.frame) spawnProjectile(world, f, m);
  if (m.place && f.mf === m.place.frame) placeObject(world, f, m.place);
  if (m.heal && f.mf === m.heal.frame) {
    const before = f.health;
    f.health = Math.min(f.maxHealth, f.health + m.heal.amount);
    emit(world, { type: 'heal', side: f.side, amount: f.health - before });
  }
  if (m.teleport && f.mf === m.teleport.frame) {
    const dir = sign(o.x - f.x) || f.facing;
    const nx = m.teleport.to === 'behind' ? o.x + dir * 1.0 : o.x - dir * 1.0;
    f.x = Math.max(-LIMIT, Math.min(LIMIT, nx));
    f.facing = sign(o.x - f.x) || -dir;
    emit(world, { type: 'teleport', side: f.side, x: f.x });
  }
  if (f.mf > f.moveTotal && !m.air) {
    const wasCrouch = m.crouch;
    f.move = null; f.moveId = null; f.grabbed = null;
    f.setState(wasCrouch && f.input.down ? 'crouch' : 'idle');
  }
}

function advanceThrown(world, f, o) {
  const m = f.throwMove;
  if (f.techable && f.sf <= SIM.TECH_WINDOW && f.input.chord(LP, LK)) {
    // throw tech: both pop apart, nobody takes damage
    const dir = sign(f.x - o.x) || -o.facing;
    for (const [g, d] of [[f, dir], [o, -dir]]) {
      g.move = null; g.moveId = null; g.setState('blockstun'); g.stun = 14; g.crouchBlock = false; g.pvx = d * 0.06;
    }
    f.thrownBy = null; o.grabbed = null;
    emit(world, { type: 'tech', side: f.side });
    return;
  }
  if (f.sf === SIM.TECH_WINDOW + 1 && world.roundOver) {
    // the round ended while grabbed: let go without damage
    f.thrownBy = null; o.grabbed = null; f.setState('idle');
    return;
  }
  if (f.sf === SIM.TECH_WINDOW + 1) {
    f.health = Math.max(0, f.health - m.damage);
    f.lastDamage = m.damage;
    f.meter = Math.min(SIM.METER_MAX, f.meter + m.damage * 0.06);
    o.meter = Math.min(SIM.METER_MAX, o.meter + m.damage * 0.12);
    const dir = sign(f.x - o.x) || o.facing;
    f.thrownBy = null; o.grabbed = null;
    knockDown(f, dir, f.health <= 0);
    emit(world, { type: 'hit', side: o.side, target: f.side, damage: m.damage, strength: 'H', throw: true, cinematic: m.cinematic, x: f.x, y: 1.0, combo: 1 });
    if (f.health <= 0) emit(world, { type: 'ko', side: f.side });
    world.hitstop = Math.max(world.hitstop, HITSTOP.H);
  }
}

function knockDown(f, dir, ko) {
  f.move = null; f.moveId = null;
  f.setState(ko ? 'ko' : 'knockdown');
  f.vy = 0.08; f.vx = dir * 0.045; f.y = Math.max(f.y, 0.001);
}

// ---------------------------------------------------------------- push apart
function pushApart(world) {
  const [a, b] = world.fighters;
  const pa = a.pushbox(), pb = b.pushbox();
  if (pa && pb && overlap(pa, pb)) {
    const dir = sign(b.x - a.x) || a.facing;
    const need = SIM.PUSH_W - Math.abs(b.x - a.x);
    let da = need / 2, db = need / 2;
    // against a wall the other one takes the whole push
    if (Math.abs(a.x - dir * da) > LIMIT) { db += da; da = 0; }
    if (Math.abs(b.x + dir * db) > LIMIT) { da += db; db = 0; }
    a.x = Math.max(-LIMIT, Math.min(LIMIT, a.x - dir * da));
    b.x = Math.max(-LIMIT, Math.min(LIMIT, b.x + dir * db));
  }
  // the camera can't fit fighters further apart than MAX_SEP
  const sep = b.x - a.x;
  if (Math.abs(sep) > MAX_SEP) {
    const over = Math.abs(sep) - MAX_SEP, d = sign(sep);
    const aMoving = Math.abs(a.vx) >= Math.abs(b.vx);
    if (aMoving) a.x += d * over; else b.x -= d * over;
  }
}

// ---------------------------------------------------------------- hits
function canHitNow(f) {
  const m = f.move;
  if (f.state !== 'attack' || f.movePhase !== 'active' || !m.box || m.grab) return false;
  if (f.hitCount >= m.hits) return false;
  const interval = Math.max(1, Math.floor(m.active / m.hits));
  return f.hitCount === 0 || f.mf - f.lastHitFrame >= interval;
}

function grabbable(f) {
  return !f.airborne && !f.invulnerable && (f.actionable || f.state === 'attack' || f.state === 'landing' || f.state === 'dash');
}

function resolveHits(world) {
  if (world.roundOver) return; // after KO / time nothing new lands
  const fs = world.fighters;
  const hits = [], grabs = [];
  for (const f of fs) {
    const o = fs[1 - f.side];
    if (f.state === 'attack' && f.move.grab && f.movePhase === 'active' && !f.grabbed) {
      if (grabbable(o) && overlap(worldBox(f, f.move.box), { x: o.x - 0.3, y: 0, w: 0.6, h: 1.7 })) grabs.push({ att: f, def: o, m: f.move });
      continue;
    }
    if (canHitNow(f)) {
      const hb = worldBox(f, f.move.box), hurt = o.hurtbox();
      if (hurt && overlap(hb, hurt)) hits.push({ att: f, def: o, m: f.move, box: hb, dir: f.facing });
    }
  }
  // projectiles: clash with each other, then hit fighters
  const ps = world.projectiles;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const p = ps[i], q = ps[j];
    if (p.owner !== q.owner && p.hp > 0 && q.hp > 0 && overlap(projBox(p), projBox(q))) {
      p.hp = 0; q.hp = 0;
      emit(world, { type: 'clash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }
  }
  for (const p of ps) {
    if (p.hp <= 0) continue;
    const def = fs[1 - p.owner], hurt = def.hurtbox();
    if (hurt && overlap(projBox(p), hurt)) hits.push({ att: fs[p.owner], def, m: p.move, proj: p, box: projBox(p), dir: sign(p.vx) || sign(def.x - p.x) });
  }
  // routers zap whoever steps on them
  for (const ob of world.objects) {
    if (ob.kind !== 'router' || ob.age < 10) continue;
    const def = fs[1 - ob.owner];
    if (!def.airborne && !def.invulnerable && Math.abs(def.x - ob.x) < ob.w / 2 + 0.25) {
      ob.life = 0;
      hits.push({ att: fs[ob.owner], def, m: fs[ob.owner].def.moves.zap, object: ob, box: { x: ob.x - 0.2, y: 0, w: 0.4, h: 0.4 }, dir: sign(def.x - ob.x) || 1 });
      emit(world, { type: 'zap', x: ob.x });
    }
  }
  world.objects = world.objects.filter(o => o.life > 0);

  // throws: both grabbing on the same frame is a tech
  if (grabs.length === 2) {
    for (const g of grabs) { g.att.move = null; g.att.moveId = null; g.att.setState('blockstun'); g.att.stun = 14; g.att.pvx = -g.att.facing * 0.06; }
    emit(world, { type: 'tech', side: 0 });
  } else if (grabs.length === 1 && !hits.some(h => h.def === grabs[0].att)) {
    const { att, def, m } = grabs[0];
    att.grabbed = def; att.connected = true;
    def.move = null; def.moveId = null; def.setState('thrown');
    def.thrownBy = att.side; def.throwMove = m; def.techable = m.grab === 'throw'; def.vx = 0;
    emit(world, { type: 'grab', side: att.side, cinematic: m.cinematic });
  }
  // apply all strikes simultaneously (trades)
  for (const h of hits) applyHit(world, h);
}

function isBlocking(def, m) {
  if (m.level === 'unblockable') return false;
  if (def.airborne) return false;
  if (!(def.actionable || def.state === 'blockstun')) return false;
  if (!def.input.back) return false;
  const crouch = def.input.down;
  if (m.level === 'low' && !crouch) return false;
  if (m.level === 'overhead' && crouch) return false;
  return true;
}

function applyHit(world, { att, def, m, proj, object, box, dir }) {
  const c = boxCenter(box);
  const strike = !proj && !object; // a blow from the attacker's body (not a projectile or a router)
  // Víctor's Esquiva: struck during the weave window → counter punch
  if (strike && def.state === 'attack' && def.move?.counter && def.mf >= def.move.counter[0] && def.mf <= def.move.counter[1]) {
    att.connected = true; att.hitCount++; att.lastHitFrame = att.mf;
    startMove(world, def, def.move.counterMove);
    world.hitstop = Math.max(world.hitstop, HITSTOP.H);
    emit(world, { type: 'counter', side: def.side, x: c.x, y: c.y });
    return;
  }
  if (proj) proj.hp--;
  if (strike) { att.connected = true; att.hitCount++; att.lastHitFrame = att.mf; }
  const strength = m.strength || 'L';

  if (isBlocking(def, m)) {
    def.setState('blockstun');
    def.stun = m.blockstun; def.crouchBlock = def.input.down;
    def.pvx = dir * m.pushback / 4;
    if (m.chip && (strength === 'S' || strength === 'X')) {
      def.health = def.health - m.chip <= 0 && strength !== 'X' ? 1 : Math.max(0, def.health - m.chip);
    }
    att.meter = Math.min(SIM.METER_MAX, att.meter + m.damage * 0.05);
    def.meter = Math.min(SIM.METER_MAX, def.meter + m.damage * 0.03);
    if (strike && Math.abs(def.x) >= LIMIT - 0.05) att.pvx = -dir * m.pushback / 4;
    world.hitstop = Math.max(world.hitstop, HITSTOP[strength] - 2);
    emit(world, { type: 'block', side: att.side, target: def.side, strength, x: c.x, y: c.y });
    if (def.health <= 0) { knockDown(def, dir, true); emit(world, { type: 'ko', side: def.side }); }
    return;
  }

  def.combo++;
  const scale = Math.max(0.3, 1 - 0.1 * Math.max(0, def.combo - 2));
  const dmg = Math.round(m.damage * scale);
  def.health = Math.max(0, def.health - dmg);
  def.lastDamage = dmg;
  att.meter = Math.min(SIM.METER_MAX, att.meter + dmg * 0.12);
  def.meter = Math.min(SIM.METER_MAX, def.meter + dmg * 0.06);
  const lastHit = strike && att.hitCount >= m.hits;
  if (def.health <= 0) {
    knockDown(def, dir, true);
    emit(world, { type: 'ko', side: def.side });
  } else if ((m.knockdown && (!strike || lastHit || m.hits === 1)) || def.airborne) {
    knockDown(def, dir, false);
  } else {
    def.move = null; def.moveId = null;
    def.setState('hitstun');
    def.stun = m.hitstun; def.crouchBlock = false;
    def.pvx = dir * m.pushback / 4;
    if (strike && Math.abs(def.x) >= LIMIT - 0.05) att.pvx = -dir * m.pushback / 4;
  }
  world.hitstop = Math.max(world.hitstop, HITSTOP[strength]);
  emit(world, { type: 'hit', side: att.side, target: def.side, damage: dmg, strength, x: c.x, y: c.y, combo: def.combo, fx: m.fx, bell: m.fx === 'bell' && lastHit });
}

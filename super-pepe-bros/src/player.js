// Pepe: GLB character + Mario-64-style controller.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx } from './fx.js';

const GRAVITY = -32;
const RUN_SPEED = 8.2, WALK_SPEED = 3.2, ACCEL = 30, AIR_ACCEL = 14, FRICTION = 26;
const RADIUS = 0.36, HEIGHT = 1.6, STEP = 0.42;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

let gltfCache = null;
export function loadPepe(onProgress) {
  if (gltfCache) return Promise.resolve(gltfCache);
  return new Promise((res, rej) => {
    new GLTFLoader().load('models/pepe.glb', g => { gltfCache = g; res(g); }, e => {
      if (e.total) onProgress && onProgress(e.loaded / e.total);
    }, rej);
  });
}

function prepareClip(clip, mode) {
  // Strip root motion from hips so physics drives position.
  clip = clip.clone();
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('mixamorigHips.position') && !tr.name.endsWith('mixamorig:Hips.position')) continue;
    const v = tr.values, x0 = v[0], y0 = v[1], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      if (mode !== 'keepXZ') { v[i] = x0; v[i + 2] = z0; }
      if (mode === 'flat') v[i + 1] = 0.88;
    }
  }
  return clip;
}

export class Player {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.model.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (o.material) { o.material.envMapIntensity = 0.9; } }
    });
    this.pivot = new THREE.Group(); this.pivot.position.y = 0.85;
    this.model.position.y = -0.85;
    this.pivot.add(this.model); this.root.add(this.pivot);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    const get = n => gltf.animations.find(a => a.name === n);
    const defs = {
      run: ['Running', 'xz'], walk: ['Walking', 'xz'], walk2: ['walking_2_inplace', 'xz'],
      jump: ['Regular_Jump', 'flat'], climb: ['climbing_up_wall', 'keepXZ'], door: ['open_door_1', 'xz'],
    };
    for (const k in defs) {
      const c = get(defs[k][0]); if (!c) continue;
      const a = this.mixer.clipAction(prepareClip(c, defs[k][1]));
      this.actions[k] = a;
    }
    // idle = door clip frozen near its last frame (a neutral standing pose)
    this.actions.idle = this.mixer.clipAction(prepareClip(get('open_door_1'), 'xz').clone());
    this.actions.idle.getClip().name = 'idle';
    this.actions.jump.setLoop(THREE.LoopOnce); this.actions.jump.clampWhenFinished = true;
    this.actions.climb.setLoop(THREE.LoopOnce); this.actions.climb.clampWhenFinished = true;
    this.actions.door.setLoop(THREE.LoopOnce); this.actions.door.clampWhenFinished = true;
    this.current = null;
    this.bones = {};
    this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace('mixamorig', '').replace(':', '')] = o; });

    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.facing = 0; // yaw
    this.hspeed = 0;
    this.state = 'ground';
    this.onGround = true;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.platform = null;
    this.jumpChain = 0; this.chainTimer = 0;
    this.coyote = 0; this.jumpBuffer = 0;
    this.spinTimer = 0; this.spinCooldown = 0; this.airSpinUsed = false;
    this.poundTimer = 0;
    this.wallNormal = new THREE.Vector3(); this.wallTimer = 0;
    this.flip = 0; this.flipSpeed = 0;
    this.invuln = 0; this.hurtTimer = 0;
    this.health = 8; this.maxHealth = 8;
    this.locked = false;
    this.stepTimer = 0;
    this.time = 0;
    this.climbData = null;
    this.lastSafe = new THREE.Vector3();
    this.inWater = false;
    this.play('idle', 0);
  }

  play(name, fade = 0.15, speed = 1) {
    const a = this.actions[name]; if (!a) return;
    if (this.current === a) { a.timeScale = speed; return; }
    a.reset(); a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1);
    if (name === 'idle') { a.time = 5.0; a.timeScale = 0; }
    if (name === 'jump') a.time = 0.45;
    a.play();
    if (this.current && fade > 0) this.current.crossFadeTo(a, fade, false);
    else if (this.current) this.current.stop();
    this.current = a; this.currentName = name;
  }

  setPosition(p, yaw = this.facing) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.hspeed = 0; this.facing = yaw;
    this.root.rotation.set(0, yaw, 0); this.lastSafe.copy(p); this.state = 'air'; this.onGround = false; this.platform = null; this.climbData = null; this.flip = 0;
  }

  isAttacking() { return this.spinTimer > 0; }
  isPounding() { return this.state === 'pound' && this.poundTimer <= 0; }
  isFalling() { return !this.onGround && this.vel.y < 0; }

  hurt(amount, from) {
    if (this.invuln > 0 || this.locked) return false;
    this.health = Math.max(0, this.health - amount);
    this.invuln = 1.8; this.hurtTimer = 0.45;
    audio.sfx('hurt');
    if (from) { _v.subVectors(this.pos, from).setY(0).normalize(); this.vel.set(_v.x * 7, 7, _v.z * 7); }
    else this.vel.y = 7;
    this.hspeed = 0;
    this.state = 'air'; this.onGround = false;
    this.game && this.game.onPlayerHurt();
    return true;
  }
  heal(n) { const was = this.health; this.health = Math.min(this.maxHealth, this.health + n); if (this.health > was) audio.sfx('heal'); }
  bounce(vy = 12, chain = true) {
    this.vel.y = vy; this.state = 'air'; this.onGround = false; this.airSpinUsed = false; this.bounced = true;
    this.play('jump', 0.05, 1.3);
    if (chain) { this.flip = 0; }
  }

  update(dt, world, camYaw) {
    this.time += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    // carry by platform
    if (this.platform && this.platform.delta && this.onGround) {
      this.pos.applyMatrix4(this.platform.delta);
      _q.setFromRotationMatrix(this.platform.delta);
      const e = new THREE.Euler().setFromQuaternion(_q, 'YXZ');
      this.facing += e.y;
    }
    if (this.climbData) { this.updateClimb(dt); this.animate(dt); return; }
    if (this.locked) {
      this.vel.x = 0; this.vel.z = 0;
      this.physics(dt, world);
      this.animate(dt);
      return;
    }
    // ----- input -> desired direction
    const mx = input.move.x, my = input.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fx_ = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const dx = fx_ * my + rx * mx, dz = fz * my + rz * mx;
    const wantYaw = Math.atan2(dx, dz);
    const jumpPressed = input.wasPressed('jump');
    const crouch = input.isHeld('crouch');
    if (jumpPressed) this.jumpBuffer = 0.12; else this.jumpBuffer -= dt;
    if (this.chainTimer > 0) this.chainTimer -= dt; else if (this.onGround) this.jumpChain = 0;
    if (this.spinCooldown > 0) this.spinCooldown -= dt;
    if (this.spinTimer > 0) this.spinTimer -= dt;
    if (this.wallTimer > 0) this.wallTimer -= dt;

    const canAct = this.hurtTimer <= 0;
    if (canAct && input.wasPressed('attack') && this.spinTimer <= 0 && this.spinCooldown <= 0 && this.state !== 'pound') {
      if (this.onGround || !this.airSpinUsed) {
        this.spinTimer = 0.42; this.spinCooldown = 0.55; audio.sfx('spin');
        if (Math.random() < 0.5) audio.sfx('bark');
        if (!this.onGround) { this.airSpinUsed = true; this.vel.y = Math.max(this.vel.y, 4.5); }
      }
    }

    if (this.onGround) {
      this.coyote = 0.1; this.airSpinUsed = false;
      const slow = this.inWater ? 0.6 : 1;
      let target = mag * RUN_SPEED * slow;
      if (crouch) target = Math.min(target, 2);
      if (mag > 0.05 && canAct) {
        // turn toward stick direction
        let diff = Math.atan2(Math.sin(wantYaw - this.facing), Math.cos(wantYaw - this.facing));
        const turnRate = this.hspeed > 6 ? 9 : 16;
        if (Math.abs(diff) > 2.6 && this.hspeed > 5) { this.hspeed *= 0.3; fx.dust(this.pos, 4); } // skid turn
        this.facing += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
        this.hspeed = Math.min(target, this.hspeed + ACCEL * dt) * (this.hspeed > target ? 0.96 : 1);
        if (this.hspeed > target) this.hspeed = Math.max(target, this.hspeed - FRICTION * dt);
      } else {
        this.hspeed = Math.max(0, this.hspeed - FRICTION * dt);
      }
      // slope slide on steep ground
      if (this.groundNormal.y < 0.72) {
        this.vel.x += this.groundNormal.x * 30 * dt; this.vel.z += this.groundNormal.z * 30 * dt;
      }
      this.vel.x = Math.sin(this.facing) * this.hspeed;
      this.vel.z = Math.cos(this.facing) * this.hspeed;
      if (this.groundNormal.y < 0.72) { this.vel.x += this.groundNormal.x * 6; this.vel.z += this.groundNormal.z * 6; }
    } else {
      this.coyote -= dt;
      if (mag > 0.05 && canAct && this.state !== 'pound') {
        const tx = dx / Math.max(mag, 1e-3) * mag, tz = dz / Math.max(mag, 1e-3) * mag;
        const cur = Math.hypot(this.vel.x, this.vel.z);
        const maxH = Math.max(RUN_SPEED, cur);
        this.vel.x += tx * AIR_ACCEL * dt; this.vel.z += tz * AIR_ACCEL * dt;
        const h = Math.hypot(this.vel.x, this.vel.z);
        if (h > maxH) { this.vel.x *= maxH / h; this.vel.z *= maxH / h; }
        let diff = Math.atan2(Math.sin(wantYaw - this.facing), Math.cos(wantYaw - this.facing));
        this.facing += THREE.MathUtils.clamp(diff, -4 * dt, 4 * dt);
      }
      // ground pound
      if (canAct && input.wasPressed('crouch') && this.state === 'air' && this.flip === 0) {
        this.state = 'pound'; this.poundTimer = 0.28; this.vel.set(0, 0, 0); this.flip = 0.0001; this.flipSpeed = 22;
        audio.sfx('whoosh');
      }
    }

    // jumping
    if (canAct && this.jumpBuffer > 0 && (this.onGround || this.coyote > 0) && this.state !== 'pound') {
      this.jumpBuffer = 0; this.coyote = 0;
      const moving = this.hspeed > 2;
      if (crouch && this.hspeed > 4.5) { // long jump
        this.vel.y = 8.5; this.hspeed = 13; this.vel.x = Math.sin(this.facing) * 13; this.vel.z = Math.cos(this.facing) * 13;
        audio.sfx('jump2'); this.jumpChain = 0; this.flip = 0;
      } else if (crouch) { // backflip
        this.vel.y = 15.5; this.vel.x = -Math.sin(this.facing) * 3; this.vel.z = -Math.cos(this.facing) * 3;
        this.flip = 0.0001; this.flipSpeed = -10; audio.sfx('jump3'); this.jumpChain = 0;
      } else {
        this.jumpChain = this.chainTimer > 0 && moving ? Math.min(3, this.jumpChain + 1) : 1;
        if (this.jumpChain === 3 && this.hspeed > 5) { this.vel.y = 15.5; this.flip = 0.0001; this.flipSpeed = 10; audio.sfx('jump3'); this.jumpChain = 0; audio.sfx('bark', { vol: 0.6 }); }
        else if (this.jumpChain === 2) { this.vel.y = 12.6; audio.sfx('jump2'); }
        else { this.jumpChain = 1; this.vel.y = 10.5; audio.sfx('jump'); }
      }
      this.onGround = false; this.state = 'air'; this.platform = null; this.bounced = false;
      this.play('jump', 0.08, 1.25);
      fx.dust(this.pos, 5);
    } else if (canAct && this.jumpBuffer > 0 && !this.onGround && this.wallTimer > 0 && this.state === 'air') {
      // wall kick
      this.jumpBuffer = 0; this.wallTimer = 0;
      this.vel.set(this.wallNormal.x * 8.5, 13, this.wallNormal.z * 8.5);
      this.facing = Math.atan2(this.wallNormal.x, this.wallNormal.z);
      audio.sfx('jump2'); fx.dust(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 6);
      this.play('jump', 0.05, 1.25);
    }

    // variable jump height
    if (!this.onGround && this.vel.y > 0 && !input.isHeld('jump') && this.state === 'air' && this.flip === 0 && !this.bounced) this.vel.y += GRAVITY * 0.9 * dt;

    // ground pound
    if (this.state === 'pound') {
      this.poundTimer -= dt;
      if (this.poundTimer > 0) this.vel.set(0, 0.5, 0); else this.vel.y = -28;
    }

    this.physics(dt, world);
    if (this.flip !== 0) {
      this.flip += this.flipSpeed * dt;
      if (Math.abs(this.flip) >= Math.PI * 2 || this.onGround) this.flip = 0;
    }
    this.tryLedge(world);
    this.animate(dt);
  }

  physics(dt, world) {
    const steps = 4, h = dt / steps;
    const wasGround = this.onGround;
    for (let s = 0; s < steps; s++) {
      if (!this.onGround || this.state === 'pound') this.vel.y += GRAVITY * h;
      if (this.vel.y < -40) this.vel.y = -40;
      this.pos.addScaledVector(this.vel, h);
      // walls (capsule raised by STEP so ground is handled by rays)
      const before = _v.copy(this.pos);
      const p = this.pos.clone(); p.y += STEP;
      const r = world.resolveCapsule(p, RADIUS, HEIGHT - STEP);
      const pushed = r.pushed;
      this.pos.x = p.x; this.pos.z = p.z; this.pos.y = p.y - STEP;
      world.pushFromDynamic(this.pos, RADIUS, HEIGHT);
      if (pushed.y < -0.001 && this.vel.y > 0) this.vel.y = 0; // ceiling
      const ph = Math.hypot(pushed.x, pushed.z);
      if (ph > 0.001 && !this.onGround) { this.wallNormal.set(pushed.x / ph, 0, pushed.z / ph); this.wallTimer = 0.18; }
      if (ph > 0.001 && this.onGround) {
        // lose speed against walls
        const into = -(Math.sin(this.facing) * pushed.x + Math.cos(this.facing) * pushed.z) / ph;
        if (into > 0.7) this.hspeed *= 0.85;
      }
      // ground
      if (this.vel.y <= 0.01) {
        const g = world.ground(this.pos, 0.55, this.onGround ? 0.35 : 0.06);
        if (g && g.normal.y > 0.5) {
          this.pos.y = g.y;
          if (!this.onGround) this.land();
          this.onGround = true; this.vel.y = 0;
          this.groundNormal.copy(g.normal); this.platform = g.platform;
        } else {
          if (this.onGround) { this.onGround = false; if (this.state === 'ground') this.state = 'air'; this.platform = null; }
        }
      } else { this.onGround = false; this.platform = null; }
    }
    if (this.onGround && this.groundNormal.y > 0.8 && !this.platform) this.lastSafe.copy(this.pos);
    if (wasGround && !this.onGround && this.state === 'ground') this.state = 'air';
    this.root.position.copy(this.pos);
  }

  land() {
    const impact = -this.vel.y;
    if (this.state === 'pound') {
      audio.sfx('pound'); fx.ring(this.pos, 0xffffff); fx.dust(this.pos, 14);
      this.game && this.game.onPound(this.pos);
      this.hspeed = 0; this.vel.x = 0; this.vel.z = 0;
      this.poundLand = 0.25;
    } else {
      if (impact > 8) { audio.sfx('land'); fx.dust(this.pos, 6); }
    }
    this.state = 'ground'; this.flip = 0; this.bounced = false;
    this.chainTimer = 0.22;
    if (this.jumpChain === 0) this.chainTimer = 0;
  }

  tryLedge(world) {
    if (this.onGround || this.vel.y > 2 || this.state !== 'air' || this.hurtTimer > 0) return;
    const mag = Math.hypot(input.move.x, input.move.y);
    if (mag < 0.3) return;
    const fx_ = Math.sin(this.facing), fz = Math.cos(this.facing);
    const chest = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z);
    const wall = world.raycast(chest, new THREE.Vector3(fx_, 0, fz), RADIUS + 0.35);
    if (!wall || Math.abs(wall.face.normal.y) > 0.3) return;
    const top = new THREE.Vector3(this.pos.x + fx_ * (RADIUS + 0.4), this.pos.y + 2.3, this.pos.z + fz * (RADIUS + 0.4));
    const down = world.raycast(top, new THREE.Vector3(0, -1, 0), 1.6);
    if (!down || down.face.normal.y < 0.75) return;
    const ledgeY = down.point.y;
    if (ledgeY - this.pos.y < 0.9 || ledgeY - this.pos.y > 2.25) return;
    // headroom check
    const head = world.raycast(new THREE.Vector3(down.point.x, ledgeY + 0.05, down.point.z), new THREE.Vector3(0, 1, 0), 1.5);
    if (head) return;
    const n = wall.face.normal;
    this.facing = Math.atan2(-n.x, -n.z);
    const hang = new THREE.Vector3(wall.point.x + n.x * (RADIUS * 0.7), ledgeY - 0.95, wall.point.z + n.z * (RADIUS * 0.7));
    this.climbData = { t: 0, from: hang, to: new THREE.Vector3(down.point.x - n.x * 0.05, ledgeY, down.point.z - n.z * 0.05), dur: 1.25 };
    this.pos.copy(hang); this.vel.set(0, 0, 0);
    this.play('climb', 0.06, 2.0 / 1.25 * 1.0);
    audio.sfx('climb');
  }
  updateClimb(dt) {
    const c = this.climbData; c.t += dt;
    if (c.t >= c.dur) {
      this.pos.copy(c.to); this.climbData = null; this.onGround = true; this.state = 'ground'; this.vel.set(0, 0, 0); this.hspeed = 0;
      this.play('idle', 0.12);
    }
    this.root.position.copy(this.pos);
  }

  animate(dt) {
    let anim;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.climbData) anim = 'climb';
    else if (this.forcedAnim) anim = this.forcedAnim;
    else if (!this.onGround) anim = 'jump';
    else if (hs > 4.2) anim = 'run';
    else if (hs > 0.4) anim = 'walk';
    else anim = 'idle';
    if (anim === 'run') this.play('run', 0.15, THREE.MathUtils.clamp(hs / 8, 0.7, 1.3));
    else if (anim === 'walk') this.play('walk', 0.18, THREE.MathUtils.clamp(hs / 2.4, 0.6, 1.6));
    else if (anim !== 'climb') this.play(anim, anim === 'jump' ? 0.08 : 0.2, this.forcedAnimSpeed || (anim === 'jump' ? 1.25 : 1));

    // footsteps
    if (this.onGround && hs > 1) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) { this.stepTimer = 2.4; audio.sfx('step'); if (hs > 5) fx.dust(this.pos, 1); if (this.inWater) fx.splash(this.pos, 2); }
    }
    this.mixer.update(dt);

    // procedural overlays
    const b = this.bones;
    if (this.currentName === 'idle' && b.Spine2) {
      b.Spine2.rotation.x += Math.sin(this.time * 2.2) * 0.025;
      if (b.Head) { b.Head.rotation.y += Math.sin(this.time * 0.7) * 0.25; b.Head.rotation.x += Math.sin(this.time * 1.3) * 0.05; }
      if (b.LeftArm) { b.LeftArm.rotation.z += Math.sin(this.time * 2.2) * 0.03; }
    }
    // model orientation, flips, spin
    let spin = 0;
    if (this.spinTimer > 0) spin = (1 - this.spinTimer / 0.42) * Math.PI * 4;
    this.root.rotation.set(0, this.facing + spin, 0);
    this.pivot.rotation.x = this.flip;
    if (this.state === 'pound' && this.poundTimer > 0) this.pivot.rotation.x = (1 - this.poundTimer / 0.28) * Math.PI * 2;
    // squash on pound land
    if (this.poundLand > 0) { this.poundLand -= dt; const s = 1 - this.poundLand * 1.2; this.pivot.scale.set(1 + this.poundLand, Math.max(0.6, s), 1 + this.poundLand); }
    else this.pivot.scale.set(1, 1, 1);
    // blink when invulnerable
    this.model.visible = !(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0);
  }
}

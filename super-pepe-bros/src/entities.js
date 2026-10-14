// Game entities: collectibles, enemies, NPCs, platforms, portals.
import * as THREE from 'three';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { input } from './input.js';
import { mat, colorMat, boxGeo, rnd } from './kit.js';

const _v = new THREE.Vector3();
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Entity {
  constructor(game) { this.game = game; this.dead = false; this.obj = null; }
  update() {}
  remove() { this.dead = true; if (this.obj) this.obj.parent && this.obj.parent.remove(this.obj); }
}

// ---------- Collectibles ----------
const chestnutGeo = (() => { const g = new THREE.SphereGeometry(0.3, 14, 12); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) { const k = 1 - y / 0.3 * 0.45; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y * 1.25); } }
  g.scale(1, 0.95, 0.62); g.computeVertexNormals(); return g; })();
const chestnutTop = new THREE.CylinderGeometry(0.17, 0.24, 0.1, 12);
export class Chestnut extends Entity {
  constructor(game, pos, opts = {}) {
    super(game);
    const g = new THREE.Group();
    const body = new THREE.Mesh(chestnutGeo, new THREE.MeshStandardMaterial({ color: 0x7a3d17, roughness: 0.25, metalness: 0.1, emissive: 0x2a0d00 }));
    const top = new THREE.Mesh(chestnutTop, new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.8 })); top.position.y = -0.24; top.scale.z = 0.62;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xc9b07a })); tip.position.y = 0.4; g.add(tip);
    g.add(body, top); g.position.copy(pos); g.position.y += 0.6;
    body.castShadow = true;
    this.obj = g; game.scene.add(g);
    this.base = g.position.y; this.t = Math.random() * 6;
    this.vel = opts.vel ? opts.vel.clone() : null; this.ttl = opts.ttl || 0;
  }
  update(dt) {
    this.t += dt; const p = this.game.player.pos;
    if (this.vel) {
      this.vel.y -= 25 * dt; this.obj.position.addScaledVector(this.vel, dt);
      const gr = this.game.world.ground(this.obj.position, 0.3, 0.3);
      if (gr && this.vel.y < 0) { this.obj.position.y = gr.y + 0.4; this.vel.y *= -0.45; this.vel.x *= 0.7; this.vel.z *= 0.7; if (Math.abs(this.vel.y) < 1) { this.vel = null; this.base = this.obj.position.y; } }
      if (this.obj.position.y < this.game.level.killY) this.remove();
    } else this.obj.position.y = this.base + Math.sin(this.t * 3) * 0.1;
    this.obj.rotation.y += dt * 3;
    if (this.ttl) { this.ttl -= dt; if (this.ttl < 2) this.obj.visible = Math.floor(this.ttl * 10) % 2 === 0; if (this.ttl <= 0) return this.remove(); }
    if (this.obj.position.distanceTo(_v.copy(p).setY(p.y + 0.8)) < 1.1) {
      audio.sfx('chestnut'); fx.sparkle(this.obj.position, 5, 0xffd27a, 2);
      this.game.addChestnut(1); this.remove();
    }
  }
}

export class Bread extends Entity { // "red coin" equivalent: the baker's lost loaves
  constructor(game, pos, group) {
    super(game); this.group = group;
    const g = new THREE.Group();
    const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd99a4e, roughness: 0.6, emissive: 0x3a1a00 }));
    loaf.scale.set(1.2, 0.75, 0.9);
    for (let i = -1; i <= 1; i++) { const cut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.5), colorMat(0xf6dfae)); cut.position.set(i * 0.2, 0.32, 0); cut.rotation.y = 0.5; g.add(cut); }
    g.add(loaf); loaf.castShadow = true;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.soft, color: 0xffcc66, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.setScalar(1.8); g.add(halo);
    g.position.copy(pos); g.position.y += 0.8; this.base = g.position.y;
    this.obj = g; game.scene.add(g); this.t = 0;
  }
  update(dt) {
    this.t += dt; this.obj.rotation.y += dt * 2; this.obj.position.y = this.base + Math.sin(this.t * 2.5) * 0.15;
    const p = this.game.player.pos;
    if (this.obj.position.distanceTo(_v.copy(p).setY(p.y + 0.8)) < 1.3) {
      audio.sfx('bread'); fx.sparkle(this.obj.position, 12, 0xffcc66);
      this.remove(); this.game.collectBread(this.group, this.obj.position.clone());
    }
  }
}

function starShape(points = 5, outer = 1, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) { const r = i % 2 ? inner : outer, a = i / (points * 2) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  return s;
}
export function makeSparkMesh(collected = false, scale = 1) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(starShape(5, 0.75, 0.34), { depth: 0.25, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 2 });
  geo.center();
  const m = collected
    ? new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.55, emissive: 0x3070a0, metalness: 0.3, roughness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xff9a00, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.25 });
  const star = new THREE.Mesh(geo, m); star.castShadow = true; g.add(star);
  // eyes (Mario-esque charm, but it's a spark!)
  if (!collected) for (const x of [-0.13, 0.13]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0x3a2200 })); e.position.set(x, 0.08, 0.27); g.add(e); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.soft, color: collected ? 0x88ccff : 0xffdd66, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(3.2); g.add(halo);
  g.scale.setScalar(scale);
  return g;
}

export class Spark extends Entity {
  constructor(game, id, pos, opts = {}) {
    super(game); this.id = id; this.title = opts.title || 'Faísca';
    this.collected = game.save.sparks.includes(id);
    this.obj = makeSparkMesh(this.collected); this.obj.position.copy(pos); this.obj.position.y += 1;
    this.base = this.obj.position.y;
    this.light = new THREE.PointLight(0xffcc55, 6, 8, 2); this.obj.add(this.light);
    game.scene.add(this.obj); this.t = 0;
    this.appear = opts.appear ? 0 : 1;
  }
  update(dt) {
    this.t += dt;
    if (this.appear < 1) { this.appear = Math.min(1, this.appear + dt * 1.5); this.obj.scale.setScalar(THREE.MathUtils.smoothstep(this.appear, 0, 1)); }
    this.obj.rotation.y += dt * 2.2; this.obj.position.y = this.base + Math.sin(this.t * 2) * 0.2;
    if (Math.random() < dt * 6) fx.sparkle(this.obj.position, 1, 0xfff0a0, 1.2);
    const p = this.game.player.pos;
    if (this.appear >= 1 && this.obj.position.distanceTo(_v.copy(p).setY(p.y + 0.9)) < 1.5 && !this.game.player.locked) {
      this.remove(); this.game.collectSpark(this);
    }
  }
}

// ---------- Enemies ----------
class Enemy extends Entity {
  constructor(game, pos) {
    super(game); this.home = pos.clone(); this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.radius = 0.7; this.height = 1.2;
    this.stunned = 0; this.yaw = 0; this.tag = null; this.dmg = 1;
  }
  groundSnap(dt) {
    this.vel.y -= 30 * dt; this.pos.addScaledVector(this.vel, dt);
    const g = this.game.world.ground(this.pos, 0.8, 0.4);
    if (g && this.vel.y <= 0) { this.pos.y = g.y; this.vel.y = 0; this.grounded = true; } else this.grounded = false;
    if (this.pos.y < this.game.level.killY) this.kill(false);
    const p = this.pos.clone(); p.y += 0.3; this.game.world.resolveCapsule(p, this.radius * 0.8, this.height - 0.3); this.pos.x = p.x; this.pos.z = p.z;
  }
  checkPlayer() {
    const pl = this.game.player; if (pl.locked || this.dead) return;
    const d = flatDist(pl.pos, this.pos), dy = pl.pos.y - this.pos.y;
    if (pl.isAttacking() && d < this.radius + 1.3 && Math.abs(dy) < 1.6) return this.kill(true, 'spin');
    if (d < this.radius + 0.4 && dy > -0.6 && dy < this.height + 0.4) {
      if (pl.isPounding() || (pl.vel.y < -1 && dy > this.height * 0.45)) { pl.bounce(pl.isPounding() ? 10 : 11); return this.kill(true, 'stomp'); }
      pl.hurt(this.dmg, this.pos);
    }
  }
  kill(byPlayer, how) {
    if (this.dead) return;
    audio.sfx(how === 'stomp' ? 'stomp' : 'poof'); fx.poof(this.pos, 0xbbbbbb);
    if (byPlayer) {
      const n = this.drops ?? 1;
      for (let i = 0; i < n; i++) this.game.spawn(new Chestnut(this.game, this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), { vel: new THREE.Vector3(rnd(-2, 2), 8, rnd(-2, 2)) }));
    }
    this.remove(); this.game.onEnemyKilled(this);
  }
}

export class Baleirino extends Enemy { // grey cube drone of Don Baleiro
  constructor(game, pos, opts = {}) {
    super(game, pos); this.speed = opts.speed || 3.2; this.range = opts.range || 11; this.tag = opts.tag;
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(1.1, 1.0, 1.1, 1), mat('concrete')); body.position.y = 0.75; g.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x111418 })); screen.position.set(0, 0.85, 0.56); g.add(screen);
    this.eye = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0xff3030 })); this.eye.position.set(0, 0.85, 0.57); g.add(this.eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), mat('metal')); ant.position.y = 1.5; g.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xff3030 })); tip.position.y = 1.78; g.add(tip);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(boxGeo(0.3, 0.25, 0.5, 1), mat('dark')); f.position.set(s * 0.32, 0.12, 0); g.add(f); this[s < 0 ? 'fl' : 'fr'] = f; }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj = g; game.scene.add(g); this.t = rnd(0, 5); this.wanderYaw = rnd(0, 6); this.wanderT = 0;
  }
  update(dt) {
    this.t += dt; const pl = this.game.player;
    const d = flatDist(pl.pos, this.pos);
    let tx = 0, tz = 0;
    if (d < this.range && Math.abs(pl.pos.y - this.pos.y) < 5 && !pl.locked) {
      tx = pl.pos.x - this.pos.x; tz = pl.pos.z - this.pos.z; this.eye.material.color.set(0xff2020);
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    } else {
      this.eye.material.color.set(0xffaa30);
      this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = rnd(1.5, 3.5); this.wanderYaw = flatDist(this.pos, this.home) > 5 ? Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z) : rnd(0, 6); }
      tx = Math.sin(this.wanderYaw) * 0.4; tz = Math.cos(this.wanderYaw) * 0.4;
    }
    this.vel.x = tx * this.speed; this.vel.z = tz * this.speed;
    if (tx || tz) this.yaw = Math.atan2(tx, tz);
    // don't walk off edges
    const ahead = this.pos.clone().add(new THREE.Vector3(tx, 0, tz).multiplyScalar(0.9));
    if (!this.game.world.ground(ahead, 0.8, 1.5)) { this.vel.x = 0; this.vel.z = 0; }
    this.groundSnap(dt);
    this.obj.position.copy(this.pos); this.obj.rotation.y = this.yaw;
    this.obj.children[0].position.y = 0.75 + Math.abs(Math.sin(this.t * 8)) * 0.08;
    this.fl.position.z = Math.sin(this.t * 10) * 0.2; this.fr.position.z = -Math.sin(this.t * 10) * 0.2;
    this.checkPlayer();
  }
}

export class Bug extends Enemy { // escaravello: patrols back and forth
  constructor(game, pos, opts = {}) {
    super(game, pos); this.radius = 0.6; this.height = 0.8; this.tag = opts.tag;
    this.a = pos.clone(); this.b = opts.to ? opts.to.clone() : pos.clone().add(new THREE.Vector3(6, 0, 0)); this.dir = 1; this.speed = opts.speed || 2.6;
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: opts.color || 0x2a7a4a, metalness: 0.6, roughness: 0.25 }));
    shell.scale.set(1, 0.8, 1.25); shell.position.y = 0.25; g.add(shell);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 1.4), colorMat(0x111111)); line.position.y = 0.73; g.add(line);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), colorMat(0x1b1b1b)); head.position.set(0, 0.3, 0.75); g.add(head);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xffffff })); e.position.set(s * 0.12, 0.42, 0.98); g.add(e);
      const an = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), colorMat(0x111111)); an.position.set(s * 0.12, 0.65, 0.95); an.rotation.x = 0.6; g.add(an); }
    this.legs = [];
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), colorMat(0x111111)); l.position.set(s * 0.6, 0.15, -0.4 + i * 0.4); l.rotation.z = s * 1.0; g.add(l); this.legs.push(l); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj = g; game.scene.add(g); this.t = rnd(0, 5);
  }
  update(dt) {
    this.t += dt;
    const tgt = this.dir > 0 ? this.b : this.a;
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, l = Math.hypot(dx, dz);
    if (l < 0.3) this.dir *= -1;
    else { this.vel.x = dx / l * this.speed; this.vel.z = dz / l * this.speed; this.yaw = Math.atan2(dx, dz); }
    this.groundSnap(dt);
    this.obj.position.copy(this.pos); this.obj.rotation.y = this.yaw;
    this.legs.forEach((lg, i) => (lg.rotation.x = Math.sin(this.t * 14 + i) * 0.4));
    this.checkPlayer();
  }
}

export class Trasno extends Enemy { // mischievous forest goblin that hops toward you
  constructor(game, pos, opts = {}) {
    super(game, pos); this.radius = 0.5; this.height = 1.2; this.tag = opts.tag; this.hopT = rnd(0.5, 1.5);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), colorMat(0x4c8a3f)); body.position.y = 0.5; body.scale.y = 1.1; g.add(body);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), colorMat(0xb2322a)); hat.position.y = 1.2; hat.rotation.z = 0.25; g.add(hat);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xfff8a0 })); e.position.set(s * 0.15, 0.65, 0.38); g.add(e);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), colorMat(0x4c8a3f)); ear.position.set(s * 0.45, 0.7, 0); ear.rotation.z = -s * 1.2; g.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), colorMat(0x3a6a30)); nose.position.set(0, 0.55, 0.45); nose.rotation.x = Math.PI / 2; g.add(nose);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj = g; game.scene.add(g); this.t = 0;
  }
  update(dt) {
    this.t += dt; const pl = this.game.player; const d = flatDist(pl.pos, this.pos);
    if (this.grounded) {
      this.vel.x *= 0.8; this.vel.z *= 0.8;
      this.hopT -= dt;
      if (this.hopT <= 0) {
        this.hopT = rnd(0.6, 1.2);
        let dx, dz;
        if (d < 12 && !pl.locked) { dx = pl.pos.x - this.pos.x; dz = pl.pos.z - this.pos.z; } else { dx = this.home.x - this.pos.x + rnd(-3, 3); dz = this.home.z - this.pos.z + rnd(-3, 3); }
        const l = Math.hypot(dx, dz) || 1; this.vel.set(dx / l * 4.2, 7.5, dz / l * 4.2); this.yaw = Math.atan2(dx, dz);
        this.pos.y += 0.05; this.grounded = false;
      }
    }
    this.groundSnap(dt);
    this.obj.position.copy(this.pos); this.obj.rotation.y = this.yaw;
    const sq = this.grounded ? 1 - Math.max(0, this.hopT < 0.2 ? (0.2 - this.hopT) * 1.5 : 0) : 1.1;
    this.obj.scale.set(2 - sq, sq, 2 - sq);
    this.checkPlayer();
  }
}

export class Boulder extends Entity { // rolls along a path, then respawns
  constructor(game, path, opts = {}) {
    super(game); this.path = path; this.seg = 0; this.u = 0; this.speed = opts.speed || 7; this.r = opts.r || 1.3;
    this.obj = new THREE.Mesh(new THREE.DodecahedronGeometry(this.r, 1), mat('rock')); this.obj.castShadow = true;
    game.scene.add(this.obj); this.delay = opts.delay || 0;
  }
  update(dt) {
    if (this.delay > 0) { this.delay -= dt; this.obj.visible = false; return; }
    this.obj.visible = true;
    const a = this.path[this.seg], b = this.path[this.seg + 1];
    const len = a.distanceTo(b);
    this.u += this.speed * dt / len;
    if (this.u >= 1) { this.u = 0; this.seg++; if (this.seg >= this.path.length - 1) { this.seg = 0; fx.poof(this.obj.position, 0x998877); this.delay = 1.2; return; } }
    this.obj.position.lerpVectors(a, b, this.u); this.obj.position.y += this.r;
    const dir = _v.subVectors(b, a).normalize();
    this.obj.rotateOnWorldAxis(new THREE.Vector3(dir.z, 0, -dir.x), this.speed * dt / this.r);
    const pl = this.game.player;
    if (pl.pos.distanceTo(this.obj.position) < this.r + 0.6 || (flatDist(pl.pos, this.obj.position) < this.r + 0.4 && Math.abs(pl.pos.y + 0.8 - this.obj.position.y) < this.r + 0.8)) pl.hurt(2, this.obj.position);
  }
}

// ---------- People ----------
export function makePerson(o = {}) {
  const g = new THREE.Group();
  const skin = colorMat(o.skin ?? 0xe8b48f), shirt = colorMat(o.shirt ?? 0x3a7bd5), pants = colorMat(o.pants ?? 0x3b3b4f), hairM = colorMat(o.hair ?? 0x3a2a1a);
  const s = o.scale || 1;
  const parts = {};
  for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 8), pants); leg.position.set(sx * 0.15, 0.42, 0); g.add(leg); parts[sx < 0 ? 'legL' : 'legR'] = leg;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), colorMat(0x2a1d14)); shoe.position.set(0, -0.36, 0.05); leg.add(shoe); }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 10), shirt); torso.position.y = 1.15; torso.scale.set(1, 1, 0.75); g.add(torso);
  if (o.skirt) { const sk = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 12), colorMat(o.skirt)); sk.position.y = 0.72; g.add(sk); }
  if (o.apron) { const ap = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.7), colorMat(o.apron, { side: THREE.DoubleSide })); ap.position.set(0, 0.95, 0.24); g.add(ap); }
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.38, 1.45, 0); g.add(pivot);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), shirt); arm.position.y = -0.3; pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin); hand.position.y = -0.62; pivot.add(hand);
    pivot.rotation.z = sx * 0.12; parts[sx < 0 ? 'armL' : 'armR'] = pivot;
  }
  const headG = new THREE.Group(); headG.position.y = 1.85; g.add(headG); parts.head = headG;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), skin); head.scale.set(1, 1.08, 1); headG.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skin); nose.position.set(0, -0.02, 0.26); headG.add(nose);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1a1a1a })); e.position.set(sx * 0.09, 0.05, 0.23); headG.add(e); }
  const hs = o.hairStyle || 'short';
  if (hs === 'short') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), hairM); h.position.y = 0.04; h.rotation.x = -0.25; headG.add(h); }
  if (hs === 'long') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), hairM); h.position.y = 0.03; h.rotation.x = -0.35; headG.add(h);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.15), hairM); back.position.set(0, -0.2, -0.18); headG.add(back); }
  if (hs === 'bun') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), hairM); h.position.y = 0.04; h.rotation.x = -0.25; headG.add(h);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13), hairM); bun.position.set(0, 0.22, -0.18); headG.add(bun); }
  if (hs === 'curly') for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), hairM); const a = i / 12 * Math.PI * 2; c.position.set(Math.cos(a) * 0.22, 0.15 + Math.sin(i) * 0.05, Math.sin(a) * 0.2 - 0.04); headG.add(c); }
  if (o.beard) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), colorMat(o.beardColor ?? o.hair ?? 0x3a2a1a)); b.position.set(0, -0.05, 0.08); headG.add(b); }
  if (o.glasses) { const gl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 12), colorMat(0x111111)); for (const sx of [-1, 1]) { const c = gl.clone(); c.position.set(sx * 0.09, 0.05, 0.25); headG.add(c); } }
  if (o.hat === 'beret') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.1, 14), colorMat(o.hatColor ?? 0x222244)); h.position.set(0.03, 0.25, 0); h.rotation.z = 0.2; headG.add(h); }
  if (o.hat === 'cap') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), colorMat(o.hatColor ?? 0xcc3333)); h.position.y = 0.06; headG.add(h);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), colorMat(o.hatColor ?? 0xcc3333)); v.position.set(0, 0.08, 0.3); headG.add(v); }
  if (o.hat === 'scarf') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6), colorMat(o.hatColor ?? 0x222222)); h.position.y = 0.02; h.rotation.x = -0.2; headG.add(h); }
  if (o.hat === 'witch') { const h = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 10), colorMat(o.hatColor ?? 0x2a1a3a)); h.position.y = 0.55; h.rotation.z = 0.15; headG.add(h);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 16), colorMat(o.hatColor ?? 0x2a1a3a)); br.position.y = 0.2; headG.add(br); }
  if (o.hat === 'chef') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.35, 12), colorMat(0xffffff)); h.position.y = 0.33; headG.add(h); const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), colorMat(0xffffff)); top.position.y = 0.52; top.scale.y = 0.6; headG.add(top); }
  // props
  if (o.prop === 'laptop') { const l = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.28), colorMat(0xb0b4bb)); const sc = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.02), colorMat(0xb0b4bb)); sc.position.set(0, 0.14, -0.14); sc.rotation.x = -0.3;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), new THREE.MeshBasicMaterial({ color: 0x66ffcc })); glow.position.set(0, 0.14, -0.125); glow.rotation.x = -0.3; l.add(b, sc, glow); l.position.set(0, 1.12, 0.42); g.add(l); parts.armL.rotation.x = -1.1; parts.armR.rotation.x = -1.1; }
  if (o.prop === 'brush') { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), colorMat(0x8a5a2b)); br.position.y = -0.75; const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), colorMat(0xe0458a)); tip.position.y = -1.0; tip.rotation.x = Math.PI; parts.armR.add(br, tip); }
  if (o.prop === 'basket') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.25, 10), mat('wood')); b.position.set(0, -0.75, 0.1); parts.armL.add(b);
    const br = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), colorMat(0xd99a4e)); br.position.set(0, -0.6, 0.1); br.scale.set(1.3, 0.7, 1); parts.armL.add(br); }
  if (o.prop === 'cane') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0), colorMat(0x5a3a1a)); c.position.set(0, -0.95, 0.15); parts.armR.add(c); }
  if (o.prop === 'gaita') { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), colorMat(0x7a1f2b)); bag.position.set(-0.2, 1.3, 0.25); bag.scale.set(1, 0.8, 0.7); g.add(bag);
    for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.8), colorMat(0x2a1a0a)); d.position.set(-0.35 + i * 0.08, 1.75, 0.15); d.rotation.z = 0.3; g.add(d); } }
  if (o.prop === 'wrench') { const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.03), mat('metal')); w.position.y = -0.8; parts.armR.add(w); }
  if (o.prop === 'staff') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8), colorMat(0x5a3a1a)); c.position.set(0, -0.6, 0.1); parts.armR.add(c); }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.scale.setScalar(s);
  g.userData.parts = parts;
  return g;
}

export class NPC extends Entity {
  constructor(game, pos, opts) {
    super(game);
    this.name = opts.name; this.talk = opts.talk; this.radius = opts.radius || 2.6; this.anim = opts.anim || 'idle';
    this.obj = makePerson(opts.look || {}); this.obj.position.copy(pos); this.obj.rotation.y = opts.ry || 0; this.baseYaw = opts.ry || 0;
    this.parts = this.obj.userData.parts; this.t = rnd(0, 6);
    game.scene.add(this.obj);
    // collider
    this.label = game.ui.makeLabel(this.name);
    this.near = false;
  }
  update(dt) {
    this.t += dt; const p = this.parts;
    const pl = this.game.player, d = flatDist(pl.pos, this.obj.position);
    // idle animation
    p.head.rotation.z = Math.sin(this.t * 1.1) * 0.05;
    this.obj.position.y += (Math.sin(this.t * 2) * 0.004);
    if (this.anim === 'wave' || this.talking) { p.armR.rotation.z = 2.6 + Math.sin(this.t * 8) * 0.3; }
    else if (this.anim === 'paint') { p.armR.rotation.x = -1.4 + Math.sin(this.t * 3) * 0.4; p.armR.rotation.z = 0.3 + Math.cos(this.t * 3) * 0.3; }
    else if (this.anim === 'dance') { this.obj.rotation.y += dt * 2; p.armL.rotation.z = -2.5 + Math.sin(this.t * 6) * 0.3; p.armR.rotation.z = 2.5 + Math.cos(this.t * 6) * 0.3; this.obj.position.y = this.base + Math.abs(Math.sin(this.t * 6)) * 0.15; }
    else if (this.anim !== 'laptop') { p.armR.rotation.z = 0.12 + Math.sin(this.t * 1.5) * 0.04; }
    if (this.base === undefined) this.base = this.obj.position.y;
    // face player when near
    if (d < 6 && this.anim !== 'dance') {
      const want = Math.atan2(pl.pos.x - this.obj.position.x, pl.pos.z - this.obj.position.z);
      const diff = Math.atan2(Math.sin(want - this.obj.rotation.y), Math.cos(want - this.obj.rotation.y));
      this.obj.rotation.y += diff * Math.min(1, dt * 4);
    }
    // push player out
    if (d < 0.8 && d > 0.001) { pl.pos.x = this.obj.position.x + (pl.pos.x - this.obj.position.x) / d * 0.8; pl.pos.z = this.obj.position.z + (pl.pos.z - this.obj.position.z) / d * 0.8; }
    this.near = d < this.radius && !pl.locked && pl.onGround;
    this.game.ui.placeLabel(this.label, this.obj.position, 2.5 * this.obj.scale.y, d < 9, this.near ? (input.lastDevice === 'gamepad' ? 'Ⓨ Talk' : 'E  Talk') : '');
    if (this.near && (input.wasPressed('interact') || (input.wasPressed('attack') && d < 2))) {
      input.consume('attack'); input.consume('interact');
      this.game.player.spinTimer = 0;
      this.talking = true;
      this.game.talkTo(this).then(() => (this.talking = false));
    }
  }
  remove() { super.remove(); this.game.ui.removeLabel(this.label); }
}

export class Sign extends Entity {
  constructor(game, pos, ry, text, title = 'Sign') {
    super(game); this.text = text; this.title = title;
    const g = new THREE.Group();
    const post = new THREE.Mesh(boxGeo(0.15, 1.4, 0.15), mat('wood')); post.position.y = 0.7; g.add(post);
    const board = new THREE.Mesh(boxGeo(1.3, 0.8, 0.1), mat('wood')); board.position.y = 1.4; g.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0xe8d9b5 })); face.position.set(0, 1.4, 0.06); g.add(face);
    g.position.copy(pos); g.rotation.y = ry; g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj = g; game.scene.add(g);
    this.label = game.ui.makeLabel(title);
  }
  update() {
    const pl = this.game.player, d = flatDist(pl.pos, this.obj.position);
    const near = d < 2.2 && !pl.locked && pl.onGround;
    this.game.ui.placeLabel(this.label, this.obj.position, 2.1, d < 7, near ? (input.lastDevice === 'gamepad' ? 'Ⓨ Read' : 'E  Read') : '');
    if (near && (input.wasPressed('interact') || input.wasPressed('attack'))) {
      input.consume('attack'); input.consume('interact'); this.game.player.spinTimer = 0;
      this.game.readSign(this);
    }
  }
  remove() { super.remove(); this.game.ui.removeLabel(this.label); }
}

export class Checkpoint extends Entity { // a little stone lantern (lampión) that lights up
  constructor(game, pos) {
    super(game); this.pos = pos.clone(); this.on = false;
    const g = new THREE.Group();
    const base = new THREE.Mesh(boxGeo(0.7, 0.3, 0.7), mat('granite')); base.position.y = 0.15; g.add(base);
    const col = new THREE.Mesh(boxGeo(0.3, 1.1, 0.3), mat('granite')); col.position.y = 0.85; g.add(col);
    const lamp = new THREE.Mesh(boxGeo(0.55, 0.5, 0.55), new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x000000 })); lamp.position.y = 1.65; g.add(lamp); this.lamp = lamp;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 4), mat('granite')); cap.position.y = 2.1; cap.rotation.y = Math.PI / 4; g.add(cap);
    g.position.copy(pos); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj = g; game.scene.add(g);
  }
  update(dt) {
    if (this.on) return;
    if (this.game.player.pos.distanceTo(this.pos) < 1.8) {
      this.on = true; this.lamp.material.color.set(0xffe9a0); this.lamp.material.emissive.set(0xffa830); this.lamp.material.emissiveIntensity = 1.5;
      const l = new THREE.PointLight(0xffb040, 5, 8); l.position.y = 1.7; this.obj.add(l);
      audio.sfx('checkpoint'); fx.sparkle(this.pos.clone().setY(this.pos.y + 1.7), 12, 0xffd080);
      this.game.setCheckpoint(this.pos);
      this.game.ui.toast('Checkpoint!');
    }
  }
}

export class BouncePad extends Entity { // giant mushroom (cogumelo)
  constructor(game, pos, power = 20, scale = 1) {
    super(game); this.power = power; this.pos = pos.clone(); this.s = scale;
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.2, 10), mat('stem')); stem.position.y = 0.6; g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('mushroom')); cap.position.y = 1.1; cap.scale.y = 0.55; g.add(cap);
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.18, 8), colorMat(0xffffff)); const a = i / 6 * Math.PI * 2; d.position.set(Math.cos(a) * 0.75, 1.62, Math.sin(a) * 0.75); d.lookAt(d.position.clone().multiplyScalar(2).setY(3)); g.add(d); }
    g.position.copy(pos); g.scale.setScalar(scale); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj = g; this.cap = cap; game.scene.add(g); this.squash = 0;
  }
  update(dt) {
    const pl = this.game.player;
    const top = this.pos.y + 1.65 * this.s;
    if (flatDist(pl.pos, this.pos) < 1.3 * this.s && pl.vel.y <= 0 && pl.pos.y < top + 0.3 && pl.pos.y > top - 0.8) {
      pl.pos.y = top; pl.bounce(this.power); pl.state = 'air'; audio.sfx('boing'); this.squash = 1;
    }
    if (this.squash > 0) { this.squash -= dt * 4; const k = Math.sin(Math.max(0, this.squash) * Math.PI) * 0.35; this.cap.scale.set(1 + k, 0.55 - k * 0.5, 1 + k); }
  }
}

export class MovingPlatform extends Entity {
  constructor(game, points, opts = {}) {
    super(game); this.points = points.map(p => p.clone()); this.speed = opts.speed || 2.5; this.seg = 0; this.u = 0; this.dir = 1;
    this.rotSpeed = opts.rotSpeed || 0; this.loop = opts.loop || false;
    const w = opts.w || 3, d = opts.d || 3, h = opts.h || 0.6;
    const m = new THREE.Mesh(boxGeo(w, h, d), mat(opts.mat || 'wood'));
    m.castShadow = true; m.receiveShadow = true;
    m.geometry.translate(0, -h / 2, 0);
    if (opts.mesh) { this.obj = opts.mesh; } else this.obj = m;
    this.obj.position.copy(this.points[0]); game.scene.add(this.obj);
    game.world.addDynamic(this.obj);
    this.t = 0; this.wait = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.rotSpeed) this.obj.rotation.y += this.rotSpeed * dt;
    if (this.points.length < 2) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    const n = this.points.length;
    const ia = this.seg, ib = this.loop ? (this.seg + 1) % n : this.seg + this.dir;
    const a = this.points[ia], b = this.points[ib];
    this.u += this.speed * dt / Math.max(0.01, a.distanceTo(b));
    if (this.u >= 1) {
      this.u = 0; this.seg = ib; this.wait = 0.5;
      if (!this.loop && (this.seg === n - 1 || this.seg === 0)) this.dir = this.seg === 0 ? 1 : -1;
      this.obj.position.copy(b); return;
    }
    const k = THREE.MathUtils.smootherstep(this.u, 0, 1);
    this.obj.position.lerpVectors(a, b, k);
  }
  remove() { super.remove(); const i = this.game.world.dynamic.findIndex(d => d.mesh === this.obj); if (i >= 0) this.game.world.dynamic.splice(i, 1); }
}

export class Crate extends Entity {
  constructor(game, pos, drops = 3) {
    super(game); this.pos = pos.clone(); this.drops = drops;
    this.obj = new THREE.Mesh(boxGeo(1.2, 1.2, 1.2, 1.2), mat('wood')); this.obj.position.copy(pos); this.obj.position.y += 0.6;
    this.obj.castShadow = true; this.obj.receiveShadow = true; game.scene.add(this.obj);
    game.world.addDynamic(this.obj); this.obj.userData.noSide = false;
  }
  update() {
    const pl = this.game.player, d = flatDist(pl.pos, this.pos);
    if ((pl.isAttacking() && d < 1.9 && Math.abs(pl.pos.y - this.pos.y) < 1.5) || (pl.isPounding() && d < 1.2 && pl.pos.y > this.pos.y)) this.smash();
  }
  smash() {
    audio.sfx('poof'); fx.poof(this.obj.position, 0xa07040, 10);
    for (let i = 0; i < this.drops; i++) this.game.spawn(new Chestnut(this.game, this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), { vel: new THREE.Vector3(rnd(-3, 3), 9, rnd(-3, 3)) }));
    this.remove(); const i = this.game.world.dynamic.findIndex(x => x.mesh === this.obj); if (i >= 0) this.game.world.dynamic.splice(i, 1);
  }
}

export class PoundSwitch extends Entity {
  constructor(game, pos, onPress) {
    super(game); this.pos = pos.clone(); this.onPress = onPress; this.pressed = false;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.3, 16), mat('granite')); base.position.y = 0.15; g.add(base);
    this.btn = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x29b6f6, emissive: 0x0a5a80 })); this.btn.position.y = 0.45; g.add(this.btn);
    g.position.copy(pos); this.obj = g; game.scene.add(g);
    game.world.addDynamic(g);
    this.label = game.ui.makeLabel('');
  }
  update() {
    if (this.pressed) return;
    const pl = this.game.player;
    if (flatDist(pl.pos, this.pos) < 1.0 && Math.abs(pl.pos.y - this.pos.y - 0.6) < 0.5) {
      if (pl.state === 'pound' || pl.poundLand > 0) {
        this.pressed = true; this.btn.scale.y = 0.2; this.btn.position.y = 0.33; this.btn.updateMatrixWorld(); this.btn.material.color.set(0x66bb6a);
        audio.sfx('unlock'); this.onPress && this.onPress();
      } else if (!this.hinted) { this.hinted = true; this.game.ui.toast('Try a Ground Pound on it! (Shift while in the air)'); }
    }
  }
  remove() { super.remove(); this.game.ui.removeLabel(this.label); }
}

// A painted mural that is a door into a world (Se's murals!)
export class MuralPortal extends Entity {
  constructor(game, pos, ry, opts) {
    super(game); this.opts = opts; this.pos = pos.clone(); this.ry = ry;
    const g = new THREE.Group();
    const tex = new THREE.CanvasTexture(opts.paint()); tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(boxGeo(opts.w + 0.6, opts.h + 0.6, 0.3), mat('granite')); frame.position.y = opts.h / 2 + 0.6; g.add(frame);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, t: { value: 0 }, ripple: { value: 0 }, locked: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D map; uniform float t; uniform float ripple; uniform float locked; varying vec2 vUv;
        void main(){ vec2 uv = vUv; vec2 c = uv-0.5; float d = length(c);
          uv += c/d*sin(d*40.0 - t*8.0)*0.01*ripple + vec2(sin(uv.y*10.0+t)*0.002, 0.0);
          vec3 col = texture2D(map, uv).rgb; float g = dot(col, vec3(0.3,0.59,0.11));
          col = mix(col, vec3(g)*0.6, locked);
          col += vec3(1.0,0.9,0.6)*ripple*0.15*(0.5+0.5*sin(t*6.0));
          gl_FragColor = vec4(col,1.0); }`,
    });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(opts.w, opts.h), this.mat); pic.position.set(0, opts.h / 2 + 0.6, 0.16); g.add(pic);
    g.position.copy(pos); g.rotation.y = ry; this.obj = g; game.scene.add(g);
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    this.normal = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    this.label = game.ui.makeLabel(opts.title);
    this.t = 0; this.cool = 0;
  }
  update(dt) {
    this.t += dt; this.mat.uniforms.t.value = this.t;
    const pl = this.game.player, have = this.game.sparkCount();
    const locked = have < this.opts.need;
    this.mat.uniforms.locked.value = locked ? 0.85 : 0;
    _v.subVectors(pl.pos, this.pos);
    const front = _v.dot(this.normal), side = Math.abs(_v.x * this.normal.z - _v.z * this.normal.x);
    const near = front > -0.2 && front < 3 && side < this.opts.w / 2 + 0.5;
    this.mat.uniforms.ripple.value += ((near ? 1 : 0) - this.mat.uniforms.ripple.value) * Math.min(1, dt * 4);
    this.game.ui.placeLabel(this.label, this.pos, this.opts.h + 1.6, flatDist(pl.pos, this.pos) < 14, locked ? `★ ${have}/${this.opts.need}` : `★ ${this.game.levelSparkCount(this.opts.level)}/${this.opts.total}`);
    if (this.cool > 0) { this.cool -= dt; return; }
    if (front > -0.1 && front < 0.9 && side < this.opts.w / 2 && pl.pos.y - this.pos.y < this.opts.h + 0.6 && !pl.locked) {
      if (locked) { this.cool = 2; pl.vel.x = this.normal.x * 6; pl.vel.z = this.normal.z * 6; pl.hspeed = 0; audio.sfx('warn');
        this.game.ui.toast(`You need ${this.opts.need} Faíscas to enter this mural`); }
      else { this.cool = 999; this.game.enterLevel(this.opts.level, this); }
    }
  }
  remove() { super.remove(); this.game.ui.removeLabel(this.label); }
}

// Return-to-village ring found in each world
export class ExitRing extends Entity {
  constructor(game, pos) {
    super(game); this.pos = pos.clone();
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 32), new THREE.MeshStandardMaterial({ color: 0x9be7ff, emissive: 0x2a88aa, emissiveIntensity: 1 }));
    ring.position.y = 1.5; g.add(ring); this.ring = ring;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: 0xbff3ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); disc.position.y = 1.5; g.add(disc);
    g.position.copy(pos); this.obj = g; game.scene.add(g); this.t = 0;
    this.label = game.ui.makeLabel('Back to Anceu');
    this.armed = false;
  }
  update(dt) {
    this.t += dt; this.obj.rotation.y += dt;
    const d = this.game.player.pos.distanceTo(this.pos);
    this.game.ui.placeLabel(this.label, this.pos, 3.2, d < 10, '');
    if (d > 3) this.armed = true;
    if (this.armed && d < 1.2 && !this.game.player.locked) { this.armed = false; this.game.exitToHub(); }
  }
  remove() { super.remove(); this.game.ui.removeLabel(this.label); }
}

// Grey fog wall that blocks paths until enough sparks (Don Baleiro's néboa)
export class FogGate extends Entity {
  constructor(game, pos, w, h, ry, need, onOpen) {
    super(game); this.need = need; this.onOpen = onOpen;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: { t: { value: 0 }, a: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float t; uniform float a; varying vec2 vUv;
        float n(vec2 p){ return sin(p.x*3.0+t)*sin(p.y*4.0-t*0.7)*0.5+0.5; }
        void main(){ float v = n(vUv*4.0)*0.5 + n(vUv*9.0+3.0)*0.3; float e = smoothstep(0.0,0.15,vUv.x)*smoothstep(1.0,0.85,vUv.x)*smoothstep(0.0,0.1,vUv.y)*smoothstep(1.0,0.7,vUv.y);
          gl_FragColor = vec4(vec3(0.55+v*0.2), (0.6+v*0.35)*e*a); }`,
    }));
    m.position.copy(pos); m.position.y += h / 2; m.rotation.y = ry; this.obj = m; game.scene.add(m);
    this.blocker = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    this.blocker.position.copy(m.position); this.blocker.rotation.y = ry; game.scene.add(this.blocker); game.world.addDynamic(this.blocker);
    this.opening = -1; this.pos = pos.clone();
  }
  update(dt) {
    this.obj.material.uniforms.t.value += dt;
    if (this.opening < 0 && this.game.sparkCount() >= this.need && this.game.player.pos.distanceTo(this.pos) < 12) {
      this.opening = 0; this.game.ui.toast('The grey néboa fades away...'); audio.sfx('portal');
      const i = this.game.world.dynamic.findIndex(x => x.mesh === this.blocker); if (i >= 0) this.game.world.dynamic.splice(i, 1);
      this.onOpen && this.onOpen();
    }
    if (this.opening >= 0) { this.opening += dt; this.obj.material.uniforms.a.value = Math.max(0, 1 - this.opening); if (this.opening > 1) this.remove(); }
  }
}

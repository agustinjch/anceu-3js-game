// MONTE DA FIBRA — a windy granite mountain at sunset, crowned by Don Baleiro's fibre-sucking antenna.
import * as THREE from 'three';
import { mat, colorMat, boxGeo, TEX, rnd } from '../kit.js';
import { Chestnut, NPC, Sign, Baleirino, Bug, Boulder, Spark, Crate, Checkpoint, MovingPlatform, ExitRing, Entity } from '../entities.js';
import { smooth, noise2, V, grassColor, ringOf, lineOf } from './util.js';
import { makeGreyTower } from './baleiro.js';
import { audio } from '../audio.js';
import { fx } from '../fx.js';
import { wait } from '../ui.js';

const C = V(0, 0, -25); // mountain centre
const TIERS = [{ r: 26, top: 4 }, { r: 19, top: 10 }, { r: 12, top: 16 }, { r: 6.5, top: 22 }];
const PEN = V(20, 0, 46);
const polar = (r, a, y) => V(C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r);
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// the chasm cuts the whole valley in two (west side)
const chasm = x => smooth(-39, -42, x) * smooth(-77, -76, x);
function height(x, z) {
  const r = Math.hypot(x, z + 10), rc = Math.hypot(x - C.x, z - C.z);
  let h = smooth(80, 130, r) * 36 + noise2(x, z) * (0.5 * smooth(34, 50, rc) + smooth(55, 90, r) * 4);
  const f = chasm(x);
  return h * (1 - f) - 40 * f;
}

// cylinder with world-scaled UVs (side and caps)
function tierMesh(rt, rb, h, m) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 48, 1);
  const uv = g.attributes.uv, idx = g.index;
  const seen = new Set();
  g.groups.forEach((grp, gi) => {
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const v = idx.getX(i); if (seen.has(v)) continue; seen.add(v);
      if (gi === 0) uv.setXY(v, uv.getX(v) * (Math.PI * 2 * rt) / 4, uv.getY(v) * h / 4);
      else uv.setXY(v, uv.getX(v) * rt / 2, uv.getY(v) * rt / 2);
    }
  });
  return new THREE.Mesh(g, m);
}

function makeSheep() {
  const g = new THREE.Group();
  const wool = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1, flatShading: true });
  const dark = colorMat(0x2a2522);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 1), wool);
    b.position.set(rnd(-0.2, 0.2), 0.62 + rnd(-0.05, 0.12), -0.3 + i * 0.12); g.add(b);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), dark); head.position.set(0, 0.78, 0.48); head.scale.z = 1.3; g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), dark); ear.position.set(s * 0.2, 0.84, 0.42); ear.scale.set(1.6, 0.6, 0.8); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035), new THREE.MeshBasicMaterial({ color: 0xffffff })); eye.position.set(s * 0.09, 0.84, 0.66); g.add(eye);
  }
  g.userData.legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 5), dark); l.position.set(sx * 0.16, 0.21, sz * 0.25); g.add(l); g.userData.legs.push(l);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Lela's lost sheep: touch one and it follows Pepe; lead it into the pen.
class Sheep extends Entity {
  constructor(game, pos, ctx, penned = false) {
    super(game); this.ctx = ctx; this.pos = pos.clone(); this.state = penned ? 'penned' : 'lost';
    this.obj = makeSheep(); this.obj.position.copy(pos); game.scene.add(this.obj);
    this.t = rnd(0, 6); this.yaw = rnd(0, 6); this.wanderT = 0; this.target = null; this.hop = 0;
  }
  update(dt) {
    this.t += dt;
    const pl = this.game.player, world = this.game.world;
    let moving = false;
    if (this.state === 'lost') {
      if (flatDist(pl.pos, this.pos) < 1.8 && Math.abs(pl.pos.y - this.pos.y) < 2 && !pl.locked) {
        this.state = 'follow'; audio.sfx('heal'); fx.sparkle(this.pos.clone().setY(this.pos.y + 1), 8, 0xffffff, 2);
        this.game.ui.toast('Baa! A lost sheep is following you — lead it to Lela\'s pen.', 3000);
      }
    } else if (this.state === 'follow') {
      const d = flatDist(pl.pos, this.pos);
      if ((d > 16 || Math.abs(pl.pos.y - this.pos.y) > 8) && pl.onGround && !pl.locked) {
        // too far behind: hop to Pepe's side
        fx.poof(this.pos, 0xffffff, 6);
        const back = V(-Math.sin(pl.facing) * 1.8, 0, -Math.cos(pl.facing) * 1.8);
        this.pos.copy(pl.pos).add(back); fx.poof(this.pos, 0xffffff, 6);
      } else if (d > 2.2) {
        const sp = Math.min(9, d * 2.2);
        const dx = (pl.pos.x - this.pos.x) / d, dz = (pl.pos.z - this.pos.z) / d;
        const nx = this.pos.x + dx * sp * dt, nz = this.pos.z + dz * sp * dt;
        const g = world.ground(V(nx, this.pos.y, nz), 1.2, 40);
        if (g && g.normal.y > 0.5) { this.pos.x = nx; this.pos.z = nz; this.yaw = Math.atan2(dx, dz); moving = true; }
      }
      if (flatDist(this.pos, PEN) < 4.2) {
        this.state = 'penned'; audio.sfx('checkpoint'); fx.sparkle(this.pos.clone().setY(this.pos.y + 1), 14, 0xfff0a0, 3);
        this.ctx.sheepPenned();
      }
    } else { // penned: wander inside the pen
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = rnd(2, 5); this.target = PEN.clone().add(V(rnd(-3, 3), 0, rnd(-3, 3))); }
      if (this.target) {
        const d = flatDist(this.target, this.pos);
        if (d > 0.3) { const dx = (this.target.x - this.pos.x) / d, dz = (this.target.z - this.pos.z) / d; this.pos.x += dx * 1.2 * dt; this.pos.z += dz * 1.2 * dt; this.yaw = Math.atan2(dx, dz); moving = true; }
      }
    }
    // ground snap (falls smoothly when stepping off ledges)
    const g = world.ground(this.pos, 1.2, 40);
    if (g) this.pos.y = g.y < this.pos.y ? this.pos.y + (g.y - this.pos.y) * Math.min(1, dt * 10) : g.y;
    this.obj.position.copy(this.pos);
    if (moving) { this.hop += dt * 14; this.obj.position.y += Math.abs(Math.sin(this.hop)) * 0.12; }
    this.obj.userData.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(this.hop + i * 1.6) * 0.5 : 0));
    let dy = Math.atan2(Math.sin(this.yaw - this.obj.rotation.y), Math.cos(this.yaw - this.obj.rotation.y));
    this.obj.rotation.y += dy * Math.min(1, dt * 8);
    if (this.state === 'lost') this.obj.rotation.z = Math.sin(this.t * 2) * 0.04;
  }
}

function turbine(B, x, y, z, s = 1, ry = 0) {
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.7 * s, 16 * s, 10), mat('white'));
  tower.position.set(x, y + 8 * s, z); B.add(tower);
  const head = new THREE.Group(); head.position.set(x, y + 16 * s, z); head.rotation.y = ry; B.group.add(head);
  const nac = new THREE.Mesh(boxGeo(1 * s, 1 * s, 2.4 * s, 1), mat('white')); nac.castShadow = true; head.add(nac);
  const rotor = new THREE.Group(); rotor.position.z = 1.3 * s; head.add(rotor);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 10, 8), mat('white')); rotor.add(hub);
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Mesh(boxGeo(0.5 * s, 7 * s, 0.12 * s, 1), mat('white'));
    blade.geometry.translate(0, 3.5 * s, 0); blade.rotation.z = k * Math.PI * 2 / 3; blade.castShadow = true; rotor.add(blade);
  }
  const sp = rnd(0.6, 1.1);
  B.animated.push(dt => { rotor.rotation.z += dt * sp; });
}

export default {
  id: 'mountain', name: 'Monte da Fibra', subtitle: 'Where the wind turbines sing', music: 'mountain', sparks: 5,
  sky: { top: 0x6f62b8, bottom: 0xffc08a }, fog: { color: 0xffc8a0, near: 70, far: 320 },
  hemi: { sky: 0xffd8b8, ground: 0x6a5a4a, i: 1.0 }, sunColor: 0xffb070, sunI: 2.5,
  sunDir: new THREE.Vector3(-0.75, 0.32, 0.45),
  killY: -22,
  spawn: { pos: V(0, 0.3, 62), yaw: Math.PI },
  build(game, B) {
    const ctx = { spawns: {}, npcs: {} };
    const H = height;
    B.terrain({ size: 280, seg: 140, height: H, color: grassColor(null, 16) });
    B.clouds(12, 200, 75);

    // ---------- the mountain: stacked granite tiers ----------
    const grassTop = new THREE.MeshStandardMaterial({ map: TEX.grass(), color: 0x7aa84f, roughness: 1 });
    TIERS.forEach((t, i) => {
      const h = t.top + 1;
      const m = tierMesh(t.r, t.r + 1.4, h, mat('rock')); m.position.set(C.x, -1 + h / 2, C.z);
      B.add(m);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(t.r - 0.05, 48), grassTop);
      cap.geometry.attributes.uv.array.forEach((v, k, a) => (a[k] = v * t.r / 2));
      cap.rotation.x = -Math.PI / 2; cap.position.set(C.x, t.top + 0.03, C.z); cap.receiveShadow = true; B.group.add(cap);
      // a few rocks around the rim for flavour
      for (let k = 0; k < 5 + i * 2; k++) { const a = rnd(0, Math.PI * 2); const r = t.r + 0.6 + rnd(0, 0.8); const p = polar(r, a, (i ? TIERS[i - 1].top : 0)); if (i === 0) p.y = H(p.x, p.z); B.rock(p.x, p.y, p.z, rnd(0.5, 1.1), false); }
    });
    // spiral ramps: ground->T0 (south), T0->T1 (west), T1->T2 (north), T2->T3 (east)
    const angles = [Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2];
    ctx.ramps = [];
    angles.forEach((a, i) => {
      const up = TIERS[i], lowTop = i ? TIERS[i - 1].top : 0, rise = up.top - lowTop;
      const width = i === 3 ? 4 : 5, d = i === 0 ? 10 : (i === 3 ? 11 : 12);
      const rm = up.r + width / 2 + 0.3;
      const c = polar(rm, a, lowTop);
      const t = V(-Math.sin(a), 0, Math.cos(a));
      const ry = Math.atan2(t.x, t.z);
      B.ramp(c.x, lowTop, c.z, width, rise, d, ry, 'granite');
      const lo = c.clone().addScaledVector(t, -d / 2), hi = c.clone().addScaledVector(t, d / 2);
      lo.y = lowTop; hi.y = up.top;
      // landing block bridging the ramp top to the next tier
      const hr = Math.hypot(hi.x - C.x, hi.z - C.z), phi = Math.atan2(hi.z - C.z, hi.x - C.x);
      const rIn = up.r - 1.5, rOut = hr + width / 2;
      const lp = polar((rIn + rOut) / 2, phi, lowTop);
      B.box(lp.x, lowTop, lp.z, rOut - rIn, rise, 4.5, 'granite', { ry: -phi });
      ctx.ramps.push({ lo, hi, t, c });
    });

    // Don Baleiro's antenna on the summit (sucking the fibre — and the Faíscas)
    const ant = makeGreyTower(140); ant.scale.setScalar(0.12); ant.position.set(C.x, TIERS[3].top, C.z); game.addObj(ant);
    const antCol = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 18, 8)); antCol.position.set(C.x, TIERS[3].top + 9, C.z); antCol.updateMatrixWorld(); B.colliders.push(antCol);
    ctx.antenna = ant;
    // the Grey Tower, far away to the north
    const tower = makeGreyTower(140); tower.position.set(70, 0, -300); game.addObj(tower); ctx.tower = tower;
    // fibre cable sagging from antenna toward the Grey Tower
    const cablePts = []; for (let i = 0; i <= 20; i++) { const k = i / 20; cablePts.push(V(C.x + 70 * k, TIERS[3].top + 16 - Math.sin(k * Math.PI) * 10 + k * 110, C.z - 275 * k)); }
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts), 40, 0.25, 6), colorMat(0x2c2f33)); B.group.add(cable);

    // ---------- valley: turbines, sheep pen, scenery ----------
    for (const [x, z, s, ry] of [[48, 22, 1, -0.5], [62, -30, 1.2, -1.2], [-28, 58, 0.9, 0.4], [34, -62, 1.1, 0.2], [-95, -55, 1.2, 1.5], [-100, 10, 1, 1.2]]) turbine(B, x, H(x, z) - 0.3, z, s, ry);
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(55, 120), x = Math.cos(a) * r, z = Math.sin(a) * r - 10;
      if (chasm(x) > 0.01 || Math.abs(x) > 128 || Math.abs(z) > 128) continue;
      B.tree(x, H(x, z) - 0.2, z, Math.random() < 0.6 ? 'pine' : 'oak', rnd(0.8, 1.3));
    }
    for (let i = 0; i < 18; i++) { const x = rnd(-35, 60), z = rnd(-10, 70); if (Math.hypot(x - C.x, z - C.z) < 32 || Math.hypot(x, z - 62) < 6) continue; B.rock(x, H(x, z), z, rnd(0.5, 1.4)); }
    B.grassTufts(10, 30, 45, 600, H, 0x8aa84a, (x, z) => Math.hypot(x - C.x, z - C.z) > 30 && chasm(x) < 0.01);
    B.flowers(10, 40, 30, 160, H, [0xffe14d, 0xffffff, 0xb07be0]);

    // sheep pen (curral) with an opening on the west side
    const fy = H(PEN.x, PEN.z);
    B.box(PEN.x, fy, PEN.z - 5, 10, 0.9, 0.25, 'wood', { tex: 1 });
    B.box(PEN.x, fy, PEN.z + 5, 10, 0.9, 0.25, 'wood', { tex: 1 });
    B.box(PEN.x + 5, fy, PEN.z, 0.25, 0.9, 10, 'wood', { tex: 1 });
    B.box(PEN.x - 5, fy, PEN.z - 3.25, 0.25, 0.9, 3.5, 'wood', { tex: 1 });
    B.box(PEN.x - 5, fy, PEN.z + 3.25, 0.25, 0.9, 3.5, 'wood', { tex: 1 });
    B.cyl(PEN.x + 3, fy, PEN.z + 3, 0.6, 0.6, 0.5, 'wood', 10); // water trough-ish

    // wall-kick chimney ("A Cheminea") east of the mountain
    const CZ = -14;
    B.box(34.2, 0, CZ, 1.6, 9, 7, 'granite');
    B.box(39.8, 0, CZ, 1.6, 9, 7, 'granite');
    B.box(35.5, 1.9, CZ, 1, 0.3, 3, 'wood', { tex: 1 });
    B.box(38.5, 4.3, CZ, 1, 0.3, 3, 'wood', { tex: 1 });
    B.box(35.5, 6.7, CZ, 1, 0.3, 3, 'wood', { tex: 1 });
    game.spawn(new Sign(game, V(37, H(37, -5), -5.5), 0, ['A CHEMINEA — the old shepherds\' chimney.', 'Jump into one wall, then jump again to kick off it. Or hop from plank to plank and pull yourself up the ledges.'], 'Sign'));

    // ---------- the chasm crossing (west) ----------
    // moving plank, a fallen turbine rotor that spins, and a rising plank
    game.spawn(new MovingPlatform(game, [V(-42, 0, -25), V(-52, 0, -25)], { w: 3, d: 3, speed: 3, mat: 'wood' }));
    const rotor = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(boxGeo(6.4, 0.45, 1.8, 2), mat('white')); b.geometry.translate(3.2, -0.225, 0); b.rotation.y = k * Math.PI * 2 / 3; b.castShadow = true; b.receiveShadow = true; rotor.add(b);
    }
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 16), mat('white')); hubM.position.y = -0.3; rotor.add(hubM);
    rotor.userData.noSide = true;
    game.spawn(new MovingPlatform(game, [V(-59.5, 0.5, -25)], { mesh: rotor, rotSpeed: 0.55 }));
    B.cyl(-59.5, -40, -25, 0.8, 1.2, 39.8, 'concrete', 10);
    game.spawn(new MovingPlatform(game, [V(-67, 0.8, -25), V(-75.5, 1.0, -25)], { w: 3, d: 3, speed: 2.4, mat: 'wood' }));
    game.spawn(new Sign(game, V(-36, H(-36, -20), -20), -Math.PI / 2, ['Beware the gap! The cooperative\'s old turbine rotor still spins on its pole.', 'Time your jumps, Pepe.'], 'Sign'));
    // far side: a granite shrine with a Faísca
    const fz = -25, fx0 = -86;
    B.cyl(fx0, H(fx0, fz) - 0.5, fz, 3, 3.4, 1.8, 'granite', 16);
    game.spawn(new Checkpoint(game, V(-81, H(-81, -18), -18)));

    // ---------- NPCs ----------
    const T = (name, look, pos, ry, talk, anim) => { const n = new NPC(game, pos, { name, look, ry, talk, anim }); ctx.npcs[name] = n; return game.spawn(n); };
    ctx.penned = 0;
    T('Lela a pastora', { skin: 0xe0a882, shirt: 0x8a3a2a, skirt: 0x3a3a4a, hair: 0x5a3a20, hairStyle: 'long', hat: 'scarf', hatColor: 0x2e6b4f, prop: 'staff' }, V(13.5, H(13.5, 46), 46), -Math.PI / 2, async g => {
      if (g.save.sparks.includes('mountain-5')) return g.say('Lela a pastora', ['All five home, all five fat and fluffy. Grazas, Pepe!', 'My grandmother herded sheep on this mountain. Now the turbines spin above them. Old and new, side by side — that\'s how it should be.'], 380);
      const left = 5 - ctx.penned;
      if (!ctx.metLela) { ctx.metLela = true; await g.say('Lela a pastora', ['Ai, Pepe! Thank goodness, a dog!', 'That grey antenna on the summit hums so loud my sheep ran off in every direction. Five of them!', 'One in the meadow, one by the chimney, one near the chasm, and two up on the mountain terraces.', 'Touch a sheep and it\'ll follow you. Bring them back into the pen here. If one gets stuck, just keep walking — they always catch up.'], 380); return; }
      await g.say('Lela a pastora', [left === 5 ? 'Five sheep still out there. Baaaa-d luck, eh?' : `${5 - left} home, ${left} to go. You\'re a natural, Pepe!`], 380);
    });
    const brPos = polar(16, Math.PI * 0.25, TIERS[1].top);
    T('Brais', { skin: 0xf0c8a0, shirt: 0xe07a2a, pants: 0x2a3a4a, hair: 0xc08040, beard: true, beardColor: 0xb07030, hat: 'cap', hatColor: 0x3d6b3a, prop: 'wrench' }, brPos, Math.PI * 0.25 + Math.PI, async g => {
      await g.say('Brais (Rural Hackers volunteer)', ['Hey, Pepe! I\'m with Rural Hackers — I came up to fix the village fibre box.', 'Look at that thing on the summit. Don Baleiro\'s antenna is slurping the fibre AND the Faíscas straight to his Grey Tower.', 'His drones are everywhere up here. Clear them all and I bet the antenna coughs one up.', 'Oh, and watch the western ramp — he rolls boulders down it. Very inefficient way to say hello.'], 300);
    });
    const box = new THREE.Mesh(boxGeo(0.8, 1.1, 0.5, 1), colorMat(0x3f8a5a)); const bp = polar(17.2, Math.PI * 0.25 + 0.06, TIERS[1].top); box.position.set(bp.x, bp.y + 0.55, bp.z); box.castShadow = true; B.group.add(box);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x40ff80 })); led.position.set(0, 0.35, 0.26); box.add(led); box.rotation.y = -Math.PI * 0.25;

    // ---------- signs, checkpoints, exit ----------
    game.spawn(new Sign(game, V(5, H(5, 56), 56), Math.PI, ['MONTE DA FIBRA — the shepherds\' mountain.', 'NOTICE: this summit has been "upgraded" by BALEIRO CORP. Hikers will be optimised.'], 'Sign'));
    game.spawn(new ExitRing(game, V(-6, H(-6, 66), 66)));
    game.spawn(new Checkpoint(game, V(8, H(8, 18), 18)));
    game.spawn(new Checkpoint(game, polar(15.5, Math.PI * 0.75, TIERS[1].top)));
    game.spawn(new Checkpoint(game, V(-36, H(-36, -30), -30)));

    // ---------- hazards: boulders down the western ramp ----------
    const r1 = ctx.ramps[1];
    const bpath = [r1.hi.clone().addScaledVector(r1.t, 2.2).setY(TIERS[1].top), r1.hi.clone(), r1.lo.clone(), r1.lo.clone().addScaledVector(r1.t, -8).setY(TIERS[0].top), V(r1.lo.x, 0, r1.lo.z + 14), V(r1.lo.x, 0, r1.lo.z + 26)];
    game.spawn(new Boulder(game, bpath, { speed: 7.5, r: 1.2 }));
    game.spawn(new Boulder(game, bpath, { speed: 7.5, r: 1.2, delay: 3.2 }));

    // ---------- enemies ----------
    if (!game.save.sparks.includes('mountain-4')) {
      for (const p of [V(12, 0, 26), V(-16, 0, 14), polar(22.5, 0.3, TIERS[0].top), polar(22.5, -1.2, TIERS[0].top), polar(15.5, 0.6, TIERS[1].top), polar(9, Math.PI * 0.3, TIERS[2].top)]) {
        if (p.y === 0) p.y = H(p.x, p.z);
        game.spawn(new Baleirino(game, p, { tag: 'mtn', speed: 3.2 }));
      }
      ctx.tagCounts = { mtn: 'Fibre drones' };
    }
    game.spawn(new Bug(game, V(-12, H(-12, 38), 38), { to: V(6, 0, 38), speed: 3, color: 0x8a6a2a }));
    game.spawn(new Bug(game, polar(22.5, 1.75, TIERS[0].top), { to: polar(22.5, 2.6, TIERS[0].top), speed: 3.2 }));
    game.spawn(new Bug(game, polar(15.5, 3.4, TIERS[1].top), { to: polar(15.5, 4.2, TIERS[1].top), speed: 3.2, color: 0x6a2a7a }));
    game.spawn(new Bug(game, V(28, H(28, 0), 0), { to: V(30, 0, -28), speed: 2.8 }));

    // ---------- collectibles ----------
    const nuts = [...lineOf(5, V(0, 0, 54), V(0, 0, 36)), ...ringOf(8, -20, 0, 32, 4), ...lineOf(5, V(30, 0, 8), V(30, 0, -6)), ...lineOf(4, V(-30, 0, -10), V(-30, 0, -36))];
    for (const p of nuts) { p.y = H(p.x, p.z); game.spawn(new Chestnut(game, p)); }
    for (const r of ctx.ramps) for (const p of lineOf(4, r.lo.clone().lerp(r.hi, 0.1), r.lo.clone().lerp(r.hi, 0.9))) game.spawn(new Chestnut(game, p));
    for (let i = 0; i < 6; i++) game.spawn(new Chestnut(game, polar(16, i * 0.25 + 4.5, TIERS[1].top)));
    for (const p of ringOf(6, -86, 1.3 + H(-86, -25) - 0.5, -25, 2)) game.spawn(new Chestnut(game, p));
    for (const p of [V(36, 2.2, CZ), V(38.5, 4.6, CZ), V(35.5, 7.0, CZ)]) game.spawn(new Chestnut(game, p));
    game.spawn(new Crate(game, V(6, H(6, 34), 34), 3));
    game.spawn(new Crate(game, V(-10, H(-10, 50), 50), 3));
    game.spawn(new Crate(game, polar(16, 2.2, TIERS[1].top), 4));
    game.spawn(new Crate(game, polar(9.5, 0.6, TIERS[2].top), 4));

    // ---------- the five Faíscas ----------
    game.spawn(new Spark(game, 'mountain-1', polar(3.6, Math.PI * 0.8, TIERS[3].top), { title: 'Summit of the Fibre' }));
    game.spawn(new Spark(game, 'mountain-2', V(fx0, H(fx0, fz) + 1.3, fz), { title: 'Over the Abyss' }));
    game.spawn(new Spark(game, 'mountain-3', V(34.2, 9, CZ), { title: 'The Shepherds\' Chimney' }));
    ctx.onTagCleared = (tag, pos) => {
      if (tag !== 'mtn') return;
      game.ui.toast('Every fibre drone is down — the antenna splutters!');
      game.spawnSparkCinematic('mountain-4', polar(9, Math.PI * 0.6, TIERS[2].top), 'Drone-Free Skies');
    };
    // sheep quest
    const done = game.save.sparks.includes('mountain-5');
    const sheepSpots = [V(-22, 0, 28), V(42, 0, -2), V(-35, 0, -42), polar(23, 2.9, TIERS[0].top), polar(15.5, 5.4, TIERS[1].top)];
    sheepSpots.forEach((p, i) => {
      if (done) p = PEN.clone().add(V(rnd(-3, 3), 0, rnd(-3, 3)));
      if (p.y === 0) p.y = H(p.x, p.z);
      game.spawn(new Sheep(game, p, ctx, done));
    });
    ctx.sheepPenned = () => {
      ctx.penned++;
      if (ctx.penned >= 5 && !game.save.sparks.includes('mountain-5')) {
        game.ui.toast('All five sheep are home!');
        game.spawnSparkCinematic('mountain-5', PEN.clone().setY(H(PEN.x, PEN.z)), 'Lela\'s Flock');
      } else if (ctx.penned < 5) game.ui.toast(`Sheep home: ${ctx.penned}/5`, 2000);
    };

    ctx.spawns.start = { pos: V(0, H(0, 62) + 0.3, 62), yaw: Math.PI };

    // ---------- per-frame ----------
    ctx.update = (dt, t) => {
      ant.userData.eye.material.color.setHSL(0, 1, 0.45 + Math.sin(t * 5) * 0.12);
      tower.userData.eye.material.color.setHSL(0, 1, 0.45 + Math.sin(t * 3) * 0.1);
      ant.rotation.y += dt * 0.2;
      // the wind!
      if (Math.random() < dt * 3) { const p = game.player.pos; fx.spawn(V(p.x + rnd(-12, 12), p.y + rnd(1, 8), p.z + rnd(-12, 12)), V(6, 0.3, -2), 1.2, 0.25, 0xffffff, { opacity: 0.5, grow: 3 }); }
    };

    // ---------- first-visit flyover ----------
    ctx.onEnter = async () => {
      if (game.flag('seen-mountain')) { game.ui.bigText('MONTE DA FIBRA', 'Where the wind turbines sing', 2400); return; }
      game.flag('seen-mountain', true);
      const pl = game.player; pl.locked = true;
      game.cam.cinematic = true; game.ui.letterbox(true);
      const summit = V(C.x, TIERS[3].top + 4, C.z);
      game.cine.look = summit.clone();
      await game.cine.cam(V(70, 40, 70), V(0, 8, -20), 0);
      game.ui.bigText('MONTE DA FIBRA', 'Where the wind turbines sing', 3000);
      await game.cine.orbit(V(C.x, 6, C.z), 62, 30, Math.PI * 0.25, Math.PI * 0.9, 5.5);
      await game.cine.cam(V(C.x + 14, TIERS[3].top + 8, C.z + 14), summit, 2.5);
      audio.sfx('laser');
      await wait(700);
      await game.cine.cam(pl.pos.clone().add(V(0, 3.5, 8)), pl.pos.clone().add(V(0, 1.4, 0)), 2);
      game.ui.letterbox(false); game.cam.cinematic = false; game.cam.snap(pl); pl.locked = false;
      game.ui.toast('Lela the shepherd looks worried — go say hello!', 3500);
    };
    return ctx;
  },
};

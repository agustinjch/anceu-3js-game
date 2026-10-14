// TORRE BALEIRA — the top of Don Baleiro's grey tower. Boss fight vs the BALEIRO-MATIC 3000.
import * as THREE from 'three';
import { mat, colorMat, boxGeo, TEX } from '../kit.js';
import { Chestnut, Baleirino, Entity } from '../entities.js';
import { V } from './util.js';
import { makeBaleiro, textTex } from './baleiro.js';
import { audio } from '../audio.js';
import { fx } from '../fx.js';
import { wait } from '../ui.js';

const ARENA_R = 20;
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- screen faces ----------
function faceTex(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 148; const g = c.getContext('2d');
  g.fillStyle = '#101317'; g.fillRect(0, 0, 256, 148);
  g.strokeStyle = g.fillStyle = kind === 'hurt' ? '#ffffff' : '#ff2a2a'; g.lineWidth = 12; g.lineCap = 'round';
  if (kind === 'angry') {
    for (const s of [-1, 1]) {
      const cx = 128 + s * 58;
      g.beginPath(); g.moveTo(cx - 34, 58 - s * 0); g.lineTo(cx + 34, 58); g.lineTo(cx + s * 34, 30); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(cx - 40, s < 0 ? 22 : 40); g.lineTo(cx + 40, s < 0 ? 40 : 22); g.stroke();
    }
    g.beginPath(); g.moveTo(80, 118); g.quadraticCurveTo(128, 90, 176, 118); g.stroke();
  } else if (kind === 'dizzy') {
    g.lineWidth = 6;
    for (const s of [-1, 1]) { const cx = 128 + s * 58; g.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = a * 2.6; g.lineTo(cx + Math.cos(a) * r, 52 + Math.sin(a) * r); } g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.moveTo(84, 118); for (let i = 0; i < 6; i++) g.lineTo(92 + i * 16, i % 2 ? 110 : 124); g.stroke();
  } else { // hurt: X X
    for (const s of [-1, 1]) { const cx = 128 + s * 58; g.beginPath(); g.moveTo(cx - 24, 30); g.lineTo(cx + 24, 74); g.moveTo(cx + 24, 30); g.lineTo(cx - 24, 74); g.stroke(); }
    g.beginPath(); g.ellipse(128, 112, 22, 16, 0, 0, 7); g.stroke();
  }
  for (let y = 0; y < 148; y += 4) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, 256, 2); } // scanlines
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- the mech ----------
function makeMech() {
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const mats = [];
  const M = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3, ...o }); mats.push(m); return m; };
  const hull = M({ map: TEX.concrete(), color: 0xb4b8be }), dark = M({ color: 0x2a2d33 }), metal = M({ color: 0x7c8590, metalness: 0.7, roughness: 0.35 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; tilt.add(mesh); return mesh; };
  const jets = [];
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(boxGeo(0.9, 2.2, 1.0, 1), metal), s * 1.0, 1.1, 0);
    add(new THREE.Mesh(boxGeo(1.2, 0.4, 1.6, 1), dark), s * 1.0, 0.2, 0.15);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85 }));
    jet.rotation.x = Math.PI; jet.position.set(s * 1.0, -0.8, 0.1); tilt.add(jet); jets.push(jet);
  }
  add(new THREE.Mesh(boxGeo(3.6, 3.2, 1.6, 1), hull), 0, 3.8, 0);
  add(new THREE.Mesh(boxGeo(3.8, 0.25, 1.8, 1), dark), 0, 2.25, 0); // belt
  const faces = { angry: faceTex('angry'), dizzy: faceTex('dizzy'), hurt: faceTex('hurt') };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({ map: faces.angry }));
  screen.position.set(0, 4.45, 0.81); tilt.add(screen);
  const tie = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.3, 4), M({ color: 0xc0202a })); tie.rotation.z = Math.PI; tie.scale.z = 0.25; add(tie, 0, 3.0, 0.85);
  const knot = add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.15), tie.material), 0, 3.65, 0.85);
  const arms = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(s * 2.15, 5.0, 0); tilt.add(p);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), dark); p.add(sh);
    const arm = new THREE.Mesh(boxGeo(0.7, 2.4, 0.7, 1), metal); arm.position.y = -1.3; arm.castShadow = true; p.add(arm);
    const fist = new THREE.Mesh(boxGeo(1.0, 0.9, 1.0, 1), hull); fist.position.y = -2.8; fist.castShadow = true; p.add(fist);
    p.rotation.z = s * 0.15; arms.push(p);
  }
  // cockpit with Don Baleiro on top
  const don = makeBaleiro(0.6); don.position.set(0, 5.1, 0); tilt.add(don);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }));
  dome.position.set(0, 5.4, 0); tilt.add(dome);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.3, 18), dark), 0, 5.55 - 0.15, 0);
  const ant = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), metal), 1.4, 6.0, -0.4);
  const antTip = add(new THREE.Mesh(new THREE.SphereGeometry(0.14), new THREE.MeshBasicMaterial({ color: 0xff3030 })), 1.4, 6.65, -0.4);
  // the RESET button on its back
  const btnMat = M({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 0.3, roughness: 0.3 });
  const housing = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.2, 20), dark), 0, 3.8, -0.88); housing.rotation.x = Math.PI / 2;
  const button = add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.72, 0.4, 20), btnMat), 0, 3.8, -1.05); button.rotation.x = Math.PI / 2;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: textTex('RESET', '#ffffff'), transparent: true, depthWrite: false }));
  lbl.position.set(0, 2.75, -0.82); lbl.rotation.y = Math.PI; tilt.add(lbl);
  const btnLight = new THREE.PointLight(0xff2020, 0, 6); btnLight.position.set(0, 3.8, -1.6); tilt.add(btnLight);
  root.userData = { tilt, jets, screen, faces, arms, don, button, btnMat, btnLight, mats, antTip };
  return root;
}

// ---------- boss HP bar (an entity, so it's removed with the level) ----------
class BossBar extends Entity {
  constructor(game) {
    super(game);
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:absolute;bottom:26px;left:50%;transform:translateX(-50%);text-align:center;font-family:Lilita One,sans-serif;color:#fff;font-size:22px;letter-spacing:1px;text-shadow:2px 2px 0 #2b1a10,-2px -2px 0 #2b1a10,2px -2px 0 #2b1a10,-2px 2px 0 #2b1a10;transition:opacity .4s;opacity:0;pointer-events:none';
    el.innerHTML = '<div>BALEIRO-MATIC 3000</div><div class="pips" style="display:flex;gap:8px;justify-content:center;margin-top:6px"></div>';
    document.querySelector('#ui').appendChild(el);
    this.set(3);
  }
  set(hp) {
    this.el.querySelector('.pips').innerHTML = [0, 1, 2].map(i => `<div style="width:54px;height:16px;border:4px solid #2b1a10;border-radius:8px;background:${i < hp ? '#e8402f' : '#5a4a3a'}"></div>`).join('');
  }
  show(on) { this.el.style.opacity = on ? 1 : 0; }
  remove() { super.remove(); this.el.remove(); }
}

export default {
  id: 'boss', name: 'Torre Baleira', subtitle: 'Don Baleiro', music: 'boss', sparks: 0,
  sky: { top: 0x3a2a34, bottom: 0xb07a72 }, fog: { color: 0xa07672, near: 80, far: 520 },
  hemi: { sky: 0xd8b8b8, ground: 0x4a4048, i: 1.0 }, sunColor: 0xffb090, sunI: 2.2, sunDir: new THREE.Vector3(-0.4, 0.7, 0.5),
  killY: -25,
  spawn: { pos: V(0, 0.1, 14), yaw: Math.PI },
  build(game, B) {
    const ctx = { spawns: {}, fighting: false };
    // ---- arena ----
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R, ARENA_R, 2, 64), mat('concrete'));
    floor.position.y = -1; floor.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 8));
    B.add(floor, true, false);
    // painted target rings on the floor
    for (const r of [6, 12, 17]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r + 0.25, 64), new THREE.MeshStandardMaterial({ color: 0xc8b23a, roughness: 0.8 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.receiveShadow = true; B.group.add(ring);
    }
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: textTex('BALEIRO CORP.', '#ff4a4a'), transparent: true, depthWrite: false }));
    logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.03, 0); B.group.add(logo);
    // low curb around the edge (blocks walking off, not knockbacks)
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      B.box(Math.cos(a) * (ARENA_R - 0.4), 0, Math.sin(a) * (ARENA_R - 0.4), 4.1, 0.55, 0.6, 'concrete', { ry: -a + Math.PI / 2, tex: 1 });
    }
    // tower shaft and floors below
    B.cyl(0, -140, 0, ARENA_R - 2, ARENA_R + 6, 138, 'concrete', 6, { collide: false, shadow: false });
    for (let i = 0; i < 8; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xff5050 }));
      const a = i / 8 * Math.PI * 2 + 0.3; w.position.set(Math.sin(a) * (ARENA_R - 0.6), -10 - (i % 3) * 14, Math.cos(a) * (ARENA_R - 0.6)); w.rotation.y = a; B.group.add(w);
    }
    // antenna pylons beyond the edge
    const pylonLights = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * (ARENA_R + 5), z = Math.sin(a) * (ARENA_R + 5);
      B.cyl(x, -20, z, 0.6, 1.2, 38, 'metal', 8, { collide: false });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.7), new THREE.MeshBasicMaterial({ color: 0xff3030 })); l.position.set(x, 18.7, z); B.group.add(l); pylonLights.push(l);
    }
    B.clouds(22, 220, -28);
    B.clouds(10, 300, 70);
    // grey city skyline: Baleirópolis
    const N = 90, box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const city = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 1 }), N);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(260, 380), w = rnd(14, 34), h = rnd(30, 150);
      m4.compose(V(Math.cos(a) * r, -90, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd(0, 3)), V(w, h + 90, w));
      city.setMatrixAt(i, m4);
    }
    B.group.add(city);

    // ---- the boss ----
    const mech = makeMech(); game.addObj(mech);
    const U = mech.userData;
    mech.position.set(0, 45, -4);
    const bar = game.spawn(new BossBar(game));
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05; B.group.add(shadow);
    // invisible collider for the mech's back while it lies stunned
    const backCol = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.7, 6.2), new THREE.MeshBasicMaterial({ visible: false }));
    let backColOn = false;
    const setBackCol = on => {
      if (on === backColOn) return; backColOn = on;
      if (on) {
        const fwd = V(Math.sin(mech.rotation.y), 0, Math.cos(mech.rotation.y));
        backCol.position.copy(mech.position).addScaledVector(fwd, 3.1).setY(0.85); backCol.rotation.y = mech.rotation.y;
        game.scene.add(backCol); game.world.addDynamic(backCol);
      } else {
        game.scene.remove(backCol);
        const i = game.world.dynamic.findIndex(d => d.mesh === backCol); if (i >= 0) game.world.dynamic.splice(i, 1);
      }
    };

    const S = { hp: 3, state: 'idle', t: 0, ringT: 0, target: V(0, 0, -4), y: 1.6, nutT: 6, flash: 0, cycle: 0 };
    const rings = [];
    const phase = () => 3 - S.hp; // 0,1,2
    const setState = (s) => { S.state = s; S.t = 0; };
    const setFace = k => { U.screen.material.map = U.faces[k]; U.screen.material.needsUpdate = true; };

    function fireRing(center, speed = 8 + phase() * 2) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.7, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(center.x, 0.35, center.z); game.scene.add(m);
      rings.push({ m, r: 1, speed, c: center.clone().setY(0), hit: false });
      audio.sfx('shock');
    }
    function updateRings(dt) {
      const pl = game.player;
      for (let i = rings.length - 1; i >= 0; i--) {
        const R = rings[i]; R.r += R.speed * dt;
        R.m.scale.set(R.r, 1, R.r); R.m.material.opacity = 0.85 * Math.max(0, 1 - R.r / (ARENA_R + 6));
        const d = flatDist(pl.pos, R.c);
        if (!R.hit && !pl.locked && Math.abs(d - R.r) < 0.6 && pl.pos.y < 0.75) { R.hit = true; pl.hurt(1, R.c); }
        if (R.r > ARENA_R + 6) { game.scene.remove(R.m); R.m.geometry.dispose(); R.m.material.dispose(); rings.splice(i, 1); }
      }
    }
    function clearRings() { rings.forEach(R => game.scene.remove(R.m)); rings.length = 0; }
    function pickTarget() {
      const a = rnd(0, Math.PI * 2), r = rnd(3, 12);
      S.target.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    function faceToward(p, dt, rate = 3) {
      const want = Math.atan2(p.x - mech.position.x, p.z - mech.position.z);
      const d = Math.atan2(Math.sin(want - mech.rotation.y), Math.cos(want - mech.rotation.y));
      mech.rotation.y += d * Math.min(1, dt * rate);
    }
    function contactDamage() {
      const pl = game.player; if (pl.locked) return;
      if (flatDist(pl.pos, mech.position) < 2.2 && pl.pos.y < mech.position.y + 6 && pl.pos.y > mech.position.y - 1.5) pl.hurt(1, mech.position);
    }
    const quips = ['Ouch! That was my quarterly bonus!', 'Stop that! Do you know what a RESET costs?', 'Fine! No more Mr. Efficient Guy!'];

    async function hit() {
      setState('hit');
      S.hp--; bar.set(S.hp);
      audio.sfx('bosshit'); game.cam.shake(0.5, 0.5); S.flash = 0.6; setFace('hurt');
      fx.sparkle(U.button.getWorldPosition(V(0, 0, 0)), 20, 0xff6040, 5);
      const pl = game.player;
      const away = V(pl.pos.x - mech.position.x, 0, pl.pos.z - mech.position.z).normalize();
      pl.vel.set(away.x * 9, 13, away.z * 9); pl.onGround = false; pl.state = 'air';
      if (S.hp <= 0) return defeat();
      game.ui.toast(quips[2 - S.hp] || quips[0], 2500);
    }

    async function defeat() {
      ctx.fighting = false; setState('dead'); setBackCol(false); clearRings();
      bar.show(false);
      game.entities.filter(e => e.tag === 'bossdrone').forEach(e => { fx.poof(e.pos); e.remove(); });
      const pl = game.player; pl.locked = true;
      await wait(700);
      pl.vel.set(0, pl.vel.y, 0); pl.hspeed = 0;
      game.cam.cinematic = true; game.ui.letterbox(true);
      audio.stopSong(0.5);
      const c = mech.position.clone();
      game.cine.look = c.clone().add(V(0, 1.5, 0));
      await game.cine.cam(c.clone().add(V(10, 6, 12)), c.clone().add(V(0, 1.5, 0)), 1.2);
      // bring him back upright, shaking and sparking
      await game.cine.tween(0.8, k => { U.tilt.rotation.x = Math.PI / 2 * (1 - k); mech.position.y = 0.85 * (1 - k); });
      for (let i = 0; i < 7; i++) {
        const p = mech.position.clone().add(V(rnd(-2, 2), rnd(1, 6), rnd(-1.5, 1.5)));
        fx.poof(p, i % 2 ? 0x555555 : 0xffa040, 14); fx.sparkle(p, 12, 0xffb040, 6);
        audio.sfx('explode'); game.cam.shake(0.6, 0.4);
        mech.rotation.z = rnd(-0.08, 0.08);
        await wait(380);
      }
      await game.say('Don Baleiro', ['No… NO! My beautiful efficiency! My key performance indicators!', 'This is NOT effiiiiiciiieeeeent!'], 160);
      // Don Baleiro is flung away, comically
      const don = U.don; game.scene.attach(don); game.levelObjs.push(don);
      const d0 = don.position.clone();
      audio.sfx('explode'); audio.sfx('whoosh');
      fx.poof(d0, 0x777777, 20);
      game.cine.cam(c.clone().add(V(-14, 10, 18)), c.clone().add(V(0, 12, -30)), 2.5);
      await game.cine.tween(2.6, k => {
        don.position.set(d0.x + k * 10, d0.y + Math.sin(k * Math.PI * 0.9) * 26 + k * 6, d0.z - k * 70);
        don.rotation.set(k * 18, k * 7, k * 11);
      });
      fx.sparkle(don.position, 30, 0xffffff, 4);
      game.scene.remove(don);
      // the mech crumbles and the Gran Faísca bursts out
      await game.cine.cam(c.clone().add(V(9, 5, 11)), c.clone().add(V(0, 3, 0)), 1.0);
      audio.sfx('explode'); game.cam.shake(0.8, 1);
      await game.cine.tween(1.4, k => { mech.scale.set(1 + k * 0.2, Math.max(0.05, 1 - k), 1 + k * 0.2); if (Math.random() < 0.3) fx.poof(c.clone().add(V(rnd(-2, 2), rnd(0, 3), rnd(-2, 2))), 0x666666, 6); });
      mech.visible = false;
      fx.sparkle(c.clone().add(V(0, 2, 0)), 80, 0xffe080, 12);
      audio.sfx('spark');
      game.ui.bigText('DON BALEIRO DEFEATED!', 'The Gran Faísca is free!', 3000);
      await wait(3400);
      game.flag('bossBeaten', true);
      await game.playEnding();
    }

    ctx.update = (dt, t) => {
      pylonLights.forEach((l, i) => (l.material.color.setHSL(0, 1, 0.35 + 0.2 * Math.sin(t * 4 + i))));
      U.antTip.material.color.setHSL(0, 1, 0.4 + 0.15 * Math.sin(t * 6));
      U.don.userData.head && (U.don.userData.head.rotation.y = Math.sin(t * 1.3) * 0.4);
      updateRings(dt);
      // flash on hit
      if (S.flash > 0) { S.flash -= dt; const on = Math.floor(S.flash * 16) % 2 === 0; U.mats.forEach(m => { m.emissive.set(on ? 0xff2020 : 0x000000); m.emissiveIntensity = on ? 0.6 : 0; }); if (S.flash <= 0) U.mats.forEach(m => { m.emissive.set(0x000000); }); }
      const hovering = ['move', 'drones', 'rise', 'track', 'intro'].includes(S.state);
      U.jets.forEach((j, i) => { j.visible = hovering; j.scale.y = 0.8 + Math.random() * 0.5; });
      if (!ctx.fighting) return;
      S.t += dt;
      const pl = game.player;
      // healing chestnuts every so often
      S.nutT -= dt;
      if (S.nutT <= 0) {
        S.nutT = 9;
        if (game.entities.filter(e => e instanceof Chestnut && !e.dead).length < 3) { const a = rnd(0, 6.28), r = rnd(5, 15); game.spawn(new Chestnut(game, V(Math.cos(a) * r, 0, Math.sin(a) * r))); }
      }
      const P = phase();
      switch (S.state) {
        case 'move': {
          if (S.t < dt * 1.5) pickTarget();
          const to = S.target.clone().setY(0); const d = flatDist(mech.position, to);
          if (d < 0.8) pickTarget();
          const sp = 4 + P * 1.5;
          const dir = to.sub(mech.position).setY(0).normalize();
          mech.position.addScaledVector(dir, Math.min(d, sp * dt));
          mech.position.y += (1.6 + Math.sin(t * 2) * 0.3 - mech.position.y) * Math.min(1, dt * 3);
          faceToward(pl.pos, dt);
          U.arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 3 + i * Math.PI) * 0.5));
          S.ringT -= dt;
          if (S.ringT <= 0) { S.ringT = 2.4 - P * 0.5; fireRing(mech.position, 8 + P * 2.5); U.arms.forEach(a => (a.rotation.x = -2.2)); }
          contactDamage();
          if (S.t > 6 - P) { S.cycle++; setState(S.cycle % 2 ? 'drones' : 'rise'); }
          break;
        }
        case 'drones': {
          faceToward(pl.pos, dt);
          U.arms.forEach(a => (a.rotation.x = -2.8 + Math.sin(S.t * 12) * 0.2));
          if (S.t < dt * 1.5) {
            game.ui.toast('Don Baleiro calls his drones!', 1800); audio.sfx('laser');
            const alive = game.entities.filter(e => e.tag === 'bossdrone' && !e.dead).length;
            for (let i = 0; i < Math.min(2 + P, 4 - alive); i++) {
              const a = rnd(0, 6.28), r = rnd(6, 14);
              game.spawn(new Baleirino(game, V(Math.cos(a) * r, 8, Math.sin(a) * r), { tag: 'bossdrone', speed: 3 + P * 0.5, range: 40 }));
            }
          }
          contactDamage();
          if (S.t > 1.6) setState('rise');
          break;
        }
        case 'rise': {
          mech.position.y += (9 - mech.position.y) * Math.min(1, dt * 4);
          faceToward(pl.pos, dt);
          if (S.t > 0.9) { setState('track'); audio.sfx('warn'); }
          break;
        }
        case 'track': {
          const to = V(pl.pos.x, 0, pl.pos.z);
          if (to.length() > ARENA_R - 4) to.setLength(ARENA_R - 4);
          const k = Math.min(1, dt * (2.5 + P));
          mech.position.x += (to.x - mech.position.x) * k; mech.position.z += (to.z - mech.position.z) * k;
          mech.position.y = 9 + Math.sin(t * 10) * 0.15;
          shadow.position.set(mech.position.x, 0.05, mech.position.z); shadow.material.opacity = 0.5;
          if (S.t > 1.5 - P * 0.25) setState('drop');
          break;
        }
        case 'drop': {
          mech.position.y -= (14 + S.t * 50) * dt;
          shadow.position.set(mech.position.x, 0.05, mech.position.z);
          if (flatDist(pl.pos, mech.position) < 2.4 && pl.pos.y < mech.position.y + 1 && !pl.locked) pl.hurt(2, mech.position);
          if (mech.position.y <= 0) {
            mech.position.y = 0; shadow.material.opacity = 0;
            audio.sfx('pound'); audio.sfx('shock'); game.cam.shake(0.7, 0.6);
            fx.ring(mech.position, 0xffffff, 8, 0.6); fx.dust(mech.position, 20, 0x999999);
            fireRing(mech.position, 10 + P * 2);
            // always topple inward so the RESET button never hangs over the void
            const tip = V(mech.position.x + Math.sin(mech.rotation.y) * 6.5, 0, mech.position.z + Math.cos(mech.rotation.y) * 6.5);
            if (tip.length() > ARENA_R - 1.5) mech.rotation.y = Math.atan2(-mech.position.x, -mech.position.z);
            setState('topple'); setFace('dizzy');
          }
          break;
        }
        case 'topple': { // falls flat on its face, exposing the RESET button
          const k = Math.min(1, S.t / 0.5);
          U.tilt.rotation.x = Math.PI / 2 * (k * k);
          mech.position.y = 0.85 * k;
          if (k >= 1) { setState('stunned'); audio.sfx('pound'); fx.dust(mech.position.clone().add(V(Math.sin(mech.rotation.y) * 3, 0, Math.cos(mech.rotation.y) * 3)), 14, 0x999999); setBackCol(true);
            if (!ctx.hinted) { ctx.hinted = true; game.ui.toast('Now! Stomp or ground-pound the RESET button!', 3000); } }
          break;
        }
        case 'stunned': {
          U.btnMat.emissiveIntensity = 0.8 + Math.sin(t * 12) * 0.6; U.btnLight.intensity = 8 + Math.sin(t * 12) * 4;
          const bp = U.button.getWorldPosition(V(0, 0, 0)), top = bp.y + 0.2;
          const falling = pl.vel.y < -0.5 || pl.isPounding() || pl.poundLand > 0;
          if (!pl.locked && falling && flatDist(pl.pos, bp) < 1.4 && pl.pos.y > top - 0.45 && pl.pos.y < top + 1.2) { setBackCol(false); U.btnMat.emissiveIntensity = 0.3; U.btnLight.intensity = 0; hit(); break; }
          if (S.t > 4.5 - P * 0.6) { setBackCol(false); U.btnMat.emissiveIntensity = 0.3; U.btnLight.intensity = 0; setState('recover'); }
          break;
        }
        case 'hit':
          if (S.t > 0.6) setState('recover');
          break;
        case 'recover': {
          const k = Math.min(1, S.t / 0.8);
          U.tilt.rotation.x = Math.PI / 2 * (1 - k);
          mech.position.y = 0.85 * (1 - k) + k * 1.6 * k;
          if (k >= 1) { setFace('angry'); setState('move'); }
          break;
        }
      }
    };

    ctx._S = S; ctx._mech = mech; ctx._setState = setState;
    ctx.onEnter = async () => {
      const pl = game.player, ui = game.ui, cine = game.cine;
      pl.locked = true;
      ui.letterbox(true); game.cam.cinematic = true;
      audio.playSong('dark', 0.5);
      U.jets.forEach(j => (j.visible = true));
      cine.look = V(0, 30, -4);
      await cine.cam(V(14, 5, 26), V(0, 25, -4), 0);
      await cine.tween(3.5, k => {
        mech.position.y = 45 - (45 - 1.6) * (1 - Math.pow(1 - k, 3));
        cine.look = mech.position.clone().add(V(0, 3, 0)); game.camera.lookAt(cine.look);
      });
      audio.sfx('pound'); game.cam.shake(0.4, 0.4); fx.dust(V(0, 0, -4), 16, 0x999999);
      await cine.cam(V(3, 6.5, 6), V(0, 5.8, -4), 1.6);
      await game.say('Don Baleiro', ['Well, well. The village mutt. All the way to the top of my tower.', 'Do you know how many stairs that is? Neither do I. I took the lift.', 'Tell me, dog — do you know how much a dog costs per square metre? Too much. FAR too much.'], 160);
      await cine.cam(V(-7, 3.5, 6), V(0, 4, -4), 1.4);
      await game.say('Don Baleiro', ['Behold: the BALEIRO-MATIC 3000! Powered by your village\'s little Faíscas.', 'Zero chatting. Zero long tables. Zero chestnuts. Maximum GREY!'], 160);
      await cine.cam(V(2.5, 1.8, 18), V(0, 1, 14), 1.2);
      audio.sfx('bark'); await wait(350); audio.sfx('bark', { vol: 0.8 });
      await ui.dialog('', ['WOOF! WOOF!'], 700);
      await cine.cam(V(0, 5, 3), V(0, 5.5, -4), 1.0);
      await game.say('Don Baleiro', ['Charming. Let\'s optimise you.'], 160);
      ui.letterbox(false); game.cam.cinematic = false;
      game.cam.snap(pl); pl.locked = false;
      audio.playSong('boss', 0.5);
      bar.show(true);
      ui.bigText('BALEIRO-MATIC 3000', 'Jump the shockwaves · Stomp the RESET button!', 2600);
      ctx.fighting = true; setState('move'); S.ringT = 2;
    };
    return ctx;
  },
};

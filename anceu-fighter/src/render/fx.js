// Visual effects: hit sparks, projectiles and placed objects, move trails, super cinematics.
import * as THREE from 'three';
import { makeModel, clipFor } from './assets.js';

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTexture();
const sprite = (color, size, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
};

const SPARK_COLORS = { L: 0xfff2a8, H: 0xffb347, S: 0xff7b3a, X: 0xff4fd8 };

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.projViews = new Map();
    this.objViews = new Map();
    this.trails = [new THREE.Group(), new THREE.Group()];
    this.timed = [];
    for (const t of this.trails) scene.add(t);
  }

  burst(x, y, { color = 0xffffff, n = 14, speed = 4, size = 0.25, life = 0.35, z = 0.4, gravity = -6 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = sprite(color, size * (0.6 + Math.random() * 0.8));
      s.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      this.scene.add(s);
      this.parts.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: (Math.random() - 0.5) * 2, life, max: life, gravity });
    }
    const flash = sprite(color, size * 6, 0.9);
    flash.position.set(x, y, z);
    this.scene.add(flash);
    this.parts.push({ s: flash, vx: 0, vy: 0, vz: 0, life: 0.12, max: 0.12, gravity: 0, grow: 3 });
  }

  hit(e) { this.burst(e.x, e.y, { color: SPARK_COLORS[e.strength] || 0xffffff, n: e.strength === 'L' ? 10 : 18, speed: e.strength === 'L' ? 3.5 : 6, size: e.strength === 'L' ? 0.2 : 0.3 }); }
  block(e) { this.burst(e.x, e.y, { color: 0x8fd3ff, n: 8, speed: 3, size: 0.2, life: 0.25 }); }
  dust(x) { this.burst(x, 0.1, { color: 0xc9b28a, n: 12, speed: 2.2, size: 0.45, life: 0.6, gravity: 1, z: 0.2 }); }

  // ------- projectiles & objects (synced from the sim every frame)
  makeProjectile(p) {
    const g = new THREE.Group();
    switch (p.kind) {
      case 'bark': {
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.22 + i * 0.12, 0.035, 6, 18, Math.PI), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85 - i * 0.2 }));
          r.rotation.z = -Math.PI / 2; r.position.x = -i * 0.12;
          g.add(r);
        }
        g.add(sprite(0xffe680, 0.9, 0.5));
        g.userData.wobble = true;
        break;
      }
      case 'queimada': {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xbfe8ff })));
        g.add(sprite(0x3f7bff, 1.3, 0.9), sprite(0x88c8ff, 0.7, 1));
        g.userData.flame = 0x4f8bff;
        break;
      }
      case 'slipper': {
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.14), new THREE.MeshStandardMaterial({ color: 0x8a3b2a }));
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), new THREE.MeshStandardMaterial({ color: 0xd65a8a }));
        top.position.set(0.06, 0.06, 0);
        g.add(sole, top);
        g.userData.spin = 18;
        break;
      }
      case 'pot': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.6, 18), new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.6 }));
        const fire = sprite(0x4f8bff, 1.8, 0.9); fire.position.y = 0.5;
        g.add(pot, fire);
        g.userData.flame = 0x4f8bff;
        break;
      }
      default: g.add(sprite(0xffffff, 0.6));
    }
    this.scene.add(g);
    return g;
  }

  makeObject(o) {
    const g = new THREE.Group();
    if (o.kind === 'fog') {
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xd7dde6, transparent: true, opacity: 0.35, depthWrite: false }));
        s.scale.setScalar(1.2 + Math.random() * 0.8);
        s.position.set((Math.random() - 0.5) * o.w, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8);
        g.add(s);
      }
      g.userData.fog = true;
    } else if (o.kind === 'router') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4 }));
      body.position.y = 0.04;
      g.add(body);
      for (const x of [-0.14, 0.14]) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1f24 }));
        ant.position.set(x, 0.22, -0.1); g.add(ant);
      }
      const led = sprite(0x40ff70, 0.18);
      led.position.set(0, 0.1, 0.14);
      g.add(led);
      g.userData.led = led;
    }
    this.scene.add(g);
    return g;
  }

  sync(world, dt, time) {
    const seenP = new Set();
    for (const p of world.projectiles) {
      let v = this.projViews.get(p);
      if (!v) { v = this.makeProjectile(p); this.projViews.set(p, v); }
      seenP.add(p);
      v.position.set(p.x, p.y + p.h / 2, 0.1);
      v.scale.x = Math.sign(p.vx || 1);
      if (v.userData.spin) v.rotation.z += dt * v.userData.spin;
      if (v.userData.wobble) v.scale.y = 1 + Math.sin(time * 30) * 0.12;
      if (v.userData.flame && Math.random() < 0.6) this.burst(p.x, p.y + p.h / 2, { color: v.userData.flame, n: 1, speed: 0.6, size: 0.35, life: 0.3, gravity: 2, z: 0.1 });
    }
    for (const [p, v] of this.projViews) if (!seenP.has(p)) { this.scene.remove(v); this.projViews.delete(p); this.burst(v.position.x, v.position.y, { color: 0xffffff, n: 6, speed: 2, size: 0.2 }); }

    const seenO = new Set();
    for (const o of world.objects) {
      let v = this.objViews.get(o);
      if (!v) { v = this.makeObject(o); this.objViews.set(o, v); }
      seenO.add(o);
      v.position.set(o.x, 0, 0);
      const fade = Math.min(1, o.life / 30, o.age / 15);
      if (v.userData.fog) v.children.forEach((s, i) => { s.material.opacity = 0.35 * fade; s.position.x += Math.sin(time * 0.8 + i) * 0.002; });
      if (v.userData.led) v.userData.led.material.opacity = 0.5 + 0.5 * Math.sin(time * 12);
    }
    for (const [o, v] of this.objViews) if (!seenO.has(o)) { this.scene.remove(v); this.objViews.delete(o); }

    // move trails (whip, spin, Pepe's spark aura)
    world.fighters.forEach((f, i) => this.trail(i, f, time));
  }

  trail(i, f, time) {
    const g = this.trails[i];
    for (const c of g.children) { c.material.dispose(); if (!c.isSprite) c.geometry.dispose(); }
    g.clear();
    const m = f.state === 'attack' && f.move;
    if (!m || !m.fx || f.movePhase !== 'active') return;
    if (m.fx === 'whip') {
      const len = m.box.x + m.box.w;
      const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, len, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a1c }));
      whip.rotation.z = Math.PI / 2;
      whip.position.set(f.x + f.facing * len / 2, f.y + 1.1, 0.2);
      g.add(whip);
      const tip = sprite(0xfff2a8, 0.5);
      tip.position.set(f.x + f.facing * len, f.y + 1.1, 0.2);
      g.add(tip);
    } else if (m.fx === 'spin') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      ring.rotation.x = Math.PI / 2 + Math.sin(time * 20) * 0.3;
      ring.position.set(f.x, f.y + 0.9, 0);
      g.add(ring);
    } else if (m.fx === 'spark') {
      const aura = sprite(0xffd23f, 2.4, 0.75);
      aura.position.set(f.x, f.y + 0.9, 0.2);
      g.add(aura);
      if (Math.random() < 0.8) this.burst(f.x, f.y + 0.9, { color: 0xffe066, n: 2, speed: 3, size: 0.25, life: 0.3 });
    }
  }

  // ------- super cinematics
  cinematic(name, attacker, target) {
    if (name === 'gaiteiros') {
      for (const [key, dx] of [['nacho', -1.3], ['flo', -2.2]]) {
        const { group, model } = makeModel(key);
        group.position.set(attacker.x + dx * attacker.facing, 0, -0.9);
        group.rotation.y = attacker.facing > 0 ? 0.6 : -0.6;
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(clipFor(key, 'agus', 'FunnyDancing_01')).play();
        this.scene.add(group);
        this.timed.push({ life: 3.2, update: dt => mixer.update(dt), dispose: () => this.scene.remove(group) });
      }
    } else if (name === 'mesa') {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a32 }));
      top.position.y = 0.78;
      g.add(top);
      for (const [x, z] of [[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), top.material);
        leg.position.set(x, 0.39, z); g.add(leg);
      }
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: 0xf3efe6 }));
      cloth.position.y = 0.83; g.add(cloth);
      const emp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0xd9a24a, roughness: 0.6 }));
      emp.position.set(0, 0.9, 0); g.add(emp);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      bowl.position.set(0.7, 1.0, 0.1); bowl.rotation.x = Math.PI; g.add(bowl);
      g.position.set(target.x, 0, -0.5);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g);
      let t = 0;
      this.timed.push({ life: 2.6, update: dt => { t += dt; g.scale.setScalar(Math.min(1, t * 5)); emp.scale.setScalar(Math.max(0.2, 1 - t * 0.3)); }, dispose: () => this.scene.remove(g) });
    }
  }

  update(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.material.opacity = Math.max(0, p.life / p.max);
      if (p.grow) p.s.scale.multiplyScalar(1 + p.grow * dt);
      if (p.life <= 0) { this.scene.remove(p.s); p.s.material.dispose(); }
    }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const t of this.timed) { t.life -= dt; t.update(dt); if (t.life <= 0) t.dispose(); }
    this.timed = this.timed.filter(t => t.life > 0);
  }
}

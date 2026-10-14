// Lightweight pooled particle effects.
import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function starTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.translate(32, 32); g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 8 : 30, a = i * Math.PI / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.fill();
  return new THREE.CanvasTexture(c);
}

class FX {
  init(scene) {
    this.scene = scene;
    this.soft = this.soft || softTex(); this.star = this.star || starTex();
    this.pool = []; this.active = [];
    this.rings = [];
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s); this.pool.push(s);
    }
  }
  spawn(pos, vel, life, size, color, opts = {}) {
    const s = this.pool.pop(); if (!s) return;
    s.visible = true; s.position.copy(pos);
    s.material.map = opts.star ? this.star : this.soft;
    s.material.color.set(color); s.material.opacity = opts.opacity ?? 1;
    s.material.blending = opts.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.scale.setScalar(size);
    s.userData = { vel: vel.clone(), life, max: life, size, grow: opts.grow ?? 1, grav: opts.grav ?? 0, drag: opts.drag ?? 0, op: opts.opacity ?? 1, spin: opts.spin ?? 0 };
    this.active.push(s);
  }
  dust(p, n = 4, color = 0xd8cbb0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(new THREE.Vector3(p.x + Math.cos(a) * 0.3, p.y + 0.15, p.z + Math.sin(a) * 0.3),
        new THREE.Vector3(Math.cos(a) * 1.5, 0.6 + Math.random(), Math.sin(a) * 1.5), 0.5 + Math.random() * 0.3, 0.5, color, { grow: 2.2, opacity: 0.8, drag: 2 });
    }
  }
  splash(p, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      this.spawn(new THREE.Vector3(p.x, p.y + 0.1, p.z), new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp), 0.7, 0.3, 0xcfefff, { grav: -14, opacity: 0.9 });
    }
  }
  sparkle(p, n = 10, color = 0xfff2a0, spread = 3) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(spread * (0.4 + Math.random()));
      this.spawn(p, v, 0.6 + Math.random() * 0.6, 0.45, color, { star: true, add: true, drag: 1.5, grow: 0.2 });
    }
  }
  poof(p, color = 0xaaaaaa, n = 12) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar(3);
      this.spawn(p.clone().add(new THREE.Vector3(0, 0.5, 0)), v, 0.6, 0.8, color, { grow: 2.5, drag: 4, opacity: 0.85 });
    }
  }
  ring(p, color = 0xffffff, radius = 3, life = 0.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p).add(new THREE.Vector3(0, 0.08, 0));
    this.scene.add(m); this.rings.push({ m, t: 0, life, radius });
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i], u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; this.active.splice(i, 1); this.pool.push(s); continue; }
      u.vel.y += u.grav * dt;
      if (u.drag) u.vel.multiplyScalar(Math.max(0, 1 - u.drag * dt));
      s.position.addScaledVector(u.vel, dt);
      const k = 1 - u.life / u.max;
      s.scale.setScalar(u.size * (1 + (u.grow - 1) * k));
      s.material.opacity = u.op * (1 - k * k);
      if (u.spin) s.material.rotation += u.spin * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const k = r.t / r.life;
      r.m.scale.setScalar(0.2 + k * r.radius); r.m.material.opacity = 1 - k;
      if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
  }
}
export const fx = new FX();

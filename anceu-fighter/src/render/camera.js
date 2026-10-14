// Side-on fight camera: frames both fighters, zooms with their distance, shakes on big hits.
import * as THREE from 'three';
import { SIM } from '../data/common.js';

export class FightCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(30, aspect, 0.1, 400);
    this.x = 0; this.z = 8.5; this.y = 1.75;
    this.shakeT = 0; this.shakeI = 0;
    this.zoomPunch = 0;
    this.cam.position.set(0, this.y, this.z);
  }

  shake(intensity = 0.1, time = 0.25) { this.shakeI = Math.max(this.shakeI, intensity); this.shakeT = Math.max(this.shakeT, time); }
  punch(amount = 0.8) { this.zoomPunch = Math.max(this.zoomPunch, amount); }

  update(fighters, dt) {
    const [a, b] = fighters;
    const mid = (a.x + b.x) / 2, dist = Math.abs(a.x - b.x);
    const topY = Math.max(a.y, b.y);
    const tz = THREE.MathUtils.clamp(6.8 + dist * 0.75, 7.2, 10.5) - this.zoomPunch;
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * tz * this.cam.aspect;
    const lim = Math.max(0, SIM.WALL + 1.2 - halfW);
    const tx = THREE.MathUtils.clamp(mid, -lim, lim);
    const k = Math.min(1, dt * 6);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    this.y += (1.45 + topY * 0.45 - this.y) * k;
    this.zoomPunch = Math.max(0, this.zoomPunch - dt * 2.5);
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = (Math.random() - 0.5) * this.shakeI; sy = (Math.random() - 0.5) * this.shakeI;
      if (this.shakeT <= 0) this.shakeI = 0;
    }
    this.cam.position.set(this.x + sx, this.y + sy, this.z);
    this.cam.lookAt(this.x + sx * 0.5, 1.3 + topY * 0.4, 0);
  }

  resize(aspect) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
}

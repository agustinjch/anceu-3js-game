// 3D backdrop for the title / menus / character select: the five fighters lined up in the plaza.
import * as THREE from 'three';
import { FighterView } from './fighterView.js';
import { FIGHTERS, ROSTER } from '../data/fighters/index.js';
import { buildPlaza } from './stages/plaza.js';

export class Lobby {
  constructor() {
    this.scene = new THREE.Scene();
    this.stage = buildPlaza(this.scene);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 400);
    this.fighters = ROSTER.map((id, i) => {
      const view = new FighterView(FIGHTERS[id]);
      const x = (i - 2) * 1.45;
      this.scene.add(view.group);
      return { id, view, x, z: 0, f: { state: 'idle', x, y: 0, facing: 1, side: 0, sf: 0, mf: 0 }, picked: 0 };
    });
    this.t = 0;
    this.mode = 'title';
    this.picks = [null, null];
  }

  setMode(mode) { this.mode = mode; }
  setPicks(p1, p2, locked = [false, false]) { this.picks = [p1, p2]; this.locked = locked; }

  update(dt, renderer) {
    this.t += dt;
    for (const s of this.fighters) {
      const pickedBy = this.picks.indexOf(s.id);
      const target = this.mode === 'select' && pickedBy >= 0 ? 1 : 0;
      s.picked += (target - s.picked) * Math.min(1, dt * 8);
      const lockedNow = pickedBy >= 0 && this.locked?.[pickedBy];
      if (lockedNow && s.f.state !== 'victory') { s.f.state = 'victory'; s.f.sf = 0; }
      if (!lockedNow && s.f.state === 'victory') { s.f.state = 'idle'; s.f.sf = 0; }
      s.f.sf++;
      s.view.update(s.f, dt);
      s.view.group.position.set(s.x, 0, s.picked * 1.2);
      const look = pickedBy === 1 ? -0.5 : pickedBy === 0 ? 0.5 : 0.25;
      s.view.group.rotation.y = this.mode === 'select' ? look : 0.35 * Math.sin(this.t * 0.4 + s.x);
    }
    this.stage.update(dt);
    const sway = Math.sin(this.t * 0.15) * 0.6;
    if (this.mode === 'title') { this.camera.position.set(sway, 1.5, 8.5); this.camera.lookAt(0, 1.15, 0); }
    else if (this.mode === 'menu') { this.camera.position.set(2.4 + sway * 0.3, 1.6, 7.2); this.camera.lookAt(1.4, 1.0, 0); }
    else { this.camera.position.set(sway * 0.2, 1.75, 7.6); this.camera.lookAt(0, 1.45, 0); }
    renderer.render(this.scene, this.camera);
  }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}

// Head-and-shoulders portrait of each fighter, rendered once into data URLs.
export function renderPortraits(renderer) {
  const W = 256, H = 340;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0dd, 0x332211, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc070, 2); rim.position.set(-3, 2, -2); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 50);
  const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const out = {};
  const prevBg = scene.background;
  for (const id of ROSTER) {
    const def = FIGHTERS[id];
    const v = new FighterView(def);
    v.update({ state: 'idle', x: 0, y: 0, facing: 1, side: 0, sf: 0 }, 0.4);
    v.group.rotation.y = 0.35;
    scene.add(v.group);
    scene.background = new THREE.Color(def.color);
    const h = v.group.children[0] ? new THREE.Box3().setFromObject(v.group, true).max.y : 1.7;
    cam.position.set(0.25, h - 0.28, 1.6);
    cam.lookAt(0, h - 0.38, 0);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    renderer.setRenderTarget(null);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    out[id] = c.toDataURL('image/jpeg', 0.85);
    scene.remove(v.group);
  }
  scene.background = prevBg;
  rt.dispose();
  return out;
}

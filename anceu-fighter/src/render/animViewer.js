// ?dev=anim[&clip=Name][&t=0.5] — all five fighters side by side playing the same clip, for checking
// the retargeting and the CLIP_TIMING windows.
import * as THREE from 'three';
import { FighterView } from './fighterView.js';
import { FIGHTERS, ROSTER } from '../data/fighters/index.js';
import { fighterClips } from '../data/common.js';

export function animViewer(renderer, params) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa6b8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 5, 6); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshStandardMaterial({ color: 0x667755 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.4, 11); camera.lookAt(0, 0.9, 0);

  const facing = params.get('facing') === 'front' ? 0 : 1;
  // ?dev=anim&strip=victor&clip=X: 8 copies of one fighter sampled across the clip
  const strip = params.get('strip');
  if (strip) {
    const name = params.get('clip');
    const N = 8;
    const views = [];
    for (let i = 0; i < N; i++) {
      const v = new FighterView(FIGHTERS[strip]);
      v.group.position.x = (i - (N - 1) / 2) * 1.25;
      v.group.rotation.y = Math.PI / 2;
      scene.add(v.group);
      views.push(v);
    }
    camera.position.set(0, 1.2, 13); camera.lookAt(0, 0.9, 0);
    const dur = views[0].clipDuration(name);
    const from = parseFloat(params.get('from') || 0), to = parseFloat(params.get('to') || dur);
    const labels = document.createElement('div');
    labels.style.cssText = 'position:fixed;left:0;right:0;bottom:12px;display:flex;justify-content:space-around;font:14px monospace;color:#fff';
    labels.innerHTML = views.map((_, i) => `<span>${(from + (to - from) * i / (N - 1)).toFixed(2)}</span>`).join('');
    document.body.appendChild(labels);
    renderer.setAnimationLoop(() => {
      views.forEach((v, i) => v.show(name, from + (to - from) * i / (N - 1)));
      renderer.render(scene, camera);
    });
    return;
  }
  const views = ROSTER.map((id, i) => {
    const v = new FighterView(FIGHTERS[id]);
    v.group.position.x = (i - 2) * 1.6;
    scene.add(v.group);
    return v;
  });
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:12px;top:10px;font:16px monospace;color:#fff;text-shadow:0 1px 2px #000;z-index:9';
  document.body.appendChild(label);

  const clip = params.get('clip');
  const fixedT = params.has('t') ? parseFloat(params.get('t')) : null;
  const all = fighterClips(FIGHTERS.pepe).map(c => c.clip);
  let idx = 0, t = 0;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    const name = clip || all[Math.floor(t / 3) % all.length];
    label.textContent = name + (fixedT != null ? ` @ ${fixedT}` : '');
    for (const v of views) {
      v.show(name, fixedT != null ? fixedT : (t % 3) / 3 * v.clipDuration(name));
      v.group.rotation.y = facing ? Math.PI / 2 - 0.35 : 0;
    }
    renderer.render(scene, camera);
  });
  void idx;
}

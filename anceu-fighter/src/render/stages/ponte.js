// Ponte do Verdugo: the old stone bridge over the river at dusk, the mill turning below.
import * as THREE from 'three';
import { Builder, makeSky } from '../kit.js';
import { lights } from './common.js';
import { Crowd } from '../crowd.js';

export function buildPonte(scene) {
  scene.background = new THREE.Color(0xf0b07a);
  scene.fog = new THREE.Fog(0xe8a77a, 25, 80);
  scene.add(makeSky(0x3a4f8f, 0xffb070, new THREE.Vector3(-0.6, 0.12, -0.6)));
  lights(scene, { sun: 0xffb27a, sunI: 2.4, sunPos: [-9, 6, 6], hemiSky: 0xffd2b0, hemiGround: 0x3a3040, hemiI: 1.0 });
  const b = new Builder(scene);

  // the bridge: deck top at y = 0; drop the front parapet so it doesn't hide the fighters' feet
  const before = b.group.children.length;
  b.archBridge(0, -5.2, 0, 26, 3.6, 5.2, 4, 0);
  const grp = b.group.children.slice(before).find(c => c.isGroup);
  if (grp) for (const p of [...grp.children]) if (p.position.z > 0) grp.remove(p);
  // river, banks, hills
  b.waterPlane(0, -4.3, -10, 120, 60, { flow: [0.04, 0.0] });
  b.box(-26, -4.5, -8, 26, 4.5, 50, 'grass', { tex: 4 });
  b.box(26, -4.5, -8, 26, 4.5, 50, 'grass', { tex: 4 });
  b.box(0, -10, -40, 120, 9, 20, 'grass', { tex: 5 });
  b.mill(-10, -4.4, -11, 0.4);
  b.stoneHouse(17, 0, -9, 6, 5, 3.4, -0.3);
  for (let i = 0; i < 26; i++) {
    const x = -40 + (i * 37) % 80, z = -24 - ((i * 13) % 14);
    try { b.tree(x, -1, z, i % 3 ? 'oak' : 'chestnut', 1.4 + (i % 4) * 0.2); } catch { b.tree(x, -1, z, 'oak', 1.5); }
  }
  for (const [x, z] of [[-17, -3], [-21, -9], [19, -2], [23, -14], [-14, -16]]) {
    try { b.tree(x, 0, z, 'chestnut', 1.6); } catch { b.tree(x, 0, z, 'oak', 1.6); }
  }
  // lanterns along the rear parapet
  const lamps = [];
  for (const x of [-9, -3, 3, 9]) {
    const post = b.box(x, 0.7, -1.7, 0.12, 1.4, 0.12, 'wood', { collide: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd38a, emissive: 0xffa040, emissiveIntensity: 2 }));
    lamp.position.set(x, 2.25, -1.7);
    b.group.add(lamp); lamps.push(lamp);
    void post;
  }

  const crowd = new Crowd(scene, [
    { key: 'rosabel', x: -7.4, z: -1.0, ry: 0.7 },
    { key: 'nacho', x: -8.6, z: -0.6, ry: 0.9 },
    { key: 'flo', x: 7.6, z: -1.0, ry: -0.7 },
    { key: 'africa', x: 8.7, z: -0.5, ry: -0.9 },
  ]);
  let t = 0;
  return {
    crowd,
    update(dt) {
      t += dt;
      for (const f of b.animated) f(dt, t);
      lamps.forEach((l, i) => (l.material.emissiveIntensity = 1.8 + Math.sin(t * 7 + i * 2) * 0.25));
      crowd.update(dt);
    },
    music: 'ponte',
  };
}

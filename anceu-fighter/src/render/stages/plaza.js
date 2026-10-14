// Praza da igrexa: the church square of Anceu on fest afternoon.
import * as THREE from 'three';
import { Builder, makeSky } from '../kit.js';
import { lights, banner, bunting } from './common.js';
import { Crowd } from '../crowd.js';

export function buildPlaza(scene) {
  scene.background = new THREE.Color(0xbfdcf2);
  scene.fog = new THREE.Fog(0xcfe2ef, 30, 90);
  scene.add(makeSky(0x4b97e0, 0xdcefff, new THREE.Vector3(0.5, 0.45, 0.4)));
  lights(scene, { sun: 0xffe6c2, sunI: 2.7, sunPos: [7, 11, 9] });
  const b = new Builder(scene);

  b.box(0, -0.3, 0, 60, 0.3, 40, 'cobble', { tex: 1.6 });
  b.box(0, -0.25, -26, 80, 0.3, 20, 'grass', { tex: 4 });
  b.church(0, 0, -17, 0);
  b.cruceiro(-6.5, 0, -6.5, 1.1);
  b.horreo(9.5, 0, -9, -0.25, 6);
  b.stoneHouse(-15, 0, -11, 7, 6, 3.6, 0.15);
  b.stoneHouse(17, 0, -13, 6, 5, 3.2, -0.2);
  b.stoneHouse(-22, 0, -20, 8, 6, 4, 0.4);
  b.stoneHouse(24, 0, -22, 7, 6, 3.6, -0.5);
  for (const [x, z, k, s] of [[-10, -14, 'oak', 1.3], [12, -18, 'chestnut', 1.4], [-26, -8, 'oak', 1.5], [27, -9, 'chestnut', 1.3], [-6, -24, 'oak', 1.6], [7, -27, 'oak', 1.4], [-32, -26, 'chestnut', 1.8], [34, -28, 'oak', 1.7]]) {
    try { b.tree(x, 0, z, k, s); } catch { b.tree(x, 0, z, 'oak', s); }
  }
  // the long table of the fest, a stage with the band, bunting across the square
  b.box(-11.5, 0, -4.5, 5, 0.8, 1.1, 'wood', { collide: false });
  b.box(11.5, 0, -4.5, 4, 0.8, 1.1, 'wood', { collide: false });
  b.box(0, 0, -9.5, 9, 0.6, 3.5, 'wood', { collide: false });
  for (const x of [-4.3, 4.3]) b.box(x, 0.6, -10.8, 0.25, 3.2, 0.25, 'wood', { collide: false });
  banner(b.group, 0, 3.4, -10.8, 8.4, 1.4, ['ANCEU FEST', 'Rural Hackers · 25 de xullo'], { size: 110 });
  bunting(b.group, [-14, 5.5, -6], [0, 6.5, -12], 16);
  bunting(b.group, [0, 6.5, -12], [14, 5.5, -6], 16);
  bunting(b.group, [-12, 4.5, -3.5], [12, 4.5, -3.5], 30);
  for (const x of [-12, 12]) b.box(x, 0, -3.5, 0.2, 4.6, 0.2, 'wood', { collide: false });

  const crowd = new Crowd(scene, [
    { key: 'africa', x: -7.2, z: -3.2, ry: 0.5 },
    { key: 'nacho', x: -8.6, z: -4.4, ry: 0.6 },
    { key: 'ana', x: -6.1, z: -4.8, ry: 0.3 },
    { key: 'andreea', x: 7.0, z: -3.4, ry: -0.5 },
    { key: 'flo', x: 8.5, z: -4.6, ry: -0.6 },
    { key: 'rosabel', x: 6.0, z: -4.9, ry: -0.3 },
  ]);
  let t = 0;
  return {
    crowd,
    update(dt) { t += dt; for (const f of b.animated) f(dt, t); crowd.update(dt); },
    music: 'plaza',
  };
}

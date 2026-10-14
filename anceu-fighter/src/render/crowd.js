// The villagers who aren't fighting watch from the side and cheer on big moments.
import * as THREE from 'three';
import { makeModel, nativeClips, clipFor } from './assets.js';

export class Crowd {
  constructor(scene, spots) {
    this.people = spots.map(({ key, x, z, ry = 0 }) => {
      const { group, model } = makeModel(key);
      group.position.set(x, 0, z);
      group.rotation.y = ry;
      scene.add(group);
      const mixer = new THREE.AnimationMixer(model);
      const idle = mixer.clipAction(nativeClips(key).find(c => c.name === 'Idle') || nativeClips(key)[0]);
      const cheer = mixer.clipAction(clipFor(key, 'se', 'Victory_Cheer'));
      idle.play();
      mixer.update(Math.random() * 3);
      return { group, mixer, idle, cheer, cheering: 0 };
    });
  }

  cheer(seconds = 3) {
    for (const p of this.people) {
      if (p.cheering > 0) { p.cheering = Math.max(p.cheering, seconds); continue; }
      p.cheering = seconds * (0.8 + Math.random() * 0.4);
      p.cheer.reset().setEffectiveWeight(1).play();
      p.cheer.time = Math.random() * 1.5;
      p.idle.crossFadeTo(p.cheer, 0.3, false);
    }
  }

  update(dt) {
    for (const p of this.people) {
      if (p.cheering > 0 && (p.cheering -= dt) <= 0) {
        p.idle.reset().setEffectiveWeight(1).play();
        p.cheer.crossFadeTo(p.idle, 0.5, false);
      }
      p.mixer.update(dt);
    }
  }
}

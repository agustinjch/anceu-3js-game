// Rigged GLB villagers generated with Meshy (see /meshy). Preloaded at boot; NPCs with
// `model: '<key>'` use them instead of the procedural makePerson() figure.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// key -> real-world height in metres (the model is normalised to it)
export const NPC_MODELS = {
  rosa: 1.62,
  se: 1.62,
  agustin: 1.78,
  africa: 1.65,
  nacho: 1.78,
  rosabel: 1.6,
  andreea: 1.65,
  flo: 1.8,
  victor: 1.78,
  ana: 1.62,
};

const cache = {};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export async function loadNpcModels() {
  await Promise.all(Object.keys(NPC_MODELS).map(async key => {
    try { cache[key] = await loader.loadAsync(`models/npc/${key}.glb`); }
    catch (e) { console.warn(`NPC model ${key} failed to load, falling back to procedural`, e); }
  }));
}

export const hasNpcModel = key => !!cache[key];

// Meshy animation clip names -> the roles NPC uses.
const CLIPS = { idle: 'Idle', wave: 'Wave_One_Hand', talk: ['Stand_and_Chat', 'Talk_with_Left_Hand_on_Hip'] };

export function makeNpcModel(key) {
  const gltf = cache[key];
  const model = cloneSkinned(gltf.scene);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  // normalise height, feet on the ground (precise: Meshy rigs are in cm, scaled by the armature)
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  model.scale.setScalar(NPC_MODELS[key] / (box.max.y - box.min.y));
  model.position.y = -box.min.y * model.scale.y;
  const obj = new THREE.Group(); obj.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const action = name => { const c = gltf.animations.find(a => a.name === name); return c && mixer.clipAction(c); };
  const actions = {
    idle: action(CLIPS.idle),
    wave: action(CLIPS.wave),
    talk: CLIPS.talk.map(action).filter(Boolean),
  };
  if (actions.wave) { actions.wave.setLoop(THREE.LoopOnce); actions.wave.clampWhenFinished = true; }
  actions.idle.play();
  mixer.update(Math.random() * 4); // desync villagers
  let current = actions.idle;
  const fadeTo = (next, d = 0.35) => {
    if (!next || next === current) return;
    next.reset().play(); current.crossFadeTo(next, d, false); current = next;
  };
  mixer.addEventListener('finished', e => { if (e.action === actions.wave) fadeTo(actions.idle); });
  return {
    obj, mixer, height: NPC_MODELS[key],
    play(role) {
      if (role === 'talk') fadeTo(actions.talk[Math.floor(Math.random() * actions.talk.length)] || actions.idle);
      else fadeTo(actions[role] || actions.idle);
    },
    get state() { return current === actions.idle ? 'idle' : current === actions.wave ? 'wave' : 'talk'; },
  };
}

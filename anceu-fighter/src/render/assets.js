// Loads the fighter / crowd models and the Meshy clip sets, and builds per-fighter retargeted clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ClipSource, retargetClip, bindPoseOf } from './retarget.js';
import { CLIP_SETS, fighterClips } from '../data/common.js';

export const MODEL_HEIGHT = {
  pepe: 1.5, victor: 1.78, se: 1.62, agustin: 1.78, rosa: 1.62,
  africa: 1.65, ana: 1.62, andreea: 1.65, flo: 1.8, nacho: 1.78, rosabel: 1.6,
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models = {}, rests = {}, sources = {}, clipCache = {};

export async function loadAssets(onProgress = () => {}) {
  const jobs = [
    ...Object.keys(MODEL_HEIGHT).map(k => ['model', k, `models/npc/${k}.glb`]),
    ...Object.keys(CLIP_SETS).map(k => ['clips', k, `models/clips/${k}.glb`]),
  ];
  let done = 0;
  await Promise.all(jobs.map(async ([kind, key, url]) => {
    const g = await loader.loadAsync(url);
    if (kind === 'model') { models[key] = g; rests[key] = bindPoseOf(g.scene); }
    else {
      const src = new ClipSource(g.scene);
      sources[key] = { src, clips: Object.fromEntries(g.animations.map(a => [a.name, a])) };
    }
    onProgress(++done / jobs.length);
  }));
}

// All clips a fighter uses, retargeted onto its model (cached per fighter).
export function clipsFor(def) {
  if (clipCache[def.id]) return clipCache[def.id];
  const target = models[def.model];
  const out = {};
  for (const { set, clip } of fighterClips(def)) {
    const s = sources[set];
    const c = s?.clips[clip];
    if (!c) { console.warn(`clip ${clip} missing in set ${set}`); continue; }
    out[clip] = retargetClip(s.src, c, target.scene, rests[def.model]);
  }
  return (clipCache[def.id] = out);
}

// Retarget arbitrary clips (e.g. a cheer for the crowd) onto a model key.
export function clipFor(modelKey, set, name) {
  const k = `${modelKey}:${set}:${name}`;
  if (clipCache[k]) return clipCache[k];
  const s = sources[set];
  return (clipCache[k] = retargetClip(s.src, s.clips[name], models[modelKey].scene, rests[modelKey]));
}

export function nativeClips(modelKey) { return models[modelKey].animations; }

// A normalised, shadow-casting clone with its feet at y = 0, wrapped in a group.
export function makeModel(modelKey) {
  const model = cloneSkinned(models[modelKey].scene);
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    }
  });
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const s = MODEL_HEIGHT[modelKey] / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  const group = new THREE.Group();
  group.add(model);
  return { group, model };
}

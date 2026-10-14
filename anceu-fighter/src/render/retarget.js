// Retargets Meshy library clips onto any humanoid skeleton (other Meshy rigs, or Pepe's Mixamo rig).
// World-space transfer: for every bone, the clip's rotation *relative to the source reference pose*
// is applied on top of the target's bind pose, after aligning each target bone to point the same way
// as the source bone does in that reference pose (this absorbs A-pose vs T-pose and differing bone
// axes). Root motion keeps only the hips' height so the simulation stays in charge of x.
import * as THREE from 'three';

// canonical (Meshy) bone → its child used to measure the bone's direction
const CHILD = {
  Hips: 'Spine02', Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head', Head: null,
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: null,
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: null,
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: null,
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: null,
};
export const CANON = Object.keys(CHILD);
const PARENT = {};
for (const [p, c] of Object.entries(CHILD)) if (c) PARENT[c] = p;
Object.assign(PARENT, { LeftShoulder: 'Spine', RightShoulder: 'Spine', LeftUpLeg: 'Hips', RightUpLeg: 'Hips' });

// Pepe (Mixamo). three.js strips ':' from node names, so "mixamorig:Hips" arrives as "mixamorigHips".
export const MIXAMO = {
  Hips: 'Hips', Spine: 'Spine02', Spine1: 'Spine01', Spine2: 'Spine', Neck: 'neck', Head: 'Head',
  LeftShoulder: 'LeftShoulder', LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand',
  RightShoulder: 'RightShoulder', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand',
  LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot', LeftToeBase: 'LeftToeBase',
  RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot', RightToeBase: 'RightToeBase',
};

function canonicalName(name) {
  const n = name.replace(/^mixamorig:?/, '');
  if (name !== n) return MIXAMO[n] || null;
  return CHILD[name] !== undefined ? name : null;
}

// Collect the canonical bones of a model. Returns Map<canon, Object3D>.
export function rigOf(root) {
  const bones = new Map();
  root.traverse(o => { const c = o.name && canonicalName(o.name); if (c && !bones.has(c)) bones.set(c, o); });
  return bones;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function worldTR(o) {
  const q = new THREE.Quaternion(), p = new THREE.Vector3();
  o.matrixWorld.decompose(p, q, _s);
  return { q, p };
}

// Reference pose of a rig in world space (root at identity), keyed by canonical name.
function capture(root, bones) {
  root.updateMatrixWorld(true);
  const out = {};
  for (const [c, b] of bones) out[c] = worldTR(b);
  return out;
}

// Snapshot a model's rest pose (call once on an untouched gltf.scene). Meshy and Mixamo GLBs store
// the bind pose as the nodes' default transforms. (Skeleton.pose() is not used: it ignores the
// Armature node's 0.01 scale when the hips' parent isn't a bone.)
export function bindPoseOf(root) {
  return capture(root, rigOf(root));
}

export class ClipSource {
  // scene: a clip GLB's scene (skeleton only, in its default pose)
  constructor(scene) {
    this.scene = scene;
    this.bones = rigOf(scene);
    this.rest = capture(scene, this.bones);
    this.mixer = new THREE.AnimationMixer(scene);
  }
}

const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();

// Build a clip for `target` (an untouched gltf.scene) from `clip` playing on `src`.
export function retargetClip(src, clip, target, targetRest, fps = 30) {
  const tBones = rigOf(target);
  const names = CANON.filter(c => tBones.has(c) && src.bones.has(c));
  const RS = src.rest, RT = targetRest;

  // per-bone alignment of the target reference to the source reference
  const align = {};
  for (const c of names) {
    let k = c;
    while (k && !(CHILD[k] && RS[CHILD[k]] && RT[CHILD[k]])) k = PARENT[k];
    if (!k) { align[c] = new THREE.Quaternion(); continue; }
    const ch = CHILD[k];
    const dS = RS[ch].p.clone().sub(RS[k].p).normalize();
    const dT = RT[ch].p.clone().sub(RT[k].p).normalize();
    align[c] = dS.lengthSq() > 0 && dT.lengthSq() > 0 ? new THREE.Quaternion().setFromUnitVectors(dT, dS) : new THREE.Quaternion();
  }
  const Q = {}, RSinv = {};
  for (const c of names) { Q[c] = align[c].clone().multiply(RT[c].q); RSinv[c] = RS[c].q.clone().invert(); }

  // a bone's parent is either an animated canonical bone (use its new world rotation) or a static
  // node such as the armature (use its fixed world rotation). CANON lists parents before children.
  target.updateMatrixWorld(true);
  const parentStatic = {};
  for (const c of names) {
    const b = tBones.get(c), p = PARENT[c];
    parentStatic[c] = p && names.includes(p) && tBones.get(p) === b.parent ? null : worldTR(b.parent).q;
  }
  const hipsT = tBones.get('Hips');
  const hipsParentInv = hipsT.parent.matrixWorld.clone().invert();
  const hipScale = RT.Hips.p.y / RS.Hips.p.y;

  const action = src.mixer.clipAction(clip);
  action.reset().play();
  const n = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = new Float32Array(n);
  const qv = Object.fromEntries(names.map(c => [c, new Float32Array(n * 4)]));
  const pv = new Float32Array(n * 3);
  const WT = {};

  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / fps);
    times[i] = t;
    src.mixer.setTime(t);
    src.scene.updateMatrixWorld(true);
    for (const c of names) {
      const ws = worldTR(src.bones.get(c)).q;
      const wt = ws.multiply(RSinv[c]).multiply(Q[c]);
      WT[c] = wt;
      const parentQ = parentStatic[c] || WT[PARENT[c]];
      tmpQ.copy(parentQ).invert().multiply(wt);
      // keep quaternion sign continuous to avoid interpolation flips
      if (i > 0) {
        const a = qv[c];
        tmpQ2.set(a[(i - 1) * 4], a[(i - 1) * 4 + 1], a[(i - 1) * 4 + 2], a[(i - 1) * 4 + 3]);
        if (tmpQ2.dot(tmpQ) < 0) tmpQ.set(-tmpQ.x, -tmpQ.y, -tmpQ.z, -tmpQ.w);
      }
      tmpQ.toArray(qv[c], i * 4);
    }
    const hs = worldTR(src.bones.get('Hips')).p;
    _p.set(RT.Hips.p.x, RT.Hips.p.y + (hs.y - RS.Hips.p.y) * hipScale, RT.Hips.p.z).applyMatrix4(hipsParentInv);
    _p.toArray(pv, i * 3);
  }
  action.stop();

  const tracks = names.map(c => new THREE.QuaternionKeyframeTrack(`${tBones.get(c).name}.quaternion`, times, qv[c]));
  tracks.push(new THREE.VectorKeyframeTrack(`${hipsT.name}.position`, times, pv));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

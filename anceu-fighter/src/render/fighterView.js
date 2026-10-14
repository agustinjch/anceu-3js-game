// Draws one fighter: its GLB plus the clip that matches the simulation state. The animation never
// drives the game; each frame the clip time is computed from the sim's state and frame counters.
// Two layers: the upper body (spine, arms, head) and the lower body (hips, legs) can play different
// clips, e.g. a jab on top of a squat for a crouching punch.
import * as THREE from 'three';
import { makeModel, clipsFor } from './assets.js';
import { rigOf } from './retarget.js';
import { CLIP_TIMING, POSES, SIM } from '../data/common.js';

const YAW = Math.PI / 2 - 0.35; // fighters turn slightly towards the camera
const BLEND = 0.08;             // seconds of cross-fade between clips
const LOWER = new Set(['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']);

function splitClip(clip, lowerBones) {
  const isLower = t => lowerBones.has(t.name.slice(0, t.name.lastIndexOf('.')));
  return {
    U: new THREE.AnimationClip(clip.name + '|U', clip.duration, clip.tracks.filter(t => !isLower(t))),
    L: new THREE.AnimationClip(clip.name + '|L', clip.duration, clip.tracks.filter(isLower)),
  };
}

class Layer {
  constructor(actions) { this.actions = actions; this.current = null; this.prev = null; this.blend = 1; this.time = 0; }
  set(name, t, speed, dt) {
    const a = this.actions[name] || this.actions.Combat_Stance;
    if (a !== this.current) {
      this.prev = this.current; this.current = a; this.blend = this.prev ? 0 : 1;
      this.time = 0;
    }
    const dur = a.getClip().duration;
    this.time = t == null ? (this.time + dt * speed) % dur : Math.min(t, dur - 1e-3);
    a.time = this.time;
    this.blend = Math.min(1, this.blend + dt / BLEND);
    for (const x of Object.values(this.actions)) x.setEffectiveWeight(x === a ? this.blend : x === this.prev ? 1 - this.blend : 0);
  }
}

export class FighterView {
  constructor(def) {
    this.def = def;
    const { group, model } = makeModel(def.model);
    this.group = group;
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = clipsFor(def);
    const bones = rigOf(model);
    const lowerNames = new Set([...bones].filter(([c]) => LOWER.has(c)).map(([, b]) => b.name));
    const U = {}, L = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const parts = splitClip(clip, lowerNames);
      for (const [k, store] of [['U', U], ['L', L]]) {
        const a = this.mixer.clipAction(parts[k]);
        a.setEffectiveWeight(0); a.play(); a.paused = true;
        store[name] = a;
      }
    }
    this.upper = new Layer(U);
    this.lower = new Layer(L);
    this.yaw = YAW;
    this.flash = 0;
  }

  // pose the whole body at clip time t, no blending (dev viewer)
  show(name, t) {
    for (const l of [this.upper, this.lower]) { l.current = null; l.prev = null; l.set(name, t, 1, 0); }
    this.mixer.update(0);
  }

  clipDuration(name) { return this.clips[name]?.duration ?? 1; }

  // → { name, t, speed, lower?: { name, t } } ; t == null means "loop in real time"
  pose(f) {
    const d = this.def;
    const cyc = (name, speed = 1) => ({ name, t: null, speed });
    const seg = (name, k, tm = CLIP_TIMING[name] || {}) => {
      const from = tm.from ?? 0, to = tm.to ?? this.clipDuration(name);
      return { name, t: from + (to - from) * Math.min(1, Math.max(0, k)) };
    };
    const hold = name => ({ name: POSES[name].clip, t: POSES[name].t });
    const moveTime = (m, mf) => {
      const tm = m.clipTime || CLIP_TIMING[m.clip] || {};
      const from = tm.from ?? 0, hit = tm.hit ?? from, to = tm.to ?? this.clipDuration(m.clip);
      const s = Math.max(1, m.startup), rest = Math.max(1, m.active + m.recovery);
      return { name: m.clip, t: mf <= s ? from + (hit - from) * (mf / s) : hit + (to - hit) * Math.min(1, (mf - s) / rest) };
    };
    switch (f.state) {
      case 'intro': {
        const k = f.sf / 150;
        if (d.intro.then) return k < 0.6 ? seg(d.intro.clip, k / 0.6) : seg(d.intro.then, (k - 0.6) / 0.4);
        return seg(d.intro.clip, k);
      }
      case 'victory': return CLIP_TIMING[d.victory.clip]?.loop ? cyc(d.victory.clip) : seg(d.victory.clip, f.sf / 150);
      case 'walkF': return cyc('Walk_Fight_Forward', 1.15);
      case 'walkB': return f.guard ? hold('guard') : cyc('Walk_Fight_Back', 1.15);
      case 'dash': return cyc(f.dashDir > 0 ? 'Walk_Fight_Forward' : 'Walk_Fight_Back', 2.4);
      case 'crouch': return f.guard ? { ...hold('guard'), lower: hold('crouch') } : hold('crouch');
      case 'prejump': case 'landing': return { ...cyc('Combat_Stance'), lower: hold('crouch') };
      case 'jump': return { ...cyc('Combat_Stance'), lower: hold('crouch') };
      case 'attack': {
        const m = f.move;
        const p = moveTime(m, f.mf);
        const kick = /Kick|Sweep/.test(m.clip);
        if (m.crouch && !kick) p.lower = hold('crouch');
        if (m.air && !kick) p.lower = hold('crouch');
        return p;
      }
      case 'hitstun': return seg('Hit_Reaction', f.sf / Math.max(1, f.sf + f.stun));
      case 'blockstun': return f.crouchBlock ? { ...hold('guard'), lower: hold('crouch') } : hold('guard');
      case 'thrown': return seg('Hit_Reaction', f.sf / 20);
      case 'knockdown': case 'ko': return seg('Knock_Down', f.y > 0 ? Math.min(0.45, f.sf / 60) : 0.45 + f.sf / 40);
      case 'getup': return seg('Stand_Up1', f.sf / SIM.GETUP_FRAMES);
      default: return cyc('Combat_Stance');
    }
  }

  update(f, dt) {
    const p = this.pose(f);
    this.upper.set(p.name, p.t, p.speed || 1, dt);
    const lo = p.lower || p;
    if (!p.lower && p.t == null && this.lower.current === this.lower.actions[p.name]) this.lower.time = this.upper.time - dt * (p.speed || 1);
    this.lower.set(lo.name, lo.t, p.speed || 1, dt);
    this.mixer.update(0);

    const targetYaw = f.facing > 0 ? YAW : -YAW;
    this.yaw += (targetYaw - this.yaw) * Math.min(1, dt * 20);
    this.group.rotation.y = this.yaw;
    this.group.position.set(f.x, f.y, f.side === 0 ? 0.08 : -0.08);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    this.setEmissive(this.flash);
  }

  hit(strength = 1) { this.flash = Math.min(1, 0.45 + strength * 0.25); }

  setEmissive(v) {
    if (v === this._em) return;
    this._em = v;
    this.model.traverse(o => {
      if (!o.isMesh) return;
      if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; }
      o.material.emissive?.setRGB(v, v * 0.8, v * 0.55);
    });
  }
}

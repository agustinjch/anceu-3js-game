import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets } from '../core/assets';
import { toToon } from '../core/stylize';

export type NpcModel = 'woman' | 'farmer' | 'man' | 'child';

const MODEL_SCALE: Record<NpcModel, number> = { woman: 0.92, farmer: 0.9, man: 0.37 * 0.98, child: 0.45 * 0.5 };

export interface NpcOpts {
  model: NpcModel;
  /** Multiplicador de color por malla (nombre parcial → color) o global */
  tint?: Record<string, number> | number;
  height?: number;
  name: string;
}

/**
 * Vecino o residente. Puede estar normal, "conxelado" por la néboa (gris, inmóvil)
 * o ser un recuerdo (figura de luz dorada).
 */
export class Npc {
  root = new THREE.Group();
  mixer!: THREE.AnimationMixer;
  private clips: Record<string, THREE.AnimationClip> = {};
  private action?: THREE.AnimationAction;
  private mats: { mat: THREE.MeshToonMaterial; color: THREE.Color }[] = [];
  private frozen = 0;
  private frozenTarget = 0;
  ghost = false;
  name: string;
  lookAt: THREE.Vector3 | null = null;
  private head?: THREE.Bone;

  constructor(private opts: NpcOpts) {
    this.name = opts.name;
  }

  async load() {
    const g = await assets.model(`models/npc/${this.opts.model}.glb`);
    const model = cloneSkinned(g.scene);
    model.scale.setScalar(MODEL_SCALE[this.opts.model]);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        const mat = toToon((m.material as THREE.Material).clone()) as THREE.MeshToonMaterial;
        const tint = this.opts.tint;
        if (typeof tint === 'number') mat.color.multiply(new THREE.Color(tint));
        else if (tint) for (const [k, c] of Object.entries(tint)) if (m.name.includes(k)) mat.color.multiply(new THREE.Color(c));
        m.material = mat;
        this.mats.push({ mat, color: mat.color.clone() });
      }
      if ((o as THREE.Bone).isBone && /head/i.test(o.name) && !this.head) this.head = o as THREE.Bone;
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of g.animations) {
      const short = c.name.split('|').pop()!.replace(/^Man_/, '');
      if (!this.clips[short]) this.clips[short] = c;
    }
    this.play('Idle');
    return this;
  }

  play(name: string, fade = 0.3, once = false) {
    const c = this.clips[name] ?? this.clips.Idle;
    if (!c) return;
    const a = this.mixer.clipAction(c);
    if (a === this.action) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.play();
    if (this.action) a.crossFadeFrom(this.action, fade, true);
    this.action = a;
    // desfase para que no respiren todos a la vez
    if (!once) a.time = Math.random() * c.duration;
  }

  /** La néboa los deja grises e inmóviles (con transición). */
  freeze(on: boolean, instant = false) {
    this.frozenTarget = on ? 1 : 0;
    if (instant) this.frozen = this.frozenTarget;
  }

  /** Convierte la figura en un recuerdo luminoso. */
  makeGhost() {
    this.ghost = true;
    for (const { mat } of this.mats) {
      mat.color.set(0x000000);
      mat.emissive.set(0xffc77a);
      mat.emissiveIntensity = 1.4;
      mat.transparent = true;
      mat.opacity = 0;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;
    }
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = false) : null));
    return this;
  }

  set ghostOpacity(v: number) {
    for (const { mat } of this.mats) mat.opacity = v * 0.55;
    this.root.visible = v > 0.01;
  }

  update(dt: number) {
    this.frozen = THREE.MathUtils.damp(this.frozen, this.frozenTarget, 1.5, dt);
    const f = this.frozen;
    if (this.action) this.action.timeScale = 1 - f;
    this.mixer.update(dt);
    if (!this.ghost)
      for (const { mat, color } of this.mats) {
        const l = color.r * 0.3 + color.g * 0.59 + color.b * 0.11;
        mat.color.setRGB(
          THREE.MathUtils.lerp(color.r, l * 0.9 + 0.08, f),
          THREE.MathUtils.lerp(color.g, l * 0.92 + 0.08, f),
          THREE.MathUtils.lerp(color.b, l + 0.1, f),
        );
      }
    if (this.head && this.lookAt && f < 0.5) {
      const local = this.root.worldToLocal(this.lookAt.clone());
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
      this.head.rotation.y += yaw * 0.7;
    }
  }

  /** Gira el cuerpo hacia un punto (suave). */
  face(p: THREE.Vector3, dt = 1) {
    const d = new THREE.Vector3().subVectors(p, this.root.position);
    const target = Math.atan2(d.x, d.z);
    let dh = target - this.root.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.root.rotation.y += dh * Math.min(1, dt * 4);
  }
}

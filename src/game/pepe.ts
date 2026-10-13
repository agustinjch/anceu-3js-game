import * as THREE from 'three';
import { assets } from '../core/assets';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { RAPIER, type Physics } from '../core/physics';

const SCALE = 0.74; // el modelo mide ~1.75 m; Pepe ~1.3 m
const RADIUS = 0.28;
const HALF_H = 0.38;
const WALK = 1.7;
const RUN = 4.6;
const JUMP_V = 7.2;
const GRAVITY = 22;

type State = 'ground' | 'air' | 'climb' | 'scripted';

export interface ClimbSpot {
  /** Punto en la base del muro */
  base: THREE.Vector3;
  /** Punto de llegada arriba */
  top: THREE.Vector3;
}

/**
 * Pepe: modelo con rig de Mixamo, controlador cinemático de Rapier, animaciones mezcladas
 * (andar, correr, saltar, trepar, abrir puerta) e idle procedural (no hay clip de reposo).
 */
export class Pepe {
  root = new THREE.Group();
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current?: THREE.AnimationAction;
  private body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private ctrl!: RAPIER.KinematicCharacterController;
  private vy = 0;
  state: State = 'ground';
  grounded = true;
  heading = 0;
  speed = 0;
  private bones: Record<string, THREE.Bone> = {};
  private stepDist = 0;
  private idleT = 0;
  /** Superficie bajo los pies, para los pasos */
  surface: (p: THREE.Vector3) => 'stone' | 'grass' | 'dirt' = () => 'grass';
  climbSpots: ClimbSpot[] = [];
  onLand?: () => void;
  private headLook = new THREE.Vector3();
  lookTarget: THREE.Vector3 | null = null;
  /** Mientras > 0, Pepe olfatea (anima la cabeza) */
  private sniffT = 0;

  constructor(private physics: Physics) {}

  async load() {
    const gltf = await assets.model('models/pepe.glb');
    this.model = gltf.scene;
    this.model.scale.setScalar(SCALE);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.envMapIntensity = 0.8;
      }
      if ((o as THREE.Bone).isBone) this.bones[o.name.replace('mixamorig:', '')] = o as THREE.Bone;
    });
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) {
      // las pistas de posición de las caderas en X/Z se anulan (todo in-place)
      for (const tr of clip.tracks) {
        if (tr.name.endsWith('Hips.position')) {
          const v = tr.values;
          const x0 = v[0];
          const z0 = v[2];
          for (let i = 0; i < v.length; i += 3) {
            v[i] = x0;
            v[i + 2] = z0;
          }
        }
      }
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    // idle: pose de "paso" del ciclo de andar en sitio, congelada; se le añade respiración
    const idle = this.mixer.clipAction(gltf.animations.find((c) => c.name === 'walking_2_inplace')!.clone());
    idle.play();
    idle.time = 0.02;
    idle.timeScale = 0;
    this.actions.idle = idle;
    for (const k of ['Regular_Jump', 'climbing_up_wall', 'open_door_1']) {
      const a = this.actions[k];
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    this.play('idle', 0);

    const w = this.physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(HALF_H, RADIUS).setTranslation(0, HALF_H + RADIUS, 0), this.body);
    this.ctrl = w.createCharacterController(0.03);
    this.ctrl.enableAutostep(0.35, 0.2, true);
    this.ctrl.enableSnapToGround(0.4);
    this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));
    this.ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(60));
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
  }

  play(name: string, fade = 0.25, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = name === 'idle' ? 0 : timeScale;
    if (this.current === a) return;
    a.enabled = true;
    if (a.loop === THREE.LoopOnce) a.reset();
    a.setEffectiveWeight(1);
    a.play();
    if (this.current && fade > 0) a.crossFadeFrom(this.current, fade, true);
    else if (this.current) this.current.stop();
    this.current = a;
  }

  get position() {
    return this.root.position;
  }

  teleport(p: THREE.Vector3, heading = this.heading) {
    this.root.position.copy(p);
    this.body.setNextKinematicTranslation(p);
    this.body.setTranslation(p, true);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.vy = 0;
  }

  /** Olfatear: animación de cabeza + sonido. */
  sniff() {
    this.sniffT = 1.6;
    audio.sfx('sniff', { volume: 0.7, at: this.position });
  }

  bark() {
    audio.sfx('bark', { volume: 0.9, at: this.position });
    this.sniffT = 0;
    this.barkT = 0.35;
  }
  private barkT = 0;

  /**
   * Movimiento guiado por guion: anda/corre hacia `target` y resuelve al llegar.
   */
  walkTo(target: THREE.Vector3, run = false): Promise<void> {
    this.state = 'scripted';
    return new Promise((res) => {
      this.scripted = { target: target.clone(), run, res };
    });
  }
  private scripted: { target: THREE.Vector3; run: boolean; res: () => void } | null = null;

  /** Reproduce una animación de una vez (p.ej. abrir puerta) bloqueando el control. */
  async perform(name: 'open_door_1' | 'climbing_up_wall', duration?: number) {
    const prev = this.state;
    this.state = 'scripted';
    this.play(name, 0.2);
    const clip = this.actions[name].getClip();
    await new Promise((r) => setTimeout(r, (duration ?? clip.duration) * 1000));
    this.state = prev === 'scripted' ? 'scripted' : 'ground';
    this.play('idle', 0.3);
  }

  release() {
    this.state = 'ground';
    this.scripted = null;
  }

  update(dt: number, camYaw: number) {
    const pos = this.root.position;
    let wish = new THREE.Vector3();
    let wantRun = false;
    let playerControl = this.state === 'ground' || this.state === 'air';

    if (this.state === 'scripted' && this.scripted) {
      const d = new THREE.Vector3().subVectors(this.scripted.target, pos).setY(0);
      if (d.length() < 0.25) {
        const r = this.scripted.res;
        this.scripted = null;
        r();
      } else {
        wish = d.normalize();
        wantRun = this.scripted.run;
      }
    } else if (playerControl) {
      const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      wish.addScaledVector(f, input.move.y).addScaledVector(r, input.move.x);
      wantRun = input.run;
      if (input.consume('bark')) this.bark();
    }

    if (this.state === 'climb') {
      this.updateClimb(dt);
      this.animateExtras(dt);
      return;
    }

    const mag = Math.min(1, wish.length());
    const target = mag > 0.05 ? (wantRun ? RUN : WALK * (0.5 + 0.5 * Math.min(1, mag / 0.6))) : 0;
    this.speed = THREE.MathUtils.damp(this.speed, target, target > this.speed ? 6 : 10, dt);
    if (mag > 0.05) {
      const h = Math.atan2(wish.x, wish.z);
      let dh = h - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 10);
    }
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));

    // salto / trepar
    if (playerControl && this.grounded && input.consume('jump')) {
      const spot = this.findClimb();
      if (spot) return this.startClimb(spot);
      this.vy = JUMP_V;
      this.grounded = false;
      this.state = 'air';
      this.play('Regular_Jump', 0.1, 1.6);
      this.actions.Regular_Jump.time = 0.35;
      audio.sfx('jump', { volume: 0.5, at: pos });
    }

    this.vy -= GRAVITY * dt;
    const move = fwd.multiplyScalar(this.speed * dt);
    move.y = this.vy * dt;
    this.ctrl.computeColliderMovement(this.collider, move);
    const m = this.ctrl.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    const t = this.body.translation();
    const next = new THREE.Vector3(t.x + m.x, t.y + m.y, t.z + m.z);
    this.body.setNextKinematicTranslation(next);
    pos.copy(next);
    this.root.rotation.y = this.heading;

    if (this.grounded && !wasGrounded && this.state === 'air') {
      this.state = 'ground';
      audio.sfx('land', { volume: 0.6, at: pos });
      this.onLand?.();
    }
    if (!this.grounded && this.state === 'ground' && this.vy < -4) this.state = 'air';

    // animación
    if (this.state !== 'air' || this.grounded) {
      const horiz = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
      if (horiz > 3.0) this.play('Running', 0.25, horiz / RUN);
      else if (horiz > 0.25) this.play('Walking', 0.25, Math.max(0.5, horiz / WALK));
      else this.play('idle', 0.35);
      // pasos
      this.stepDist += horiz * dt;
      const stride = horiz > 3 ? 1.05 : 0.62;
      if (this.grounded && this.stepDist > stride) {
        this.stepDist = 0;
        audio.sfx(`step_${this.surface(pos)}`, { volume: horiz > 3 ? 0.55 : 0.35, at: pos, jitter: 0.12 });
      }
    }
    this.animateExtras(dt);
  }

  private findClimb(): ClimbSpot | null {
    const pos = this.root.position;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    for (const s of this.climbSpots) {
      const to = new THREE.Vector3().subVectors(s.base, pos).setY(0);
      if (to.length() < 1.3 && Math.abs(s.base.y - pos.y) < 0.6) {
        const dir = new THREE.Vector3().subVectors(s.top, s.base).setY(0).normalize();
        if (dir.dot(fwd) > 0.5) return s;
      }
    }
    return null;
  }

  private climb?: { spot: ClimbSpot; t: number; from: THREE.Vector3 };

  private startClimb(spot: ClimbSpot) {
    this.state = 'climb';
    this.climb = { spot, t: 0, from: this.root.position.clone() };
    const dir = new THREE.Vector3().subVectors(spot.top, spot.base).setY(0);
    this.heading = Math.atan2(dir.x, dir.z);
    this.play('climbing_up_wall', 0.12, 1.15);
    audio.sfx('whoosh', { volume: 0.4, at: spot.base });
  }

  private updateClimb(dt: number) {
    const c = this.climb!;
    const D = 2.0 / 1.15;
    c.t += dt / D;
    const k = Math.min(1, c.t);
    // primero sube, al final avanza sobre el borde
    const up = THREE.MathUtils.smoothstep(k, 0.05, 0.75);
    const fw = THREE.MathUtils.smoothstep(k, 0.6, 1.0);
    const p = new THREE.Vector3(
      THREE.MathUtils.lerp(c.from.x, c.spot.top.x, fw),
      THREE.MathUtils.lerp(c.from.y, c.spot.top.y, up),
      THREE.MathUtils.lerp(c.from.z, c.spot.top.z, fw),
    );
    this.root.position.copy(p);
    this.root.rotation.y = this.heading;
    this.body.setNextKinematicTranslation(p);
    if (k >= 1) {
      this.state = 'ground';
      this.vy = 0;
      this.play('idle', 0.3);
    }
  }

  /** Respiración, cabeza que mira, olfateo y ladrido: capas procedurales sobre el mixer. */
  private animateExtras(dt: number) {
    this.mixer.update(dt);
    this.idleT += dt;
    const b = this.bones;
    const idle = this.current === this.actions.idle;
    if (b.Spine2 && idle) {
      const br = Math.sin(this.idleT * 2.1) * 0.025;
      b.Spine2.rotation.x += br;
      b.Spine1 && (b.Spine1.rotation.x += br * 0.5);
      // brazos relajados (la pose de paso los deja algo abiertos)
    }
    if (b.Head) {
      this.sniffT = Math.max(0, this.sniffT - dt);
      this.barkT = Math.max(0, this.barkT - dt);
      if (this.sniffT > 0) {
        b.Head.rotation.x += 0.35 + Math.sin(this.idleT * 18) * 0.06;
        b.Neck && (b.Neck.rotation.x += 0.25);
      }
      if (this.barkT > 0) b.Head.rotation.x -= Math.sin((this.barkT / 0.35) * Math.PI) * 0.35;
      // mirar a un objetivo (vecinos, pegadas)
      if (this.lookTarget) {
        const local = this.root.worldToLocal(this.headLook.copy(this.lookTarget));
        const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.0, 1.0);
        b.Head.rotation.y += yaw * 0.6;
        b.Neck && (b.Neck.rotation.y += yaw * 0.3);
      } else if (idle) {
        b.Head.rotation.y += Math.sin(this.idleT * 0.45) * 0.25 * Math.max(0, Math.sin(this.idleT * 0.13));
      }
    }
  }
}

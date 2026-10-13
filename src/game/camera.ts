import * as THREE from 'three';
import { input } from '../core/input';
import type { Physics, RAPIER } from '../core/physics';

/**
 * Cámara en tercera persona: órbita libre (ratón / arrastre / stick derecho), se recoloca
 * suavemente detrás de Pepe al moverse y se acerca cuando hay obstáculos.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.32;
  distance = 4.6;
  private curDist = 4.6;
  private focus = new THREE.Vector3();
  enabled = true;
  private idleTime = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private physics: Physics,
    private exclude: () => RAPIER.Collider | undefined,
  ) {}

  snap(target: THREE.Vector3, heading: number) {
    this.yaw = heading + Math.PI;
    this.focus.copy(target).add(new THREE.Vector3(0, 1.1, 0));
    this.curDist = this.distance;
    this.apply();
  }

  update(dt: number, target: THREE.Vector3, heading: number, moving: boolean) {
    if (!this.enabled) return;
    const lx = input.look.x;
    const ly = input.look.y;
    this.yaw -= lx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + ly, -0.25, 1.15);
    if (Math.abs(lx) + Math.abs(ly) > 0.0001) this.idleTime = 0;
    else this.idleTime += dt;

    // auto-seguimiento: tras un rato sin tocar la cámara, se coloca detrás al andar
    if (moving && this.idleTime > 1.2) {
      const behind = heading + Math.PI;
      let d = behind - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 1.4);
    }

    const goal = target.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.focus.x = THREE.MathUtils.damp(this.focus.x, goal.x, 10, dt);
    this.focus.z = THREE.MathUtils.damp(this.focus.z, goal.z, 10, dt);
    this.focus.y = THREE.MathUtils.damp(this.focus.y, goal.y, 6, dt);

    // colisión de la cámara
    const dir = this.offsetDir();
    const hit = this.physics.raycast(this.focus, dir, this.distance + 0.3, this.exclude());
    const want = hit !== null ? Math.max(0.8, hit - 0.3) : this.distance;
    this.curDist = want < this.curDist ? want : THREE.MathUtils.damp(this.curDist, want, 3, dt);
    this.apply();
  }

  get forwardYaw() {
    return this.yaw + Math.PI;
  }

  private offsetDir() {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();
  }

  private apply() {
    const p = this.focus.clone().addScaledVector(this.offsetDir(), this.curDist);
    this.camera.position.copy(p);
    this.camera.lookAt(this.focus);
  }
}

import * as THREE from 'three';
import type { Engine } from '../core/engine';
import { input } from '../core/input';
import { ui } from '../ui/ui';

type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  sine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

interface Tween {
  t: number;
  dur: number;
  step: (k: number) => void;
  done: () => void;
}

export interface ShotOpts {
  /** Recorrido de cámara (2+ puntos → curva suave) */
  path: THREE.Vector3[];
  /** A dónde mira (1 punto fijo o recorrido) */
  look: THREE.Vector3[] | (() => THREE.Vector3);
  duration: number;
  ease?: Ease;
  fov?: [number, number];
}

/**
 * Director de cinemáticas: planos de cámara con curvas, subtítulos, fundidos y bandas.
 * Al saltar (acción/salto o tocar), la secuencia sigue en "avance rápido": se aplican
 * los estados finales de cada paso sin esperar, para que la lógica de juego no se rompa.
 */
export class Director {
  active = false;
  private fast = false;
  private tweens: Tween[] = [];
  private baseFov = 55;
  private skipArmed = false;

  constructor(private engine: Engine) {
    engine.onUpdate((dt) => this.update(dt));
    addEventListener('pointerdown', () => this.active && this.skipArmed && this.requestSkip());
  }

  async play(seq: (d: Director) => Promise<void>, opts: { skippable?: boolean; letterbox?: boolean } = {}) {
    this.active = true;
    this.fast = false;
    input.enabled = false;
    this.baseFov = this.engine.camera.fov;
    const lb = opts.letterbox ?? true;
    if (lb) this.tween(0.9, (k) => (this.engine.letterbox = k));
    this.skipArmed = opts.skippable ?? true;
    ui.skipHint(this.skipArmed);
    try {
      await seq(this);
    } finally {
      ui.subtitle(null);
      ui.skipHint(false);
      this.skipArmed = false;
      this.fast = false;
      this.engine.camera.fov = this.baseFov;
      this.engine.camera.updateProjectionMatrix();
      if (lb) await this.tween(0.8, (k) => (this.engine.letterbox = 1 - k));
      this.active = false;
      input.enabled = true;
    }
  }

  requestSkip() {
    if (!this.skipArmed || this.fast) return;
    this.fast = true;
    for (const tw of this.tweens.splice(0)) {
      tw.step(1);
      tw.done();
    }
    ui.subtitle(null);
  }

  get skipping() {
    return this.fast;
  }

  private update(dt: number) {
    if (this.active && this.skipArmed && (input.consume('action') || input.consume('jump') || input.consume('pause'))) this.requestSkip();
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
  }

  /** Interpolación genérica 0→1 durante `dur` segundos. */
  tween(dur: number, step: (k: number) => void): Promise<void> {
    if (this.fast || dur <= 0) {
      step(1);
      return Promise.resolve();
    }
    return new Promise((done) => this.tweens.push({ t: 0, dur, step, done }));
  }

  wait(s: number) {
    return this.tween(s, () => {});
  }

  /** Plano de cámara. No espera si `await` no se usa (permite solapar con subtítulos). */
  shot(o: ShotOpts) {
    const cam = this.engine.camera;
    const path = o.path.length > 1 ? new THREE.CatmullRomCurve3(o.path, false, 'centripetal') : null;
    const lookCurve = Array.isArray(o.look) && o.look.length > 1 ? new THREE.CatmullRomCurve3(o.look, false, 'centripetal') : null;
    const e = o.ease ?? ease.inOut;
    return this.tween(o.duration, (k) => {
      const t = e(k);
      if (path) path.getPoint(t, cam.position);
      else cam.position.copy(o.path[0]);
      const target = typeof o.look === 'function' ? o.look() : lookCurve ? lookCurve.getPoint(t) : o.look[0];
      cam.lookAt(target);
      if (o.fov) {
        cam.fov = THREE.MathUtils.lerp(o.fov[0], o.fov[1], t);
        cam.updateProjectionMatrix();
      }
    });
  }

  /** Órbita alrededor de un punto. */
  orbit(center: THREE.Vector3, radius: number, height: number, a0: number, a1: number, duration: number, lookOffset = 1) {
    const cam = this.engine.camera;
    return this.tween(duration, (k) => {
      const a = THREE.MathUtils.lerp(a0, a1, ease.sine(k));
      cam.position.set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius);
      cam.lookAt(center.x, center.y + lookOffset, center.z);
    });
  }

  /** Subtítulo durante `dur` segundos (o hasta que se salte). */
  async line(text: string, dur?: number, who = '') {
    if (this.fast) return;
    ui.subtitle(text, who);
    await this.wait(dur ?? Math.max(2.8, text.length * 0.065));
    ui.subtitle(null);
    await this.wait(0.25);
  }

  fade(to: number, dur = 1) {
    const from = this.engine.fade;
    return this.tween(dur, (k) => (this.engine.fade = THREE.MathUtils.lerp(from, to, ease.sine(k))));
  }
}

import * as THREE from 'three';
import { audio } from '../core/audio';
import { Engine, memory } from '../core/engine';
import { t } from '../core/i18n';
import { input } from '../core/input';
import { Physics } from '../core/physics';
import { save } from '../core/save';
import { ui } from '../ui/ui';
import { buildInterior, type Interior } from '../world/interior';
import { World } from '../world/world';
import { CameraRig } from './camera';
import { Director } from './cinematic';
import { Npc, type NpcOpts } from './npc';
import { Pepe } from './pepe';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: () => string;
  enabled?: () => boolean;
  run: () => Promise<void> | void;
}

export interface Phase {
  id: string;
  /** Prepara la escena (geometría, NPCs, interactivos). */
  setup(game: Game): Promise<void>;
  /** Comienza la fase (cuando Pepe llega). */
  update?(dt: number): void;
}

export const TOTAL_PEGADAS = 5;
export type Location = 'interior' | 'hub';

/**
 * Juego: posee el motor, la física, el mundo, a Pepe, la cámara, el director de
 * cinemáticas, los vecinos y los objetos con los que se interactúa.
 */
export class Game {
  engine: Engine;
  physics = new Physics();
  world!: World;
  interior!: Interior;
  pepe!: Pepe;
  rig!: CameraRig;
  director!: Director;
  npcs: Npc[] = [];
  interactables: Interactable[] = [];
  updaters: ((dt: number, t: number) => void)[] = [];
  location: Location = 'hub';
  playing = false;
  private busy = false;
  private fwd = new THREE.Vector3();
  /** Zonas de ambiente: el juego mezcla capas según la posición */
  ambienceOverride: Record<string, number> | null = null;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
  }

  async load(progress: (p: number, label: string) => void) {
    progress(0.05, t('load.physics'));
    await this.physics.init();
    this.world = new World(this.engine, this.physics);
    const steps = ['terreo', 'aldea', 'camiños', 'bosque'];
    await this.world.load((s) => progress(0.15 + 0.6 * (steps.indexOf(s) / steps.length), t('load.' + s)));
    progress(0.8, t('load.casa'));
    this.interior = await buildInterior(this.physics);
    this.engine.scene.add(this.interior.group);
    progress(0.88, t('load.pepe'));
    this.pepe = new Pepe(this.physics);
    await this.pepe.load();
    this.engine.scene.add(this.pepe.root);
    this.pepe.surface = (p) => {
      if (this.location === 'interior') return 'stone';
      if (this.world.nearPath(p.x, p.z, 0.2)) return 'dirt';
      return this.world.blocked(p.x, p.z, 2) ? 'stone' : 'grass';
    };
    // troncos de los árboles cercanos: colisión barata
    this.rig = new CameraRig(this.engine.camera, this.physics, () => this.pepe.collider);
    this.director = new Director(this.engine);
    this.engine.onUpdate((dt, time) => this.update(dt, time));
    ui.onPause = (p) => (input.enabled = !p && !this.director.active);
    this.addTreeColliders();
    progress(1, '');
  }

  private addTreeColliders() {
    const v = this.world.vegetation;
    for (const p of v.treesNear(0, 0, 600)) {
      this.physics.addBox(new THREE.Vector3(p.x, p.y + 2, p.z), new THREE.Vector3(0.32, 2, 0.32));
    }
  }

  async npc(opts: NpcOpts, pos: THREE.Vector3, heading = 0, collide = true) {
    const n = await new Npc(opts).load();
    n.root.position.copy(pos);
    n.root.rotation.y = heading;
    this.engine.scene.add(n.root);
    this.npcs.push(n);
    // cápsula estática para que Pepe no los atraviese
    if (collide) this.physics.addBox(pos.clone().add(new THREE.Vector3(0, 0.9, 0)), new THREE.Vector3(0.25, 0.9, 0.25));
    return n;
  }

  addInteractable(i: Interactable) {
    this.interactables.push(i);
    return () => this.removeInteractable(i.id);
  }

  removeInteractable(id: string) {
    this.interactables = this.interactables.filter((i) => i.id !== id);
  }

  /** Cambia entre el interior del coliving y la aldea. */
  setLocation(loc: Location) {
    this.location = loc;
    const inside = loc === 'interior';
    this.interior.group.visible = inside;
    this.world.group.visible = !inside;
    this.world.atmosphere.sky.visible = !inside;
    this.world.atmosphere.sun.visible = !inside;
    this.world.atmosphere.hemi.visible = !inside;
    for (const n of this.npcs) n.root.visible = (n.root.position.x > 2000) === inside || n.ghost;
  }

  /** Coloca a Pepe y la cámara. */
  placePepe(p: THREE.Vector3, heading: number) {
    this.pepe.teleport(p, heading);
    this.rig.snap(p, heading);
  }

  get pegadas() {
    return save.get().pegadas.length;
  }

  private update(dt: number, time: number) {
    input.update();
    ui.update();
    if (ui.paused) {
      input.endFrame();
      return;
    }
    const p = this.pepe.position;
    if (this.playing || this.director.active) {
      this.pepe.update(dt, this.rig.yaw);
      if (!this.director.active) this.rig.update(dt, p, this.pepe.heading, this.pepe.speed > 0.3);
    }
    this.physics.step(dt);
    if (this.location === 'hub') this.world.update(dt, time, p);
    else {
      this.world.atmosphere.update(dt, p);
    }
    for (const n of this.npcs) n.update(dt);
    for (const u of this.updaters) u(dt, time);

    if (this.playing && !this.director.active && !this.busy && !ui.inDialogue) this.checkInteract();
    else ui.prompt(null);

    this.engine.camera.getWorldDirection(this.fwd);
    audio.setListener(this.engine.camera.position, this.fwd);
    this.updateAmbience();
    input.endFrame();
  }

  private checkInteract() {
    const p = this.pepe.position;
    const fwd = new THREE.Vector3(Math.sin(this.pepe.heading), 0, Math.cos(this.pepe.heading));
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const d = new THREE.Vector3().subVectors(it.pos, p);
      const dy = Math.abs(d.y);
      d.y = 0;
      const dist = d.length();
      if (dist > it.radius || dy > 1.8) continue;
      const facing = dist < 0.6 ? 1 : d.normalize().dot(fwd);
      if (facing < -0.2) continue;
      const score = dist - facing;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    ui.prompt(best ? best.label() : null);
    if (best && input.consume('action')) {
      this.busy = true;
      ui.prompt(null);
      Promise.resolve(best.run()).finally(() => (this.busy = false));
    }
  }

  private updateAmbience() {
    if (this.ambienceOverride) {
      for (const [k, v] of Object.entries(this.ambienceOverride)) audio.setAmbience(k, v, 1.5);
      return;
    }
    if (this.location === 'interior') {
      audio.setAmbience('interior', 0.8);
      audio.setAmbience('forest', 0.08);
      audio.setAmbience('river', 0);
      audio.setAmbience('wind', 0.1 * this.world.atmosphere.fogAmount);
      audio.setAmbience('mill', 0);
      return;
    }
    const p = this.pepe.position;
    const fog = this.world.atmosphere.fogAmount;
    const ds = this.world.distanceToStream(p);
    audio.setAmbience('interior', 0);
    audio.setAmbience('forest', THREE.MathUtils.lerp(0.7, 0.15, fog));
    audio.setAmbience('river', THREE.MathUtils.clamp(1 - ds / 45, 0, 1) * 0.9);
    audio.setAmbience('wind', 0.15 + 0.6 * fog);
  }

  /** Muestra el aviso de pegada recuperada y devuelve el color a la zona. */
  recoverPegada(id: string, center: THREE.Vector3, radius: number) {
    save.addPegada(id);
    ui.pegadas(this.pegadas, TOTAL_PEGADAS, true);
    const slot = memory.restore.find((v) => v.w <= 0);
    if (slot) {
      slot.set(center.x, center.y, center.z, 0.01);
      const start = performance.now();
      const grow = () => {
        const k = Math.min(1, (performance.now() - start) / 6000);
        slot.w = radius * (1 - Math.pow(1 - k, 3));
        if (k < 1) requestAnimationFrame(grow);
      };
      grow();
    }
  }

  /** Aplica de golpe las zonas restauradas guardadas (al continuar partida). */
  restoreSaved(centers: Record<string, { c: THREE.Vector3; r: number }>) {
    let i = 0;
    for (const id of save.get().pegadas) {
      const z = centers[id];
      if (z && i < memory.restore.length) memory.restore[i++].set(z.c.x, z.c.y, z.c.z, z.r);
    }
  }
}

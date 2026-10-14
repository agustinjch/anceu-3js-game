import * as THREE from 'three';
import { audio } from '../core/audio';
import { memory } from '../core/engine';
import { t } from '../core/i18n';
import { save } from '../core/save';
import { ease } from '../game/cinematic';
import { TOTAL_PEGADAS, type Game } from '../game/game';
import type { Npc } from '../game/npc';
import { PawTrail } from '../game/pegada';
import { MUINOS_ID, MuinosPhase } from '../phases/muinos/muinos';
import { ui } from '../ui/ui';
import { buildHorreo } from '../world/props';
import { PLACES } from '../world/world';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Salida de la casa al patio (Os Ramís). */
const EXIT = { pos: V(-4.5, 0, 9), heading: Math.PI * 0.95 };

/**
 * Guion del juego: une las escenas en orden. Cada acto es una función async; las fases
 * jugables viven en src/phases/ y se registran aquí.
 */
export class Story {
  private muinos = new MuinosPhase();
  private trail: PawTrail | null = null;
  private interiorNpcs: Record<string, Npc> = {};
  private hubReady = false;

  constructor(private game: Game) {}

  /** Prepara el contenido persistente (fases, hórreo, vecinos de la aldea). */
  async setup() {
    const g = this.game;
    EXIT.pos.y = g.world.hm.at(EXIT.pos.x, EXIT.pos.z);
    const hp = V(-15, 0, 15);
    hp.y = g.world.hm.at(hp.x, hp.z);
    g.engine.scene.add(await buildHorreo(g.physics, hp, 0.35, 4.6));
    await this.muinos.setup(g);
    this.muinos.onComplete = () => this.afterMuinos();

    const s = g.interior.spots;
    this.interiorNpcs.rosa = await g.npc({ model: 'woman', name: 'Rosa', tint: { Body: 0xc86a5a, Legs: 0x40465a } }, s.kitchen.clone().add(V(0.4, 0, -0.1)), Math.PI);
    this.interiorNpcs.africa = await g.npc({ model: 'woman', name: 'África', tint: { Body: 0x5a7fb0, Legs: 0x3a3a3a } }, s.table.clone().add(V(0.6, 0, -0.1)), Math.PI * 1.1);
    this.interiorNpcs.agustin = await g.npc({ model: 'man', name: 'Agustín', tint: 0xd8d0c8 }, s.desk.clone().add(V(0, 0, 0.15)), Math.PI, false);
    this.interiorNpcs.agustin.play('Sitting');
    this.interiorNpcs.agustin.root.position.y += 0.02;
    g.setLocation('hub');
    this.hubReady = true;
  }

  // ---------------------------------------------------------------------------
  /** Fondo animado de la pantalla de título: Anceu al amanecer, cámara en órbita lenta. */
  titleBackdrop(): () => void {
    const g = this.game;
    g.setLocation('hub');
    g.world.atmosphere.setTime(9.4);
    g.world.atmosphere.setFog(0.12, true);
    memory.grey = 0;
    g.engine.fade = 0;
    let a = 0.6;
    const stop = g.engine.onUpdate((dt) => {
      a += dt * 0.012;
      const c = V(40, 0, 60);
      const cam = g.engine.camera;
      cam.position.set(c.x + Math.sin(a) * 260, 90, c.z + Math.cos(a) * 260);
      cam.lookAt(c.x, -20, c.z);
    });
    audio.playMusic('title', 2);
    return () => stop();
  }

  // ---------------------------------------------------------------------------
  async newGame() {
    save.reset();
    await this.prologue();
    await this.act1();
  }

  /** Atajos de depuración: ?debug=interior | hub | muinos | prologue */
  async debug(what: string) {
    const g = this.game;
    if (what === 'interior') return this.act1();
    if (what === 'prologue') return this.prologue();
    if (what === 'fog') {
      await this.act1Skip();
      return;
    }
    await this.enterHub(false);
    if (what === 'muinos') g.placePepe(PLACES.muinos.clone().add(V(-6, 0, 14)), Math.PI);
    if (what === 'clear') g.world.atmosphere.setFog(0.1, true);
  }

  private async act1Skip() {
    this.game.setLocation('interior');
    this.game.playing = true;
    await this.fogArrives();
  }

  async continueGame() {
    const g = this.game;
    if (save.get().pegadas.includes(MUINOS_ID)) {
      g.restoreSaved({ [MUINOS_ID]: { c: PLACES.muinos, r: 140 } });
      await this.enterHub(false);
      g.world.atmosphere.setFog(0.35, true);
      ui.objective(t('obj.after_muinos'));
      audio.playMusic('explore', 3);
    } else if (save.get().checkpoint === 'hub') {
      await this.enterHub(false);
    } else {
      await this.act1();
    }
  }

  // ---------------------------------------------------------------------------
  /** Prólogo: noche sobre el encoro de Eiras; la néboa sube por el río hasta Anceu. */
  private async prologue() {
    const g = this.game;
    const atm = g.world.atmosphere;
    g.setLocation('hub');
    atm.setNight();
    atm.setFog(0.25, true);
    atm.greyFromFog = false;
    memory.grey = 0;
    const wl = g.world.data.water_level;
    audio.playMusic('fog', 2);
    audio.setAmbience('wind', 0.4);
    await g.director.play(async (d) => {
      g.engine.fade = 1;
      // sobre a auga quieta do encoro
      d.shot({
        path: [V(-1250, wl + 5, 820), V(-950, wl + 9, 620), V(-650, wl + 18, 470)],
        look: [V(-600, wl - 6, 420), V(-200, wl + 10, 260)],
        duration: 15,
        ease: ease.linear,
      });
      await d.fade(0, 3);
      await d.line(t('pro.l1'), 4.5);
      await d.line(t('pro.l2'), 4.5);
      // a néboa érguese
      d.tween(8, (k) => atm.setFog(0.25 + 0.5 * k, false));
      await d.line(t('pro.l3'), 4.5);
      // río arriba, entre carballos, ata os tellados
      await d.shot({
        path: [V(-650, wl + 18, 470), V(-200, wl + 30, 300), V(60, 25, 140), V(20, 18, 40)],
        look: [V(-200, wl + 10, 260), V(80, -20, 120), V(0, 2, 0), V(0, 0, 0)],
        duration: 13,
        ease: ease.inOut,
      });
      await d.line(t('pro.l4'), 4.5);
      await d.fade(1, 2.5);
    });
    audio.stopAllAmbience(1);
    atm.greyFromFog = true;
  }

  // ---------------------------------------------------------------------------
  /** Acto I — A mañá: el coliving, el café, y la llegada de la néboa. */
  private async act1() {
    const g = this.game;
    const s = g.interior.spots;
    const atm = g.world.atmosphere;
    const { rosa, africa, agustin } = this.interiorNpcs;
    for (const n of [rosa, africa, agustin]) n.freeze(false, true);
    g.setLocation('interior');
    atm.setTime(8.5);
    atm.setFog(0, true);
    memory.grey = 0;
    g.interior.windowMat.emissiveIntensity = 2.2;
    g.placePepe(s.bed.clone(), Math.PI * 0.25);
    ui.pegadas(0, TOTAL_PEGADAS);

    audio.playMusic('explore', 3);
    await g.director.play(async (d) => {
      g.engine.fade = 1;
      d.shot({
        path: [s.window.clone().add(V(0, 0.4, -1.4)), s.bed.clone().add(V(1.8, 1.0, -1.2))],
        look: [s.window.clone(), s.bed.clone().add(V(0, 0.6, 0))],
        duration: 6,
      });
      await d.fade(0, 2.5);
      await d.line(t('a1.c1.l1'), 3.8);
      await d.line(t('a1.c1.l2'), 3.5);
    });
    ui.chapter(t('chapter.n', { n: 'I' }), t('chapter.1'));
    ui.hud(true);
    g.playing = true;
    ui.objective(t('a1.obj.rosa'));

    // diálogos: Rosa → África (+ Agustín opcional) → a néboa
    let stage = 0;
    rosa.lookAt = g.pepe.position;
    africa.lookAt = g.pepe.position;
    const done = new Promise<void>((resolve) => {
      g.addInteractable({
        id: 'a1.rosa',
        pos: rosa.root.position,
        radius: 2.0,
        label: () => t('act.talk', { name: 'Rosa' }),
        enabled: () => stage <= 1,
        run: async () => {
          await ui.say({ name: 'Rosa' }, t('a1.rosa.1'));
          await ui.say({ name: 'Rosa' }, t('a1.rosa.2'));
          if (stage === 0) {
            stage = 1;
            ui.objective(t('a1.obj.africa'));
          }
        },
      });
      g.addInteractable({
        id: 'a1.agustin',
        pos: agustin.root.position,
        radius: 1.8,
        label: () => t('act.talk', { name: 'Agustín' }),
        enabled: () => stage <= 1,
        run: async () => {
          await ui.say({ name: 'Agustín' }, t('a1.agustin.1'));
          await ui.say({ name: 'Agustín' }, t('a1.agustin.2'));
        },
      });
      g.addInteractable({
        id: 'a1.africa',
        pos: africa.root.position,
        radius: 2.0,
        label: () => t('act.talk', { name: 'África' }),
        enabled: () => stage === 1,
        run: async () => {
          await ui.say({ name: 'África' }, t('a1.africa.1'));
          await ui.say({ name: 'África' }, t('a1.africa.2'));
          stage = 2;
          resolve();
        },
      });
    });
    await done;
    g.removeInteractable('a1.rosa');
    g.removeInteractable('a1.africa');
    g.removeInteractable('a1.agustin');
    ui.objective('');
    await this.fogArrives();
  }

  private async fogArrives() {
    const g = this.game;
    const s = g.interior.spots;
    const atm = g.world.atmosphere;
    const { rosa, africa, agustin } = this.interiorNpcs;
    audio.playMusic(null, 2);
    await g.director.play(async (d) => {
      // as nove: o reloxo
      await d.shot({ path: [s.clock.clone().add(V(0.6, -0.4, 2.2))], look: [s.clock], duration: 0.1 });
      audio.sfx('mechanism', { volume: 0.5, rate: 1.6 });
      await d.line(t('a1.c2.l1'), 3, 'Rosa');
      await d.line(t('a1.c2.l2'), 3.2, 'Rosa');
      // a fiestra vólvese gris; entra a néboa
      audio.playMusic('fog', 2);
      audio.sfx('rumble', { volume: 0.5 });
      audio.setAmbience('wind', 0.7, 4);
      d.shot({
        path: [s.window.clone().add(V(-2.5, -0.2, -3.5)), s.window.clone().add(V(-1.0, -0.3, -2.2))],
        look: [s.window.clone()],
        duration: 6,
      });
      d.tween(6, (k) => {
        g.interior.windowMat.emissiveIntensity = THREE.MathUtils.lerp(2.2, 0.5, k);
        atm.setFog(k * 0.95, false);
      });
      await d.line(t('a1.c2.l3'), 4);
      rosa.freeze(true);
      agustin.freeze(true);
      const A = africa.root.position;
      await d.shot({
        path: [A.clone().add(V(-1.6, 1.6, 1.8)), A.clone().add(V(-1.0, 1.55, 1.3))],
        look: [A.clone().add(V(0, 1.4, 0))],
        duration: 4,
      });
      await d.line(t('a1.c2.l4'), 3.5, 'África');
      await d.line(t('a1.c2.l5'), 4, 'África');
      await d.line(t('a1.c2.l6'), 3.5, 'África');
      africa.freeze(true);
      await d.wait(1.2);
      // a primeira pegada, na porta
      audio.sfx('chime', { volume: 0.8 });
      await d.shot({
        path: [g.pepe.position.clone().add(V(2.2, 1.6, -2.2)), s.door.clone().add(V(-1.8, 1.4, -2.6))],
        look: [g.pepe.position.clone().add(V(0, 0.6, 0)), s.door.clone()],
        duration: 3.5,
      });
    });
    this.setTrail([g.pepe.position.clone(), s.door.clone().add(V(-1.6, 0, -1.4)), s.door.clone()], false);
    ui.objective(t('a1.obj.door'));
    await new Promise<void>((resolve) =>
      g.addInteractable({
        id: 'a1.door',
        pos: s.door,
        radius: 1.6,
        label: () => t('act.go_out'),
        run: async () => {
          g.removeInteractable('a1.door');
          await g.pepe.perform('open_door_1', 2.3);
          audio.sfx('door');
          resolve();
        },
      }),
    );
    await g.director.play(async (d) => {
      await d.fade(1, 1.2);
    }, { skippable: false, letterbox: false });
    await this.enterHub(true);
  }

  // ---------------------------------------------------------------------------
  /** Acto II — A aldea na néboa. */
  private async enterHub(intro: boolean) {
    const g = this.game;
    const atm = g.world.atmosphere;
    if (!this.hubReady) return;
    this.clearTrail();
    g.setLocation('hub');
    atm.setTime(9.6);
    atm.setFog(1, true);
    g.placePepe(EXIT.pos.clone(), EXIT.heading);
    save.update({ checkpoint: 'hub' });
    ui.pegadas(g.pegadas, TOTAL_PEGADAS);
    ui.hud(true);
    if (!save.get().pegadas.includes(MUINOS_ID)) this.trailToMuinos();
    if (intro) {
      g.playing = false;
      await g.director.play(async (d) => {
        const P = g.pepe.position;
        d.shot({
          path: [P.clone().add(V(1.5, 1.2, 2.5)), P.clone().add(V(-4, 6, 8)), P.clone().add(V(-10, 22, 2))],
          look: [P.clone().add(V(0, 1, 0)), P.clone(), PLACES.muinos.clone()],
          duration: 10,
        });
        await d.fade(0, 2);
        await d.line(t('a2.c1.l1'), 3.5);
        await d.line(t('a2.c1.l2'), 4);
        await d.wait(1.5);
      });
      ui.chapter(t('chapter.n', { n: 'II' }), t('chapter.2'));
    } else g.engine.fade = 0;
    g.playing = true;
    if (!save.get().pegadas.includes(MUINOS_ID)) ui.objective(t('a2.obj.muinos'));
  }

  private trailToMuinos() {
    const path = [EXIT.pos.clone(), V(-4, 0, 14), V(12, 0, 20), V(34, 0, 26), V(58, 0, 20), V(80, 0, 30), V(104, 0, 40), V(126, 0, 36), V(148, 0, 50), V(166, 0, 58), this.muinos.trailTarget];
    this.setTrail(path, true);
  }

  private setTrail(path: THREE.Vector3[], onTerrain: boolean) {
    this.clearTrail();
    const g = this.game;
    this.trail = new PawTrail(path, onTerrain ? g.world.hm : null);
    g.engine.scene.add(this.trail.mesh);
    const trail = this.trail;
    const tick = (dt: number) => trail.update(dt, g.pepe.position);
    g.updaters.push(tick);
    trail.mesh.userData.tick = tick;
  }

  private clearTrail() {
    if (!this.trail) return;
    const g = this.game;
    g.updaters = g.updaters.filter((u) => u !== this.trail!.mesh.userData.tick);
    this.trail.dispose();
    this.trail = null;
  }

  // ---------------------------------------------------------------------------
  /** Tras Os Muíños: volver á aldea abre o peche do prototipo. */
  private afterMuinos() {
    const g = this.game;
    this.clearTrail();
    this.setTrail([PLACES.muinos.clone().add(V(-2, 0, 6)), V(166, 0, 58), V(148, 0, 50), V(126, 0, 36), V(104, 0, 40), V(80, 0, 30), V(58, 0, 20), V(34, 0, 26), V(12, 0, 20), EXIT.pos.clone()], true);
    let shown = false;
    const check = () => {
      if (shown || !g.playing) return;
      if (g.pepe.position.distanceTo(EXIT.pos) < 10) {
        shown = true;
        g.updaters = g.updaters.filter((u) => u !== check);
        this.demoEnding();
      }
    };
    g.updaters.push(check);
  }

  private async demoEnding() {
    const g = this.game;
    this.clearTrail();
    await g.director.play(async (d) => {
      const P = g.pepe.position;
      await d.shot({
        path: [P.clone().add(V(2, 1.5, 3)), P.clone().add(V(20, 40, 40)), V(120, 70, 120)],
        look: [P.clone().add(V(0, 1, 0)), V(80, -10, 40), PLACES.muinos.clone()],
        duration: 12,
      });
      await d.line(t('end.l1'), 4);
      await d.line(t('end.l2'), 4.5);
      await d.line(t('end.l3'), 4.5);
    });
    ui.chapter(t('end.kicker'), t('end.title'));
    ui.objective(t('obj.free'));
  }
}

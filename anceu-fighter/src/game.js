// A fight in progress: runs the Match at a fixed 60 Hz and renders it.
import * as THREE from 'three';
import { Match } from './sim/match.js';
import { AI } from './sim/ai.js';
import { FIGHTERS } from './data/fighters/index.js';
import { FighterView } from './render/fighterView.js';
import { FightCamera } from './render/camera.js';
import { FX } from './render/fx.js';
import { STAGES } from './render/stages/index.js';
import { HUD } from './ui/hud.js';
import { audio, announce } from './audio/audio.js';
import { readPlayer } from './devices.js';

const STEP = 1 / 60;
const SAY = {
  round: n => `Asalto ${['', 'un', 'dous', 'tres', 'catro', 'cinco'][n] || n}`,
  final: () => 'Asalto final',
  fight: () => '¡A loitar!',
  ko: () => 'K.O.',
  time: () => '¡Tempo!',
  perfect: () => '¡Perfecto!',
};

export class Fight {
  // opts: { p1, p2 (fighter ids), stage, cpu: [level|null, level|null], seed, skipIntro }
  constructor(renderer, uiRoot, opts) {
    this.renderer = renderer;
    this.opts = opts;
    this.defs = [FIGHTERS[opts.p1], FIGHTERS[opts.p2]];
    this.scene = new THREE.Scene();
    this.stage = STAGES[opts.stage].build(this.scene);
    this.views = this.defs.map(d => new FighterView(d));
    for (const v of this.views) this.scene.add(v.group);
    this.camera = new FightCamera(innerWidth / innerHeight);
    this.fx = new FX(this.scene);
    this.hud = new HUD(uiRoot, this.defs);
    this.match = new Match({ p1: this.defs[0], p2: this.defs[1], stage: opts.stage, skipIntro: opts.skipIntro });
    const seed = opts.seed ?? (Date.now() & 0xffff);
    this.ais = (opts.cpu || [null, null]).map((lvl, i) => (lvl ? new AI(lvl, seed + i * 101) : null));
    this.acc = 0;
    this.time = 0;
    this.paused = false;
    this.ended = false;
    this.comboDmg = [0, 0];
    audio.playSong(this.stage.music);
    this.handle(this.match.events);
    this.intro();
  }

  intro() {
    if (this.opts.skipIntro) return;
    const [a, b] = this.defs;
    this.hud.line(`${a.name}: “${a.intro.line}”`, 2.2);
    this.hud.after(2.3, () => this.hud.line(`${b.name}: “${b.intro.line}”`, 2.2));
  }

  inputs() {
    return [0, 1].map(i => (this.ais[i] ? this.ais[i].think(this.match.world, i) : readPlayer(i)));
  }

  update(dt) {
    if (!this.paused) {
      this.acc = Math.min(this.acc + dt, 0.25);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.handle(this.match.step(this.inputs()));
      }
      this.time += dt;
    }
    const pdt = this.paused ? 0 : dt;
    const fs = this.match.fighters;
    this.views.forEach((v, i) => v.update(fs[i], pdt));
    this.fx.sync(this.match.world, pdt, this.time);
    this.fx.update(pdt);
    this.stage.update(pdt);
    this.camera.update(fs, pdt);
    this.hud.update(this.match, pdt);
    this.renderer.render(this.scene, this.camera.cam);
  }

  handle(events) {
    const fs = this.match.fighters;
    for (const e of events) {
      switch (e.type) {
        case 'announce':
          if (e.text === 'round') this.hud.show(`ROUND ${e.round}`, { time: 1.0 });
          else if (e.text === 'final') this.hud.show('ROUND FINAL', { time: 1.0 });
          else if (e.text === 'fight') { this.hud.show('¡LOITA!', { time: 0.7, red: true }); audio.sfx('bell'); }
          else if (e.text === 'ko') { this.hud.show('K.O.', { time: 1.8, red: true }); this.hud.flash(); audio.sfx('ko'); this.stage.crowd.cheer(4); }
          else if (e.text === 'time') this.hud.show('¡TEMPO!', { time: 1.6 });
          else if (e.text === 'perfect') this.hud.after(1.0, () => this.hud.show('PERFECTO', { time: 1.6 }));
          announce(SAY[e.text](e.round));
          break;
        case 'hit': {
          const att = e.side, def = e.target;
          this.views[def].hit(e.strength === 'L' ? 0 : 1);
          this.fx.hit(e);
          audio.sfx(e.strength === 'L' ? 'hitL' : e.strength === 'X' ? 'hitX' : 'hitH');
          if (e.bell) audio.sfx('bell');
          if (e.strength !== 'L') this.camera.shake(e.strength === 'X' ? 0.22 : 0.12, 0.22);
          if (e.combo === 1) this.comboDmg[att] = 0;
          this.comboDmg[att] += e.damage;
          this.hud.combo(att, e.combo, this.comboDmg[att]);
          if (e.combo >= 4) this.stage.crowd.cheer(2);
          if (e.cinematic) this.fx.cinematic(e.cinematic, fs[att], fs[def]);
          break;
        }
        case 'block': this.fx.block(e); audio.sfx('block'); break;
        case 'counter': this.fx.burst(e.x, e.y, { color: 0x9fe8ff, n: 20, speed: 5 }); audio.sfx('counter'); this.hud.line('¡CONTRA!', 0.8); break;
        case 'super': {
          const f = fs[e.side];
          this.hud.superName(e.name, e.side);
          audio.sfx('super');
          this.camera.punch(1.2);
          this.fx.burst(f.x, 1.2, { color: 0xff7af0, n: 26, speed: 6, size: 0.35 });
          if (e.cinematic === 'gaiteiros') this.fx.cinematic('gaiteiros', f, fs[1 - e.side]);
          this.stage.crowd.cheer(2);
          break;
        }
        case 'grab': audio.sfx('grab'); break;
        case 'tech': audio.sfx('tech'); this.hud.line('¡ESCAPE!', 0.8); break;
        case 'projectile': audio.sfx(e.kind === 'bark' ? 'bark' : e.kind === 'slipper' ? 'throwItem' : 'fireball'); break;
        case 'place': audio.sfx(e.kind === 'fog' ? 'fog' : 'grab'); break;
        case 'teleport': this.fx.burst(e.x, 1, { color: 0xb07aff, n: 18, speed: 3 }); audio.sfx('teleport'); break;
        case 'zap': this.fx.burst(e.x, 0.3, { color: 0x6fffd0, n: 22, speed: 5 }); audio.sfx('zap'); break;
        case 'heal': audio.sfx('slurp'); this.fx.burst(fs[e.side].x, 1.4, { color: 0x7dff9a, n: 10, speed: 1.5, gravity: 2 }); break;
        case 'clash': this.fx.burst(e.x, e.y, { color: 0xffffff, n: 16, speed: 4 }); audio.sfx('poof'); break;
        case 'floor': this.fx.dust(e.x); audio.sfx('floor'); break;
        case 'jump': audio.sfx('whiff', { vol: 0.5 }); break;
        case 'land': audio.sfx('land'); break;
        case 'roundWon': break;
        case 'matchEnd':
          this.ended = true;
          audio.playSong('ending');
          if (e.winner !== 'draw') {
            const d = this.defs[e.winner];
            this.hud.after(1.0, () => announce(`Gaña ${d.name}`));
          }
          this.hud.after(3.2, () => this.onEnd?.(e.winner));
          break;
        default: break;
      }
    }
  }

  resize() { this.camera.resize(innerWidth / innerHeight); }

  dispose() {
    this.hud.dispose();
    this.scene.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); } });
  }
}

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { FollowCam } from './camera.js';
import { CollisionWorld } from './physics.js';
import { Player, loadPepe } from './player.js';
import { loadNpcModels } from './npcModels.js';
import { UI, wait } from './ui.js';
import { Builder, makeSky } from './kit.js';
import { makeSparkMesh, Spark } from './entities.js';
import { LEVELS } from './levels/index.js';
import * as STORY from './story.js';

const SAVE_KEY = 'superpepebros.save.v1';
const $ = s => document.querySelector(s);

class Cine {
  constructor(game) { this.game = game; this.tweens = []; }
  cam(pos, look, dur = 2, ease = t => t * t * (3 - 2 * t)) {
    const c = this.game.camera;
    const p0 = c.position.clone(), l0 = this.look ? this.look.clone() : c.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(c.position);
    const p1 = pos.clone(), l1 = look.clone();
    if (dur <= 0) { c.position.copy(p1); this.look = l1.clone(); c.lookAt(l1); return Promise.resolve(); }
    return new Promise(res => this.tweens.push({ t: 0, dur, fn: k => { const e = ease(k); c.position.lerpVectors(p0, p1, e); this.look = l0.clone().lerp(l1, e); c.lookAt(this.look); }, res }));
  }
  orbit(center, radius, height, a0, a1, dur) {
    const c = this.game.camera;
    return new Promise(res => this.tweens.push({ t: 0, dur, fn: k => { const a = a0 + (a1 - a0) * k; c.position.set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius); this.look = center.clone(); c.lookAt(center); }, res }));
  }
  tween(dur, fn) { return new Promise(res => this.tweens.push({ t: 0, dur, fn, res })); }
  update(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
  }
}

class Game {
  constructor() {
    const canvas = $('#game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex; this.scene.environmentIntensity = 0.35;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    addEventListener('resize', () => this.resize());
    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6a3a, 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -35; sc.right = sc.top = 35; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
    this.fog = new THREE.Fog(0xcfe9ff, 60, 320); this.scene.fog = this.fog;

    this.world = new CollisionWorld();
    this.ui = new UI(this.camera);
    this.cam = new FollowCam(this.camera);
    this.cine = new Cine(this);
    this.entities = [];
    this.levelObjs = [];
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.save = this.loadSave();
    this.levelBread = 0;
    fx.init(this.scene);
    this.loop = this.loop.bind(this);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }
  // ---------- save ----------
  loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.sparks) return s; } catch (e) {}
    return { sparks: [], nuts: 0, flags: {}, deaths: 0 };
  }
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {} }
  hasSave() { return this.save.sparks.length > 0 || this.save.flags.introDone; }
  newSave() { this.save = { sparks: [], nuts: 0, flags: {}, deaths: 0 }; this.writeSave(); }
  flag(k, v) { if (v === undefined) return !!this.save.flags[k]; this.save.flags[k] = v; this.writeSave(); }
  sparkCount() { return this.save.sparks.length; }
  levelSparkCount(id) { return this.save.sparks.filter(s => s.startsWith(id + '-')).length; }

  // ---------- boot ----------
  async boot() {
    const fill = $('#loading .lfill');
    const [gltf] = await Promise.all([loadPepe(p => (fill.style.width = (p * 100).toFixed(0) + '%')), loadNpcModels()]);
    fill.style.width = '100%';
    this.player = new Player(gltf); this.player.game = this;
    this.scene.add(this.player.root);
    requestAnimationFrame(this.loop);
    // need a user gesture for audio
    $('#loading .lmsg').textContent = 'Click or press any key to start';
    await new Promise(res => {
      const go = () => { removeEventListener('keydown', go); removeEventListener('pointerdown', go); res(); };
      addEventListener('keydown', go); addEventListener('pointerdown', go);
      const padPoll = () => { const p = navigator.getGamepads && [...navigator.getGamepads()].find(Boolean); if (p && p.buttons.some(b => b.pressed)) go(); else if ($('#loading').style.display !== 'none') requestAnimationFrame(padPoll); };
      padPoll();
    });
    audio.init();
    $('#loading').style.display = 'none';
    const dev = new URLSearchParams(location.search).get('dev');
    if (dev) { this.flag('introDone', true); this.ui.fade(0, 10); return this.loadLevel(dev, { quiet: true }); }
    this.titleScreen();
  }

  // ---------- title ----------
  async titleScreen() {
    this.state = 'title';
    this.ui.showHUD(false); this.ui.letterbox(false);
    await this.loadLevel('hub', { noIntro: true, title: true });
    this.player.root.visible = true;
    this.player.setPosition(new THREE.Vector3(2, 0, 10), Math.PI * 0.85);
    this.player.locked = true;
    audio.playSong('title');
    $('#title').classList.remove('hidden');
    this.titleOrbit = true; this.ui.hideLabels = true;
    this.ui.fade(0, 1200);
    const t = $('#title'), press = t.querySelector('.press'), menu = t.querySelector('.titlemenu');
    press.classList.remove('hidden'); menu.classList.add('hidden');
    await this.ui.waitConfirm();
    audio.sfx('select');
    press.classList.add('hidden'); menu.classList.remove('hidden');
    while (true) {
      const items = [{ label: this.hasSave() ? `Continue  ★${this.sparkCount()}` : 'Continue', disabled: !this.hasSave() }, { label: 'New Game' }, { label: 'Controls' }, { label: 'Credits' }];
      const i = await this.ui.menu(menu, items);
      if (i === 0 || i === 1) {
        if (i === 1 && this.hasSave()) {
          menu.classList.add('hidden'); $('#menu').classList.remove('hidden');
          const c = await this.ui.menu($('#menu'), [{ label: 'Yes, start over' }, { label: 'No' }], { title: 'Erase save?', back: 1 });
          $('#menu').classList.add('hidden'); menu.classList.remove('hidden');
          if (c !== 0) continue;
        }
        if (i === 1) this.newSave();
        t.classList.add('hidden'); this.titleOrbit = false; this.ui.hideLabels = false;
        await this.ui.fade(1, 800);
        if (!this.flag('introDone')) await this.playIntro();
        else await this.loadLevel('hub', { spawn: 'start' });
        return;
      }
      if (i === 2) { t.classList.add('hidden'); await this.showControls(); t.classList.remove('hidden'); }
      if (i === 3) { t.classList.add('hidden'); audio.playSong('ending'); await this.ui.credits(STORY.creditsHTML(false), 45); audio.playSong('title'); t.classList.remove('hidden'); }
    }
  }
  async showControls() {
    $('#menu').classList.remove('hidden');
    await this.ui.menu($('#menu'), [{ label: 'Back' }], { title: 'Controls', html: STORY.controlsHTML, back: 0 });
    $('#menu').classList.add('hidden');
  }

  // ---------- levels ----------
  clearLevel() {
    for (const e of this.entities) e.remove();
    this.entities = [];
    if (this.builder) { this.scene.remove(this.builder.group); this.builder.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    for (const o of this.levelObjs) this.scene.remove(o);
    this.levelObjs = [];
    this.world.clear();
    this.ui.clearLabels();
    this.levelUpdate = null;
  }
  async loadLevel(id, opts = {}) {
    this.clearLevel();
    const L = LEVELS[id];
    this.level = L; this.levelId = id;
    this.levelBread = 0;
    const B = this.builder = new Builder(this.scene);
    this.sky = makeSky(L.sky.top, L.sky.bottom, this.sunDir); this.addObj(this.sky);
    this.fog.color.set(L.fog.color); this.fog.near = L.fog.near; this.fog.far = L.fog.far;
    this.hemi.color.set(L.hemi?.sky ?? 0xcfe8ff); this.hemi.groundColor.set(L.hemi?.ground ?? 0x5a6a3a); this.hemi.intensity = L.hemi?.i ?? 1.1;
    this.sun.color.set(L.sunColor ?? 0xfff0d0); this.sun.intensity = L.sunI ?? 2.6;
    if (L.sunDir) this.sunDir.copy(L.sunDir).normalize();
    this.sky.material.uniforms.sun.value.copy(this.sunDir);
    this.renderer.toneMappingExposure = L.exposure ?? 1.05;
    this.scene.environmentIntensity = L.envI ?? 0.35;
    this.ctx = L.build(this, B, opts) || {};
    this.world.build(B.colliders);
    const sp = (this.ctx.spawns && this.ctx.spawns[opts.spawn || 'start']) || L.spawn;
    this.checkpoint = sp.pos.clone();
    this.player.setPosition(sp.pos, sp.yaw ?? 0);
    this.player.health = this.player.maxHealth; this.player.locked = false; this.player.forcedAnim = null;
    this.player.root.visible = true;
    this.cam.snap(this.player);
    this.ui.setLevelName(L.name);
    if (!opts.title) {
      audio.playSong(L.music);
      this.state = 'play';
      this.ui.showHUD(true); this.updateHUD();
      this.ui.fade(0, 700);
      if (this.ctx.onEnter) await this.ctx.onEnter(opts);
      else if (!opts.quiet) this.ui.bigText(L.name, L.subtitle, 2400);
    }
  }
  addObj(o) { this.scene.add(o); this.levelObjs.push(o); return o; }
  spawn(e) { this.entities.push(e); return e; }

  async enterLevel(id, portal) {
    if (this.busy) return; this.busy = true;
    this.player.locked = true;
    audio.sfx('portal');
    this.save.flags.lastPortal = portal ? portal.opts.level : null; this.writeSave();
    // dive into the painting
    const p0 = this.player.pos.clone(), n = portal.normal;
    this.player.forcedAnim = 'jump';
    await this.cine.tween(0.6, k => { this.player.pos.copy(p0).addScaledVector(n, -k * 1.2); this.player.pos.y = p0.y + Math.sin(k * Math.PI) * 1.2; this.player.root.position.copy(this.player.pos); this.player.root.scale.setScalar(1 - k * 0.6); });
    await this.ui.fade(1, 500, true);
    this.player.root.scale.setScalar(1);
    await this.loadLevel(id);
    this.busy = false;
  }
  async exitToHub(fromLevel = this.levelId) {
    if (this.busy) return; this.busy = true;
    this.player.locked = true;
    audio.sfx('portal');
    await this.ui.fade(1, 600, true);
    await this.loadLevel('hub', { spawn: 'from-' + fromLevel, quiet: true });
    this.busy = false;
  }
  setCheckpoint(p) { this.checkpoint = p.clone(); }

  // ---------- events from entities ----------
  addChestnut(n) {
    this.save.nuts += n; this.player.heal(1);
    this.levelNuts = (this.levelNuts || 0) + n;
    if (this.save.nuts % 50 === 0) { this.player.heal(8); audio.sfx('oneup'); this.ui.toast('50 chestnuts! Full health!'); }
    this.updateHUD();
  }
  collectBread(group, pos) {
    this.levelBread++;
    this.updateHUD();
    if (this.levelBread >= 8 && this.ctx.breadSpark) {
      const s = this.ctx.breadSpark;
      this.spawnSparkCinematic(s.id, s.pos, s.title);
    } else this.ui.toast(`Bread for the baker: ${this.levelBread}/8`, 1500);
  }
  async spawnSparkCinematic(id, pos, title) {
    await wait(300);
    this.player.locked = true; this.ui.letterbox(true); this.cam.cinematic = true;
    const look = pos.clone().add(new THREE.Vector3(0, 1, 0));
    this.cine.look = this.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    await this.cine.cam(look.clone().add(new THREE.Vector3(6, 4, 8)), look, 1.2);
    this.spawn(new Spark(this, id, pos, { title, appear: true }));
    audio.sfx('spark'); fx.sparkle(look, 30, 0xffe080, 4);
    await wait(1600);
    this.cam.cinematic = false; this.ui.letterbox(false); this.player.locked = false;
    this.cam.snap(this.player);
  }
  async collectSpark(spark) {
    const already = this.save.sparks.includes(spark.id);
    if (!already) this.save.sparks.push(spark.id);
    this.writeSave();
    const pl = this.player;
    pl.locked = true; pl.health = pl.maxHealth;
    this.updateHUD();
    audio.stopSong(0.3);
    audio.sfx('fanfare');
    this.cam.cinematic = true; this.ui.letterbox(true);
    const face = pl.pos.clone(); const yaw = pl.facing;
    const front = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.cine.look = pl.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.camera.position.copy(face).addScaledVector(front, 4.2).add(new THREE.Vector3(0, 1.8, 0));
    this.camera.lookAt(this.cine.look);
    // hold the spark overhead
    const held = makeSparkMesh(false, 0.8); held.position.set(0, 2.5, 0); pl.root.add(held);
    pl.vel.set(0, 9, 0); pl.onGround = false; pl.forcedAnim = 'jump';
    fx.sparkle(pl.pos.clone().add(new THREE.Vector3(0, 2, 0)), 40, 0xffe080, 5);
    const spinT = this.cine.tween(2.2, k => { held.rotation.y = k * 12; });
    await wait(500);
    this.ui.bigText(already ? 'FAÍSCA (again!)' : 'FAÍSCA RECOVERED!', spark.title, 2600);
    await spinT;
    pl.root.remove(held);
    pl.forcedAnim = null;
    await wait(600);
    this.ui.letterbox(false); this.cam.cinematic = false; pl.locked = false;
    audio.playSong(this.level.music, 0.5);
    const n = this.sparkCount();
    if (!already) {
      if (this.ctx.onSpark) await this.ctx.onSpark(spark.id);
      const msg = STORY.sparkMilestone(n);
      if (msg) this.ui.toast(msg, 4000);
    }
  }
  onEnemyKilled(e) {
    this.ctx.onEnemyKilled && this.ctx.onEnemyKilled(e);
    if (e.tag) {
      const left = this.entities.filter(x => !x.dead && x.tag === e.tag).length;
      if (left === 0 && this.ctx.onTagCleared) this.ctx.onTagCleared(e.tag, e.pos.clone());
      else if (left > 0 && this.ctx.tagCounts) this.ui.toast(`${this.ctx.tagCounts[e.tag] || 'Drones'} left: ${left}`, 1500);
    }
  }
  onPlayerHurt() {
    this.cam.shake(0.25, 0.25); this.updateHUD();
    if (this.player.health <= 0) this.gameOver();
  }
  onPound(pos) {
    this.cam.shake(0.2, 0.2);
    this.ctx.onPound && this.ctx.onPound(pos);
  }
  async talkTo(npc) {
    const pl = this.player; pl.locked = true; pl.vel.set(0, pl.vel.y, 0); pl.hspeed = 0;
    pl.facing = Math.atan2(npc.obj.position.x - pl.pos.x, npc.obj.position.z - pl.pos.z);
    try { await npc.talk(this, npc); } finally { pl.locked = false; input.consume('jump'); }
  }
  async readSign(sign) {
    this.player.locked = true;
    await this.ui.dialog(sign.title, sign.text, 380);
    this.player.locked = false; input.consume('jump');
  }
  say(name, lines, pitch) { return this.ui.dialog(name, lines, pitch); }

  async respawn(fall = true) {
    if (this.busy) return; this.busy = true;
    this.player.locked = true;
    if (fall) { audio.sfx('splash'); }
    await this.ui.fade(1, 400);
    this.player.setPosition(this.checkpoint.clone().add(new THREE.Vector3(0, 0.5, 0)), this.player.facing);
    this.player.invuln = 0;
    if (fall) { this.player.health = Math.max(0, this.player.health - 2); this.updateHUD(); }
    this.cam.snap(this.player);
    this.player.locked = false;
    this.busy = false;
    if (this.player.health <= 0) return this.gameOver();
    await this.ui.fade(0, 400);
  }
  async gameOver() {
    if (this.over) return; this.over = true;
    this.player.locked = true; this.save.deaths++; this.writeSave();
    audio.stopSong(0.3); audio.sfx('gameover');
    await wait(600);
    await this.ui.fade(1, 900);
    this.ui.showHUD(false);
    await this.ui.bigText('PEPE NEEDS A NAP', 'Back to the checkpoint…', 2600);
    this.over = false; this.busy = false;
    this.player.health = this.player.maxHealth;
    this.player.setPosition(this.checkpoint.clone().add(new THREE.Vector3(0, 0.5, 0)), this.player.facing);
    this.cam.snap(this.player); this.player.locked = false;
    this.ui.showHUD(true); this.updateHUD();
    audio.playSong(this.level.music);
    await this.ui.fade(0, 600);
  }
  updateHUD() {
    this.ui.updateHUD({ health: this.player.health, sparks: this.sparkCount(), nuts: this.save.nuts, bread: this.ctx && this.ctx.breadSpark ? this.levelBread : null });
  }

  async pause() {
    if (this.state !== 'play' || this.player.locked || this.busy) return;
    this.state = 'pause'; audio.sfx('pause'); input.releaseLock();
    const m = $('#menu'); m.classList.remove('hidden');
    while (true) {
      const inWorld = this.levelId !== 'hub';
      const items = [{ label: 'Continue' }, { label: 'Exit to Anceu', disabled: !inWorld || (this.levelId === 'boss' && this.ctx.fighting) }, { label: 'Controls' }, { label: `Music: ${Math.round(audio.musicVol * 100)}%` }, { label: 'Quit to Title' }];
      const stats = `<div class="stats">${this.level.name} — ★ ${this.levelSparkCount(this.levelId)}/${this.level.sparks || 0} &nbsp;·&nbsp; Total ★ ${this.sparkCount()} &nbsp;·&nbsp; Chestnuts ${this.save.nuts}</div>`;
      const i = await this.ui.menu(m, items, { title: 'Paused', html: stats, back: 0 });
      if (i === 0) break;
      if (i === 1) { m.classList.add('hidden'); this.state = 'play'; return this.exitToHub(); }
      if (i === 2) { await this.ui.menu(m, [{ label: 'Back' }], { title: 'Controls', html: STORY.controlsHTML, back: 0 }); }
      if (i === 3) { const v = [0, 0.25, 0.4, 0.55, 0.75, 1]; const k = v.findIndex(x => Math.abs(x - audio.musicVol) < 0.01); audio.setMusicVolume(v[(k + 1) % v.length]); }
      if (i === 4) { m.classList.add('hidden'); await this.ui.fade(1, 500); this.state = 'title'; return this.titleScreen(); }
    }
    m.classList.add('hidden'); this.state = 'play';
  }

  // ---------- story sequences ----------
  playIntro() { return STORY.intro(this); }
  playEnding() { return STORY.ending(this); }

  // ---------- main loop ----------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.frames = (this.frames || 0) + 1;
    this.time += dt;
    input.poll();
    this.ui.update(dt);
    if (this.player) {
      if (this.state === 'play') {
        if (input.wasPressed('pause')) this.pause();
        if (!input.pointerLocked && input.mouseDown) {}
      }
      const paused = this.state === 'pause';
      if (!paused) {
        if (this.builder) for (const f of this.builder.animated) f(dt, this.time);
        if (this.levelUpdate) this.levelUpdate(dt, this.time);
        if (this.ctx && this.ctx.update) this.ctx.update(dt, this.time);
        for (const e of this.entities) if (!e.dead) e.update(dt, this.time);
        this.entities = this.entities.filter(e => !e.dead);
        this.world.updateDynamic();
        this.player.update(dt, this.world, this.cam.yaw);
        if (this.state === 'play' && !this.busy && this.level && this.player.pos.y < this.level.killY) this.respawn(true);
        if (this.titleOrbit) {
          const a = this.time * 0.08, c = new THREE.Vector3(0, 6, 0);
          this.camera.position.set(Math.sin(a) * 34, 16 + Math.sin(this.time * 0.2) * 2, Math.cos(a) * 34); this.camera.lookAt(c);
        } else if (!this.cam.cinematic) this.cam.update(dt, this.player, this.world);
        this.cine.update(dt);
        fx.update(dt);
      }
      // shadow camera follows the player
      const focus = this.cam.cinematic && this.cine.look ? this.cine.look : this.player.pos;
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 90);
      this.sun.target.position.copy(focus);
      if (this.sky) this.sky.position.copy(this.camera.position);
    }
    if (this.state === 'play' && !input.pointerLocked && input.wasPressed('attack') === false) {}
    this.composer.render();
    input.endFrame();
  }
}

const game = new Game();
window.__game = game;
$('#game').addEventListener('click', () => { if (game.state === 'play' && !game.player.locked) input.requestLock($('#game')); });
game.boot();

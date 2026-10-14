// ANCEU — the village hub.
import * as THREE from 'three';
import { mat, colorMat, boxGeo } from '../kit.js';
import { Chestnut, NPC, Sign, Baleirino, MuralPortal, FogGate, Spark, Crate, PoundSwitch, BouncePad, Entity, makePerson } from '../entities.js';
import { smooth, noise2, V, grassColor, segDist, ringOf, lineOf } from './util.js';
import { paintRiver, paintForest, paintMountain } from './murals.js';
import { makeGreyTower, textTex } from './baleiro.js';
import { audio } from '../audio.js';
import { fx } from '../fx.js';
import { wait } from '../ui.js';

const TOTAL = 18;
function height(x, z) {
  const r = Math.hypot(x, z);
  let h = smooth(48, 95, r) * 22 + noise2(x, z) * smooth(40, 70, r) * 3;
  // north valley toward Don Baleiro's door
  const valley = smooth(16, 8, Math.abs(x)) * smooth(-40, -55, z);
  h = h * (1 - valley);
  // gentle mound with the hórreos to the south-west
  h += Math.exp(-((x + 18) ** 2 + (z - 30) ** 2) / 120) * 2.5;
  return h;
}
function pathAmt(x, z) {
  const r = Math.hypot(x, z);
  if (r < 14) return 2; // plaza cobbles
  let p = 0;
  p = Math.max(p, smooth(3, 1.5, segDist(x, z, 0, 0, 0, -80)));
  p = Math.max(p, smooth(3, 1.5, segDist(x, z, 0, 0, 34, 0)));
  p = Math.max(p, smooth(2.5, 1.2, segDist(x, z, 0, 0, -22, -4)));
  p = Math.max(p, smooth(2.5, 1.2, segDist(x, z, 0, 0, -12, 24)));
  return p;
}

class BossDoor extends Entity {
  constructor(game, pos) {
    super(game); this.pos = pos.clone();
    const g = new THREE.Group();
    const facade = new THREE.Mesh(boxGeo(26, 16, 3, 2), mat('concrete')); facade.position.set(0, 8, -2); g.add(facade);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: textTex('BALEIRO CORP.', '#ff4040', '#1d1f23') })); sign.position.set(0, 13, -0.45); g.add(sign);
    this.doorL = new THREE.Mesh(boxGeo(2.4, 5.5, 0.4, 1), mat('metal')); this.doorL.geometry.translate(1.2, 0, 0); this.doorL.position.set(-2.4, 2.75, -0.3);
    this.doorR = new THREE.Mesh(boxGeo(2.4, 5.5, 0.4, 1), mat('metal')); this.doorR.geometry.translate(-1.2, 0, 0); this.doorR.position.set(2.4, 2.75, -0.3);
    g.add(this.doorL, this.doorR);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0xff3030 })); lamp.position.set(0, 6.2, -0.3); g.add(lamp);
    g.position.copy(pos); this.obj = g; game.scene.add(g);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.label = game.ui.makeLabel('Torre Baleira');
    this.blocker = new THREE.Mesh(new THREE.BoxGeometry(26, 16, 3)); this.blocker.position.set(pos.x, pos.y + 8, pos.z - 2); this.blocker.visible = false;
    game.scene.add(this.blocker); game.world.addDynamic(this.blocker);
  }
  update() {
    const pl = this.game.player, d = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    this.game.ui.placeLabel(this.label, this.pos, 7.5, d < 25, `★ ${this.game.sparkCount()}/12`);
    if (d < 2.6 && !pl.locked && !this.game.busy) {
      if (this.game.sparkCount() < 12) { pl.vel.z = 6; pl.hspeed = 0; this.game.ui.toast('The door is sealed. 12 Faíscas are needed to break the seal.'); audio.sfx('warn'); }
      else this.open();
    }
  }
  async open() {
    const game = this.game, pl = game.player; game.busy = true; pl.locked = true;
    game.cam.cinematic = true; game.ui.letterbox(true);
    pl.facing = Math.PI; pl.pos.set(this.pos.x, this.pos.y, this.pos.z + 1.6); pl.vel.set(0, 0, 0); pl.hspeed = 0;
    game.cine.look = this.pos.clone().add(V(0, 2, 0));
    await game.cine.cam(this.pos.clone().add(V(4.5, 2.2, 6)), this.pos.clone().add(V(0, 1.8, 0)), 0.8);
    pl.forcedAnim = 'door'; pl.forcedAnimSpeed = 1.3;
    await wait(1100);
    audio.sfx('door');
    await game.cine.tween(1.4, k => { this.doorL.rotation.y = -k * 1.7; this.doorR.rotation.y = k * 1.7; });
    pl.forcedAnim = null; pl.forcedAnimSpeed = 0;
    await game.cine.tween(1.0, k => { pl.pos.z = this.pos.z + 1.6 - k * 2.5; pl.vel.z = -3; });
    await game.ui.fade(1, 700);
    game.ui.letterbox(false); game.cam.cinematic = false; game.busy = false;
    await game.loadLevel('boss');
  }
  remove() { super.remove(); this.game.ui.removeLabel(this.label); }
}

export default {
  id: 'hub', name: 'Anceu', subtitle: 'The village', music: 'hub', sparks: 3,
  sky: { top: 0x3d8fe0, bottom: 0xd6ecff }, fog: { color: 0xd6ecff, near: 70, far: 330 },
  killY: -30,
  spawn: { pos: V(0, 0.1, 8), yaw: Math.PI },
  build(game, B, opts) {
    const ctx = { spawns: {}, npcs: {}, windows: [] };
    const H = height;
    B.terrain({ size: 300, seg: 150, height: H, color: grassColor(pathAmt) });
    // plaza
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.3, 0.3, 40), mat('cobble'));
    plaza.position.y = -0.1; plaza.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 6)); B.add(plaza, true, false);
    B.cruceiro(0, 0.05, 0, 1);
    // benches around plaza
    for (const a of [0.6, 2.2, 3.8, 5.3]) {
      const x = Math.cos(a) * 10, z = Math.sin(a) * 10;
      B.box(x, 0, z, 2.4, 0.5, 0.7, 'granite', { ry: -a + Math.PI / 2 });
    }

    // --- Anceu Coliving: the big house with the long table ---
    const casa = B.stoneHouse(0, 0, -26, 14, 9, 5.5, 0, { plaster: true, roofH: 2.6, shutter: 0x2f5f8f, doorX: -3 });
    ctx.windows.push(...casa.userData.windows);
    // extra upstairs windows
    for (const x of [-5, -1, 3, 5.4]) { const w = new THREE.Mesh(boxGeo(0.9, 1, 0.1), mat('window').clone()); w.position.set(x, 4.1, -21.47); B.group.add(w); ctx.windows.push(w); }
    const casaSign = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.9), new THREE.MeshBasicMaterial({ map: textTex('ANCEU COLIVING', '#2b1a10', '#efe2c0'), transparent: false }));
    casaSign.position.set(1.5, 3.0, -21.45); B.group.add(casaSign);
    // long table
    B.box(0, 0, -16, 12, 0.85, 1.4, 'wood', { tex: 1 });
    for (const s of [-1, 1]) B.box(0, 0, -16 + s * 1.3, 12, 0.45, 0.45, 'wood', { tex: 1 });
    ctx.tableItems = new THREE.Group(); B.group.add(ctx.tableItems);
    for (let i = 0; i < 8; i++) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.25, 10), colorMat([0xe0b080, 0xc05030, 0xf0e0c0][i % 3])); pot.position.set(-5 + i * 1.4, 0.98, -16 + (i % 2 ? 0.3 : -0.3)); ctx.tableItems.add(pot);
    }
    ctx.tableItems.visible = false;
    // vegetable patch (horta)
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
      const cab = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), colorMat(r % 2 ? 0x5fa040 : 0x3f8a5a)); cab.position.set(12 + i * 1.5, 0.35 + H(12 + i * 1.5, -30 + r * 2), -30 + r * 2); cab.castShadow = true; B.group.add(cab);
    }
    B.box(15.75, 0, -26.2, 9.5, 0.4, 0.3, 'wood', { tex: 1 }); B.box(15.75, 0, -31.5, 9.5, 0.4, 0.3, 'wood', { tex: 1 });

    // --- Church with espadana (bell gable) ---
    B.church(-28, 0, -4, Math.PI / 2);
    // scaffolding (the village is always repairing something)
    const scaf = [[-32, 1.3, 1.6], [-29.6, 2.6, 1.6], [-27.2, 3.9, 1.6], [-24.8, 5.2, 1.6]];
    for (const [x, y, z] of scaf) {
      B.box(x, y - 0.25, z, 2.2, 0.25, 1.8, 'wood', { tex: 1 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(x + sx * 1, 0, z + sz * 0.8, 0.07, 0.07, y, 'wood', 5, { collide: false });
    }
    game.spawn(new Sign(game, V(-34, H(-34, 4), 4), Math.PI * 0.75, ['Scaffolding — mind your paws!', 'The espadana is being repaired by the neighbours, colivers and one very determined goat.'], 'Obras'));

    // --- Hórreos ---
    B.horreo(18, 0, -10, 0.2, 6);
    B.horreo(24, 0, 10, Math.PI / 2 + 0.1, 5);
    B.horreo(-18, H(-18, 30) - 0.2, 30, 0.3, 7);
    B.horreo(10, H(10, -36), -36, 0, 5);

    // --- Village houses ---
    const houses = [[16, -22, 7, 6, 0.1], [28, -22, 6, 5, -0.3], [-14, -20, 6, 6, 0.4], [26, 22, 7, 5, Math.PI + 0.3], [-26, 16, 6, 5, Math.PI / 2 + 0.2], [8, 26, 6, 5, Math.PI - 0.1], [-6, 34, 5, 5, Math.PI + 0.4], [-38, -20, 6, 5, 0.9]];
    for (const [x, z, w, d, ry] of houses) {
      const hs = B.stoneHouse(x, H(x, z) - 0.1, z, w, d, 3.2 + (w > 6 ? 0.6 : 0), ry, { plaster: Math.random() < 0.35, shutter: [0x2e6b4f, 0x8a3a2a, 0x2f5f8f][Math.floor(Math.random() * 3)] });
      ctx.windows.push(...hs.userData.windows);
    }
    // lavadoiro + parra + stone walls
    B.lavadoiro(-12, 0, 22, 0.3);
    B.parra(18, 0, 30, 7, 4);
    B.parra(-30, H(-30, -26), -26, 6, 4);
    B.stoneWall(-40, 6, -40, 30, 0, 1); B.stoneWall(40, 26, 20, 40, 0, 1.0);
    B.stoneWall(-8, -36, -30, -34, 0, 1.0);

    // --- Trees: carballos & castiñeiros around the village ---
    const treeSpots = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 12 && z < -40) continue; // keep north road clear
      treeSpots.push([x, z]);
    }
    treeSpots.push([-8, 14], [36, -30], [-40, 0], [32, 34], [-30, 34], [14, 40]);
    for (const [x, z] of treeSpots) B.tree(x, H(x, z) - 0.2, z, Math.random() < 0.5 ? 'chestnut' : 'oak', 0.8 + Math.random() * 0.5);
    B.flowers(0, 0, 45, 260, H);
    B.grassTufts(0, 0, 60, 900, H, 0x5d9b3c, (x, z) => pathAmt(x, z) < 0.5 && Math.hypot(x, z) > 14);
    B.clouds(16, 200, 70);
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, r = 30 + Math.random() * 60; B.rock(Math.cos(a) * r, H(Math.cos(a) * r, Math.sin(a) * r), Math.sin(a) * r, 0.6 + Math.random() * 1.2); }

    // --- Se's mural wall: doors to the worlds ---
    B.box(39, 0, 0, 2, 8, 46, 'granite');
    const murals = [
      { level: 'river', title: 'O Río Verdugo', need: 0, total: 5, paint: paintRiver, z: -13 },
      { level: 'forest', title: 'A Fraga dos Trasnos', need: 3, total: 5, paint: paintForest, z: 0 },
      { level: 'mountain', title: 'Monte da Fibra', need: 7, total: 5, paint: paintMountain, z: 13 },
    ];
    for (const m of murals) {
      game.spawn(new MuralPortal(game, V(37.85, 0, m.z), -Math.PI / 2, { ...m, w: 6.5, h: 4.8 }));
      ctx.spawns['from-' + m.level] = { pos: V(33, 0.2, m.z), yaw: -Math.PI / 2 };
    }
    // ladders of paint pots & a ledge on the wall top
    B.box(36.5, 0, 22, 2, 1.2, 2, 'wood', { tex: 1 });
    B.box(36.5, 0, 25, 2, 2.6, 2, 'wood', { tex: 1 });

    // --- North road: fog gate and Don Baleiro's door ---
    game.spawn(new FogGate(game, V(0, H(0, -58), -58), 18, 9, 0, 12));
    game.spawn(new BossDoor(game, V(0, H(0, -80), -80)));
    ctx.spawns['from-boss'] = { pos: V(0, 0.2, -48), yaw: 0 };
    const tower = makeGreyTower(140); tower.position.set(0, 0, -300); game.addObj(tower); ctx.tower = tower;
    game.spawn(new Sign(game, V(4, H(4, -46), -46), 0, ['NORTH: Monte da Fibra & Torre Baleira.', '"Property of BALEIRO CORP. Villages beyond this point will be optimised."'], 'Signpost'));

    // --- Collectibles ---
    const nuts = [...ringOf(8, 0, 0, 0, 7), ...lineOf(6, V(4, 0, -4), V(30, 0, -4)), ...lineOf(5, V(-4, 0, 6), V(-10, 0, 20)), ...ringOf(6, 18, 0, -10, 5), ...lineOf(5, V(-8, 0, -40), V(-28, 0, -38))];
    for (const p of nuts) { p.y = H(p.x, p.z); game.spawn(new Chestnut(game, p)); }
    // chestnuts up the scaffolding and on the roof
    for (const [x, y, z] of scaf) game.spawn(new Chestnut(game, V(x, y, z)));
    game.spawn(new Crate(game, V(6, 0, -12))); game.spawn(new Crate(game, V(-6, 0, -12), 4)); game.spawn(new Crate(game, V(30, 0, 4)));

    // Spark 1: atop the espadana of the church
    game.spawn(new Spark(game, 'hub-1', V(-21.7, 12.4, -4), { title: 'The Bell Gable' }));
    // Spark 2: clear Don Baleiro's drones from the village
    if (!game.save.sparks.includes('hub-2') && game.flag('introDone')) {
      for (const p of [V(10, 0, 14), V(-16, 0, 6), V(22, 0, -16), V(-20, 0, -14), V(4, 0, 32)]) game.spawn(new Baleirino(game, p, { tag: 'hub', speed: 2.8 }));
      ctx.tagCounts = { hub: 'Drones in the village' };
    }
    ctx.onTagCleared = (tag, pos) => { if (tag === 'hub') { pos.y = Math.max(pos.y, 0); game.ui.toast('The village is drone-free!'); game.spawnSparkCinematic('hub-2', pos, 'Drone-Free Village'); } };
    // Spark 3: the button in the horta -> spark atop the hórreo
    game.spawn(new PoundSwitch(game, V(20, H(20, -34), -34), () => {
      if (!game.save.sparks.includes('hub-3')) game.spawnSparkCinematic('hub-3', V(10, H(10, -36) + 5, -36), 'Hórreo Hideaway');
    }));

    // --- Villagers ---
    const prog = game.sparkCount();
    const T = (name, look, pos, ry, talk, anim) => { const n = new NPC(game, pos, { name, look, model: look.model, ry, talk, anim }); ctx.npcs[name] = n; return game.spawn(n); };
    T('Rosario', { skin: 0xe4b896, shirt: 0x2b2b30, skirt: 0x1d1d22, hair: 0xdddddd, hairStyle: 'bun', prop: 'cane', hat: 'scarf', hatColor: 0x222222, scale: 0.92 }, V(3, 0.05, 3.5), Math.PI * 0.8, async g => {
      const n = g.sparkCount();
      if (n >= 18) await g.say('Rosario', ['Every Faísca home. Now there is only one thing left.', 'Go up to that grey tower and remind that man what a village is.'], 300);
      else if (n >= 12) await g.say('Rosario', ['Twelve sparks! I can feel it in my knees, Pepe — the seal on the north door will break now.', 'Don Baleiro is waiting at the top of his tower. Go carefully, but go.'], 300);
      else await g.say('Rosario', ['Ai, Pepiño. Look at everyone, packing their bags.', 'Listen to an old woman: a village doesn\'t die when people leave. It dies when it forgets.', 'If each of us brings a little, things change — together. Even you, dog.', `You have ${n} Faíscas. Twelve should break the seal on Don Baleiro's door.`], 300);
    });
    T('Rosa', { model: 'rosa', skin: 0xe8b48f, shirt: 0xc75a7a, pants: 0x3b3b4f, hair: 0x6a3a1a, hairStyle: 'long', apron: 0xf4efe2 }, V(-1.5, 0, -20.2), 0, async g => {
      g.player.health = g.player.maxHealth; g.updateHUD(); audio.sfx('heal');
      await g.say('Rosa', [g.sparkCount() < 6 ? 'Pepe! Come in, come in, the house is cold without the sparks… but there\'s always caldo for you.' : 'The house feels warmer with every Faísca you bring. I lit the fire again!', '(Rosa gives Pepe a bowl of caldo. Health fully restored!)', 'Keeper of the cosy house, that\'s me. Now go — and wipe your paws when you come back.'], 420);
    });
    T('Africa', { model: 'africa', skin: 0xd9a37e, shirt: 0xf2b134, pants: 0x2d4a6a, hair: 0x1a1210, hairStyle: 'curly' }, V(4, 0, -14), Math.PI, async g => {
      const s = id => `${g.levelSparkCount(id)}/${{ hub: 3, river: 5, forest: 5, mountain: 5 }[id]}`;
      await g.say('Africa', ['I\'m making the magic happen — or I was, until the magic got stolen.', `Here's the plan, Pepe. Village: ${s('hub')} · River: ${s('river')} · Forest: ${s('forest')} · Mountain: ${s('mountain')}.`, g.sparkCount() < 3 ? 'Start with Se\'s river mural on the east wall. You\'ll need 3 Faíscas to open the forest one.' : g.sparkCount() < 7 ? 'The forest mural is open! The mountain one needs 7 sparks.' : 'All murals are open. Twelve sparks for the north door!'], 560);
    });
    T('Agustín', { model: 'agustin', skin: 0xe2b08a, shirt: 0x3d6b3a, pants: 0x4a3a2a, hair: 0x3a2a1a, beard: true, glasses: true, prop: 'laptop' }, V(-7.2, 0, -12), 0.6, async g => {
      if (!g.flag('tutorial')) {
        g.flag('tutorial', true);
        await g.say('Agustín', ['Pepe! The fibre is down, the router is sad, and Don Baleiro took every Faísca. Classic Tuesday.', 'Quick hacker briefing: WASD or the stick to move. SPACE to jump — chain three jumps while running for a big triple jump!', 'SHIFT while running + SPACE: long jump. SHIFT standing + SPACE: backflip. SHIFT in the air: ground pound.', 'J or click: spin attack. Jump into a wall and press SPACE again to wall-kick. Run into a ledge to climb it.', 'Mouse (click to capture) or Q / R rotate the camera. Problems are opportunities. Now go hack reality!'], 260);
      } else if (!g.save.sparks.includes('hub-2')) await g.say('Agustín', ['Don Baleiro left grey drones snooping around the village. Their firmware is… rude.', 'Stomp all of them and I bet a Faísca will pop out. Hack the planet!'], 260);
      else await g.say('Agustín', ['Want the controls again? Pause with ESC and check "Controls".', 'Oh, and the hórreo by the horta… someone hid a button in the vegetable patch. Ground pound it!'], 260);
    }, 'laptop');
    T('Se', { model: 'se', skin: 0xf0c4a0, shirt: 0x7a4fd0, pants: 0x222222, hair: 0xd0453a, hairStyle: 'curly', prop: 'brush', hat: 'beret', hatColor: 0x222244 }, V(34.5, 0, -6.5), -Math.PI / 2, async g => {
      await g.say('Se', ['Artista da pista, at your service! I painted these murals with the neighbours last summer.', 'When the Faíscas were stolen, the paint started to shimmer… They\'re doors now, Pepe! Doors to the places in the paintings.', 'Just run into one. The grey ones are still asleep — they need more sparks to wake up.'], 640);
    }, 'paint');
    T('O Panadeiro', { skin: 0xe8b48f, shirt: 0xffffff, pants: 0x6a6a6a, hair: 0x222222, beard: true, beardColor: 0x333333, hat: 'chef', prop: 'basket', scale: 1.05 }, V(-9, 0, 2), Math.PI / 2, async g => {
      await g.say('O Panadeiro', ['Bread at nine o\'clock, every morning, for forty years. Until today!', 'The grey wind blew my loaves all the way down to the Verdugo river. Eight of them!', 'Find all eight and I\'m sure something good will happen. Bread always brings people together.'], 220);
    });
    T('Rosabel', { model: 'rosabel' }, V(6.5, 0, -18.5), -2.6, async g => {
      await g.say('Rosabel', ['Pepe! Paws off the clean floor, I just mopped it!', 'Fresh sheets, clean rooms, new colivers arriving every week… I keep this house shining.', 'But that grey fog gets into everything. Bring the Faíscas back and even the windows will sparkle again.'], 380);
    });
    T('Nacho', { model: 'nacho' }, V(-9.8, 0, -9.6), 1.2, async g => {
      await g.say('Nacho', ['Nacho here! I\'m mapping every path around Anceu, from the mills to the reservoir.', 'Since the grey fog came, half my map is just… blank. Every Faísca you find puts a bit of it back.'], 250);
    });
    T('Kenji', { skin: 0xf0d0a8, shirt: 0x334455, pants: 0x223344, hair: 0x111111, prop: 'laptop' }, V(-3, 0, -16.4), 0, async g => {
      await g.say('Kenji (coliver)', g.sparkCount() < 9 ? ['I came for two weeks and stayed three months. I was going to leave today…', 'Funny. I can\'t remember why I wanted to. Something about efficiency?'] : ['I unpacked my bags! Sourdough workshop is back on tomorrow.'], 480);
    }, 'laptop');
    T('Maya', { skin: 0x8a5a3c, shirt: 0x2fa58f, pants: 0x553344, hair: 0x1a1210, hairStyle: 'long' }, V(12, H(12, 18), 18), -2.2, async g => {
      await g.say('Maya (coliver)', ['Every afternoon we clear the river or paint a wall with the neighbours. Two hours. Best part of the day.', 'Without the Faíscas, nobody wants to do anything. It\'s like a grey Monday that never ends.'], 600);
    });
    T('Manolo', { skin: 0xd8a080, shirt: 0x7a5a3a, pants: 0x333344, hair: 0xaaaaaa, hat: 'cap', hatColor: 0x2a3a5a, prop: 'staff' }, V(-14, 0.75, 26), 2.5, async g => {
      await g.say('Manolo', ['This is the lavadoiro. My mother washed clothes here, and her mother before her.', 'The young ones laughed at it. Now they film it for the "Pegadas do Recordo" project. Stories of the village!', 'Hmph. At least somebody\'s listening.'], 240);
    });

    // Mood: the village gets greyer the fewer sparks are home
    ctx.setMood = k => {
      const grey = new THREE.Color(0x8e959c), blue = new THREE.Color(0x3d8fe0), bgrey = new THREE.Color(0xb8bec4), bblue = new THREE.Color(0xd6ecff);
      game.sky.material.uniforms.top.value.copy(grey).lerp(blue, k);
      game.sky.material.uniforms.bottom.value.copy(bgrey).lerp(bblue, k);
      game.fog.color.copy(bgrey).lerp(bblue, k); game.fog.far = 140 + k * 190; game.fog.near = 30 + k * 40;
      game.sun.intensity = 1.2 + k * 1.4; game.hemi.intensity = 0.8 + k * 0.3;
    };
    ctx.setWindows = on => ctx.windows.forEach(w => { w.material.emissiveIntensity = on ? 1.4 : 0; w.material.color.set(on ? 0xffd36b : 0x2a3340); });
    ctx.setMood(game.flag('introDone') ? Math.min(1, 0.25 + prog / TOTAL * 0.75) : 1);
    ctx.setWindows(game.flag('introDone') ? prog >= 9 : true);

    ctx.update = (dt, t) => { if (ctx.tower) ctx.tower.userData.eye.material.color.setHSL(0, 1, 0.45 + Math.sin(t * 3) * 0.1); };
    ctx.onEnter = async o => {
      if (o.quiet) return;
      game.ui.bigText('ANCEU', 'The village', 2200);
    };
    return ctx;
  },
};

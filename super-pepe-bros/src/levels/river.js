// O RÍO VERDUGO — the river valley below Anceu.
import * as THREE from 'three';
import { mat, colorMat, boxGeo } from '../kit.js';
import { Chestnut, Bread, NPC, Sign, Baleirino, Bug, Spark, Crate, PoundSwitch, MovingPlatform, Checkpoint, ExitRing, Entity } from '../entities.js';
import { smooth, noise2, V, grassColor, ringOf, lineOf } from './util.js';
import { audio } from '../audio.js';
import { fx } from '../fx.js';
import { wait } from '../ui.js';

const WATER = -1.2;
const riverZ = x => Math.sin(x * 0.035) * 7;
function height(x, z) {
  const d = Math.abs(z - riverZ(x));
  let h = noise2(x, z) * 0.6 * smooth(10, 16, d);
  h += smooth(38, 70, Math.abs(z)) * 18 + smooth(-80, -110, x) * 15;
  h -= 6 * smooth(10, 6, d) * smooth(70, 66, x);       // the river channel
  // plateau above the fervenza (waterfall)
  const plat = smooth(69, 71, x);
  h = h * (1 - plat) + plat * (16 + noise2(x, z) * 0.4 + smooth(38, 60, Math.abs(z)) * 10 - 1.2 * smooth(7, 4, d));
  return h;
}
function pathAmt(x, z) {
  const d = Math.abs(z - riverZ(x));
  return d > 9 && d < 12 ? 0.6 : 0;
}

class Trout extends Entity { // decorative jumping trout
  constructor(game, x) {
    super(game); this.x = x; this.t = Math.random() * 4;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), colorMat(0xc89060, { metalness: 0.4, roughness: 0.3 })); body.scale.set(0.5, 0.55, 1.4); g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), colorMat(0xa07040)); tail.position.z = -0.6; tail.rotation.x = -Math.PI / 2; g.add(tail);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.04), colorMat(0xd03020)); sp.position.set(0.16, 0.05 + (i % 2) * 0.08, -0.3 + i * 0.13); g.add(sp); }
    this.obj = g; game.scene.add(g); g.visible = false;
  }
  update(dt) {
    this.t -= dt;
    if (this.t < 0) {
      const k = -this.t / 1.0;
      if (k > 1) { this.t = 2 + Math.random() * 5; this.x = -60 + Math.random() * 110; this.obj.visible = false; fx.splash(this.obj.position, 4); return; }
      if (!this.obj.visible) { this.obj.visible = true; this.z0 = riverZ(this.x); fx.splash(V(this.x, WATER, this.z0), 4); }
      const x = this.x + k * 3;
      this.obj.position.set(x, WATER + Math.sin(k * Math.PI) * 2.2, riverZ(x));
      this.obj.rotation.set(-Math.cos(k * Math.PI) * 1.0, Math.PI / 2, 0);
    }
  }
}

export default {
  id: 'river', name: 'O Río Verdugo', subtitle: 'Clear the river · Find the bread', music: 'river', sparks: 5,
  sky: { top: 0x3a8ee6, bottom: 0xd8f0ff }, fog: { color: 0xd8f0ff, near: 80, far: 360 },
  killY: WATER - 0.5,
  spawn: { pos: V(-62, 0.3, 22), yaw: Math.PI / 2 },
  build(game, B) {
    const ctx = { spawns: {} };
    const H = height;
    B.terrain({ size: 260, seg: 170, height: H, color: grassColor(pathAmt), x: 0, z: 0 });
    B.waterPlane(-20, WATER, 0, 180, 40, { flow: [0.06, 0.0] });
    B.waterPlane(95, 15.4, 0, 60, 30, { flow: [0.06, 0] });
    // the fervenza: a vertical granite cliff with the waterfall
    B.box(70, -7, 0, 2.4, 23, 120, 'granite', { tex: 3 });
    B.waterfall(68.75, WATER, riverZ(69), 9, 16.6, -Math.PI / 2);
    // spray
    ctx.update = (dt, t) => { if (Math.random() < dt * 20) fx.spawn(V(67.5, WATER + 0.2, riverZ(69) + (Math.random() - 0.5) * 8), V(-1 - Math.random(), 2 + Math.random() * 2, 0), 0.9, 1.2, 0xffffff, { grow: 2, opacity: 0.6, drag: 1 }); };

    // --- The old stone bridge (like the 16th-century bridge of Caldelas) ---
    B.archBridge(0, -6, 0, 30, 4, 7.5, 4, Math.PI / 2);
    B.ramp(0, 0, 17.2, 4, 1.5, 4.4, Math.PI);
    B.ramp(0, 0, -17.2, 4, 1.5, 4.4, 0);
    game.spawn(new Spark(game, 'river-1', V(0, 1.5 + 2.2, 0), { title: 'The Old Bridge' }));

    // --- Stepping stones across the river (east) ---
    const stones = [];
    for (let i = 0; i < 7; i++) {
      const x = 26 + (i % 2) * 1.5, z = 12 - i * 3.6 + riverZ(26);
      B.cyl(x, -7, z, 0.9, 1.15, 7.0 + (i % 3) * 0.25, 'rock', 9);
      stones.push(V(x, 0.25 + (i % 3) * 0.25, z));
    }
    // log rafts (west)
    game.spawn(new MovingPlatform(game, [V(-40, -0.75, riverZ(-40) + 11), V(-40, -0.75, riverZ(-40) - 11)], { w: 3.2, d: 2.4, h: 0.6, speed: 2.4 }));
    game.spawn(new MovingPlatform(game, [V(-47, -0.75, riverZ(-47) - 11), V(-47, -0.75, riverZ(-47) + 11)], { w: 3.2, d: 2.4, h: 0.6, speed: 2.0 }));
    game.spawn(new Sign(game, V(-43, H(-43, 15), 15), 0, ['RAFT CROSSING', 'Ride the logs to the north bank. Mind the current: the Verdugo is cold!'], 'Sign'));

    // --- North bank: the watermill (muíño) ---
    const millX = -26, millZ = riverZ(-26) - 15;
    B.mill(millX, H(millX, millZ) - 0.1, millZ, Math.PI);
    // mill race & sluice tower with the switch
    B.box(millX + 7, H(millX + 7, millZ), millZ + 2, 2.6, 1.3, 2.6, 'granite');
    B.box(millX + 9.5, H(millX + 9.5, millZ), millZ + 4.5, 2.6, 2.7, 2.6, 'granite');
    B.box(millX + 12, H(millX + 12, millZ), millZ + 1.5, 2.8, 4.2, 2.8, 'granite');
    const swPos = V(millX + 12, H(millX + 12, millZ) + 4.2, millZ + 1.5);
    game.spawn(new PoundSwitch(game, swPos, () => {
      game.ui.toast('The sluice opens — the mill wheel turns again!');
      ctx.millFast = true;
      if (!game.save.sparks.includes('river-3')) game.spawnSparkCinematic('river-3', V(millX, H(millX, millZ) + 5.2, millZ), "The Miller's Wheel");
    }));
    game.spawn(new NPC(game, V(millX + 4, H(millX + 4, millZ + 4), millZ + 4.5), { name: 'Carme', ry: Math.PI, look: { skin: 0xe4b896, shirt: 0x9a3b3b, skirt: 0x2b2b44, hair: 0x555555, hairStyle: 'bun', apron: 0xe8e0d0 }, talk: async g => {
      await g.say('Carme a muiñeira', ['This mill has ground corn for three hundred years. Today the wheel barely turns.', 'Don Baleiro\'s drones jammed the sluice gate! There\'s a big blue button on top of that stone tower.', 'Give it a proper ground pound — jump, then SHIFT in the air. Thump!'], 300);
    } }));
    game.spawn(new Crate(game, V(millX - 5, H(millX - 5, millZ + 4), millZ + 4)));

    // --- South bank: hórreo, fisherman & volunteers ---
    B.horreo(-18, H(-18, 26) - 0.2, 26, 0.2, 6);
    game.spawn(new NPC(game, V(-30, H(-30, 13), 13), { name: 'Paco', ry: Math.PI * 0.9, look: { skin: 0xd8a080, shirt: 0x5a7a3a, pants: 0x3a3a2a, hair: 0x888888, hat: 'cap', hatColor: 0x3a5a2a, prop: 'staff', beard: true, beardColor: 0x999999 }, talk: async g => {
      await g.say('Paco o pescador', ['Shh! You\'ll scare the trout.', 'Ponte Caldelas has held the Festa da Troita since 1967. Best trout in Galicia, from this very river.', 'But those grey drones and their beetles are dumping rubbish in the water. The fish are furious.'], 220);
    } }));
    game.spawn(new NPC(game, V(-50, H(-50, 18), 18), { name: 'Lucía', ry: Math.PI / 2, anim: 'wave', look: { skin: 0xf0c8a0, shirt: 0x2f9fd0, pants: 0x2a3a5a, hair: 0x8a4a1a, hairStyle: 'long', hat: 'cap', hatColor: 0xffd23a } }, ));
    const lucia = game.entities[game.entities.length - 1];
    lucia.talk = async g => {
      const left = g.entities.filter(e => !e.dead && e.tag === 'bugs').length;
      if (g.save.sparks.includes('river-5')) return g.say('Lucía', ['The river is clean again! Every afternoon, two hours, together. That\'s how it\'s done.'], 600);
      await g.say('Lucía', ['Hi Pepe! I\'m with the river clean-up crew — village projects, every afternoon!', `Don Baleiro's escaravellos are polluting the Verdugo. ${left} of them are still crawling along the banks.`, 'Stomp them all and I\'m sure the river will thank you with something shiny.'], 600);
    };

    // --- The climb to the top of the fervenza ---
    const steps = [[63.5, 22, 1.6], [65, 26, 3.4], [64, 30, 5.4], [65.2, 34, 7.4]];
    for (const [x, z, h] of steps) B.box(x, H(x, z) - 0.5, z, 3, h + 0.5, 3, 'granite');
    game.spawn(new MovingPlatform(game, [V(67.1, 7.6, 38.5), V(67.1, 15.1, 38.5)], { w: 3, d: 3, h: 0.5, speed: 2.2, mat: 'wood' }));
    game.spawn(new Checkpoint(game, V(60, H(60, 22), 22)));
    game.spawn(new Sign(game, V(58, H(58, 18), 18), -Math.PI / 2, ['A FERVENZA', 'Climb the old quarry steps to the top of the waterfall. The lift was built by Rural Hackers volunteers (it mostly works).'], 'Sign'));
    // on the plateau
    game.spawn(new Spark(game, 'river-2', V(92, H(92, riverZ(92) + 7) + 0.6, riverZ(92) + 7), { title: 'Top of the Fervenza' }));
    B.rock(92, H(92, riverZ(92) + 7) - 0.4, riverZ(92) + 7, 1.6);
    for (const p of lineOf(5, V(75, 0, 20), V(88, 0, 12))) { p.y = H(p.x, p.z); game.spawn(new Chestnut(game, p)); }
    for (let i = 0; i < 6; i++) B.tree(78 + i * 6, H(78 + i * 6, -14) - 0.2, -14 - (i % 2) * 6, 'pine', 0.9);

    // --- Bugs to clean up (quest) & drones ---
    const bugSpots = [[-55, 12, -48, 12], [-20, 12, -10, 12], [14, -14, 22, -14], [36, 14, 46, 13], [-10, -13, -2, -15], [44, -12, 52, -10]];
    for (const [ax, az, bx, bz] of bugSpots) game.spawn(new Bug(game, V(ax, H(ax, az), az), { to: V(bx, H(bx, bz), bz), tag: 'bugs' }));
    ctx.tagCounts = { bugs: 'Polluting beetles' };
    ctx.onTagCleared = (tag, pos) => { if (tag === 'bugs' && !game.save.sparks.includes('river-5')) { pos.y = H(pos.x, pos.z); game.ui.toast('The Verdugo runs clean again!'); game.spawnSparkCinematic('river-5', pos, 'A Clean River'); } };
    for (const p of [V(10, 0, 20), V(-8, 0, -22), V(40, 0, -22), V(30, 0, 22)]) { p.y = H(p.x, p.z); game.spawn(new Baleirino(game, p)); }

    // --- The baker's 8 loaves of bread ---
    const breads = [
      V(0, 1.5, 12),                                 // on the bridge
      stones[3].clone(),                             // on a stepping stone
      V(-43.5, -0.2, riverZ(-43.5)),                 // above the river between rafts
      V(-18, 5.2, 26),                               // on the hórreo roof
      V(millX + 9.5, H(millX + 9.5, millZ) + 2.7, millZ + 4.5), // sluice steps
      V(65.2, 7.4 + H(65.2, 34) - 0.5, 34),          // last climbing step
      V(82, H(82, -14), -14),                        // plateau pines
      V(50, H(50, 26), 26),                          // behind a rock on the south bank
    ];
    for (const p of breads) game.spawn(new Bread(game, p, 'river'));
    ctx.breadSpark = { id: 'river-4', pos: V(-60, H(-60, 30) + 0.2, 30), title: 'Bread at Nine' };
    B.rock(52, H(52, 28), 28, 2.2);

    // --- Scenery ---
    for (let i = 0; i < 80; i++) {
      const x = -110 + Math.random() * 175, z = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 50);
      if (Math.abs(x) < 6 || (x > 55 && x < 72)) continue;
      B.tree(x, H(x, z) - 0.2, z, ['oak', 'chestnut', 'oak', 'pine'][i % 4], 0.8 + Math.random() * 0.5);
    }
    for (let i = 0; i < 20; i++) { const x = -90 + Math.random() * 150, z = riverZ(x) + (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 2); B.rock(x, H(x, z), z, 0.5 + Math.random() * 0.8); }
    B.grassTufts(-10, 0, 90, 1400, H, 0x4f9a3a, (x, z) => Math.abs(z - riverZ(x)) > 10 && x < 66);
    B.flowers(-20, 0, 70, 220, H);
    B.clouds(14, 200, 75);
    for (let i = 0; i < 3; i++) game.spawn(new Trout(game, -40 + i * 30));

    // chestnuts
    for (const p of stones) game.spawn(new Chestnut(game, p.clone().add(V(0, 0.1, 0))));
    for (const p of [...lineOf(6, V(-58, 0, 16), V(-28, 0, 16)), ...ringOf(6, -18, 0, 20, 4), ...lineOf(5, V(0, 1.5, -12), V(0, 1.5, 8)), ...lineOf(6, V(10, 0, -18), V(40, 0, -18))]) {
      if (p.y === 0) p.y = H(p.x, p.z);
      game.spawn(new Chestnut(game, p));
    }
    game.spawn(new Crate(game, V(18, H(18, 20), 20), 4)); game.spawn(new Crate(game, V(-36, H(-36, -20), -20), 4));
    game.spawn(new Checkpoint(game, V(-6, H(-6, 18), 18)));
    game.spawn(new Checkpoint(game, V(-30, H(-30, -18), -24)));

    // exit back to Anceu
    game.spawn(new ExitRing(game, V(-68, H(-68, 26), 26)));

    // mill wheel speed hook
    const baseUpdate = ctx.update;
    ctx.update = (dt, t) => { baseUpdate(dt, t); };

    ctx.onEnter = async () => {
      if (game.flag('seen-river')) return game.ui.bigText('O RÍO VERDUGO', 'Clear the river · Find the bread', 2200);
      game.flag('seen-river', true);
      const pl = game.player; pl.locked = true; game.cam.cinematic = true; game.ui.letterbox(true);
      game.cine.cam(V(-40, 25, 50), V(0, 0, 0), 0);
      game.ui.bigText('O RÍO VERDUGO', 'Clear the river · Find the bread', 3000);
      await game.cine.cam(V(40, 18, 40), V(60, 6, 0), 4.5);
      await game.cine.cam(V(-50, 4, 30), pl.pos.clone().add(V(0, 1, 0)), 2.5);
      await game.say('', ['The baker\'s eight loaves are scattered along the river. Don Baleiro\'s beetles are polluting the water.', 'And somewhere out there, five Faíscas are waiting to go home.'], 500);
      game.ui.letterbox(false); game.cam.cinematic = false; game.cam.snap(pl); pl.locked = false;
    };
    return ctx;
  },
};

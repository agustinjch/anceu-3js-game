// A FRAGA DOS TRASNOS — the enchanted night forest.
import * as THREE from 'three';
import { mat, colorMat } from '../kit.js';
import { Chestnut, NPC, Sign, Baleirino, Bug, Trasno, Spark, Crate, PoundSwitch, BouncePad, MovingPlatform, Checkpoint, ExitRing } from '../entities.js';
import { smooth, noise2, V, segDist, ringOf, lineOf } from './util.js';
import { fx } from '../fx.js';
import { audio } from '../audio.js';
import { wait } from '../ui.js';

const BOG_Y = -8;
function height(x, z) {
  // rolling forest floor, steep hills all around the edge
  const e = Math.max(Math.abs(x) / 62, z > 0 ? z / 62 : -z / 72);
  let h = noise2(x, z) * 1.2 + smooth(0.86, 1.0, e) * 18;
  // the bog: a deep dark band crossing the whole forest
  const m = smooth(-25, -28, z) * smooth(-53, -50, z);
  h = h * (1 - m) + BOG_Y * m;
  return h;
}
function pathAmt(x, z) {
  let p = 0;
  p = Math.max(p, smooth(2.6, 1.2, segDist(x, z, 0, 0, 0, -24)));
  p = Math.max(p, smooth(2.6, 1.2, segDist(x, z, 0, 0, -26, 8)));
  p = Math.max(p, smooth(2.6, 1.2, segDist(x, z, 0, 0, 26, -10)));
  p = Math.max(p, smooth(2.6, 1.2, segDist(x, z, 0, 0, -12, 32)));
  p = Math.max(p, smooth(2.6, 1.2, segDist(x, z, 0, 0, 28, 24)));
  p = Math.max(p, smooth(2.6, 1.2, segDist(x, z, 28, 24, 38, 40)));
  return p;
}
function forestColor() {
  const moss = new THREE.Color(0x2f6a3a), dark = new THREE.Color(0x1d4a2c), dirt = new THREE.Color(0x6a5a40), mud = new THREE.Color(0x2a2a1c), rock = new THREE.Color(0x2c3a30);
  return (x, z, h, ny, out) => {
    out.copy(moss).lerp(dark, (Math.sin(x * 0.27) * Math.sin(z * 0.31) + 1) / 2);
    const p = pathAmt(x, z); if (p > 0) out.lerp(dirt, Math.min(1, p) * 0.8);
    if (h < -1) out.lerp(mud, smooth(-1, -4, h));
    if (ny < 0.75) out.lerp(rock, smooth(0.75, 0.55, ny));
  };
}

export default {
  id: 'forest', name: 'A Fraga dos Trasnos', subtitle: 'The enchanted forest', music: 'forest', sparks: 5,
  sky: { top: 0x0b1230, bottom: 0x24365a }, fog: { color: 0x14243a, near: 18, far: 115 },
  hemi: { sky: 0x6a7ab8, ground: 0x1a2a1a, i: 0.65 }, sunColor: 0x9ab8ff, sunI: 1.2, sunDir: V(-0.35, 0.8, -0.45), exposure: 1.15,
  killY: -4.5,
  spawn: { pos: V(0, 0.2, 0), yaw: Math.PI },
  build(game, B, opts) {
    const H = height;
    const ctx = { spawns: {} };
    ctx.spawns.start = { pos: V(0, H(0, 0) + 0.2, 0), yaw: Math.PI };
    game.sky.material.uniforms.stars.value = 1;
    B.terrain({ size: 170, seg: 140, height: H, color: forestColor(), z: -5 });

    // ---- moon ----
    const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }));
    moon.position.set(-260, 330, -520); game.addObj(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.soft, color: 0x9ab8ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(180); moon.add(halo);

    // ---- the bog with log rafts ----
    B.waterPlane(0, -3.6, -39, 150, 30, { color: 0x355a48, flow: [0.01, 0.015] });
    game.spawn(new Sign(game, V(-4, H(-4, -21), -21), Math.PI, ['THE BOG OF A FRAGA', 'Ride the log rafts across. Do not swim: the bog keeps what it swallows.', '— Uxía a Meiga'], 'Warning'));
    game.spawn(new Checkpoint(game, V(5, H(5, -21), -21)));
    game.spawn(new MovingPlatform(game, [V(-7, -0.2, -29.6), V(7, -0.2, -29.6)], { w: 4, d: 4, h: 0.7, speed: 2.6, mat: 'wood' }));
    game.spawn(new MovingPlatform(game, [V(0, -0.2, -34.2), V(0, -0.2, -41.8)], { w: 4, d: 4, h: 0.7, speed: 2.2, mat: 'wood' }));
    B.cyl(0, -9, -45.6, 1.4, 1.6, 8.8, 'bark', 10);
    B.cyl(1.2, -9, -49.4, 1.2, 1.5, 8.8, 'bark', 10);
    // far bank
    const fz = -57;
    game.spawn(new Checkpoint(game, V(-5, H(-5, -55), -55)));
    B.box(0, H(0, fz) - 1, fz, 3, 2, 3, 'granite');
    game.spawn(new Spark(game, 'forest-2', V(0, H(0, fz) + 1, fz), { title: 'Across the Bog' }));
    game.spawn(new Baleirino(game, V(8, H(8, -56), -56)));
    for (const p of lineOf(4, V(-10, 0, -57), V(-18, 0, -57))) { p.y = H(p.x, p.z); game.spawn(new Chestnut(game, p)); }
    // chestnuts floating over the rafts' route
    for (const p of [V(0, 0.6, -29.6), V(0, 0.6, -38), V(0, 0.6, -45.6), V(1.2, 0.6, -49.4)]) game.spawn(new Chestnut(game, p));

    // ---- the hórreo tower (west) ----
    const tx = -32, tz = 8, ty = H(tx, tz);
    B.box(tx, ty - 1, tz, 6, 10, 6, 'granite');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, px = tx + Math.cos(a) * 5.2, pz = tz + Math.sin(a) * 5.2, top = ty + 1.1 * (i + 1);
      B.box(px, top - 0.45, pz, 2.6, 0.45, 2.6, 'granite', { ry: -a });
      B.cyl(px, ty - 0.5, pz, 0.25, 0.3, top - 0.45 - ty + 0.5, 'granite', 8, { collide: false });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12), mat('granite')); cap.position.set(px, top - 0.5, pz); B.group.add(cap);
      if (i % 2) game.spawn(new Chestnut(game, V(px, top, pz)));
    }
    B.horreo(tx, ty + 9, tz - 1.2, 0, 3);
    game.spawn(new Spark(game, 'forest-1', V(tx, ty + 9, tz + 1.8), { title: 'Top of the Hórreo Tower' }));
    B.horreo(tx - 8, H(tx - 8, tz + 8), tz + 8, 0.4, 5);
    B.horreo(tx + 4, H(tx + 4, tz + 12), tz + 12, -0.3, 4);
    game.spawn(new Checkpoint(game, V(-22, H(-22, 6), 6)));
    game.spawn(new Bug(game, V(-24, H(-24, 14), 14), { to: V(-24, 0, 0), speed: 2.4 }));

    // ---- the mushroom cliff (east) ----
    const cx = 30, cz = 20, cy = H(cx, cz);
    B.box(cx, cy - 1, cz, 6, 9.5, 6, 'rock');
    B.rock(cx - 3.5, cy, cz - 2, 2.2); B.rock(cx + 3.6, cy, cz + 1, 1.8);
    game.spawn(new BouncePad(game, V(cx, H(cx, cz + 4.5), cz + 4.5), 26));
    game.spawn(new Spark(game, 'forest-3', V(cx, cy + 8.5, cz), { title: 'The Mushroom Ledge' }));
    for (let i = 0; i < 5; i++) game.spawn(new Chestnut(game, V(cx, cy + 3 + i * 1.3, cz + 4.5)));
    game.spawn(new Sign(game, V(cx - 3, H(cx - 3, cz + 6), cz + 6), Math.PI * 0.1, ['Cogumelos de salto!', 'Hold JUMP when you bounce to go higher.'], 'Sign'));

    // ---- trasno clearing ----
    const kx = 28, kz = -10, ky = H(kx, kz);
    for (const p of ringOf(10, kx, 0, kz, 9)) B.rock(p.x, H(p.x, p.z), p.z, 0.7 + Math.random() * 0.5);
    for (const p of [V(kx - 4, 0, kz + 3), V(kx + 5, 0, kz - 2), V(kx + 1, 0, kz + 5), V(kx - 3, 0, kz - 5), V(kx + 4, 0, kz + 4), V(kx, 0, kz - 3)])
      game.spawn(new Trasno(game, p.setY(H(p.x, p.z)), { tag: 'trasnos' }));
    ctx.tagCounts = { trasnos: 'Trasnos' };
    ctx.onTagCleared = (tag, pos) => {
      if (tag !== 'trasnos') return;
      game.ui.toast('The trasnos run off giggling into the dark!');
      if (!game.save.sparks.includes('forest-4')) game.spawnSparkCinematic('forest-4', V(kx, ky + 0.3, kz), 'Trasno Trouble');
    };
    game.spawn(new BouncePad(game, V(kx + 10, H(kx + 10, kz - 8), kz - 8), 18, 0.8));
    game.spawn(new Crate(game, V(14, H(14, -8), -8))); game.spawn(new Crate(game, V(16, H(16, -6), -6), 4));

    // ---- Uxía's cauldron & the eucalyptus invasion (south) ----
    const ux = -12, uz = 34, uy = H(ux, uz);
    const caul = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), colorMat(0x1a1a1a, { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    caul.position.set(ux + 2.2, uy + 0.9, uz); caul.castShadow = true; B.group.add(caul);
    B.cyl(ux + 2.2, uy, uz, 0.9, 0.9, 1.0, new THREE.MeshBasicMaterial({ visible: false }), 10);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.set(ux + 2.2, uy + 1.65, uz); B.group.add(flame);
    const caulLight = new THREE.PointLight(0x4aa0ff, 10, 14, 2); caulLight.position.set(ux + 2.2, uy + 2.4, uz); game.addObj(caulLight);
    for (let i = 0; i < 3; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), mat('bark')); log.position.set(ux + 2.2, uy + 0.15, uz); log.rotation.set(Math.PI / 2, i * 1.05, 0); B.group.add(log); }
    game.spawn(new NPC(game, V(ux, uy, uz), { name: 'Uxía a Meiga', ry: Math.PI / 2, look: { skin: 0xe6c0a0, shirt: 0x3a2a5a, skirt: 0x2a1a3a, hair: 0x9a9a9a, hairStyle: 'long', hat: 'witch', hatColor: 0x2a1a3a, prop: 'staff' }, talk: async g => {
      const done = g.save.sparks.includes('forest-5');
      await g.say('Uxía a Meiga', done
        ? ['The carballos will grow tall and the fraga will drink the rain again. Ben feito, can.', 'Now — a sip of queimada? No? Dogs. Never any fun.']
        : ['Eu non creo nas meigas… pero habelas, hainas! Good evening, little dog.', 'Don Baleiro\'s grey wind blew eucalyptus seeds all over my fraga. They drink the springs dry and burn like matches.', 'Brais from the Green Mission is in the eucalyptus grove to the south-east, planting native carballos.', 'Ground pound the three planting holes and the forest will thank you with a Faísca. That much I can read in the queimada.'], 330);
    } }));
    game.spawn(new Sign(game, V(ux + 4, H(ux + 4, uz - 5), uz - 5), Math.PI, ['QUEIMADA in progress.', 'Mouchos, curuxas, sapos e bruxas… (Do not touch the blue fire.)'], 'Sign'));

    // eucalyptus grove
    const plantSpots = [V(32, 0, 42), V(44, 0, 34), V(46, 0, 48)];
    for (let i = 0; i < 22; i++) {
      const x = 26 + Math.random() * 28, z = 28 + Math.random() * 26;
      if (plantSpots.some(p => Math.hypot(p.x - x, p.z - z) < 3.5) || Math.hypot(x - 38, z - 40) < 2.5) continue;
      B.tree(x, H(x, z) - 0.2, z, 'eucalyptus', 0.9 + Math.random() * 0.4);
    }
    game.spawn(new NPC(game, V(38, H(38, 40), 40), { name: 'Brais (Green Mission)', ry: -2.4, look: { skin: 0xdcae88, shirt: 0x4f8a3a, pants: 0x5a4a32, hair: 0x6a4a2a, hat: 'cap', hatColor: 0x2f6a3a, beard: true }, talk: async g => {
      const n = ctx.planted;
      await g.say('Brais (Green Mission)', g.save.sparks.includes('forest-5')
        ? ['Carballos, castiñeiros, bidueiros… a real fraga again. Thanks, Pepe!']
        : n === 0 ? ['Green Mission, at your service! We take care of the land around Anceu.', 'I dug three planting holes for oak saplings, but the soil is hard as granite.', 'You look like a dog who can ground pound. Jump, then SHIFT in the air — right on the blue stones!'] : [`${n} of 3 planted! Keep going, the other holes are around the grove.`], 450);
    } }));
    ctx.planted = 0;
    const sapling = p => { const t = new THREE.Group(); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 5), mat('bark')); tr.position.y = 0.45; t.add(tr);
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat('leaves')); lf.position.y = 1.0; t.add(lf); t.position.copy(p); t.position.y += 0.62; game.addObj(t); };
    for (const p of plantSpots) {
      p.y = H(p.x, p.z);
      B.box(p.x, p.y, p.z, 1.6, 0.62, 1.6, new THREE.MeshBasicMaterial({ visible: false }), { shadow: false });
      game.spawn(new PoundSwitch(game, p, () => {
        ctx.planted++; sapling(p); fx.sparkle(p.clone().setY(p.y + 1), 14, 0x9aff9a);
        if (ctx.planted < 3) game.ui.toast(`Oak sapling planted! ${ctx.planted}/3`);
        else if (!game.save.sparks.includes('forest-5')) { game.ui.toast('All three carballos planted!'); game.spawnSparkCinematic('forest-5', V(38, H(38, 43), 43), 'The Green Mission'); }
      }));
    }
    game.spawn(new Checkpoint(game, V(24, H(24, 26), 26)));
    game.spawn(new Bug(game, V(30, H(30, 32), 32), { to: V(50, 0, 32), speed: 3, color: 0x6a3a8a }));
    game.spawn(new Baleirino(game, V(46, H(46, 42), 42)));

    // ---- Santa Compaña: a silent candle procession ----
    const proc = new THREE.Group(); game.addObj(proc);
    const robe = new THREE.MeshStandardMaterial({ color: 0x0c0c12, transparent: true, opacity: 0.55, roughness: 1 });
    const walkers = [];
    for (let i = 0; i < 6; i++) {
      const w = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.9, 8), robe); body.position.y = 0.95; w.add(body);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), robe); hood.position.y = 1.95; w.add(hood);
      const candle = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.soft, color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      candle.position.set(0.35, 1.35, 0.25); candle.scale.setScalar(0.6); w.add(candle);
      proc.add(w); walkers.push({ w, candle, off: i * 2.2 });
    }
    const procLight = new THREE.PointLight(0xffb050, 6, 12, 2); game.addObj(procLight);
    const procPath = t => { const a = t * 0.05; return V(-14 + Math.cos(a) * 12, 0, -8 + Math.sin(a) * 9); };
    game.spawn(new Sign(game, V(-6, H(-6, -4), -4), -0.6, ['If at midnight you see a line of candles walking through the fraga…', '…that is the Santa Compaña. Do not follow them. Do not take a candle. Definitely do not bark at them.'], 'Old Sign'));

    // ---- wisps over the bog ----
    const wisps = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.soft, color: 0x8affd0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(1.4); game.addObj(s); wisps.push(s);
    }

    // ---- fireflies ----
    const N = 260, ffPos = new Float32Array(N * 3), ffBase = [];
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 110, z = -20 + Math.random() * 75; const y = H(x, z) + 0.5 + Math.random() * 3; ffBase.push([x, y, z, Math.random() * 6]); }
    const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ff = new THREE.Points(ffGeo, new THREE.PointsMaterial({ map: fx.soft, color: 0xd8ff7a, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    game.addObj(ff);

    // ---- trees, mushrooms, rocks ----
    const keep = [[0, 0, 7], [tx, tz, 9], [cx, cz, 8], [kx, kz, 11], [ux, uz, 6], [38, 40, 16], [-14, -8, 14]];
    let placed = 0;
    for (let i = 0; i < 400 && placed < 85; i++) {
      const x = (Math.random() - 0.5) * 120, z = -22 + Math.random() * 82;
      if (pathAmt(x, z) > 0.2 || keep.some(([a, b, r]) => Math.hypot(x - a, z - b) < r)) continue;
      if (x > 24 && z > 26) continue; // eucalyptus grove
      B.tree(x, H(x, z) - 0.2, z, Math.random() < 0.5 ? 'chestnut' : 'oak', 0.9 + Math.random() * 0.6); placed++;
    }
    for (let i = 0; i < 16; i++) { const x = (Math.random() - 0.5) * 140, z = -64 - Math.random() * 6; B.tree(x, H(x, z) - 0.3, z, 'pine', 1.2 + Math.random() * 0.5); }
    const mushM = mat('mushroom'), stemM = mat('stem');
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() - 0.5) * 110, z = -20 + Math.random() * 75; if (pathAmt(x, z) > 0.3) continue;
      const g = new THREE.Group(), s = 0.3 + Math.random() * 0.5;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6), stemM); st.position.y = 0.25; g.add(st);
      const cp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mushM); cp.position.y = 0.45; cp.scale.y = 0.6; g.add(cp);
      g.position.set(x, H(x, z), z); g.scale.setScalar(s); B.group.add(g);
    }
    for (let i = 0; i < 14; i++) { const x = (Math.random() - 0.5) * 100, z = -18 + Math.random() * 70; if (pathAmt(x, z) > 0.3) continue; B.rock(x, H(x, z), z, 0.6 + Math.random()); }
    B.grassTufts(0, 15, 60, 900, H, 0x2f6a3a, (x, z) => pathAmt(x, z) < 0.5 && H(x, z) > -0.5);
    B.flowers(0, 15, 50, 120, H, [0x9f7be0, 0x6ab0ff, 0xffffff]);

    // ---- chestnuts, crates, drones near spawn ----
    for (const p of [...lineOf(5, V(0, 0, -5), V(0, 0, -18)), ...lineOf(5, V(-5, 0, 2), V(-18, 0, 6)), ...lineOf(5, V(5, 0, -2), V(20, 0, -8)), ...lineOf(5, V(-3, 0, 6), V(-10, 0, 26)), ...ringOf(6, 10, 0, 14, 3)]) { p.y = H(p.x, p.z); game.spawn(new Chestnut(game, p)); }
    game.spawn(new Crate(game, V(-6, H(-6, 12), 12), 4)); game.spawn(new Crate(game, V(8, H(8, 22), 22)));
    game.spawn(new Baleirino(game, V(10, H(10, 14), 14)));
    game.spawn(new Bug(game, V(-8, H(-8, -14), -14), { to: V(8, 0, -14), speed: 2.6 }));
    game.spawn(new BouncePad(game, V(-6, H(-6, 4), 4), 16, 0.7));
    game.spawn(new ExitRing(game, V(-6, H(-6, 1), 1)));
    game.spawn(new Sign(game, V(3, H(3, 2.5), 2.5), Math.PI, ['A FRAGA DOS TRASNOS', 'North: the bog. West: the hórreo tower. East: the trasno clearing. South: Uxía\'s cauldron.'], 'Signpost'));

    // ---- animation ----
    ctx.update = (dt, t) => {
      for (let i = 0; i < N; i++) { const b = ffBase[i]; ffPos[i * 3] = b[0] + Math.sin(t * 0.5 + b[3]) * 1.2; ffPos[i * 3 + 1] = b[1] + Math.sin(t * 0.9 + b[3] * 2) * 0.5; ffPos[i * 3 + 2] = b[2] + Math.cos(t * 0.4 + b[3]) * 1.2; }
      ffGeo.attributes.position.needsUpdate = true;
      ff.material.opacity = 0.7 + Math.sin(t * 3) * 0.25;
      flame.scale.set(1 + Math.sin(t * 9) * 0.1, 1 + Math.sin(t * 7) * 0.2, 1 + Math.cos(t * 9) * 0.1);
      caulLight.intensity = 9 + Math.sin(t * 13) * 2 + Math.sin(t * 7) * 1.5;
      let cxs = 0, czs = 0;
      for (const w of walkers) {
        const p = procPath(t - w.off), q = procPath(t - w.off + 0.1);
        w.w.position.set(p.x, H(p.x, p.z) + Math.sin(t * 2 + w.off) * 0.05, p.z);
        w.w.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
        w.candle.scale.setScalar(0.55 + Math.sin(t * 17 + w.off * 5) * 0.08);
        cxs += p.x; czs += p.z;
      }
      procLight.position.set(cxs / 6, H(cxs / 6, czs / 6) + 2, czs / 6);
      procLight.intensity = 5 + Math.sin(t * 11) * 1;
      wisps.forEach((s, i) => { s.position.set(Math.sin(t * 0.4 + i * 3) * 14, -1.5 + Math.sin(t * 1.3 + i) * 0.8, -39 + Math.cos(t * 0.3 + i * 2) * 8); s.material.opacity = 0.6 + Math.sin(t * 5 + i) * 0.3; });
    };

    ctx.onEnter = async o => {
      if (o.quiet) return;
      if (game.flag('seen-forest')) { game.ui.bigText('A FRAGA DOS TRASNOS', 'The enchanted forest', 2200); return; }
      game.flag('seen-forest', true);
      const pl = game.player; pl.locked = true;
      game.ui.letterbox(true); game.cam.cinematic = true;
      const c = game.cine;
      c.look = V(0, 2, -40);
      await c.cam(V(30, 22, -10), V(0, -1, -40), 0);
      c.cam(V(-10, 14, -20), V(0, -1, -45), 4.5);
      await wait(800);
      game.ui.bigText('A FRAGA DOS TRASNOS', 'The enchanted forest', 3000);
      await wait(3700);
      await c.cam(V(-20, 16, 22), V(tx, ty + 7, tz), 3.5);
      await c.cam(V(4, 3.5, 8), V(0, 1.2, 0), 2.5);
      await game.say('', ['A grey wind howls through the oaks… and somewhere in the dark, something giggles.', 'Five Faíscas are hidden in this fraga. Uxía a Meiga lives by the blue fire to the south.'], 600);
      game.ui.letterbox(false); game.cam.cinematic = false; pl.locked = false;
      game.cam.snap(pl);
    };
    return ctx;
  },
};

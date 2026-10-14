import * as THREE from 'three';
import { assets, pbr } from '../../core/assets';
import { audio } from '../../core/audio';
import { t } from '../../core/i18n';
import { save } from '../../core/save';
import { ease } from '../../game/cinematic';
import type { Game, Phase } from '../../game/game';
import type { Npc } from '../../game/npc';
import { Beacon, MemoryOrb, getGlowTex } from '../../game/pegada';
import { ui } from '../../ui/ui';
import { PLACES } from '../../world/world';
import { waterMaterial } from '../../world/atmosphere';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const MUINOS_ID = 'muinos';

/**
 * Fase 1 — Os Muíños: a memoria de Laurita.
 *
 * O muíño de rodicio está parado: a levada que lle trae a auga do regato está pechada
 * e atrancada. Pepe ten que (1) abrir a comporta, (2) subir á levada e apartar a pedra,
 * (3) baixar a panca do canle e (4) entrar no muíño para revivir o recordo.
 */
export class MuinosPhase implements Phase {
  id = MUINOS_ID;
  stage = 0;
  private game!: Game;
  private M!: THREE.Vector3;
  private intake!: THREE.Vector3;
  private chute!: THREE.Vector3;
  private segs: { p: THREE.Vector3; top: number; water: THREE.Mesh }[] = [];
  private gate!: THREE.Mesh;
  private boulder!: THREE.Object3D;
  private boulderCollider: ReturnType<Game['physics']['addBox']> | null = null;
  private lever!: THREE.Group;
  private door!: THREE.Group;
  private stone!: THREE.Mesh;
  private rodicio!: THREE.Group;
  private chuteWater!: THREE.Mesh;
  private splash!: THREE.Points;
  private running = 0;
  private laurita!: Npc;
  private ghostMother!: Npc;
  private ghostChild!: Npc;
  beacon!: Beacon;
  private orb: MemoryOrb | null = null;
  private flour!: THREE.Points;
  private waterTicks: ((t: number) => void)[] = [];

  async setup(game: Game) {
    this.game = game;
    const M = (this.M = PLACES.muinos.clone());
    const hm = game.world.hm;
    const physics = game.physics;
    const scene = game.engine.scene;
    const group = new THREE.Group();
    group.name = 'muinos';
    scene.add(group);
    game.world.vegetation.clearArea(M.x, M.z, 9);

    const [mossy, dry, roofT, wood] = await Promise.all([
      pbr('mossy_stone', 1),
      pbr('drystone', 1),
      pbr('roof_tiles_old', 1),
      pbr('wood_weathered', 1),
    ]);
    const mossMat = new THREE.MeshStandardMaterial({ color: 0xbfc8b0, map: mossy.map, normalMap: mossy.normalMap, roughnessMap: mossy.roughnessMap, roughness: 1 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd0cabd, map: dry.map, normalMap: dry.normalMap, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb98d75, map: roofT.map, normalMap: roofT.normalMap, roughness: 0.9, side: THREE.DoubleSide });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4a33, map: wood.map, normalMap: wood.normalMap, roughness: 0.85 });

    const box = (w: number, h: number, d: number, mat: THREE.Material, p: THREE.Vector3, rotY = 0, collide = true, parent: THREE.Object3D = group) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.copy(p);
      m.rotation.y = rotY;
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      if (collide) physics.addBox(p, V(w / 2, h / 2, d / 2), rotY);
      return m;
    };

    // --- O muíño: planta 5 x 4 m, porta ao sur, canle chegando polo norte ---
    const floorY = M.y;
    const WX = 5;
    const WZ = 4;
    const WH = 2.6;
    const th = 0.45;
    box(WX, WH, th, mossMat, V(M.x, floorY + WH / 2 - 0.3, M.z - WZ / 2)); // muro norte
    box(th, WH, WZ, mossMat, V(M.x - WX / 2, floorY + WH / 2 - 0.3, M.z)); // oeste
    box(th, WH, WZ, mossMat, V(M.x + WX / 2, floorY + WH / 2 - 0.3, M.z)); // leste
    // muro sur con oco de porta
    box(1.9, WH, th, mossMat, V(M.x - 1.55, floorY + WH / 2 - 0.3, M.z + WZ / 2));
    box(1.9, WH, th, mossMat, V(M.x + 1.55, floorY + WH / 2 - 0.3, M.z + WZ / 2));
    box(1.2, 0.5, th, mossMat, V(M.x, floorY + 2.05, M.z + WZ / 2));
    // chan de lousa
    const floor = box(WX - 0.5, 0.2, WZ - 0.5, stoneMat, V(M.x, floorY - 0.05, M.z), 0, true);
    floor.receiveShadow = true;
    // tellado a dúas augas
    const pitch = 0.5;
    const half = WZ / 2 + 0.45;
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(WX + 0.8, half / Math.cos(pitch)), roofMat);
      r.position.set(M.x, floorY + WH - 0.3 + Math.tan(pitch) * half * 0.5, M.z + (s * half) / 2);
      r.rotation.x = s > 0 ? -(Math.PI / 2) + pitch : -(Math.PI / 2) - pitch;
      r.castShadow = r.receiveShadow = true;
      group.add(r);
    }
    // frontóns triangulares
    for (const sx of [-1, 1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-half, 0);
      tri.lineTo(half, 0);
      tri.lineTo(0, Math.tan(pitch) * half);
      const g = new THREE.ExtrudeGeometry(tri, { depth: th, bevelEnabled: false });
      const m = new THREE.Mesh(g, mossMat);
      m.rotation.y = Math.PI / 2;
      m.position.set(M.x + (sx * WX) / 2 - th / 2, floorY + WH - 0.3, M.z);
      m.castShadow = true;
      group.add(m);
    }
    physics.addBox(V(M.x, floorY + WH + 0.3, M.z), V(WX / 2 + 0.3, 0.4, WZ / 2 + 0.3));

    // porta de madeira con bisagra
    this.door = new THREE.Group();
    this.door.position.set(M.x - 0.6, floorY, M.z + WZ / 2);
    box(1.2, 2.0, 0.08, woodMat, V(0.6, 1.0, 0), 0, false, this.door);
    group.add(this.door);
    this.doorCollider = physics.addBox(V(M.x, floorY + 1, M.z + WZ / 2), V(0.6, 1, 0.1));

    // pedras do muíño (moa) e moega
    const millBase = box(1.6, 0.6, 1.6, stoneMat, V(M.x + 0.6, floorY + 0.3, M.z - 0.4));
    millBase.castShadow = true;
    this.stone = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.28, 28), new THREE.MeshStandardMaterial({ color: 0xb8b2a6, map: dry.map, roughness: 0.9 }));
    this.stone.position.set(M.x + 0.6, floorY + 0.74, M.z - 0.4);
    this.stone.castShadow = true;
    group.add(this.stone);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 0.7, 4, 1, true), woodMat);
    hopper.position.set(M.x + 0.6, floorY + 1.55, M.z - 0.4);
    hopper.rotation.y = Math.PI / 4;
    group.add(hopper);
    for (const [dx, dz] of [
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
    ])
      box(0.06, 0.8, 0.06, woodMat, V(M.x + 0.6 + dx, floorY + 1.0, M.z - 0.4 + dz), 0, false);

    // rodicio (roda horizontal) baixo o muíño, visible polo cárcavo do norte
    this.rodicio = new THREE.Group();
    this.rodicio.position.set(M.x + 0.6, floorY + 0.15, M.z - WZ / 2 - 0.9);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10), woodMat);
    this.rodicio.add(hub);
    for (let i = 0; i < 14; i++) {
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.05), woodMat);
      const a = (i / 14) * Math.PI * 2;
      paddle.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      paddle.rotation.y = -a;
      paddle.rotation.x = 0.5;
      this.rodicio.add(paddle);
    }
    group.add(this.rodicio);
    // cárcavo: foxo de pedra baixo o canle
    box(1.9, 0.9, 0.25, stoneMat, V(M.x + 0.6, floorY + 0.25, M.z - WZ / 2 - 1.85), 0, true);
    box(0.25, 0.9, 1.7, stoneMat, V(M.x - 0.35, floorY + 0.25, M.z - WZ / 2 - 1.0), 0, true);
    box(0.25, 0.9, 1.7, stoneMat, V(M.x + 1.55, floorY + 0.25, M.z - WZ / 2 - 1.0), 0, true);

    // --- A levada: do regato (augas arriba) ata o canle traseiro do muíño ---
    this.intake = V(M.x + 15, 0, M.z - 19);
    this.intake.y = hm.at(this.intake.x, this.intake.z);
    this.chute = V(M.x + 0.6, 0, M.z - WZ / 2 - 1.0);
    const topEnd = floorY + 1.55;
    const topStart = Math.max(this.intake.y + 0.35, topEnd + 0.6);
    const N = 12;
    const dir = new THREE.Vector3().subVectors(this.chute, this.intake).setY(0);
    const len = dir.length();
    dir.normalize();
    const rotY = Math.atan2(dir.x, dir.z);
    const water = waterMaterial(new THREE.Vector2(0, -1.2), 0x3a5552);
    water.mat.normalMap!.repeat.set(1, 2);
    this.waterTicks.push(water.tick);
    for (let i = 0; i < N; i++) {
      const k = (i + 0.5) / N;
      const p = new THREE.Vector3().lerpVectors(this.intake, this.chute, k);
      const top = THREE.MathUtils.lerp(topStart, topEnd, k);
      const g = Math.min(hm.at(p.x, p.z), top - 0.3);
      const h = top - g + 0.6;
      const segLen = len / N + 0.05;
      box(1.15, h, segLen, mossMat, V(p.x, top - h / 2, p.z), rotY);
      // rebordes do canle
      for (const s of [-1, 1]) {
        const side = V(-dir.z, 0, dir.x).multiplyScalar(s * 0.45);
        box(0.22, 0.16, segLen, stoneMat, V(p.x + side.x, top + 0.08, p.z + side.z), rotY, false);
      }
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, segLen), water.mat);
      w.position.set(p.x, top + 0.06, p.z);
      w.rotation.y = rotY;
      w.visible = false;
      group.add(w);
      this.segs.push({ p: p.setY(top), top, water: w });
    }
    // canle inclinado que cae sobre o rodicio
    this.chuteWater = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 1.6), water.mat);
    this.chuteWater.position.set(this.chute.x, topEnd - 0.7, this.chute.z - 0.2);
    this.chuteWater.rotation.set(0.9, rotY, 0);
    this.chuteWater.visible = false;
    group.add(this.chuteWater);

    // comporta na toma (táboa de madeira atravesando o regato)
    this.gate = box(1.4, 1.1, 0.12, woodMat, V(this.intake.x, this.intake.y + 0.45, this.intake.z), rotY + Math.PI / 2, false);
    box(0.16, 1.8, 0.16, woodMat, V(this.intake.x + dir.z * 0.75, this.intake.y + 0.9, this.intake.z - dir.x * 0.75), 0, true);
    box(0.16, 1.8, 0.16, woodMat, V(this.intake.x - dir.z * 0.75, this.intake.y + 0.9, this.intake.z + dir.x * 0.75), 0, true);

    // pedra caída na levada
    const bi = Math.floor(N * 0.5);
    const bp = this.segs[bi].p.clone();
    const rocks = await assets.optionalModel('models/env/rock_moss_stylized.glb');
    if (rocks) {
      this.boulder = rocks.scene.clone();
      const b = new THREE.Box3().setFromObject(this.boulder);
      this.boulder.scale.setScalar(0.85 / Math.max(0.01, b.max.y - b.min.y));
      this.boulder.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    } else {
      this.boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), stoneMat);
    }
    this.boulder.position.copy(bp).add(V(0, 0.1, 0));
    group.add(this.boulder);
    this.boulderCollider = physics.addBox(bp.clone().add(V(0, 0.45, 0)), V(0.5, 0.45, 0.5));

    // punto para trepar á levada (polo lado do camiño, cara ao oeste)
    const ci = Math.floor(N * 0.68);
    const cp = this.segs[ci].p.clone();
    const side = V(dir.z, 0, -dir.x); // lado oeste
    const base = cp.clone().addScaledVector(side, 1.15);
    base.y = hm.at(base.x, base.z);
    const topP = cp.clone().addScaledVector(side, 0.1);
    topP.y = this.segs[ci].top + 0.02;
    game.pepe.climbSpots.push({ base, top: topP });

    // panca do canle, no extremo da levada
    this.lever = new THREE.Group();
    const lp = this.segs[N - 1].p.clone().addScaledVector(side, 0.42);
    this.lever.position.copy(lp).add(V(0, 0.1, 0));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), woodMat);
    post.position.y = 0.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), woodMat);
    arm.position.y = 0.45;
    arm.geometry.translate(0, 0.45, 0);
    arm.name = 'arm';
    arm.rotation.z = -0.6;
    this.lever.add(post, arm);
    this.lever.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    group.add(this.lever);

    // salpicaduras e fariña
    const mkPoints = (n: number, color: number, size: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: getGlowTex(), color, size, transparent: true, depthWrite: false, opacity: 0.8 }));
      pts.visible = false;
      pts.frustumCulled = false;
      group.add(pts);
      return pts;
    };
    this.splash = mkPoints(80, 0xdde8ea, 0.12);
    this.flour = mkPoints(120, 0xfff4e0, 0.06);

    // baliza visible desde a aldea
    this.beacon = new Beacon(M.clone().add(V(0, 0, 4)), 45);
    group.add(this.beacon.group);

    // --- personaxes ---
    this.laurita = await game.npc({ model: 'woman', name: 'Laurita', tint: { Head: 0xe0dcd6, Body: 0x8a8f9e, Legs: 0x6b5a50 } }, V(M.x - 2.8, floorY, M.z + 5.2), Math.PI * 0.85);
    this.laurita.root.scale.setScalar(0.94);
    this.ghostMother = (await game.npc({ model: 'woman', name: 'Nai' }, V(M.x - 6, floorY, M.z + 9), 0, false)).makeGhost();
    this.ghostChild = (await game.npc({ model: 'child', name: 'Laurita nena' }, V(M.x - 6.8, floorY, M.z + 9.4), 0, false)).makeGhost();
    this.ghostMother.ghostOpacity = 0;
    this.ghostChild.ghostOpacity = 0;

    game.updaters.push((dt, time) => this.tick(dt, time));

    // --- interaccións ---
    game.addInteractable({
      id: 'muinos.laurita',
      pos: this.laurita.root.position,
      radius: 2.2,
      label: () => t('act.talk', { name: 'Laurita' }),
      enabled: () => this.stage >= 1 && this.stage < 5,
      run: () => this.talkLaurita(),
    });
    game.addInteractable({
      id: 'muinos.gate',
      pos: this.intake.clone().addScaledVector(side, 1.0),
      radius: 2.2,
      label: () => t('muinos.act.gate'),
      enabled: () => this.stage === 1,
      run: () => this.openGate(),
    });
    game.addInteractable({
      id: 'muinos.boulder',
      pos: bp,
      radius: 1.9,
      label: () => t('muinos.act.boulder'),
      enabled: () => this.stage === 2 && game.pepe.position.y > bp.y - 0.4,
      run: () => this.pushBoulder(),
    });
    game.addInteractable({
      id: 'muinos.lever',
      pos: lp,
      radius: 1.6,
      label: () => t('muinos.act.lever'),
      enabled: () => this.stage === 3 && game.pepe.position.y > lp.y - 0.4,
      run: () => this.pullLever(),
    });
    game.addInteractable({
      id: 'muinos.door',
      pos: V(M.x, floorY, M.z + WZ / 2 + 0.8),
      radius: 1.8,
      label: () => t('muinos.act.door'),
      enabled: () => this.stage === 4,
      run: () => this.enterMill(),
    });

    if (save.get().pegadas.includes(MUINOS_ID)) this.applyCompleted();
  }

  private doorCollider: ReturnType<Game['physics']['addBox']> | null = null;
  private waterFront = 0;
  private waterTarget = 0;

  /** Estado final (partida guardada con la fase completada). */
  private applyCompleted() {
    this.stage = 5;
    this.waterTarget = this.waterFront = this.segs.length;
    this.running = 1;
    this.gate.position.y += 0.9;
    this.boulder.visible = false;
    if (this.boulderCollider) this.game.physics.remove(this.boulderCollider);
    this.boulderCollider = null;
    (this.lever.getObjectByName('arm') as THREE.Mesh).rotation.z = 0.7;
    this.door.rotation.y = -1.7;
    if (this.doorCollider) this.game.physics.remove(this.doorCollider);
    this.doorCollider = null;
    this.beacon.intensity = 0;
    this.laurita.freeze(false, true);
  }

  /** Chamado cando Pepe chega á zona por primeira vez. */
  async arrive() {
    if (this.stage !== 0) return;
    this.stage = -1;
    const g = this.game;
    const d = g.director;
    const M = this.M;
    audio.playMusic('fog', 3);
    this.laurita.freeze(true, true);
    await d.play(async (d) => {
      // a cámara descobre o muíño entre a néboa
      d.shot({
        path: [M.clone().add(V(-14, 6, 14)), M.clone().add(V(-9, 3.5, 10)), M.clone().add(V(-6, 2.2, 8))],
        look: [M.clone().add(V(0, 1.5, 0)), M.clone().add(V(0, 1.2, 0))],
        duration: 7,
        fov: [50, 42],
      });
      await d.line(t('muinos.c1.l1'), 3.5);
      // recordo: a nai e a nena camiño do muíño
      this.ghostMother.root.position.copy(M).add(V(-5.5, 0, 9));
      this.ghostChild.root.position.copy(M).add(V(-6.3, 0, 9.5));
      this.ghostMother.play('Walk');
      this.ghostChild.play('Walk');
      audio.sfx('chime', { volume: 0.4 });
      const walk = (n: Npc, to: THREE.Vector3) => {
        const from = n.root.position.clone();
        n.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        return d.tween(6, (k) => {
          n.root.position.lerpVectors(from, to, k);
          n.ghostOpacity = Math.sin(k * Math.PI) * 1.2;
        });
      };
      walk(this.ghostMother, M.clone().add(V(-0.3, 0, 2.6)));
      walk(this.ghostChild, M.clone().add(V(-1.0, 0, 3.0)));
      await d.line(t('muinos.c1.l2'), 3.2);
      await d.line(t('muinos.c1.l3'), 3);
      this.ghostMother.ghostOpacity = 0;
      this.ghostChild.ghostOpacity = 0;
      // Laurita, perdida diante do muíño
      const L = this.laurita.root.position;
      d.shot({
        path: [L.clone().add(V(2.4, 1.8, 2.4)), L.clone().add(V(1.6, 1.6, 2.2))],
        look: [L.clone().add(V(0, 1.5, 0))],
        duration: 5,
      });
      this.laurita.freeze(false);
      await d.wait(1.2);
    });
    await this.laurita_intro();
    this.stage = 1;
    ui.objective(t('muinos.obj.gate'));
    audio.playMusic('puzzle', 3);
  }

  private async laurita_intro() {
    const L = { name: 'Laurita' };
    this.laurita.lookAt = this.game.pepe.position;
    await ui.say(L, t('muinos.laurita.1'));
    await ui.say(L, t('muinos.laurita.2'));
    await ui.say(L, t('muinos.laurita.3'));
  }

  private async talkLaurita() {
    const L = { name: 'Laurita' };
    const key = ['', 'muinos.hint.gate', 'muinos.hint.boulder', 'muinos.hint.lever', 'muinos.hint.door'][this.stage];
    if (key) await ui.say(L, t(key));
  }

  private async openGate() {
    const g = this.game;
    const pepe = g.pepe;
    pepe.lookTarget = this.gate.position;
    const anim = pepe.perform('open_door_1', 2.2);
    await new Promise((r) => setTimeout(r, 900));
    audio.sfx('mechanism', { at: this.gate.position });
    audio.sfx('creak', { at: this.gate.position, volume: 0.8 });
    const y0 = this.gate.position.y;
    await g.director.play(
      async (d) => {
        const I = this.intake;
        d.tween(1.6, (k) => (this.gate.position.y = y0 + 0.9 * ease.out(k)));
        await d.shot({
          path: [I.clone().add(V(-3, 3, 4)), I.clone().add(V(-2, 2.5, 2))],
          look: [I.clone()],
          duration: 1.8,
        });
        audio.sfx('splash', { at: I, volume: 0.8 });
        this.waterTarget = Math.floor(this.segs.length * 0.5);
        // seguimos a auga pola levada ata a pedra
        const B = this.boulder.position;
        await d.shot({
          path: [I.clone().add(V(-2, 3, 2)), B.clone().add(V(-4, 3, 3))],
          look: [I.clone(), B.clone()],
          duration: 3.5,
        });
        await d.line(t('muinos.c2.l1'), 3);
      },
      { letterbox: true },
    );
    await anim;
    pepe.lookTarget = null;
    this.stage = 2;
    ui.objective(t('muinos.obj.boulder'));
  }

  private async pushBoulder() {
    const g = this.game;
    const pepe = g.pepe;
    pepe.lookTarget = this.boulder.position;
    const anim = pepe.perform('open_door_1', 1.8);
    await new Promise((r) => setTimeout(r, 800));
    audio.sfx('rumble', { at: this.boulder.position });
    // la pedra rueda fóra da levada polo lado leste
    const from = this.boulder.position.clone();
    const dir = new THREE.Vector3().subVectors(this.chute, this.intake).setY(0).normalize();
    const side = V(-dir.z, 0, dir.x);
    const to = from.clone().addScaledVector(side, 2.2);
    to.y = g.world.hm.at(to.x, to.z) + 0.3;
    if (this.boulderCollider) g.physics.remove(this.boulderCollider);
    this.boulderCollider = null;
    await g.director.tween(1.1, (k) => {
      const kk = ease.in(k);
      this.boulder.position.lerpVectors(from, to, kk);
      this.boulder.position.y = THREE.MathUtils.lerp(from.y, to.y, kk) + Math.sin(k * Math.PI) * 0.4;
      this.boulder.rotation.x = k * 3;
    });
    audio.sfx('splash', { at: to });
    audio.sfx('land', { at: to, volume: 1, rate: 0.6 });
    await anim;
    pepe.lookTarget = null;
    this.waterTarget = this.segs.length;
    this.stage = 3;
    ui.objective(t('muinos.obj.lever'));
  }

  private async pullLever() {
    const g = this.game;
    const pepe = g.pepe;
    pepe.lookTarget = this.lever.position;
    const anim = pepe.perform('open_door_1', 1.6);
    await new Promise((r) => setTimeout(r, 700));
    audio.sfx('lever', { at: this.lever.position });
    const arm = this.lever.getObjectByName('arm') as THREE.Mesh;
    await g.director.play(async (d) => {
      d.tween(0.8, (k) => (arm.rotation.z = THREE.MathUtils.lerp(-0.6, 0.7, ease.out(k))));
      const R = this.rodicio.position;
      await d.shot({
        path: [R.clone().add(V(-3.5, 2.5, -2.5)), R.clone().add(V(-2.6, 1.4, -1.6))],
        look: [R.clone().add(V(0, 0.4, 0)), R.clone()],
        duration: 3,
      });
      this.chuteWater.visible = true;
      this.splash.visible = true;
      audio.sfx('splash', { at: R, volume: 1 });
      d.tween(4, (k) => (this.running = k));
      audio.setAmbience('mill', 0.9, 3);
      await d.line(t('muinos.c3.l1'), 3.2);
      const M = this.M;
      await d.shot({
        path: [M.clone().add(V(4, 3, 9)), M.clone().add(V(1.5, 2, 6.5))],
        look: [M.clone().add(V(0, 1.2, 2))],
        duration: 3.5,
      });
      audio.sfx('door', { at: this.door.position, volume: 0.6 });
      await d.line(t('muinos.c3.l2'), 2.8);
    });
    await anim;
    pepe.lookTarget = null;
    this.stage = 4;
    ui.objective(t('muinos.obj.door'));
  }

  private async enterMill() {
    const g = this.game;
    const pepe = g.pepe;
    const M = this.M;
    const anim = pepe.perform('open_door_1', 2.4);
    await new Promise((r) => setTimeout(r, 1000));
    audio.sfx('door', { at: this.door.position });
    await g.director.tween(1.4, (k) => (this.door.rotation.y = -1.7 * ease.out(k)));
    if (this.doorCollider) g.physics.remove(this.doorCollider);
    this.doorCollider = null;
    await anim;
    this.stage = 4.5;
    ui.objective('');
    audio.playMusic(null, 3);
    await g.director.play(
      async (d) => {
        const inside = M.clone().add(V(-0.8, 0, 0.6));
        pepe.walkTo(inside);
        await d.shot({
          path: [M.clone().add(V(0, 1.6, 4.5)), M.clone().add(V(-0.2, 1.4, 2.2))],
          look: [M.clone().add(V(0.4, 0.9, -0.4))],
          duration: 3,
        });
        pepe.release();
        // o recordo enche o muíño
        this.ghostMother.root.position.copy(M).add(V(0, 0, -1.1));
        this.ghostMother.root.rotation.y = Math.PI * 0.35;
        this.ghostChild.root.position.copy(M).add(V(-0.9, 0, -0.4));
        this.ghostChild.root.rotation.y = Math.PI * 0.6;
        this.ghostMother.play('Interact');
        this.ghostChild.play('Idle');
        this.flour.visible = true;
        audio.sfx('chime', { volume: 0.7 });
        audio.playMusic('gaita', 4, false);
        d.tween(2.5, (k) => {
          this.ghostMother.ghostOpacity = k;
          this.ghostChild.ghostOpacity = k;
        });
        d.orbit(M.clone().add(V(0.3, 0, -0.5)), 2.6, 1.5, -0.6, 0.9, 16, 0.9);
        await d.line(t('muinos.mem.l1'), 4.5, 'Laurita');
        await d.line(t('muinos.mem.l2'), 4.5, 'Laurita');
        await d.line(t('muinos.mem.l3'), 4.5, 'Laurita');
        await d.line(t('muinos.mem.l4'), 4, 'Laurita');
        // a pegada aparece
        this.orb = new MemoryOrb(M.clone().add(V(0.6, 1.4, -0.4)));
        g.engine.scene.add(this.orb.group);
        audio.sfx('chime', { volume: 1 });
        d.tween(2, (k) => {
          this.ghostMother.ghostOpacity = 1 - k;
          this.ghostChild.ghostOpacity = 1 - k;
        });
        const O = this.orb.group.position;
        await d.shot({
          path: [O.clone().add(V(-1.6, 0.2, 1.6)), O.clone().add(V(-0.9, 0.1, 0.9))],
          look: [O.clone()],
          duration: 3,
          fov: [45, 38],
        });
        // Pepe recolle a pegada → o color volve
        const from = O.clone();
        const to = pepe.position.clone().add(V(0, 1, 0));
        await d.tween(1.2, (k) => this.orb!.group.position.lerpVectors(from, to, ease.in(k)));
        this.orb!.group.removeFromParent();
        this.orb = null;
        audio.playMusic('stinger', 0.3, false);
        g.recoverPegada(MUINOS_ID, M, 140);
        g.world.atmosphere.setFog(0.35);
        this.beacon.intensity = 0;
        await d.shot({
          path: [M.clone().add(V(-5, 5, 8)), M.clone().add(V(-14, 22, 20)), M.clone().add(V(-24, 34, 32))],
          look: [M.clone().add(V(0, 1, 0)), M.clone().add(V(0, 0, 0))],
          duration: 7,
          ease: ease.out,
        });
      },
      { skippable: true },
    );
    ui.toast(t('pegada.recovered'), t('muinos.pegada.name'));
    this.laurita.freeze(false);
    this.stage = 5;
    await new Promise((r) => setTimeout(r, 1800));
    const L = { name: 'Laurita' };
    this.laurita.lookAt = pepe.position;
    await ui.say(L, t('muinos.end.1'));
    await ui.say(L, t('muinos.end.2'));
    await ui.say(L, t('muinos.end.3'));
    audio.playMusic('explore', 4);
    ui.objective(t('obj.after_muinos'));
    this.onComplete?.();
  }

  onComplete?: () => void;

  private tick(dt: number, time: number) {
    for (const w of this.waterTicks) w(time);
    this.beacon.update(dt);
    this.orb?.update(dt);
    // a auga avanza pola levada
    if (this.waterFront < this.waterTarget) this.waterFront = Math.min(this.waterTarget, this.waterFront + dt * 4);
    this.segs.forEach((s, i) => {
      const k = THREE.MathUtils.clamp(this.waterFront - i, 0, 1);
      s.water.visible = k > 0;
      s.water.scale.set(1, 1, Math.max(0.01, k));
    });
    // muíño en marcha
    this.rodicio.rotation.y += dt * 5 * this.running;
    this.stone.rotation.y += dt * 1.6 * this.running;
    if (this.splash.visible) this.animParticles(this.splash, this.rodicio.position, 0.7, dt, 2.5, true);
    if (this.flour.visible) this.animParticles(this.flour, this.stone.position, 0.8, dt, 0.3, false);
    // Pepe chega
    if (this.stage === 0 && this.game.playing && this.game.pepe.position.distanceTo(this.M) < 24) this.arrive();
  }

  private animParticles(p: THREE.Points, at: THREE.Vector3, r: number, dt: number, speed: number, fall: boolean) {
    const a = p.geometry.attributes.position as THREE.BufferAttribute;
    if (!p.userData.v) {
      p.userData.v = new Float32Array(a.count * 3);
      p.userData.life = new Float32Array(a.count).map(() => Math.random());
    }
    const v = p.userData.v as Float32Array;
    const life = p.userData.life as Float32Array;
    for (let i = 0; i < a.count; i++) {
      life[i] -= dt * (fall ? 1.4 : 0.3);
      if (life[i] <= 0) {
        life[i] = 1;
        a.setXYZ(i, at.x + (Math.random() - 0.5) * r, at.y + (fall ? 0.2 : 0.2), at.z + (Math.random() - 0.5) * r);
        v.set([(Math.random() - 0.5) * speed, fall ? Math.random() * speed : Math.random() * 0.2, (Math.random() - 0.5) * speed], i * 3);
      }
      v[i * 3 + 1] -= (fall ? 9 : -0.05) * dt;
      a.setXYZ(i, a.getX(i) + v[i * 3] * dt, a.getY(i) + v[i * 3 + 1] * dt, a.getZ(i) + v[i * 3 + 2] * dt);
    }
    a.needsUpdate = true;
    (p.material as THREE.PointsMaterial).opacity = 0.75 * this.running;
  }

  /** Destino del rastro de huellas desde la aldea. */
  get trailTarget() {
    return this.M.clone().add(V(-2, 0, 6));
  }
}

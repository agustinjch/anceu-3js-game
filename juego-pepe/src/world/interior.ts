import * as THREE from 'three';
import { pbr } from '../core/assets';
import type { Physics } from '../core/physics';

/** El interior se construye lejos del mapa (no hay terreno alrededor). */
export const INTERIOR_ORIGIN = new THREE.Vector3(3200, 0, 3200);

const W = 15; // ancho (x)
const D = 9; // fondo (z)
const H = 3.6;

/** Mural abstracto como el del café del coliving (formas planas azul, ocre, rosa, negro). */
function muralTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe6dc';
  g.fillRect(0, 0, c.width, c.height);
  const cols = ['#7fa6c9', '#c99a4a', '#e7a9a0', '#2b2b2b', '#8fb8a8', '#d8c3a5'];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    const w = 60 + rnd() * 260;
    const h = 40 + rnd() * 380;
    g.moveTo(x, y);
    g.lineTo(x + w, y + rnd() * 60);
    g.lineTo(x + w * (0.6 + rnd() * 0.5), y + h);
    g.lineTo(x - rnd() * 60, y + h * (0.7 + rnd() * 0.3));
    g.closePath();
    g.globalAlpha = i % cols.length === 3 ? 1 : 0.92;
    if (i % cols.length === 3) {
      g.lineWidth = 18;
      g.strokeStyle = '#2b2b2b';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w * 0.5, y + h * 0.3);
      g.lineTo(x + w * 0.2, y + h * 0.6);
      g.stroke();
    } else g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Interior {
  group: THREE.Group;
  /** Puntos de interés en coordenadas de mundo */
  spots: {
    bed: THREE.Vector3;
    kitchen: THREE.Vector3;
    table: THREE.Vector3;
    desk: THREE.Vector3;
    door: THREE.Vector3;
    window: THREE.Vector3;
    clock: THREE.Vector3;
  };
  lights: THREE.Light[];
  windowMat: THREE.MeshStandardMaterial;
}

export async function buildInterior(physics: Physics): Promise<Interior> {
  const O = INTERIOR_ORIGIN;
  const group = new THREE.Group();
  group.position.copy(O);
  const [floorT, wood, granite, planks] = await Promise.all([
    pbr('terracotta', 1),
    pbr('wood_planks', 2),
    pbr('granite', 1),
    pbr('wood_weathered', 1),
  ]);

  // suelo de baldosa de barro (terracota)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0xf2dccd, map: floorT.map, roughness: 0.75 }),
  );
  floorT.map?.repeat.set(W / 1.2, D / 1.2);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // techo de lamas de pino
  wood.map?.repeat.set(4, 8);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0xf4efe6, map: wood.map, roughness: 0.6 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  group.add(ceil);
  // vigas de madera pintadas de blanco
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xf6f2ea });
  for (let x = -W / 2 + 0.6; x < W / 2; x += 0.95) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, D), beamMat);
    b.position.set(x, H - 0.11, 0);
    b.castShadow = true;
    group.add(b);
  }

  // paredes: rosa empolvado + mural en la pared del fondo; granito vista en un lateral
  const pink = new THREE.MeshStandardMaterial({ color: 0xfaf5ec, roughness: 0.95 }); // encalado blanco
  const mural = new THREE.MeshStandardMaterial({ map: muralTexture(), roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, map: granite.map, normalMap: granite.normalMap, roughness: 0.95 });
  granite.map?.repeat.set(3, 1.4);
  granite.normalMap?.repeat.set(3, 1.4);
  const wall = (w: number, mat: THREE.Material, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat);
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    group.add(m);
  };
  wall(W, mural, 0, -D / 2, 0); // fondo
  wall(W, pink, 0, D / 2, Math.PI); // frente (con ventanas y puerta)
  wall(D, stone, -W / 2, 0, Math.PI / 2);
  wall(D, pink, W / 2, 0, -Math.PI / 2);

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (collide) physics.addBox(new THREE.Vector3(O.x + x, O.y + y, O.z + z), new THREE.Vector3(w / 2, h / 2, d / 2));
    return m;
  };

  // colisión de paredes
  for (const [x, z, hx, hz] of [
    [0, -D / 2 - 0.1, W / 2, 0.1],
    [0, D / 2 + 0.1, W / 2, 0.1],
    [-W / 2 - 0.1, 0, 0.1, D / 2],
    [W / 2 + 0.1, 0, 0.1, D / 2],
  ])
    physics.addBox(new THREE.Vector3(O.x + x, H / 2, O.z + z), new THREE.Vector3(hx, H / 2, hz));
  physics.addBox(new THREE.Vector3(O.x, -0.1, O.z), new THREE.Vector3(W / 2, 0.1, D / 2));

  // mesa longa (madera) con bancos
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, map: planks.map, normalMap: planks.normalMap, roughness: 0.7 });
  box(6.5, 0.08, 1.1, woodMat, -2, 0.76, -0.6);
  for (const [lx, lz] of [
    [-5, -1],
    [1, -1],
    [-5, -0.2],
    [1, -0.2],
  ])
    box(0.09, 0.74, 0.09, woodMat, lx, 0.37, lz, false);
  box(6.2, 0.06, 0.38, woodMat, -2, 0.45, -1.5);
  box(6.2, 0.06, 0.38, woodMat, -2, 0.45, 0.3);
  // sillas de forja verde alrededor no: bancos simples. Platos y tazas:
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.3 });
  for (let i = 0; i < 6; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 12), ceramic);
    cup.position.set(-4.6 + i * 1.05, 0.845, -0.6 + (i % 2 ? 0.3 : -0.3));
    group.add(cup);
  }

  // cocina: muebles blancos, encimera, cafetera
  const white = new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.9, roughness: 0.25 });
  box(4.4, 0.9, 0.65, new THREE.MeshStandardMaterial({ color: 0x2a2a2c }), 4.6, 0.45, -3.9);
  box(4.5, 0.05, 0.7, new THREE.MeshStandardMaterial({ color: 0x3b3430, roughness: 0.35 }), 4.6, 0.92, -3.9, false);
  box(0.5, 0.45, 0.4, steel, 3.4, 1.17, -3.95, false);
  box(0.9, 0.7, 0.3, white, 5.6, 2.1, -4.25, false);
  // barandilla torneada (como la del café)
  for (let i = 0; i < 12; i++) box(0.05, 0.85, 0.05, woodMat, 2.0 + i * 0.32, 0.43, -2.5, false);
  box(3.9, 0.07, 0.1, woodMat, 3.76, 0.9, -2.5);

  // zona de coworking: dos escritorios con monitores
  const dark = new THREE.MeshStandardMaterial({ color: 0x222628, roughness: 0.4 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x0d1418, emissive: 0x3a6a8a, emissiveIntensity: 0.6 });
  for (const x of [4.4, 6.0]) {
    box(1.3, 0.05, 0.7, woodMat, x, 0.74, 2.6);
    box(0.06, 0.72, 0.6, dark, x - 0.6, 0.36, 2.6, false);
    box(0.06, 0.72, 0.6, dark, x + 0.6, 0.36, 2.6, false);
    const mon = box(0.62, 0.38, 0.03, screen, x, 1.05, 2.85, false);
    mon.rotation.y = Math.PI;
  }

  // cama de Pepe: cojín redondo junto a la pared de piedra
  const bed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.66, 0.16, 28),
    new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.95 }),
  );
  bed.position.set(-6.3, 0.08, 2.9);
  bed.receiveShadow = true;
  group.add(bed);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 10, 28), new THREE.MeshStandardMaterial({ color: 0x8f4a38, roughness: 1 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(-6.3, 0.18, 2.9);
  group.add(rim);

  // reloj de pared
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 32), ceramic);
  clock.rotation.x = Math.PI / 2;
  clock.position.set(-3.4, 2.6, -D / 2 + 0.04);
  group.add(clock);

  // ventanas: marcos blancos y luz de mañana entrando
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 2.2 });
  windowMat.userData.keepPBR = true;
  for (const x of [-4.5, -0.5, 3.5]) {
    box(1.3, 1.5, 0.12, white, x, 1.75, D / 2 - 0.02, false);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), windowMat);
    glass.position.set(x, 1.75, D / 2 - 0.09);
    glass.rotation.y = Math.PI;
    group.add(glass);
  }
  // puerta de madera
  box(1.15, 2.2, 0.1, new THREE.MeshStandardMaterial({ color: 0x6f4428, map: planks.map, roughness: 0.75 }), 6.4, 1.1, D / 2 - 0.05, false);

  // --- salón: chimenea de piedra, sofás amarillos y puf verde ---
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b830 });
  const fire = box(1.8, 1.3, 0.6, stone, -5.6, 0.65, -D / 2 + 0.3);
  fire.name = 'chimenea';
  box(2.1, 0.14, 0.75, stone, -5.6, 1.36, -D / 2 + 0.35, false);
  box(1.0, 0.8, 0.1, new THREE.MeshStandardMaterial({ color: 0x1c1612 }), -5.6, 0.5, -D / 2 + 0.62, false);
  // sofá en L contra la pared de piedra
  box(0.9, 0.42, 2.6, yellow, -6.95, 0.21, -2.4);
  box(0.25, 0.85, 2.6, yellow, -7.35, 0.55, -2.4, false);
  for (const z of [-3.2, -2.4, -1.6]) {
    const c = box(0.62, 0.18, 0.7, new THREE.MeshStandardMaterial({ color: 0xf0c948 }), -6.85, 0.5, z, false);
    c.rotation.z = 0.04;
  }
  const puf = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9cc43c }));
  puf.scale.set(1, 0.6, 1);
  puf.position.set(-4.6, 0.3, -2.9);
  puf.castShadow = true;
  group.add(puf);
  physics.addBox(new THREE.Vector3(O.x - 4.6, 0.3, O.z - 2.9), new THREE.Vector3(0.45, 0.3, 0.45));

  // --- escalera blanca de balaústres torneados, subiendo por la pared del fondo ---
  const stairWhite = new THREE.MeshStandardMaterial({ color: 0xf6f2ea });
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x9a6a44, map: planks.map });
  const steps = 13;
  for (let i = 0; i < steps; i++) {
    const x = 1.6 - i * 0.28;
    const y = 0.14 + i * 0.26;
    box(0.3, 0.06, 0.95, stepMat, x, y + 0.11, -D / 2 + 0.5, false);
    box(0.3, y + 0.08, 0.95, stairWhite, x, (y + 0.08) / 2, -D / 2 + 0.5, false);
    // balaústre torneado
    const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.85, 8), stairWhite);
    bal.position.set(x, y + 0.6, -D / 2 + 0.98);
    group.add(bal);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, steps * 0.39), stairWhite);
  rail.rotation.y = Math.PI / 2;
  rail.rotation.x = Math.atan2(0.26, 0.28);
  rail.position.set(1.6 - (steps - 1) * 0.14, 0.14 + (steps - 1) * 0.13 + 1.05, -D / 2 + 0.98);
  group.add(rail);
  physics.addBox(new THREE.Vector3(O.x + 1.6 - (steps - 1) * 0.14, 0.9, O.z - D / 2 + 0.5), new THREE.Vector3(steps * 0.15, 0.9, 0.5));

  // --- cortinas rosas y plantas ---
  const curtain = new THREE.MeshStandardMaterial({ color: 0xf2b6b0, side: THREE.DoubleSide });
  for (const x of [-4.5, -0.5, 3.5])
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.42, 2.3, 6, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.04);
      g.computeVertexNormals();
      const c = new THREE.Mesh(g, curtain);
      c.position.set(x + s * 0.82, 1.6, D / 2 - 0.12);
      c.rotation.y = Math.PI;
      group.add(c);
    }
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb5603e });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3a });
  for (const [x, z, s] of [
    [-7.0, 0.5, 1.2],
    [2.6, 4.0, 1],
    [7.0, -1.5, 1.4],
  ]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.35 * s, 10), potMat);
    pot.position.set(x, 0.175 * s, z);
    group.add(pot);
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6), leafMat);
      l.scale.set(1, 1.6, 0.5);
      l.position.set(x + Math.cos(k * 1.3) * 0.12 * s, 0.55 * s + (k % 2) * 0.12 * s, z + Math.sin(k * 1.3) * 0.12 * s);
      l.rotation.z = Math.cos(k * 1.3) * 0.5;
      l.rotation.x = Math.sin(k * 1.3) * 0.5;
      group.add(l);
    }
  }

  // luces
  const lights: THREE.Light[] = [];
  const hemi = new THREE.HemisphereLight(0xfff2e6, 0x9a7a6c, 0.55);
  group.add(hemi);
  lights.push(hemi);
  for (const [x, z] of [
    [-4, -0.6],
    [0.5, -0.6],
    [4.6, -2.8],
  ]) {
    const l = new THREE.PointLight(0xffe0bc, 7, 9, 1.6);
    l.position.set(x, H - 0.5, z);
    group.add(l);
    lights.push(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
    bulb.position.copy(l.position);
    group.add(bulb);
  }
  const sunIn = new THREE.SpotLight(0xfff0d6, 60, 16, 0.75, 0.6, 1.2);
  sunIn.position.set(-1, 3.2, D / 2 + 2.5);
  sunIn.target.position.set(-2, 0, -1);
  sunIn.castShadow = true;
  sunIn.shadow.mapSize.set(1024, 1024);
  group.add(sunIn, sunIn.target);
  lights.push(sunIn);

  const w = (x: number, y: number, z: number) => new THREE.Vector3(O.x + x, O.y + y, O.z + z);
  return {
    group,
    lights,
    windowMat,
    spots: {
      bed: w(-6.3, 0.16, 2.9),
      kitchen: w(4.2, 0, -3.1),
      table: w(-2.6, 0, 0.75),
      desk: w(4.4, 0, 2.0),
      door: w(6.4, 0, D / 2 - 0.7),
      window: w(-0.5, 1.7, D / 2 - 0.2),
      clock: w(-3.4, 2.6, -D / 2 + 0.1),
    },
  };
}

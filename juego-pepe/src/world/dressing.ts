import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '../core/physics';
import { toon } from '../core/stylize';
import { painted } from './painted';
import { buildHorreo } from './props';
import type { HeightMap } from './terrain';
import type { BuildingInfo } from './village';

/**
 * Atrezo de aldea: lo que hace que Anceu parezca habitada. Muros de pedra seca junto a los
 * caminos, parras sobre las puertas, leña apilada, macetas de xeranios, bancos de piedra,
 * un cruceiro y más hórreos. Todo procedural, en el mismo estilo pintado que las casas.
 */

export interface DressingInput {
  hm: HeightMap;
  physics: Physics;
  buildings: BuildingInfo[];
  roads: { width: number; pts: [number, number][] }[];
  doors: THREE.Matrix4[];
  windows: THREE.Matrix4[];
  blocked: (x: number, z: number, pad: number) => boolean;
  /** Registra un obstáculo circular para que la vegetación no crezca encima. */
  obstacle: (x: number, z: number, r: number) => void;
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const UP = new THREE.Vector3(0, 1, 0);
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

export async function buildDressing(inp: DressingInput) {
  const { hm, physics, buildings } = inp;
  const r = rng(1234);
  const group = new THREE.Group();
  group.name = 'dressing';
  const granite = toon({ map: painted('drystone')!, color: 0xf0e8da });
  const graniteLight = toon({ map: painted('granite_light')!, color: 0xe6dccb });
  const wood = toon({ map: painted('wood_weathered')! });

  // centro de Anceu: el coliving es el origen del mapa (los datos traen también otros lugares)
  const center = new THREE.Vector2(0, 0);
  const dist = (m: THREE.Matrix4) => Math.hypot(m.elements[12], m.elements[14]);
  const doorsNear = [...inp.doors].filter((m) => dist(m) < 260).sort((a, b) => dist(a) - dist(b));
  const near = (x: number, z: number, R: number) => Math.hypot(x - center.x, z - center.y) < R;
  const nearHouse = (x: number, z: number, d: number) =>
    buildings.some((b) => Math.hypot(x - b.obb.cx, z - b.obb.cz) < Math.max(b.obb.hx, b.obb.hz) + d);

  // ---------------------------------------------------------------- muros de pedra seca
  const wallGeos: THREE.BufferGeometry[] = [];
  for (const road of inp.roads) {
    if (road.pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(road.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const len = curve.getLength();
    const STEP = 1.4;
    const n = Math.floor(len / STEP);
    for (const side of [-1, 1]) {
      let gap = 0;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const p = curve.getPointAt(t);
        if (!near(p.x, p.z, 260) || !nearHouse(p.x, p.z, 30)) continue;
        // huecos: entradas a fincas cada tanto
        if (gap > 0) {
          gap--;
          continue;
        }
        if (r() < 0.08) {
          gap = 2 + Math.floor(r() * 3);
          continue;
        }
        const tg = curve.getTangentAt(t);
        const nrm = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
        const off = road.width / 2 + 0.7;
        const x = p.x + nrm.x * off * side;
        const z = p.z + nrm.z * off * side;
        if (inp.blocked(x, z, 0.4)) continue;
        const y = hm.at(x, z);
        // no en pendientes muy fuertes
        if (Math.abs(hm.at(x + tg.x, z + tg.z) - hm.at(x - tg.x, z - tg.z)) > 1.2) continue;
        const h = 0.75 + r() * 0.3;
        const rotY = Math.atan2(tg.x, tg.z);
        const parts = [box(0.55, h + 0.4, STEP + 0.08, 0, (h - 0.4) / 2, 0)];
        // albardilla: piedras irregulares encima
        for (let k = 0; k < 3; k++) {
          const w = 0.35 + r() * 0.25;
          const c = box(0.5 + r() * 0.15, 0.12 + r() * 0.1, w, (r() - 0.5) * 0.05, h + 0.04, -STEP / 2 + (k + 0.5) * (STEP / 3));
          c.rotateY((r() - 0.5) * 0.3);
          parts.push(c);
        }
        const g = mergeGeometries(parts);
        g.rotateY(rotY);
        g.translate(x, y, z);
        wallGeos.push(g);
        physics.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(0.28, h / 2 + 0.05, STEP / 2), rotY);
        inp.obstacle(x, z, 0.8);
      }
    }
  }
  if (wallGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(wallGeos), granite);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // ---------------------------------------------------------------- parras sobre las puertas
  const leafTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const rr = rng(5);
    for (let i = 0; i < 26; i++) {
      const x = 10 + rr() * 108;
      const y = 10 + rr() * 108;
      const l = 190 + rr() * 60;
      g.fillStyle = `rgb(${l * 0.8},${l * 0.85},${l * 0.7})`;
      g.beginPath();
      // hoja de vid: tres lóbulos
      for (let k = 0; k < 3; k++) g.ellipse(x + (k - 1) * 6, y - (k === 1 ? 5 : 0), 8, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
    // racimos
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgb(80,40,90)';
      const x = 15 + rr() * 98;
      const y = 15 + rr() * 98;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.arc(x + (rr() - 0.5) * 8, y + k * 2.2, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const vineLeaves = toon({ map: leafTex, color: 0x7f9a44, alphaTest: 0.5, side: THREE.DoubleSide });
  const pergolaStone: THREE.BufferGeometry[] = [];
  const pergolaWood: THREE.BufferGeometry[] = [];
  const pergolaLeaf: THREE.BufferGeometry[] = [];
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  let pergolas = 0;
  for (const dm of doorsNear) {
    dm.decompose(pos, q, sc);
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const W = 3.2;
    const D = 2.8;
    const c = pos.clone().addScaledVector(out, D / 2 + 0.3);
    if (r() > 0.45 || inp.blocked(c.x, c.z, 0.2)) continue;
    // que no caiga sobre otra casa ni sobre el camino
    const far = pos.clone().addScaledVector(out, D + 0.3);
    if (inp.blocked(far.x, far.z, 0.3)) continue;
    const y = hm.at(c.x, c.z);
    const rotY = Math.atan2(out.x, out.z);
    const local = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyAxisAngle(UP, rotY).add(pos);
    const H = 2.4;
    for (const [lx, lz] of [
      [-W / 2, D + 0.2],
      [W / 2, D + 0.2],
    ]) {
      const p = local(lx, lz);
      const gy = hm.at(p.x, p.z);
      pergolaStone.push(box(0.24, H + (y - gy) + 0.1, 0.24, p.x, gy + (H + (y - gy)) / 2, p.z));
      physics.addBox(new THREE.Vector3(p.x, gy + H / 2, p.z), new THREE.Vector3(0.13, H / 2, 0.13));
    }
    // vigas y canopia de hojas
    const top = new THREE.Group();
    const beams = [box(W + 0.4, 0.12, 0.12, 0, H, D + 0.2)];
    for (let k = 0; k < 5; k++) beams.push(box(0.08, 0.08, D + 0.6, -W / 2 + (k * W) / 4, H + 0.1, D / 2));
    const bg = mergeGeometries(beams);
    bg.rotateY(rotY);
    bg.translate(pos.x, y, pos.z);
    pergolaWood.push(bg);
    void top;
    for (let k = 0; k < 14; k++) {
      const leaf = new THREE.PlaneGeometry(1.3, 1.3);
      leaf.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.9);
      leaf.rotateY(r() * Math.PI);
      leaf.translate(-W / 2 + r() * W, H + 0.18 + r() * 0.15, 0.2 + r() * D);
      leaf.rotateY(rotY);
      leaf.translate(pos.x, y, pos.z);
      // normales hacia arriba: la parra se ilumina como un techo de hojas
      const nn = leaf.attributes.normal as THREE.BufferAttribute;
      for (let v = 0; v < nn.count; v++) nn.setXYZ(v, 0, 1, 0);
      pergolaLeaf.push(leaf.toNonIndexed());
    }
    // cuelgan algunas hojas por el borde
    for (let k = 0; k < 4; k++) {
      const leaf = new THREE.PlaneGeometry(0.9, 0.9);
      leaf.translate(-W / 2 + r() * W, H - 0.25, D + 0.25);
      leaf.rotateY(rotY);
      leaf.translate(pos.x, y, pos.z);
      pergolaLeaf.push(leaf.toNonIndexed());
    }
    inp.obstacle(c.x, c.z, 2);
    if (++pergolas > 14) break;
  }
  const addMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  };
  addMesh(pergolaStone, graniteLight);
  addMesh(pergolaWood, wood);
  addMesh(pergolaLeaf, vineLeaves);

  // ---------------------------------------------------------------- bancos de piedra y leña
  const benchGeos: THREE.BufferGeometry[] = [];
  const logGeos: THREE.BufferGeometry[] = [];
  const logMat = toon({ color: 0x9a7350 });
  const logEnd = toon({ color: 0xd8b98a });
  const logEnds: THREE.BufferGeometry[] = [];
  let piles = 0;
  for (const dm of doorsNear) {
    dm.decompose(pos, q, sc);
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const side = new THREE.Vector3(out.z, 0, -out.x);
    const rotY = Math.atan2(out.x, out.z);
    // banco a un lado de la puerta
    if (r() < 0.5) {
      const p = pos.clone().addScaledVector(side, 1.6).addScaledVector(out, 0.3);
      if (!inp.blocked(p.x, p.z, -0.1)) {
        const y = hm.at(p.x, p.z);
        const g = mergeGeometries([box(1.5, 0.12, 0.42, 0, 0.42, 0), box(0.25, 0.4, 0.35, -0.55, 0.2, 0), box(0.25, 0.4, 0.35, 0.55, 0.2, 0)]);
        g.rotateY(rotY);
        g.translate(p.x, y, p.z);
        benchGeos.push(g);
        physics.addBox(new THREE.Vector3(p.x, y + 0.25, p.z), new THREE.Vector3(0.75, 0.25, 0.22), rotY);
      }
    }
    // leña apilada al otro lado
    if (r() < 0.35 && piles < 18) {
      const p = pos.clone().addScaledVector(side, -2.4).addScaledVector(out, 0.45);
      if (inp.blocked(p.x, p.z, -0.2)) continue;
      const y = hm.at(p.x, p.z);
      const L = 1.6;
      for (let row = 0; row < 5; row++)
        for (let k = 0; k < 7 - (row % 2); k++) {
          const lr = 0.09 + r() * 0.03;
          const x = -L / 2 + 0.12 + k * 0.22 + (row % 2) * 0.11;
          const log = new THREE.CylinderGeometry(lr, lr, 0.7, 7).rotateX(Math.PI / 2).translate(x, 0.1 + row * 0.18, 0).toNonIndexed();
          const end = new THREE.CircleGeometry(lr * 0.92, 7).translate(x, 0.1 + row * 0.18, 0.351).toNonIndexed();
          for (const g of [log, end]) {
            g.rotateY(rotY);
            g.translate(p.x, y, p.z);
          }
          logGeos.push(log);
          logEnds.push(end);
        }
      physics.addBox(new THREE.Vector3(p.x, y + 0.45, p.z), new THREE.Vector3(L / 2, 0.45, 0.36), rotY);
      inp.obstacle(p.x, p.z, 1.2);
      piles++;
    }
  }
  addMesh(benchGeos, graniteLight);
  addMesh(logGeos, logMat);
  addMesh(logEnds, logEnd, false);

  // ---------------------------------------------------------------- macetas de xeranios
  const pots: THREE.Matrix4[] = [];
  for (const wm of inp.windows) {
    if (r() > 0.3) continue;
    for (const lx of r() < 0.5 ? [-0.3] : [-0.3, 0.3]) {
      const m = wm.clone().multiply(new THREE.Matrix4().makeTranslation(lx, -0.62, 0.2));
      pots.push(m);
    }
  }
  for (const dm of inp.doors) {
    if (r() > 0.5) continue;
    for (const s of [-1, 1]) pots.push(dm.clone().multiply(new THREE.Matrix4().makeTranslation(s * 1.05, 0, 0.35).scale(new THREE.Vector3(1.6, 1.6, 1.6))));
  }
  if (pots.length) {
    const potGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.2, 8).translate(0, 0.1 + 0.06, 0);
    const leaves = new THREE.IcosahedronGeometry(0.16, 0).scale(1.1, 0.7, 1.1).translate(0, 0.3, 0);
    const flowers = mergeGeometries(
      [0, 1, 2, 3, 4].map((k) => new THREE.IcosahedronGeometry(0.06, 0).translate(Math.cos(k * 1.3) * 0.1, 0.38 + (k % 2) * 0.05, Math.sin(k * 1.3) * 0.1).toNonIndexed()),
    );
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, colors?: THREE.Color[]) => {
      const im = new THREE.InstancedMesh(geo, mat, pots.length);
      pots.forEach((m, i) => {
        im.setMatrixAt(i, m);
        if (colors) im.setColorAt(i, colors[i % colors.length]);
      });
      im.castShadow = true;
      group.add(im);
    };
    mk(potGeo, toon({ color: 0xb5603e }));
    mk(leaves, toon({ color: 0x4f7a32 }));
    mk(flowers, toon({ color: 0xffffff }), [new THREE.Color(0xd8263a), new THREE.Color(0xe8508a), new THREE.Color(0xf0f0f0), new THREE.Color(0xd8263a)]);
  }

  // ---------------------------------------------------------------- cruceiro
  {
    // en el camino asfaltado más cercano al centro de la aldea, a un lado
    let best: { p: THREE.Vector3; n: THREE.Vector3; d: number } | null = null;
    for (const road of inp.roads) {
      if (road.width < 3) continue;
      for (let i = 0; i < road.pts.length; i++) {
        const [x, z] = road.pts[i];
        const d = Math.hypot(x - center.x, z - center.y);
        if (best && d > best.d) continue;
        const [nx2, nz2] = road.pts[Math.min(i + 1, road.pts.length - 1)];
        const [px2, pz2] = road.pts[Math.max(i - 1, 0)];
        const tg = new THREE.Vector3(nx2 - px2, 0, nz2 - pz2).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        const p = new THREE.Vector3(x, 0, z).addScaledVector(n, road.width / 2 + 2.2);
        if (inp.blocked(p.x, p.z, 0.3)) continue;
        best = { p, n, d };
      }
    }
    if (best) {
      const p = best.p;
      const y = hm.at(p.x, p.z);
      const parts = [
        box(2.2, 0.3, 2.2, 0, 0.0, 0),
        box(1.6, 0.3, 1.6, 0, 0.3, 0),
        box(1.0, 0.3, 1.0, 0, 0.6, 0),
        box(0.6, 0.5, 0.6, 0, 1.0, 0), // pedestal
        new THREE.CylinderGeometry(0.16, 0.2, 3.0, 8).translate(0, 2.75, 0).toNonIndexed(), // fuste
        box(0.42, 0.25, 0.42, 0, 4.35, 0), // capitel
        box(0.16, 1.1, 0.16, 0, 5.0, 0), // cruz
        box(0.75, 0.16, 0.16, 0, 5.2, 0),
      ];
      const g = mergeGeometries(parts);
      g.translate(p.x, y, p.z);
      addMesh([g], graniteLight);
      physics.addBox(new THREE.Vector3(p.x, y + 0.45, p.z), new THREE.Vector3(1.1, 0.45, 1.1));
      physics.addBox(new THREE.Vector3(p.x, y + 2.5, p.z), new THREE.Vector3(0.22, 2.5, 0.22));
      inp.obstacle(p.x, p.z, 2);
    }
  }

  // ---------------------------------------------------------------- hórreos
  let horreos = 0;
  for (const b of [...buildings].sort((a, c) => Math.hypot(a.obb.cx, a.obb.cz) - Math.hypot(c.obb.cx, c.obb.cz))) {
    if (horreos >= 4 || b.floors === 0 || r() > 0.4) continue;
    for (let tries = 0; tries < 6; tries++) {
      const a = r() * Math.PI * 2;
      const d = Math.max(b.obb.hx, b.obb.hz) + 4.5;
      const x = b.obb.cx + Math.cos(a) * d;
      const z = b.obb.cz + Math.sin(a) * d;
      if (inp.blocked(x, z, 3)) continue;
      const y = hm.at(x, z);
      if (Math.abs(hm.at(x + 2.5, z) - hm.at(x - 2.5, z)) > 1 || Math.abs(hm.at(x, z + 2) - hm.at(x, z - 2)) > 1) continue;
      group.add(await buildHorreo(physics, new THREE.Vector3(x, y - 0.1, z), b.obb.angle + Math.PI / 2 * (r() < 0.5 ? 0 : 1), 3.4 + r() * 2));
      inp.obstacle(x, z, 3.5);
      horreos++;
      break;
    }
  }

  return group;
}

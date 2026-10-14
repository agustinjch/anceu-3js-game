import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '../core/physics';
import { toon } from '../core/stylize';
import { painted } from './painted';
import type { HeightMap } from './terrain';
import type { BuildingInfo } from './village';

/**
 * El coliving de Anceu por fuera, sacado de las fotos: patio de grava, terraza cubierta
 * de baldosa de barro con pilares de granito y toldo, mesas verdes de forja, balcón de
 * madera en la planta alta, piscina entre bolos de granito y una parra amarilla de otoño.
 */

/** Sitio de la piscina (se allana el terreno antes de construir la malla). */
export const POOL = { x: -22, z: 2, w: 7.5, d: 3.6 };

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Losa irregular pegada al terreno (patio de grava). */
function groundPatch(hm: HeightMap, cx: number, cz: number, R: number, r: () => number) {
  const N = 40;
  const rings = 6;
  const radii = Array.from({ length: N }, () => R * (0.85 + r() * 0.25));
  const pos: number[] = [cx, hm.at(cx, cz) + 0.04, cz];
  const uv: number[] = [cx / 3, cz / 3];
  for (let k = 1; k <= rings; k++)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = (radii[i] * k) / rings;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      pos.push(x, hm.at(x, z) + 0.04, z);
      uv.push(x / 3, z / 3);
    }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) idx.push(0, 1 + ((i + 1) % N), 1 + i);
  for (let k = 1; k < rings; k++)
    for (let i = 0; i < N; i++) {
      const a = 1 + (k - 1) * N + i;
      const b = 1 + (k - 1) * N + ((i + 1) % N);
      const c = 1 + k * N + i;
      const d = 1 + k * N + ((i + 1) % N);
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Mesa redonda de forja verde con cuatro sillas. */
function tableSet(r: () => number) {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.55, 0.55, 0.04, 18).translate(0, 0.74, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6).translate(0, 0.37, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.28, 0.3, 0.04, 10).translate(0, 0.02, 0).toNonIndexed(),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + r() * 0.4;
    const chair = [
      box(0.44, 0.04, 0.42, 0, 0.45, 0),
      box(0.44, 0.45, 0.04, 0, 0.7, 0.2),
      box(0.04, 0.45, 0.04, -0.19, 0.22, -0.18),
      box(0.04, 0.45, 0.04, 0.19, 0.22, -0.18),
      box(0.04, 0.45, 0.04, -0.19, 0.22, 0.18),
      box(0.04, 0.45, 0.04, 0.19, 0.22, 0.18),
    ];
    const cg = mergeGeometries(chair);
    cg.translate(0, 0, 0.85);
    cg.rotateY(a);
    parts.push(cg);
  }
  return mergeGeometries(parts);
}

/** Bolo de granito redondeado (como los de la piscina y el monte). */
function boulder(r: () => number, size: number) {
  const ico = new THREE.IcosahedronGeometry(1, 4);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const p = g.attributes.position as THREE.BufferAttribute;
  const seed = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = 1 + 0.12 * Math.sin(v.x * 2.3 + seed) * Math.cos(v.z * 2.1 + seed) + 0.06 * Math.sin(v.y * 4.7 + seed);
    v.multiplyScalar(n);
    v.y *= 0.72;
    p.setXYZ(i, v.x * size, v.y * size, v.z * size * (0.8 + r() * 0.3));
  }
  g.computeVertexNormals();
  // UV esféricas aproximadas para la textura de piedra
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getY(i) * 0.4) * 0.35, (p.getZ(i) - p.getY(i) * 0.3) * 0.35);
  return g;
}

export function buildColiving(hm: HeightMap, physics: Physics, buildings: BuildingInfo[]) {
  const r = rng(77);
  const group = new THREE.Group();
  group.name = 'coliving';
  const tex = (n: string) => painted(n)!;
  const stoneLight = toon({ map: tex('granite_light'), color: 0xe6dccb });
  const wood = toon({ map: tex('wood_planks') });
  const metal = toon({ color: 0x3e5a40, rim: 1.5 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---- patio de grava
  const gravelMat = toon({ map: tex('gravel'), polygonOffset: true, polygonOffsetFactor: -3 });
  add(groundPatch(hm, -7, 9, 10, r), gravelMat, false);

  // ---- casa principal: la más cercana a su sitio real
  const main = buildings.reduce((a, b) => (Math.hypot(b.obb.cx - 0.6, b.obb.cz + 10.8) < Math.hypot(a.obb.cx - 0.6, a.obb.cz + 10.8) ? b : a));
  const o = main.obb;
  const rot = -o.angle;
  // fachada que da al patio: lado +hz del rectángulo
  const toWorld = (u: number, y: number, v: number) => new THREE.Vector3(u, y, v).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(o.cx, 0, o.cz));
  const facadeSign = toWorld(0, 0, o.hz).z > o.cz ? 1 : -1;
  const L = o.hx * 2 - 1.2;
  const D = 2.8;
  const gy = main.ground;
  const local = (geo: THREE.BufferGeometry) => {
    geo.rotateY(rot);
    geo.translate(o.cx, 0, o.cz);
    return geo;
  };
  const fv = (v: number) => facadeSign * (o.hz + v);

  // ---- terraza cubierta
  const floor = local(box(L, 0.3, D, 0, gy + 0.05, fv(D / 2)));
  const terrMat = toon({ map: tex('terracotta') });
  const floorUv = floor.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < floorUv.count; i++) floorUv.setXY(i, floorUv.getX(i) * L * 0.5, floorUv.getY(i) * D * 0.5);
  add(floor, terrMat);
  physics.addBox(toWorld(0, gy + 0.05, fv(D / 2)), new THREE.Vector3(L / 2, 0.15, D / 2), rot);
  const pillars: THREE.BufferGeometry[] = [];
  const np = Math.max(2, Math.round(L / 3.2) + 1);
  for (let i = 0; i < np; i++) {
    const u = -L / 2 + 0.25 + (i * (L - 0.5)) / (np - 1);
    pillars.push(local(box(0.36, 2.7, 0.36, u, gy + 1.5, fv(D - 0.2))));
    physics.addBox(toWorld(u, gy + 1.5, fv(D - 0.2)), new THREE.Vector3(0.18, 1.35, 0.18), rot);
  }
  pillars.push(local(box(L, 0.25, 0.3, 0, gy + 2.95, fv(D - 0.2))));
  add(mergeGeometries(pillars), stoneLight);
  // toldo: tela gris clara con algo de caída
  const sail = new THREE.PlaneGeometry(L - 0.4, D, 12, 4);
  const sp = sail.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const sag = Math.sin(((x / (L - 0.4)) * 4 + 0.5) * Math.PI) * 0.06 - (1 - (2 * y) / D) ** 2 * 0.05;
    sp.setXYZ(i, x, y, sag);
  }
  sail.rotateX(-Math.PI / 2);
  sail.translate(0, gy + 3.15, fv(D / 2));
  sail.computeVertexNormals();
  add(local(sail), toon({ color: 0xd9d4c8, side: THREE.DoubleSide }));
  // mesas en la terraza
  for (const u of [-L * 0.28, L * 0.22]) {
    const t = tableSet(r);
    t.translate(u, gy + 0.2, fv(D * 0.5));
    add(local(t), metal);
    physics.addBox(toWorld(u, gy + 0.6, fv(D * 0.5)), new THREE.Vector3(0.55, 0.4, 0.55), rot);
  }

  // ---- balcón de madera de la planta alta
  if (main.floors >= 2) {
    const BL = L * 0.75;
    const BD = 1.1;
    const by = gy + 2.9;
    const parts = [box(BL, 0.1, BD, 0, by, fv(BD / 2))];
    for (let u = -BL / 2; u <= BL / 2; u += 1.2) parts.push(box(0.12, 1.05, 0.12, u, by + 0.5, fv(BD - 0.06)));
    parts.push(box(BL, 0.08, 0.12, 0, by + 1.02, fv(BD - 0.06)));
    for (let u = -BL / 2; u <= BL / 2; u += 0.6) parts.push(box(0.12, 0.14, BD + 0.1, u, by - 0.1, fv(BD / 2)));
    add(local(mergeGeometries(parts)), wood);
    const rail: THREE.BufferGeometry[] = [];
    for (let u = -BL / 2 + 0.1; u <= BL / 2; u += 0.14) rail.push(box(0.025, 0.9, 0.025, u, by + 0.5, fv(BD - 0.06)));
    add(local(mergeGeometries(rail)), toon({ color: 0x2d2a28 }));
  }

  // ---- piscina
  {
    const { x, z, w, d } = POOL;
    const y = hm.at(x, z);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y + 0.42, z),
      toon({ color: 0x3fb3c4, transparent: true, opacity: 0.88, rim: 2 }),
    );
    water.name = 'pool';
    water.receiveShadow = true;
    group.add(water);
    const coping: THREE.BufferGeometry[] = [];
    const c = 0.45;
    // vaso elevado de granito (como las piscinas en ladera) con albardilla clara
    const wallsOut = [
      box(w + 2 * c, 0.85, c, x, y + 0.12, z - d / 2 - c / 2),
      box(w + 2 * c, 0.85, c, x, y + 0.12, z + d / 2 + c / 2),
      box(c, 0.85, d, x - w / 2 - c / 2, y + 0.12, z),
      box(c, 0.85, d, x + w / 2 + c / 2, y + 0.12, z),
    ];
    add(mergeGeometries(wallsOut), toon({ map: tex('granite'), color: 0xf4ece0 }));
    coping.push(box(w + 2 * c + 0.1, 0.1, c + 0.1, x, y + 0.6, z - d / 2 - c / 2));
    coping.push(box(w + 2 * c + 0.1, 0.1, c + 0.1, x, y + 0.6, z + d / 2 + c / 2));
    coping.push(box(c + 0.1, 0.1, d, x - w / 2 - c / 2, y + 0.6, z));
    coping.push(box(c + 0.1, 0.1, d, x + w / 2 + c / 2, y + 0.6, z));
    add(mergeGeometries(coping), stoneLight);
    // fondo y paredes interiores azuladas (se ven a través del agua)
    add(box(w, 0.05, d, x, y - 0.25, z), toon({ color: 0x6cc4d0 }), false);
    const walls = [box(w, 0.7, 0.05, x, y + 0.1, z - d / 2 + 0.03), box(w, 0.7, 0.05, x, y + 0.1, z + d / 2 - 0.03), box(0.05, 0.7, d, x - w / 2 + 0.03, y + 0.1, z), box(0.05, 0.7, d, x + w / 2 - 0.03, y + 0.1, z)];
    add(mergeGeometries(walls), toon({ color: 0x9ad8e0 }), false);
    // losas alrededor
    const slab = groundPatch(hm, x, z, 6.2, r);
    // solo el anillo de fuera: el centro lo tapa el vaso
    add(slab, toon({ map: tex('stone_slates'), polygonOffset: true, polygonOffsetFactor: -2 }), false);
    // no se puede caer a la piscina (aún)
    physics.addBox(new THREE.Vector3(x, y + 0.6, z), new THREE.Vector3(w / 2, 0.6, d / 2));
    // bolos de granito
    const rockMat = toon({ map: tex('boulder') });
    for (const [bx, bz, s] of [
      [x - w / 2 - 2.6, z - 1.5, 1.9],
      [x - w / 2 - 1.8, z + 2.4, 1.2],
      [x + 1.5, z - d / 2 - 2.6, 1.5],
      [x - 2.5, z - d / 2 - 2.2, 1.0],
      [x + w / 2 + 2.4, z - 2.0, 1.3],
    ]) {
      const g = boulder(r, s);
      g.translate(bx, hm.at(bx, bz) + s * 0.25, bz);
      add(g, rockMat);
      physics.addBox(new THREE.Vector3(bx, hm.at(bx, bz) + s * 0.4, bz), new THREE.Vector3(s * 0.8, s * 0.6, s * 0.8));
    }
  }

  // ---- parra amarilla con mesa entre el patio y la piscina
  {
    const cx = -11;
    const cz = 4;
    const y = hm.at(cx, cz);
    const W = 4.2;
    const H = 2.5;
    const posts: THREE.BufferGeometry[] = [];
    for (const [px, pz] of [
      [-W / 2, -W / 2],
      [W / 2, -W / 2],
      [-W / 2, W / 2],
      [W / 2, W / 2],
    ]) {
      posts.push(box(0.22, H, 0.22, cx + px, y + H / 2, cz + pz));
      physics.addBox(new THREE.Vector3(cx + px, y + H / 2, cz + pz), new THREE.Vector3(0.12, H / 2, 0.12));
    }
    add(mergeGeometries(posts), stoneLight);
    const beams: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) beams.push(box(W + 0.4, 0.08, 0.08, cx, y + H + 0.05, cz - W / 2 + (k * W) / 5));
    for (const s of [-1, 1]) beams.push(box(0.1, 0.12, W + 0.4, cx + (s * W) / 2, y + H, cz));
    add(mergeGeometries(beams), wood);
    // hojas de otoño: amarillas y alguna verde, con racimos
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g2 = c.getContext('2d')!;
    for (let i = 0; i < 30; i++) {
      const lx = 8 + r() * 112;
      const ly = 8 + r() * 112;
      const yellow = r() < 0.75;
      g2.fillStyle = yellow ? `hsl(${42 + r() * 12}, 75%, ${55 + r() * 15}%)` : `hsl(${80 + r() * 20}, 40%, 45%)`;
      g2.beginPath();
      for (let k = 0; k < 3; k++) g2.ellipse(lx + (k - 1) * 6, ly - (k === 1 ? 5 : 0), 8, 7, 0, 0, Math.PI * 2);
      g2.fill();
    }
    const leafTex = new THREE.CanvasTexture(c);
    leafTex.colorSpace = THREE.SRGBColorSpace;
    const leaves: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 26; k++) {
      const l = new THREE.PlaneGeometry(1.4, 1.4);
      l.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.8);
      l.rotateY(r() * Math.PI);
      l.translate(cx - W / 2 + r() * W, y + H + 0.15 + r() * 0.2, cz - W / 2 + r() * W);
      const nn = l.attributes.normal as THREE.BufferAttribute;
      for (let v = 0; v < nn.count; v++) nn.setXYZ(v, 0, 1, 0);
      leaves.push(l.toNonIndexed());
    }
    add(mergeGeometries(leaves), toon({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide }));
    const t = tableSet(r);
    t.translate(cx, y, cz);
    add(t, metal);
    physics.addBox(new THREE.Vector3(cx, y + 0.4, cz), new THREE.Vector3(0.55, 0.4, 0.55));
  }

  return group;
}

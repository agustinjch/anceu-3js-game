import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../core/stylize';
import { painted } from './painted';
import type { Physics } from '../core/physics';
import type { HeightMap, WorldData } from './terrain';

const FLOOR_H = 2.9;

interface OBB {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  angle: number;
}

/** Rectángulo orientado de área mínima (rotating calipers simplificado sobre las aristas). */
function minAreaRect(ring: [number, number][]): OBB {
  let best: OBB | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const ang = Math.atan2(bz - az, bx - ax);
    const c = Math.cos(-ang);
    const s = Math.sin(-ang);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of ring) {
      const u = x * c - z * s;
      const v = x * s + z * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      // de vuelta a mundo
      const ci = Math.cos(ang);
      const si = Math.sin(ang);
      best = { cx: cu * ci - cv * si, cz: cu * si + cv * ci, hx: (maxU - minU) / 2, hz: (maxV - minV) / 2, angle: ang };
    }
  }
  return best!;
}

function signedArea(ring: [number, number][]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/**
 * Muros extruidos siguiendo la huella real del Catastro, con UV en metros.
 * El color de vértice pinta la humedad del zócalo y la sombra bajo el alero.
 */
function wallGeometry(ring: [number, number][], y0: number, ground: number, y1: number, tint: THREE.Color) {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const r = signedArea(ring) > 0 ? ring : [...ring].reverse();
  // bandas: base enterrada / zócalo húmedo / muro / sombra del alero
  const ys = [y0, Math.min(ground + 0.9, y1 - 0.5), y1 - 0.35, y1];
  const shade = [0.5, 1.0, 1.0, 0.78];
  const damp = [1, 0, 0, 0];
  let u = 0;
  const s = 1 / 2.5; // la textura cubre 2.5 m
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    const len = Math.hypot(bx - ax, bz - az);
    const b = pos.length / 3;
    for (let k = 0; k < ys.length; k++) {
      const y = ys[k];
      pos.push(ax, y, az, bx, y, bz);
      uv.push(u * s, y * s, (u + len) * s, y * s);
      const sh = shade[k];
      // la humedad tira a verde musgo
      const cr = tint.r * sh * (1 - 0.12 * damp[k]);
      const cg = tint.g * sh;
      const cb = tint.b * sh * (1 - 0.2 * damp[k]);
      col.push(cr, cg, cb, cr, cg, cb);
    }
    for (let k = 0; k < ys.length - 1; k++) {
      const a0 = b + k * 2;
      idx.push(a0, a0 + 3, a0 + 1, a0, a0 + 2, a0 + 3);
    }
    u += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface RoofShape {
  pts: number[][];
  faces: number[][];
  H: number;
  long: boolean;
  hx: number;
  hz: number;
}

/** Tejado a cuatro aguas (o casi a dos, si la planta es alargada) sobre el rectángulo orientado. */
function roofShape(o: OBB, pitch: number, overhang: number): RoofShape {
  const hx = o.hx + overhang;
  const hz = o.hz + overhang;
  const long = hx >= hz;
  const H = Math.min(hx, hz) * pitch * 2;
  const ridge = long ? Math.max(hx - hz * 0.9, 0.2) : Math.max(hz - hx * 0.9, 0.2);
  const pts = long
    ? [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz], [-ridge, H, 0], [ridge, H, 0]]
    : [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz], [0, H, -ridge], [0, H, ridge]];
  const faces = long
    ? [[0, 4, 5, 1], [2, 5, 4, 3], [1, 5, 2], [3, 4, 0]]
    : [[1, 4, 5, 2], [3, 5, 4, 0], [0, 4, 1], [2, 5, 3]];
  return { pts, faces, H, long, hx, hz };
}

function placeOnObb(g: THREE.BufferGeometry, o: OBB, y: number) {
  g.rotateY(-o.angle);
  g.translate(o.cx, y, o.cz);
  return g;
}

/** Faldones con tejas en hileras ladera abajo + canto grueso del alero. */
function roofGeometry(o: OBB, y: number, rs: RoofShape) {
  const { pts, faces } = rs;
  const pos: number[] = [];
  const uv: number[] = [];
  const s = 1 / 2.0;
  const tmp = new THREE.Vector3();
  const tri = (a: number[], b: number[], c: number[]) => {
    const n = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)))
      .normalize();
    const tan = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
    if (tan.lengthSq() < 0.01) tan.set(1, 0, 0);
    const bit = new THREE.Vector3().crossVectors(n, tan);
    for (const p of [a, b, c]) {
      tmp.set(p[0], p[1], p[2]);
      pos.push(p[0], p[1], p[2]);
      uv.push(tmp.dot(tan) * s, tmp.dot(bit) * s);
    }
  };
  for (const f of faces) {
    const P = f.map((i) => pts[i]);
    tri(P[0], P[1], P[2]);
    if (P.length === 4) tri(P[0], P[2], P[3]);
  }
  // canto del alero: el tejado tiene grosor
  const T = 0.16;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const a2 = [a[0], a[1] - T, a[2]];
    const b2 = [b[0], b[1] - T, b[2]];
    tri(a, a2, b2);
    tri(a, b2, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return placeOnObb(g, o, y);
}

/** Cumbrera y limas: rollos de teja sobre las aristas del tejado. */
function ridgeGeometry(o: OBB, y: number, rs: RoofShape) {
  const { pts } = rs;
  const parts: THREE.BufferGeometry[] = [];
  const seg = (a: number[], b: number[], r: number) => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    if (len < 0.05) return;
    const c = new THREE.CylinderGeometry(r, r, len, 6, 1);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    c.translate((A.x + B.x) / 2, (A.y + B.y) / 2 + r * 0.4, (A.z + B.z) / 2);
    parts.push(c.toNonIndexed());
  };
  seg(pts[4], pts[5], 0.15);
  // limas: de cada extremo de la cumbrera a sus esquinas
  const pairs = rs.long ? [[4, 0], [4, 3], [5, 1], [5, 2]] : [[4, 0], [4, 1], [5, 2], [5, 3]];
  for (const [a, b] of pairs) seg(pts[a], pts[b], 0.1);
  return placeOnObb(mergeGeometries(parts), o, y);
}

export interface BuildingInfo {
  id: string;
  obb: OBB;
  ground: number;
  top: number;
  floors: number;
}

function hash(str: string, k = 0) {
  let h = 2166136261 ^ k;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const M4 = () => new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

/** Pinturas de carpintería típicas: verde, azul, burdeos, madera. */
const JOINERY = [0x3f6b4a, 0x3b5f80, 0x7a2e2a, 0x8a5a36, 0x2f5a5a, 0xe9e2d0];
/** Revocos: crema, blanco roto, ocre pálido, rosa viejo. */
const PLASTER = [0xfff3dc, 0xf6f1e8, 0xf4dcae, 0xf0d4c4];

/**
 * Construye todas las casas de la aldea a partir de las huellas reales del Catastro:
 * granito o revoco con esquinas de cantería, tejado de teja con cumbrera y chimenea,
 * ventanas con recercado de piedra y carpintería pintada, contraventanas y solainas.
 */
export async function buildVillage(world: WorldData, hm: HeightMap, physics: Physics) {
  const tex = (n: string) => painted(n)!;
  const graniteMat = toon({ map: tex('granite'), vertexColors: true });
  const plasterMat = toon({ map: tex('plaster'), vertexColors: true });
  const stoneLight = toon({ map: tex('granite_light'), color: 0xe6dccb });
  const roofMat = toon({ map: tex('roof_tiles'), color: 0xf2dccb, side: THREE.DoubleSide });
  const ridgeMat = toon({ color: 0xa3533a });
  const joineryMat = toon({ color: 0xffffff });
  const glassMat = toon({ color: 0x2b3d4f, rim: 2.5 });
  const woodMat = toon({ map: tex('wood_planks') });
  const doorMat = toon({ map: tex('wood_planks') });

  const graniteWalls: THREE.BufferGeometry[] = [];
  const plasterWalls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const ridges: THREE.BufferGeometry[] = [];
  const quoins: THREE.BufferGeometry[] = [];
  const stoneBits: THREE.BufferGeometry[] = [];
  const woodBits: THREE.BufferGeometry[] = [];
  const windows: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const shutters: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const doors: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const infos: BuildingInfo[] = [];

  for (const b of world.buildings) {
    const floors = Math.max(b.floors, 0);
    const shed = floors === 0; // alpendre / galpón
    const height = shed ? 2.4 : floors * FLOOR_H;
    const yb = b.ground - 1.5;
    let top = b.ground + height;
    const maxG = Math.max(...b.ring.map(([x, z]) => hm.at(x, z)));
    if (maxG - b.ground > height * 0.6) top = maxG + 2.4;

    const plastered = !shed && hash(b.id) < 0.35;
    const tint = plastered ? new THREE.Color(PLASTER[Math.floor(hash(b.id, 1) * PLASTER.length)]) : new THREE.Color(1, 1, 1).multiplyScalar(0.92 + hash(b.id, 2) * 0.16);
    (plastered ? plasterWalls : graniteWalls).push(wallGeometry(b.ring, yb, b.ground, top, tint));

    const o = minAreaRect(b.ring);
    const rs = roofShape(o, shed ? 0.3 : 0.42, shed ? 0.3 : 0.55);
    roofs.push(roofGeometry(o, top, rs));
    ridges.push(ridgeGeometry(o, top, rs));
    infos.push({ id: b.id, obb: o, ground: b.ground, top, floors });

    const r = signedArea(b.ring) > 0 ? b.ring : [...b.ring].reverse();

    // cantería en las esquinas: sillares alternos que asoman del muro
    if (!shed)
      for (let i = 0; i < r.length; i++) {
        const [px, pz] = r[(i - 1 + r.length) % r.length];
        const [ax, az] = r[i];
        const [bx, bz] = r[(i + 1) % r.length];
        const d1 = new THREE.Vector2(ax - px, az - pz).normalize();
        const d2 = new THREE.Vector2(bx - ax, bz - az).normalize();
        if (Math.abs(d1.dot(d2)) > 0.7) continue; // no es una esquina de verdad
        // solo esquinas salientes: la arista siguiente gira hacia dentro
        if (d2.x * d1.y - d2.y * d1.x > 0) continue;
        const g0 = hm.at(ax, az);
        for (let y = Math.max(g0 - 0.2, yb), k = 0; y < top - 0.3; y += 0.34, k++) {
          const along = k % 2 ? d2 : d1.clone().negate();
          const L = 0.55;
          const blk = new THREE.BoxGeometry(L, 0.3, 0.3);
          blk.rotateY(-Math.atan2(along.y, along.x));
          blk.translate(ax + along.x * (L / 2 - 0.18), y + 0.15, az + along.y * (L / 2 - 0.18));
          quoins.push(blk.toNonIndexed());
        }
      }

    // carpintería de la casa
    const jc = new THREE.Color(JOINERY[Math.floor(hash(b.id, 3) * JOINERY.length)]);
    const hasShutters = hash(b.id, 4) < 0.55;
    let doorPlaced = shed;
    let longest = { len: 0, i: 0 };
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[(i + 1) % r.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len > longest.len) longest = { len, i };
      if (len < 2.6) continue;
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      const rotY = Math.atan2(nx, nz);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
      const n = Math.max(1, Math.floor(len / 3.4));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t + nx * 0.01;
        const z = az + (bz - az) * t + nz * 0.01;
        const g = hm.at(x, z);
        for (let f = 0; f < Math.max(1, floors); f++) {
          const y = b.ground + f * FLOOR_H;
          if (y + 1.2 < g) continue; // planta enterrada en la ladera
          if (!doorPlaced && f === 0 && k === Math.floor(n / 2) && len > 4) {
            doors.push({ m: M4().compose(new THREE.Vector3(x, Math.max(g, y), z), q, new THREE.Vector3(1, 1, 1)), c: jc });
            doorPlaced = true;
            continue;
          }
          if (shed) continue;
          const wm = M4().compose(new THREE.Vector3(x, y + 1.0, z), q, new THREE.Vector3(1, 1, 1));
          windows.push({ m: wm, c: jc });
          if (hasShutters) shutters.push({ m: wm, c: jc });
        }
      }
    }

    // chimenea de granito junto a la cumbrera
    if (!shed && hash(b.id, 5) < 0.8) {
      const side = hash(b.id, 6) < 0.5 ? -1 : 1;
      const along = rs.long ? [rs.hx * 0.35 * side, 0] : [0, rs.hz * 0.35 * side];
      const ch = box(0.62, rs.H + 1.3, 0.62, along[0], (rs.H + 1.3) / 2 - 0.2, along[1]);
      const cap = box(0.85, 0.1, 0.85, along[0], rs.H + 1.1, along[1]);
      stoneBits.push(placeOnObb(mergeGeometries([ch, cap]), o, top));
    }

    // solaina: balcón corrido de madera en la fachada larga de las casas de dos plantas
    if (floors >= 2 && longest.len > 6 && hash(b.id, 7) < 0.5) {
      const [ax, az] = r[longest.i];
      const [bx, bz] = r[(longest.i + 1) % r.length];
      const len = longest.len;
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      const L = len * 0.62;
      const D = 1.1;
      const y = b.ground + FLOOR_H;
      const parts: THREE.BufferGeometry[] = [box(L, 0.12, D, 0, 0, D / 2)];
      for (let px = -L / 2 + 0.05; px <= L / 2; px += 0.9) parts.push(box(0.1, 1.0, 0.1, px, 0.5, D - 0.05));
      for (let px = -L / 2 + 0.05; px <= L / 2; px += 0.18) parts.push(box(0.04, 0.85, 0.04, px, 0.45, D - 0.05));
      parts.push(box(L, 0.08, 0.14, 0, 1.0, D - 0.05));
      // vigas que la sostienen
      for (let px = -L / 2 + 0.3; px <= L / 2; px += 1.4) parts.push(box(0.14, 0.16, D + 0.1, px, -0.12, D / 2));
      const bal = mergeGeometries(parts);
      bal.rotateY(Math.atan2(nx, nz));
      bal.translate((ax + bx) / 2, y, (az + bz) / 2);
      woodBits.push(bal);
      const c = new THREE.Vector3((ax + bx) / 2 + nx * D * 0.5, y + 0.06, (az + bz) / 2 + nz * D * 0.5);
      physics.addBox(c, new THREE.Vector3(L / 2, 0.08, D / 2), Math.atan2(nx, nz));
    }
  }

  const group = new THREE.Group();
  group.name = 'village';
  const mesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, collide = false) => {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (collide) physics.addTrimesh(m);
    return m;
  };
  mesh(graniteWalls, graniteMat, true);
  mesh(plasterWalls, plasterMat, true);
  mesh(roofs, roofMat, true);
  mesh(ridges, ridgeMat);
  mesh(quoins, stoneLight);
  mesh(stoneBits, stoneLight, true);
  mesh(woodBits, woodMat);

  // --- ventana: recercado de granito, marco pintado, vidrio, contraventanas ---
  const surroundGeo = mergeGeometries([
    box(1.36, 0.24, 0.16, 0, 0.74, 0.08), // dintel
    box(1.42, 0.12, 0.3, 0, -0.68, 0.12), // alféizar
    box(0.18, 1.3, 0.14, -0.6, 0, 0.07),
    box(0.18, 1.3, 0.14, 0.6, 0, 0.07),
  ]);
  const frameGeo = mergeGeometries([
    box(1.02, 0.08, 0.06, 0, 0.58, 0.05),
    box(1.02, 0.08, 0.06, 0, -0.58, 0.05),
    box(0.08, 1.2, 0.06, -0.47, 0, 0.05),
    box(0.08, 1.2, 0.06, 0.47, 0, 0.05),
    box(0.05, 1.1, 0.05, 0, 0, 0.06),
    box(0.9, 0.05, 0.05, 0, 0.18, 0.06),
  ]);
  const glassGeo = box(0.94, 1.12, 0.02, 0, 0, 0.025);
  const shutterGeo = mergeGeometries([
    box(0.48, 1.18, 0.05, -0.86, 0, 0.04),
    box(0.48, 1.18, 0.05, 0.86, 0, 0.04),
    box(0.4, 0.06, 0.03, -0.86, 0.3, 0.075),
    box(0.4, 0.06, 0.03, -0.86, -0.3, 0.075),
    box(0.4, 0.06, 0.03, 0.86, 0.3, 0.075),
    box(0.4, 0.06, 0.03, 0.86, -0.3, 0.075),
  ]);
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: { m: THREE.Matrix4; c?: THREE.Color }[], colored: boolean) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((w, i) => {
      im.setMatrixAt(i, w.m);
      if (colored && w.c) im.setColorAt(i, w.c);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  };
  inst(surroundGeo, stoneLight, windows, false);
  inst(frameGeo, joineryMat, windows, true);
  inst(glassGeo, glassMat, windows, false);
  inst(shutterGeo, joineryMat, shutters, true);

  // --- puerta: recercado de cantería + hoja de tablas pintada ---
  const doorSurround = mergeGeometries([
    box(1.6, 0.3, 0.18, 0, 2.3, 0.09),
    box(0.25, 2.3, 0.16, -0.68, 1.1, 0.08),
    box(0.25, 2.3, 0.16, 0.68, 1.1, 0.08),
    box(1.6, 0.12, 0.5, 0, 0.0, 0.25), // soleira
  ]);
  const doorLeaf = mergeGeometries([box(1.1, 2.12, 0.06, 0, 1.08, 0.04), box(0.08, 0.08, 0.06, 0.4, 1.1, 0.09)]);
  inst(doorSurround, stoneLight, doors, false);
  inst(doorLeaf, doorMat, doors, true);

  return {
    group,
    infos,
    doors: doors.map((d) => d.m),
    windows: windows.map((w) => w.m),
  };
}

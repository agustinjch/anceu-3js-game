import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../core/assets';
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

/** Muros extruidos siguiendo la huella real del Catastro, con UV en metros. */
function wallGeometry(ring: [number, number][], y0: number, y1: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const r = signedArea(ring) > 0 ? ring : [...ring].reverse();
  let u = 0;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    const len = Math.hypot(bx - ax, bz - az);
    const b = pos.length / 3;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    const s = 1 / 2.5; // la textura cubre 2.5 m
    uv.push(u * s, y0 * s, (u + len) * s, y0 * s, (u + len) * s, y1 * s, u * s, y1 * s);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    u += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tejado a cuatro aguas (o dos, si la planta es alargada) sobre el rectángulo orientado. */
function roofGeometry(o: OBB, y: number, pitch = 0.42, overhang = 0.45) {
  const hx = o.hx + overhang;
  const hz = o.hz + overhang;
  const long = hx >= hz;
  const H = Math.min(hx, hz) * pitch * 2;
  const ridge = long ? Math.max(hx - hz * 0.9, 0.2) : Math.max(hz - hx * 0.9, 0.2);
  const pts = long
    ? [
        [-hx, 0, -hz],
        [hx, 0, -hz],
        [hx, 0, hz],
        [-hx, 0, hz],
        [-ridge, H, 0],
        [ridge, H, 0],
      ]
    : [
        [-hx, 0, -hz],
        [hx, 0, -hz],
        [hx, 0, hz],
        [-hx, 0, hz],
        [0, H, -ridge],
        [0, H, ridge],
      ];
  const faces = long
    ? [
        [0, 4, 5, 1],
        [2, 5, 4, 3],
        [1, 5, 2],
        [3, 4, 0],
      ]
    : [
        [1, 4, 5, 2],
        [3, 5, 4, 0],
        [0, 4, 1],
        [2, 5, 3],
      ];
  const pos: number[] = [];
  const uv: number[] = [];
  const s = 1 / 2.0;
  const tmp = new THREE.Vector3();
  const tri = (a: number[], b: number[], c: number[]) => {
    // UV proyectadas en el plano del faldón (tejas en hileras ladera abajo)
    const n = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)))
      .normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const tan = new THREE.Vector3().crossVectors(up, n).normalize();
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.rotateY(-o.angle);
  g.translate(o.cx, y, o.cz);
  return g;
}

export interface BuildingInfo {
  id: string;
  obb: OBB;
  ground: number;
  top: number;
  floors: number;
}

/**
 * Construye todas las casas de la aldea a partir de las huellas reales del Catastro:
 * muros de granito, tejados de teja, ventanas blancas y puertas de madera.
 */
export async function buildVillage(world: WorldData, hm: HeightMap, physics: Physics) {
  const [granite, roof, wood] = await Promise.all([pbr('granite', 1), pbr('roof_tiles', 1), pbr('wood_weathered', 1)]);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xd8d0c2,
    roughness: 0.92,
    map: granite.map,
    normalMap: granite.normalMap,
    roughnessMap: granite.roughnessMap,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xe0a080,
    roughness: 0.85,
    map: roof.map,
    normalMap: roof.normalMap,
    roughnessMap: roof.roughnessMap,
    side: THREE.DoubleSide,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2328, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.5 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: 0.7, map: wood.map, normalMap: wood.normalMap });

  const walls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const windows: THREE.Matrix4[] = [];
  const doors: THREE.Matrix4[] = [];
  const infos: BuildingInfo[] = [];

  for (const b of world.buildings) {
    const floors = Math.max(b.floors, 0);
    const height = floors === 0 ? 2.4 : floors * FLOOR_H;
    // los muros arrancan bajo el punto más bajo (casas en ladera, como en Anceu)
    const yb = b.ground - 1.5;
    let top = b.ground + height;
    // asentamos la base: la cara superior sobre el punto más alto del terreno si la ladera es fuerte
    const maxG = Math.max(...b.ring.map(([x, z]) => hm.at(x, z)));
    if (maxG - b.ground > height * 0.6) top = maxG + 2.4;
    walls.push(wallGeometry(b.ring, yb, top));
    const o = minAreaRect(b.ring);
    roofs.push(roofGeometry(o, top, floors === 0 ? 0.3 : 0.42, floors === 0 ? 0.3 : 0.5));
    infos.push({ id: b.id, obb: o, ground: b.ground, top, floors });

    // ventanas y puertas en cada fachada larga
    const r = signedArea(b.ring) > 0 ? b.ring : [...b.ring].reverse();
    let doorPlaced = floors === 0;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[(i + 1) % r.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2.6) continue;
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      const rotY = Math.atan2(nx, nz);
      const n = Math.max(1, Math.floor(len / 3.4));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t + nx * 0.02;
        const z = az + (bz - az) * t + nz * 0.02;
        const g = hm.at(x, z);
        for (let f = 0; f < Math.max(1, floors); f++) {
          const y = b.ground + f * FLOOR_H;
          if (y + 1.2 < g) continue; // planta enterrada en la ladera
          if (!doorPlaced && f === 0 && k === Math.floor(n / 2) && len > 4) {
            doors.push(new THREE.Matrix4().compose(new THREE.Vector3(x, Math.max(g, y), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
            doorPlaced = true;
            continue;
          }
          if (floors === 0) continue;
          windows.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'village';
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), wallMat);
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  const roofMesh = new THREE.Mesh(mergeGeometries(roofs), roofMat);
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  group.add(wallMesh, roofMesh);

  // ventana: marco blanco + vidrio, ligeramente saliente
  const frameGeo = new THREE.BoxGeometry(1.0, 1.25, 0.12);
  const glassGeo = new THREE.BoxGeometry(0.82, 1.07, 0.14);
  const fr = new THREE.InstancedMesh(frameGeo, frameMat, windows.length);
  const gl = new THREE.InstancedMesh(glassGeo, glassMat, windows.length);
  windows.forEach((m, i) => {
    fr.setMatrixAt(i, m);
    gl.setMatrixAt(i, m);
  });
  const doorGeo = new THREE.BoxGeometry(1.05, 2.1, 0.12).translate(0, 1.05, 0);
  const dr = new THREE.InstancedMesh(doorGeo, doorMat, doors.length);
  doors.forEach((m, i) => dr.setMatrixAt(i, m));
  fr.castShadow = dr.castShadow = true;
  group.add(fr, gl, dr);

  physics.addTrimesh(wallMesh);
  physics.addTrimesh(roofMesh);

  return { group, infos };
}

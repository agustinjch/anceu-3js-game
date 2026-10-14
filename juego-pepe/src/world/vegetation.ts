import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assets } from '../core/assets';
import { addRim, toon } from '../core/stylize';
import { paintGroundAt } from './paint';
import type { HeightMap } from './terrain';

/** Mallas de un GLB convertidas a InstancedMesh que comparten matrices de instancia. */
class InstancedModel {
  group = new THREE.Group();
  meshes: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
  private tmp = new THREE.Matrix4();

  constructor(root: THREE.Object3D, max: number, targetHeight: number, castShadow = true) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const h = box.max.y - box.min.y || 1;
    const norm = new THREE.Matrix4()
      .makeScale(targetHeight / h, targetHeight / h, targetHeight / h)
      .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      // hojas: alpha-test en vez de transparencia (sin problemas de orden)
      if (mat.transparent || mat.alphaTest > 0) {
        mat.transparent = false;
        mat.alphaTest = 0.45;
        mat.side = THREE.DoubleSide;
      }
      addWind(mat, targetHeight);
      addRim(mat, m.userData.leaves ? 0.8 : 0.4);
      const im = new THREE.InstancedMesh(m.geometry, mat, max);
      if (m.userData.leaves) im.setColorAt(0, new THREE.Color());
      im.count = 0;
      im.castShadow = castShadow;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.meshes.push({ mesh: im, local: norm.clone().multiply(m.matrixWorld) });
      this.group.add(im);
    });
  }

  set(i: number, m: THREE.Matrix4, color?: THREE.Color) {
    for (const { mesh, local } of this.meshes) {
      mesh.setMatrixAt(i, this.tmp.multiplyMatrices(m, local));
      if (color && mesh.instanceColor) mesh.setColorAt(i, color);
    }
  }

  commit(count: number) {
    for (const { mesh } of this.meshes) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

const windTime = { value: 0 };

/** Balanceo por viento en el vertex shader, proporcional a la altura. */
function addWind(mat: THREE.Material, height: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float hk = clamp(transformed.y / ${height.toFixed(1)}, 0.0, 1.0);
          float ph = ip.x * 0.13 + ip.z * 0.17;
          transformed.x += sin(uWind * 1.3 + ph) * 0.12 * hk * hk;
          transformed.z += cos(uWind * 1.1 + ph * 1.3) * 0.09 * hk * hk;
        #endif`,
      );
  };
}

/** Textura de mata de hierba: hojas finas dibujadas en canvas, alfa recortado. */
function grassTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // hojas en gris claro con degradado raíz→punta: el color lo pone la instancia (el suelo)
  for (let i = 0; i < 60; i++) {
    const x = 6 + rnd() * 116;
    const h = 50 + rnd() * 76;
    const bend = (rnd() - 0.5) * 30;
    const w = 1.6 + rnd() * 2;
    const grd = g.createLinearGradient(0, 128, 0, 128 - h);
    const k = 0.85 + rnd() * 0.15;
    grd.addColorStop(0, `rgb(${175 * k},${178 * k},${165 * k})`);
    grd.addColorStop(1, `rgb(${255 * k},${250 * k},${215 * k})`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - w, 128);
    g.quadraticCurveTo(x - w * 0.4 + bend * 0.4, 128 - h * 0.55, x + bend, 128 - h);
    g.quadraticCurveTo(x + w * 0.4 + bend * 0.4, 128 - h * 0.55, x + w, 128);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hierba densa y barata: 3 planos cruzados por mata, instanciados alrededor del jugador. */
function grassCards(max: number) {
  const W = 0.8;
  const H = 0.32;
  const quads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const q = new THREE.PlaneGeometry(W * 0.75, H).translate(0, H / 2, 0);
    // inclinado hacia fuera desde la base
    q.rotateX(-0.55);
    q.translate(0, 0, 0.06);
    q.rotateY((i / 5) * Math.PI * 2);
    quads.push(q);
  }
  const geo = mergeGeometries(quads);
  // normales hacia arriba: la mata se ilumina como el suelo, sin caras oscuras
  const n = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = toon({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, rim: 0.6 });
  addWind(mat, H);
  addRim(mat, 0.6);
  const im = new THREE.InstancedMesh(geo, mat, max);
  im.count = 0;
  im.receiveShadow = true;
  im.frustumCulled = false;
  // sin profundidad: no genera contornos y se dibuja al final sobre lo que ya hay
  mat.depthWrite = false;
  im.renderOrder = 5;
  im.setColorAt(0, new THREE.Color());
  return im;
}

/** Textura de racimo de hojas: manchas ovaladas claras con borde algo más oscuro. */
let leafTex: THREE.Texture | null = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 46;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    const l = 200 + rnd() * 55;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI);
    g.fillStyle = `rgb(${l * 0.82},${l * 0.82},${l * 0.78})`;
    g.beginPath();
    g.ellipse(0, 0, 13 + rnd() * 6, 7 + rnd() * 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgb(${l},${l},${l * 0.94})`;
    g.beginPath();
    g.ellipse(-1.5, -1.5, 10 + rnd() * 4, 5 + rnd() * 2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

interface TreeShape {
  trunkH: number;
  trunkR: number;
  clumps: { p: [number, number, number]; r: number }[];
  leaf: number;
  bark: number;
  cards: number;
}

const SHAPES: Record<string, TreeShape> = {
  // carballo: copa ancha e irregular
  oak: {
    trunkH: 4.2,
    trunkR: 0.42,
    clumps: [
      { p: [0, 6.6, 0], r: 2.7 },
      { p: [2.0, 5.6, 0.6], r: 2.0 },
      { p: [-1.9, 5.8, -0.5], r: 2.1 },
      { p: [0.4, 5.5, 2.0], r: 1.9 },
      { p: [-0.5, 5.4, -2.0], r: 1.9 },
      { p: [0.6, 8.3, -0.3], r: 1.7 },
    ],
    leaf: 0x5f8236,
    bark: 0x5a4636,
    cards: 16,
  },
  // castiñeiro: más redondo y denso
  chestnut: {
    trunkH: 3.6,
    trunkR: 0.5,
    clumps: [
      { p: [0, 6.0, 0], r: 3.0 },
      { p: [1.8, 5.0, 1.0], r: 2.1 },
      { p: [-1.8, 5.1, 0.9], r: 2.1 },
      { p: [0.2, 5.0, -2.0], r: 2.0 },
      { p: [0, 7.8, 0.3], r: 2.0 },
    ],
    leaf: 0x8a8f3c,
    bark: 0x4e3d30,
    cards: 16,
  },
  // piñeiro do país: tronco alto y copa en parasol
  pine: {
    trunkH: 11,
    trunkR: 0.34,
    clumps: [
      { p: [0, 12.2, 0], r: 2.3 },
      { p: [1.8, 11.4, 0.5], r: 1.6 },
      { p: [-1.6, 11.6, -0.6], r: 1.7 },
      { p: [0.2, 13.4, 0.2], r: 1.4 },
    ],
    leaf: 0x3f5f37,
    bark: 0x6a4a36,
    cards: 14,
  },
};

/**
 * Árbol "esponjoso" pintado: tronco + racimos de tarjetas de hojas cuyas normales salen
 * del centro de la copa (sombreado blando y redondo, como en las películas de animación).
 */
function fluffyTree(kind: string, lod = 0) {
  const sh = SHAPES[kind] ?? SHAPES.oak;
  let seed = kind.length * 97 + lod;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const root = new THREE.Group();

  // tronco con dos ramas
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(sh.trunkR * 0.55, sh.trunkR, sh.trunkH + 1.2, lod ? 5 : 8).translate(0, (sh.trunkH + 1.2) / 2, 0)];
  if (!lod)
    for (let b = 0; b < 2; b++) {
      const br = new THREE.CylinderGeometry(sh.trunkR * 0.2, sh.trunkR * 0.4, 2.4, 5).translate(0, 1.2, 0);
      br.rotateZ((b ? 1 : -1) * 0.75);
      br.rotateY(rnd() * Math.PI);
      br.translate(0, sh.trunkH * 0.85, 0);
      parts.push(br);
    }
  const trunk = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), toon({ color: sh.bark, rim: 0.3 }));
  trunk.castShadow = true;
  root.add(trunk);

  // copa
  const center = new THREE.Vector3();
  for (const c of sh.clumps) center.add(new THREE.Vector3(...c.p));
  center.divideScalar(sh.clumps.length);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const cards = lod ? Math.ceil(sh.cards * 0.45) : sh.cards;
  let base = 0;
  for (const c of sh.clumps) {
    const cp = new THREE.Vector3(...c.p);
    for (let k = 0; k < cards; k++) {
      // punto en la esfera del racimo, más denso hacia fuera
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.6 - 0.6, rnd() * 2 - 1).normalize();
      const at = cp.clone().addScaledVector(dir, c.r * (0.45 + 0.4 * rnd()));
      const size = c.r * (lod ? 1.5 : 1.15) * (0.8 + 0.4 * rnd());
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      q.setFromEuler(e);
      const corners = [
        [-1, -1, 0, 0],
        [1, -1, 1, 0],
        [1, 1, 1, 1],
        [-1, 1, 0, 1],
      ];
      for (const [x, y, u, w] of corners) {
        v.set(x * size * 0.5, y * size * 0.5, 0).applyQuaternion(q).add(at);
        pos.push(v.x, v.y, v.z);
        // normal esférica respecto a la copa entera, algo inclinada hacia arriba
        const n = v.clone().sub(center).normalize().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.25, 0)).normalize();
        nor.push(n.x, n.y, n.z);
        uv.push(u, w);
        // oclusión: más oscuro dentro y abajo de la copa
        const inner = THREE.MathUtils.clamp(v.distanceTo(center) / (c.r * 2.2), 0, 1);
        const low = THREE.MathUtils.clamp((v.y - center.y) / (c.r * 2) + 0.5, 0, 1);
        const ao = 0.55 + 0.3 * inner + 0.2 * low;
        col.push(ao, ao, ao);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  lg.setIndex(idx);
  const leaves = new THREE.Mesh(
    lg,
    toon({ color: sh.leaf, map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }),
  );
  leaves.userData.leaves = true;
  leaves.castShadow = true;
  root.add(leaves);
  return root;
}

const TREE_H: Record<string, number> = { oak: 12, chestnut: 10, pine: 17 };

/** Los GLB de plantas traen varias variantes como nodos hijos: nos quedamos con una. */
function variant(root: THREE.Object3D, i = 0) {
  const meshes: THREE.Object3D[] = [];
  root.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o));
  if (meshes.length <= 1) return root;
  const pick = meshes[i % meshes.length];
  const g = new THREE.Group();
  pick.updateWorldMatrix(true, false);
  const c = pick.clone();
  c.matrix.copy(pick.matrixWorld);
  c.matrix.decompose(c.position, c.quaternion, c.scale);
  c.position.set(0, c.position.y, 0);
  g.add(c);
  return g;
}

/**
 * Bosque real de Anceu: las posiciones vienen de la ortofoto. Cerca del jugador se usan
 * modelos detallados; lejos, siluetas baratas. Además hay sotobosque (fentos, hierba) que
 * se regenera alrededor del jugador.
 */
export class Vegetation {
  group = new THREE.Group();
  private trees: { p: THREE.Vector3; s: number; rot: number; kind: string }[] = [];
  private near: Record<string, InstancedModel> = {};
  private far: Record<string, InstancedModel> = {};
  private ferns?: InstancedModel;
  private grass?: InstancedModel;
  private cards!: THREE.InstancedMesh;
  private cardStep = 0.8;
  private clearings: [number, number, number][] = [];
  /** Color pintado del suelo (la hierba nace de él). */
  groundColor?: (x: number, z: number, out: THREE.Color) => THREE.Color;
  /** Cota del encoro: sin hierba bajo el agua. */
  waterLevel = -Infinity;
  private lastFocus = new THREE.Vector3(1e9, 0, 0);
  private lastCover = new THREE.Vector3(1e9, 0, 0);
  private NEAR = 110;
  private MAX_NEAR = 420;
  hidden = new Set<number>();

  constructor(
    private hm: HeightMap,
    private blocked: (x: number, z: number, pad: number) => boolean,
  ) {}

  async build(trees: [number, number, number, string][], low: boolean) {
    if (low) {
      this.NEAR = 80;
      this.MAX_NEAR = 260;
      this.cardStep = 1.1;
    }
    this.cards = grassCards(low ? 2600 : 5200);
    this.group.add(this.cards);
    for (const [x, z, s, kind] of trees) {
      this.trees.push({ p: new THREE.Vector3(x, this.hm.at(x, z) - 0.2, z), s, rot: Math.random() * Math.PI * 2, kind });
    }
    const kinds = ['oak', 'chestnut', 'pine'];
    for (const k of kinds) {
      const total = this.trees.filter((t) => t.kind === k).length;
      this.near[k] = new InstancedModel(fluffyTree(k), this.MAX_NEAR, TREE_H[k]);
      // lejos: menos tarjetas y sin sombras
      this.far[k] = new InstancedModel(fluffyTree(k, 1), total, TREE_H[k], false);
      this.group.add(this.near[k].group, this.far[k].group);
    }

    const fern = await assets.optionalModel('models/env/fern_stylized.glb');
    if (fern) {
      this.ferns = new InstancedModel(fern.scene, 500, 0.7, false);
      this.group.add(this.ferns.group);
    }
    const grass = null as { scene: THREE.Object3D } | null; // los hierbajos fotográficos no encajan con el estilo
    if (grass) {
      this.grass = new InstancedModel(variant(grass.scene, 1), 700, 0.5, false);
      this.group.add(this.grass.group);
    }
  }

  /** Árboles cuyo tronco bloquea al jugador (para colisiones baratas). */
  treesNear(x: number, z: number, r: number) {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < this.trees.length; i++) {
      if (this.hidden.has(i)) continue;
      const t = this.trees[i];
      if (Math.abs(t.p.x - x) < r && Math.abs(t.p.z - z) < r) out.push(t.p);
    }
    return out;
  }

  /** Oculta árboles en un radio (para despejar zonas de juego). */
  clearArea(x: number, z: number, r: number) {
    this.trees.forEach((t, i) => {
      if (Math.hypot(t.p.x - x, t.p.z - z) < r) this.hidden.add(i);
    });
    this.clearings.push([x, z, r]);
    this.cardCache?.clear();
    this.coverCache?.clear();
    this.lastFocus.set(1e9, 0, 0);
    this.lastCover.set(1e9, 0, 0);
  }

  update(t: number, focus: THREE.Vector3) {
    windTime.value = t;
    if (focus.distanceToSquared(this.lastFocus) > 64) {
      this.lastFocus.copy(focus);
      this.rebuildTrees(focus);
    }
    if (focus.distanceToSquared(this.lastCover) > 225) {
      this.lastCover.copy(focus);
      this.rebuildCover(focus);
    }
  }

  private rebuildTrees(focus: THREE.Vector3) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const counts: Record<string, number> = { oak: 0, chestnut: 0, pine: 0 };
    const farCounts: Record<string, number> = { oak: 0, chestnut: 0, pine: 0 };
    const tint = new THREE.Color();
    const near2 = this.NEAR * this.NEAR;
    for (let i = 0; i < this.trees.length; i++) {
      if (this.hidden.has(i)) continue;
      const tr = this.trees[i];
      q.setFromAxisAngle(up, tr.rot);
      const d2 = (tr.p.x - focus.x) ** 2 + (tr.p.z - focus.z) ** 2;
      const model = this.near[tr.kind];
      // cada árbol con su tono: algunos castaños ya amarillean (es otoño)
      const h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      tint.setRGB(0.85 + h * 0.3, 0.85 + h * 0.25, 0.8 + (1 - h) * 0.2);
      if (tr.kind === 'chestnut' && h > 0.6) tint.setRGB(1.45, 1.1, 0.55);
      if (tr.kind === 'oak' && h > 0.85) tint.setRGB(1.3, 1.05, 0.6);
      m.compose(tr.p, q, new THREE.Vector3(tr.s, tr.s, tr.s));
      if (d2 < near2 && counts[tr.kind] < this.MAX_NEAR) model.set(counts[tr.kind]++, m, tint);
      else this.far[tr.kind].set(farCounts[tr.kind]++, m, tint);
    }
    for (const k in this.near) this.near[k].commit(counts[k]);
    for (const k in this.far) this.far[k].commit(farCounts[k]);
  }

  private rebuildCover(focus: THREE.Vector3) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const R = 45;
    const step = 2.2;
    let nf = 0;
    let ng = 0;
    const hash = (x: number, z: number) => {
      const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const gx0 = Math.floor((focus.x - R) / step);
    const gz0 = Math.floor((focus.z - R) / step);
    let treesCache: THREE.Vector3[] | null = null;
    const self = this;
    const trees = { some: (f: (p: THREE.Vector3) => boolean) => (treesCache ??= self.treesNear(focus.x, focus.z, R + 8)).some(f) };
    for (let gz = gz0; gz < gz0 + (2 * R) / step; gz++)
      for (let gx = gx0; gx < gx0 + (2 * R) / step; gx++) {
        const h1 = hash(gx, gz);
        const x = (gx + hash(gz, gx)) * step;
        const z = (gz + h1) * step;
        if ((x - focus.x) ** 2 + (z - focus.z) ** 2 > R * R) continue;
        const key = gx * 100003 + gz;
        let cell = this.coverCache.get(key);
        if (cell === undefined) {
          cell = this.blocked(x, z, 0.8) || this.inClearing(x, z) ? -1 : trees.some((p) => Math.abs(p.x - x) < 7 && Math.abs(p.z - z) < 7) ? 1 : 0;
          if (this.coverCache.size > 100000) this.coverCache.clear();
          this.coverCache.set(key, cell);
        }
        if (cell < 0) continue;
        const underTrees = cell === 1;
        const y = this.hm.at(x, z);
        q.setFromAxisAngle(up, h1 * 6.28);
        const s = 0.7 + hash(gx * 3, gz * 7) * 0.8;
        m.compose(new THREE.Vector3(x, y - 0.05, z), q, new THREE.Vector3(s, s, s));
        if (underTrees && this.ferns && h1 < 0.55 && nf < 500) this.ferns.set(nf++, m);
        else if (this.grass && h1 < 0.1 && ng < 700) this.grass.set(ng++, m.scale(new THREE.Vector3(0.6, 0.6, 0.6)));
      }
    this.ferns?.commit(nf);
    this.grass?.commit(ng);
    this.rebuildCards(focus, hash);
  }

  /** Altura de la mata en la celda, o null si no lleva hierba (cacheado: la rejilla es fija). */
  private cardCache = new Map<number, number | null>();
  /** Celdas de sotobosque: -1 bloqueada, 0 claro, 1 bajo árboles. */
  private coverCache = new Map<number, number>();
  private cardY(gx: number, gz: number, x: number, z: number) {
    const key = gx * 100003 + gz;
    let y = this.cardCache.get(key);
    if (y !== undefined) return y;
    if (this.cardCache.size > 300000) this.cardCache.clear();
    y = this.hm.at(x, z);
    if (
      y < this.waterLevel + 0.3 ||
      // sin hierba en pendientes fuertes, edificios, caminos ni claros
      Math.abs(this.hm.at(x + 1, z) - y) + Math.abs(this.hm.at(x, z + 1) - y) > 1.4 ||
      this.inClearing(x, z) ||
      this.blocked(x, z, 0.5)
    )
      y = null;
    this.cardCache.set(key, y);
    return y;
  }

  private inClearing(x: number, z: number) {
    return this.clearings.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  }

  private rebuildCards(focus: THREE.Vector3, hash: (x: number, z: number) => number) {
    const R = 32;
    const step = this.cardStep;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const max = this.cards.instanceMatrix.count;
    let n = 0;
    const g0x = Math.floor((focus.x - R) / step);
    const g0z = Math.floor((focus.z - R) / step);
    for (let gz = g0z; gz < g0z + (2 * R) / step && n < max; gz++)
      for (let gx = g0x; gx < g0x + (2 * R) / step && n < max; gx++) {
        const a = hash(gx * 1.7, gz * 2.3);
        const x = (gx + a) * step;
        const z = (gz + hash(gz * 3.1, gx * 0.7)) * step;
        if ((x - focus.x) ** 2 + (z - focus.z) ** 2 > R * R) continue;
        const y = this.cardY(gx, gz, x, z);
        if (y === null) continue;
        const s = 0.75 + a * 0.7;
        q.setFromAxisAngle(up, a * 12.6);
        m.compose(new THREE.Vector3(x, y - 0.04, z), q, new THREE.Vector3(s, s * (0.8 + hash(gx, gz) * 0.5), s));
        this.cards.setMatrixAt(n, m);
        // verde de otoño: unas matas más secas
        if (this.groundColor) {
          this.groundColor(x, z, c);
          if (paintGroundAt.bare > 0.35 + a * 0.5) continue;
        } else c.set(0x86a843);
        c.multiplyScalar(1.05 + a * 0.25);
        this.cards.setColorAt(n++, c);
      }
    this.cards.count = n;
    this.cards.instanceMatrix.needsUpdate = true;
    if (this.cards.instanceColor) this.cards.instanceColor.needsUpdate = true;
  }
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assets } from '../core/assets';
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
      const im = new THREE.InstancedMesh(m.geometry, mat, max);
      im.count = 0;
      im.castShadow = castShadow;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.meshes.push({ mesh: im, local: norm.clone().multiply(m.matrixWorld) });
      this.group.add(im);
    });
  }

  set(i: number, m: THREE.Matrix4) {
    for (const { mesh, local } of this.meshes) mesh.setMatrixAt(i, this.tmp.multiplyMatrices(m, local));
  }

  commit(count: number) {
    for (const { mesh } of this.meshes) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
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
  for (let i = 0; i < 46; i++) {
    const x = 10 + rnd() * 108;
    const h = 55 + rnd() * 70;
    const bend = (rnd() - 0.5) * 34;
    const w = 2 + rnd() * 2.5;
    const l = 30 + rnd() * 22;
    g.fillStyle = `hsl(${78 + rnd() * 30}, ${38 + rnd() * 22}%, ${l}%)`;
    g.beginPath();
    g.moveTo(x - w, 128);
    g.quadraticCurveTo(x - w * 0.5 + bend * 0.4, 128 - h * 0.55, x + bend, 128 - h);
    g.quadraticCurveTo(x + w * 0.5 + bend * 0.4, 128 - h * 0.55, x + w, 128);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hierba densa y barata: 3 planos cruzados por mata, instanciados alrededor del jugador. */
function grassCards(max: number) {
  const W = 0.95;
  const H = 0.4;
  const quads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const q = new THREE.PlaneGeometry(W, H).translate(0, H / 2, 0);
    q.rotateY((i / 3) * Math.PI);
    quads.push(q);
  }
  const geo = mergeGeometries(quads);
  // normales hacia arriba: la mata se ilumina como el suelo, sin caras oscuras
  const n = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  addWind(mat, H);
  const im = new THREE.InstancedMesh(geo, mat, max);
  im.count = 0;
  im.receiveShadow = true;
  im.frustumCulled = false;
  im.setColorAt(0, new THREE.Color());
  return im;
}

/** Árbol procedural de respaldo (si no hay modelo): tronco + copa de masas irregulares. */
function proceduralTree(kind: string) {
  const parts: THREE.BufferGeometry[] = [];
  const color = (g: THREE.BufferGeometry, c: THREE.Color, vary = 0.08) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = 1 - vary + Math.random() * vary * 2;
      col.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const pine = kind === 'pine';
  const trunkH = pine ? 9 : 4.5;
  const trunk = new THREE.CylinderGeometry(0.18, 0.38, trunkH, 7).translate(0, trunkH / 2, 0);
  parts.push(color(trunk.toNonIndexed(), new THREE.Color(0x4a3a2c)));
  const leafC = new THREE.Color(kind === 'chestnut' ? 0x47602a : pine ? 0x2d4426 : 0x3d5626);
  const blobs = pine ? 3 : 6;
  for (let i = 0; i < blobs; i++) {
    const r = pine ? 2.2 - i * 0.4 : 1.8 + Math.random() * 1.4;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const s = 1 + (Math.sin(p.getX(k) * 3.1 + i) * Math.cos(p.getZ(k) * 2.7) + Math.sin(p.getY(k) * 4.3)) * 0.12;
      p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * (pine ? 0.7 : 0.85), p.getZ(k) * s);
    }
    const a = (i / blobs) * Math.PI * 2;
    const rad = pine ? 0 : 1.6;
    g.translate(Math.cos(a) * rad * (i ? 1 : 0), (pine ? trunkH - 2 + i * 1.6 : trunkH + 0.8 + (i ? Math.random() * 2 : 2.2)), Math.sin(a) * rad * (i ? 1 : 0));
    parts.push(color(g.toNonIndexed(), leafC, 0.15));
  }
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

const TREE_H: Record<string, number> = { oak: 13, chestnut: 11, pine: 19 };
const TREE_FILE: Record<string, string> = { oak: 'oak', chestnut: 'chestnut', pine: 'tree_tall' };

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
  private far!: THREE.InstancedMesh;
  private ferns?: InstancedModel;
  private grass?: InstancedModel;
  private cards!: THREE.InstancedMesh;
  private cardStep = 0.8;
  private clearings: [number, number, number][] = [];
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
    await Promise.all(
      kinds.map(async (k) => {
        const g = await assets.optionalModel(`models/env/${TREE_FILE[k]}.glb`);
        const root = g?.scene ?? proceduralTree(k);
        this.near[k] = new InstancedModel(root, this.MAX_NEAR, TREE_H[k]);
        this.group.add(this.near[k].group);
      }),
    );

    // siluetas lejanas: copa + tronco muy simples, sin sombras
    const farGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.2, 0.35, 5, 5).translate(0, 2.5, 0).toNonIndexed(),
      new THREE.IcosahedronGeometry(3.6, 0).scale(1, 1.15, 1).translate(0, 8.5, 0).toNonIndexed(),
    ]);
    farGeo.computeVertexNormals();
    this.far = new THREE.InstancedMesh(farGeo, new THREE.MeshLambertMaterial({ color: 0x3a4d2a }), this.trees.length);
    this.far.frustumCulled = false;
    this.group.add(this.far);

    const fern = await assets.optionalModel('models/env/fern.glb');
    if (fern) {
      this.ferns = new InstancedModel(variant(fern.scene, 0), 500, 0.9, false);
      this.group.add(this.ferns.group);
    }
    const grass = await assets.optionalModel('models/env/weeds.glb');
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
    let far = 0;
    const near2 = this.NEAR * this.NEAR;
    for (let i = 0; i < this.trees.length; i++) {
      if (this.hidden.has(i)) continue;
      const tr = this.trees[i];
      q.setFromAxisAngle(up, tr.rot);
      const d2 = (tr.p.x - focus.x) ** 2 + (tr.p.z - focus.z) ** 2;
      const model = this.near[tr.kind];
      if (d2 < near2 && counts[tr.kind] < this.MAX_NEAR) {
        m.compose(tr.p, q, new THREE.Vector3(tr.s, tr.s, tr.s));
        model.set(counts[tr.kind]++, m);
      } else {
        const s = tr.s * (TREE_H[tr.kind] / 12);
        m.compose(tr.p, q, new THREE.Vector3(s, s, s));
        this.far.setMatrixAt(far++, m);
      }
    }
    for (const k in this.near) this.near[k].commit(counts[k]);
    this.far.count = far;
    this.far.instanceMatrix.needsUpdate = true;
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
        const dry = hash(gx * 0.11, gz * 0.13);
        c.setHSL(0.17 + 0.05 * (1 - dry), 0.2 + 0.15 * (1 - dry), 0.5 + a * 0.15);
        this.cards.setColorAt(n++, c);
      }
    this.cards.count = n;
    this.cards.instanceMatrix.needsUpdate = true;
    if (this.cards.instanceColor) this.cards.instanceColor.needsUpdate = true;
  }
}

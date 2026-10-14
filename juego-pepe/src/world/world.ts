import * as THREE from 'three';
import { assets, pbr } from '../core/assets';
import type { Engine } from '../core/engine';
import type { Physics } from '../core/physics';
import { Atmosphere, FogBanks, waterMaterial } from './atmosphere';
import { paintGroundAt } from './paint';
import { buildTerrain, type HeightMap, type WorldData } from './terrain';
import { Vegetation } from './vegetation';
import { buildColiving, POOL } from './coliving';
import { buildDressing } from './dressing';
import { buildVillage, type BuildingInfo } from './village';

/** Lugares con nombre del Anceu real (coordenadas locales, origen en el coliving). */
export const PLACES = {
  coliving: new THREE.Vector3(0, 0, 0),
  /** Patio de grava delante de la casa */
  patio: new THREE.Vector3(-6, 0, 10),
  muinos: new THREE.Vector3(184, 0, 52),
  encoro: new THREE.Vector3(60, 0, 230),
};

/** Senderos que no están en OSM (trazados sobre la ortofoto y el relieve). */
const EXTRA_PATHS: { width: number; pts: [number, number][] }[] = [
  // Camiño dos muíños: del patio del coliving baja en zigzag por la carballeira
  {
    width: 1.8,
    pts: [
      [-4, 14],
      [12, 20],
      [34, 26],
      [58, 20],
      [80, 30],
      [104, 40],
      [126, 36],
      [148, 50],
      [166, 58],
      [180, 56],
    ],
  },
];

export class World {
  data!: WorldData;
  hm!: HeightMap;
  atmosphere: Atmosphere;
  fogBanks = new FogBanks();
  vegetation!: Vegetation;
  buildings: BuildingInfo[] = [];
  paths: { width: number; pts: [number, number][] }[] = [];
  /** Atrezo (muros, leña, hórreos…): la vegetación no crece encima. */
  obstacles: [number, number, number][] = [];
  group = new THREE.Group();
  private ticks: ((t: number) => void)[] = [];

  constructor(
    private engine: Engine,
    private physics: Physics,
  ) {
    this.atmosphere = new Atmosphere(engine.renderer, engine.scene, engine.quality.shadows);
  }

  async load(onStep: (label: string) => void) {
    onStep('terreo');
    this.data = await assets.json<WorldData>('world/world.json');
    const { hm, mesh, farMesh, ortho } = await buildTerrain(this.data);
    this.hm = hm;
    for (const [k, p] of Object.entries(PLACES)) p.y = hm.at(p.x, p.z) + (k === 'coliving' ? 0 : 0);

    // allanamos el patio del coliving (en la realidad es una explanada de grava)
    hm.flatten(PLACES.patio.x, PLACES.patio.z, 11, PLACES.patio.y, 0.8);
    // ...y el sitio del muíño
    hm.flatten(PLACES.muinos.x, PLACES.muinos.z, 9, PLACES.muinos.y - 0.4, 0.7);
    // ...y el de la piscina
    hm.flatten(POOL.x, POOL.z, 8, hm.at(POOL.x, POOL.z), 1);
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setY(k, hm.data[k]);
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    for (const p of Object.values(PLACES)) p.y = hm.at(p.x, p.z);

    this.group.add(mesh, farMesh);
    this.physics.addHeightfield(hm.data, this.data.n, this.data.half * 2);

    onStep('aldea');
    const v = await buildVillage(this.data, hm, this.physics);
    this.buildings = v.infos;
    this.group.add(v.group);
    this.group.add(buildColiving(hm, this.physics, this.buildings));
    // sin hierba en el patio de grava, la piscina y la parra
    this.obstacles.push([-7, 9, 9], [POOL.x, POOL.z, 6.5], [-11, 4, 3]);

    onStep('camiños');
    this.paths = [...this.data.roads, ...EXTRA_PATHS];
    await this.buildPaths();
    this.buildWater();
    this.group.add(
      await buildDressing({
        hm,
        physics: this.physics,
        buildings: this.buildings,
        roads: this.data.roads,
        doors: v.doors,
        windows: v.windows,
        blocked: (x, z, pad) => this.blocked(x, z, pad),
        obstacle: (x, z, r) => this.obstacles.push([x, z, r]),
      }),
    );

    onStep('bosque');
    this.vegetation = new Vegetation(hm, (x, z, pad) => this.blocked(x, z, pad));
    this.vegetation.waterLevel = this.data.water_level;
    this.vegetation.groundColor = (x, z, out) => paintGroundAt(ortho, x, z, out);
    await this.vegetation.build(
      this.data.trees.filter(([x, z]) => !this.nearPath(x, z, 2.5)),
      this.engine.quality.low,
    );
    this.group.add(this.vegetation.group);
    this.group.add(this.fogBanks.group);

    this.engine.scene.add(this.group);
  }

  /** ¿Hay un edificio o camino en (x, z)? */
  blocked(x: number, z: number, pad: number) {
    for (const b of this.buildings) {
      const o = b.obb;
      const c = Math.cos(o.angle);
      const s = Math.sin(o.angle);
      const dx = x - o.cx;
      const dz = z - o.cz;
      const u = dx * c + dz * s;
      const v = -dx * s + dz * c;
      if (Math.abs(u) < o.hx + pad && Math.abs(v) < o.hz + pad) return true;
    }
    for (const [ox, oz, r] of this.obstacles) if ((x - ox) ** 2 + (z - oz) ** 2 < (r + pad) ** 2) return true;
    return this.nearPath(x, z, pad);
  }

  nearPath(x: number, z: number, pad: number) {
    for (const r of this.paths) {
      const p = r.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, az] = p[i];
        const [bx, bz] = p[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < r.width / 2 + pad) return true;
      }
    }
    return false;
  }

  /** Cintas de camino pegadas al terreno. */
  private async buildPaths() {
    const asphalt = new THREE.MeshStandardMaterial({ map: (await pbr('asphalt', 1)).map, roughness: 0.9 });
    const dirt = await pbr('dirt_path', 1);
    const dirtMat = new THREE.MeshStandardMaterial({
      map: dirt.map,
      normalMap: dirt.normalMap,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    asphalt.polygonOffset = true;
    asphalt.polygonOffsetFactor = -2;
    for (const r of this.paths) {
      const pts = r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const len = curve.getLength();
      const n = Math.max(2, Math.ceil(len / 1.5));
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      const side = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = curve.getPointAt(t);
        const tg = curve.getTangentAt(t);
        side.set(-tg.z, 0, tg.x).normalize().multiplyScalar(r.width / 2);
        for (const s of [-1, 1]) {
          const x = p.x + side.x * s;
          const z = p.z + side.z * s;
          pos.push(x, this.hm.at(x, z) + 0.05, z);
          uv.push(s < 0 ? 0 : 1, (t * len) / Math.max(2, r.width));
        }
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const paved = r.width >= 3.5;
      const mesh = new THREE.Mesh(g, paved ? asphalt : dirtMat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private buildWater() {
    // Encoro de Eiras
    const lake = waterMaterial(new THREE.Vector2(0.01, 0.006), 0x1d2c30);
    lake.mat.normalMap!.repeat.set(120, 120);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lake.mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(this.data.far.center[0], this.data.water_level + 0.6, this.data.far.center[1]);
    this.group.add(plane);
    this.ticks.push(lake.tick);

    // Arroyo de los muíños
    const s = this.data.stream.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(s, false, 'centripetal');
    const len = curve.getLength();
    const n = Math.ceil(len / 1.5);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t);
      const w = 1.4 + t * 1.2;
      for (const sgn of [-1, 1]) {
        const x = p.x - tg.z * w * sgn;
        const z = p.z + tg.x * w * sgn;
        pos.push(x, this.hm.at(p.x, p.z) + 0.25, z);
        uv.push(sgn < 0 ? 0 : 1, (t * len) / 3);
      }
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const stream = waterMaterial(new THREE.Vector2(0, -0.6), 0x2a3b3a);
    const mesh = new THREE.Mesh(g, stream.mat);
    this.group.add(mesh);
    this.ticks.push(stream.tick);
    this.streamCurve = curve;
  }

  streamCurve!: THREE.CatmullRomCurve3;

  /** Distancia al arroyo (para el sonido del agua). */
  distanceToStream(p: THREE.Vector3) {
    let best = Infinity;
    for (const [x, z] of this.data.stream) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
    return best;
  }

  update(dt: number, t: number, focus: THREE.Vector3) {
    this.atmosphere.update(dt, focus);
    this.fogBanks.update(dt, focus, this.atmosphere.fogAmount, (x, z) => this.hm.at(x, z));
    this.vegetation.update(t, focus);
    for (const tick of this.ticks) tick(t);
  }
}

import * as THREE from 'three';
import { assets, pbr } from '../core/assets';

export interface WorldData {
  base_altitude: number;
  half: number;
  cell: number;
  n: number;
  water_level: number;
  far: { n: number; size: number; center: [number, number] };
  buildings: { id: string; floors: number; ground: number; ring: [number, number][] }[];
  roads: { type: string; name: string | null; width: number; pts: [number, number][] }[];
  stream: [number, number][];
  trees: [number, number, number, string][];
}

/** Muestreo de alturas del terreno real (bilineal). */
export class HeightMap {
  constructor(
    public data: Float32Array,
    public n: number,
    public size: number,
    public cx = 0,
    public cz = 0,
  ) {}

  /** Altura en (x, z) de mundo. */
  at(x: number, z: number) {
    const { n, size } = this;
    const cell = size / (n - 1);
    const fx = THREE.MathUtils.clamp((x - this.cx + size / 2) / cell, 0, n - 1.001);
    const fz = THREE.MathUtils.clamp((z - this.cz + size / 2) / cell, 0, n - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const d = this.data;
    const a = d[j * n + i] * (1 - tx) + d[j * n + i + 1] * tx;
    const b = d[(j + 1) * n + i] * (1 - tx) + d[(j + 1) * n + i + 1] * tx;
    return a * (1 - tz) + b * tz;
  }

  normal(x: number, z: number, out = new THREE.Vector3()) {
    const e = 1.5;
    return out.set(this.at(x - e, z) - this.at(x + e, z), 2 * e, this.at(x, z - e) - this.at(x, z + e)).normalize();
  }

  /** Modifica la altura en un radio (aplanar parcelas, cauce, etc). */
  flatten(x: number, z: number, radius: number, y: number, strength = 1) {
    const { n, size } = this;
    const cell = size / (n - 1);
    const r = Math.ceil(radius / cell) + 1;
    const ci = Math.round((x - this.cx + size / 2) / cell);
    const cj = Math.round((z - this.cz + size / 2) / cell);
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const wx = i * cell - size / 2 + this.cx;
        const wz = j * cell - size / 2 + this.cz;
        const d = Math.hypot(wx - x, wz - z);
        if (d > radius) continue;
        const k = strength * THREE.MathUtils.smoothstep(radius, radius * 0.5, d);
        this.data[j * n + i] = THREE.MathUtils.lerp(this.data[j * n + i], y, k);
      }
  }
}

function heightGeometry(hm: HeightMap, hole?: { half: number }) {
  const { n, size, cx, cz } = hm;
  const g = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k) + cx;
    const z = p.getZ(k) + cz;
    p.setXYZ(k, x, hm.data[k] - (hole ? 1.5 : 0), z);
  }
  if (hole) {
    // quitamos los triángulos que quedan bajo el terreno detallado
    const idx = g.index!.array;
    const keep: number[] = [];
    const v = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      let inside = true;
      for (let s = 0; s < 3; s++) {
        v.fromBufferAttribute(p, idx[t + s]);
        if (Math.abs(v.x) > hole.half - 2 || Math.abs(v.z) > hole.half - 2) inside = false;
      }
      if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    g.setIndex(keep);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Terreno: ortofoto PNOA real como color base + texturas de detalle mezcladas por
 * pendiente (roca en las laderas fuertes) para que de cerca no se vea borroso.
 */
export async function buildTerrain(world: WorldData) {
  const [hBuf, fBuf, ortho, far] = await Promise.all([
    assets.binary('world/height.bin'),
    assets.binary('world/far.bin'),
    assets.texture('world/ortho.jpg', { srgb: true }),
    assets.texture('world/far.jpg', { srgb: true }),
  ]);
  const hm = new HeightMap(new Float32Array(hBuf), world.n, world.half * 2);
  const farHm = new HeightMap(new Float32Array(fBuf), world.far.n, world.far.size, world.far.center[0], world.far.center[1]);

  const grass = await pbr('grass', 1);
  const rock = await pbr('rock_mossy', 1);

  const geo = heightGeometry(hm);
  const mat = new THREE.MeshStandardMaterial({ map: ortho, roughness: 0.95, metalness: 0 });
  const uniforms = {
    uDetail: { value: grass.map },
    uDetailN: { value: grass.normalMap },
    uRock: { value: rock.map },
    uHalf: { value: world.half },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos; varying vec3 vWNormal;
        uniform sampler2D uDetail; uniform sampler2D uRock; uniform float uHalf;
        ${uniforms.uDetail.value ? '#define HAS_DETAIL' : ''}
        ${uniforms.uRock.value ? '#define HAS_ROCK' : ''}`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 ouv = (vWPos.xz + uHalf) / (2.0 * uHalf);
        ouv.y = 1.0 - ouv.y;
        vec4 ortho = texture2D(map, ouv);
        vec3 base = ortho.rgb;
        float slope = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
        #ifdef HAS_DETAIL
          vec3 d1 = texture2D(uDetail, vWPos.xz * 0.35).rgb;
          vec3 d2 = texture2D(uDetail, vWPos.xz * 0.061).rgb;
          vec3 det = d1 * 0.6 + d2 * 0.4;
          float dl = dot(det, vec3(0.333));
          base *= mix(vec3(1.0), det / max(dl, 0.05), 0.35) * (0.65 + 0.7 * dl);
        #endif
        #ifdef HAS_ROCK
          vec3 r = texture2D(uRock, vWPos.xz * 0.12 + vWPos.y * 0.05).rgb;
          base = mix(base, r * 0.9, smoothstep(0.45, 0.7, slope));
        #endif
        diffuseColor.rgb *= base;
        `,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // Horizonte: terreno real de 4 km, sin detalle
  const farMesh = new THREE.Mesh(
    heightGeometry(farHm, { half: world.half }),
    new THREE.MeshStandardMaterial({ map: far, roughness: 1 }),
  );
  // UV del terreno lejano: la PlaneGeometry ya trae UV 0..1 sobre su extensión
  farMesh.name = 'far-terrain';

  return { hm, farHm, mesh, farMesh };
}

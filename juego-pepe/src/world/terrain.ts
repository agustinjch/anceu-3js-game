import * as THREE from 'three';
import { assets } from '../core/assets';
import { toon } from '../core/stylize';
import { OrthoSampler, PAINT_GLSL, paintUniforms } from './paint';

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

  const geo = heightGeometry(hm);
  const ortho2 = new OrthoSampler(ortho.image as CanvasImageSource, world.half);
  const mat = toon({ map: ortho, rim: 0.4 });
  const uniforms = { uHalf: { value: world.half }, ...paintUniforms() };
  const rim = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;\nuniform float uHalf;\n${PAINT_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `
        vec2 ouv = (vWPos.xz + uHalf) / (2.0 * uHalf);
        ouv.y = 1.0 - ouv.y;
        // la ortofoto solo como máscara, muy desenfocada
        vec3 o = texture2D(map, ouv, 3.5).rgb;
        vec3 base = paintGround(o, vWPos.xz);
        // pinceladas: ruido alargado que varía el tono
        float b1 = pNoise(vec2(vWPos.x * 0.9 + vWPos.z * 0.35, vWPos.z * 0.25) * 1.3);
        float b2 = pNoise(vWPos.xz * 0.21 + 7.0);
        float b3 = pNoise(vec2(vWPos.x * 2.6 - vWPos.z * 0.8, vWPos.z * 0.7 + vWPos.x * 0.2));
        base *= 0.84 + 0.18 * b1 + 0.1 * b2 + 0.08 * b3;
        // roca en las laderas fuertes
        float slope = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
        base = mix(base, pRock * (0.9 + 0.15 * b1), smoothstep(0.5, 0.68, slope));
        diffuseColor.rgb *= base;
        `,
      );
    rim?.call(mat, sh, r);
  };
  mat.customProgramCacheKey = () => 'terrain-painted';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // Horizonte: terreno real de 4 km, sin detalle
  const farMesh = new THREE.Mesh(
    heightGeometry(farHm, { half: world.half }),
    farMaterial(far),
  );
  // UV del terreno lejano: la PlaneGeometry ya trae UV 0..1 sobre su extensión
  farMesh.name = 'far-terrain';

  return { hm, farHm, mesh, farMesh, ortho: ortho2 };
}

/** Horizonte: la misma paleta, sin pinceladas finas. */
function farMaterial(far: THREE.Texture) {
  const mat = toon({ map: far, rim: 0 });
  const uniforms = paintUniforms();
  const rim = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${PAINT_GLSL}`)
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= paintGround(texture2D(map, vMapUv, 2.0).rgb, vWPos.xz);');
    rim?.call(mat, sh, r);
  };
  mat.customProgramCacheKey = () => 'terrain-far-painted';
  return mat;
}

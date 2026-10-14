import * as THREE from 'three';

/**
 * Estilo pintado: todo el mundo usa MeshToonMaterial con una rampa suave de 3 tonos,
 * sombras frías (las pone la luz hemisférica) y un borde de luz cálido (rim).
 * `toon()` crea materiales nuevos; `stylizeObject()` convierte los que traen los modelos.
 */

/** Rampa de luz: sombra / medio tono / luz, con transiciones suaves (pinceladas, no cel duro). */
function makeRamp() {
  const N = 64;
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const step = (a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);
    const v = 0.22 + 0.38 * step(0.18, 0.3) + 0.4 * step(0.52, 0.64);
    const c = Math.round(v * 255);
    data.set([c, c, c, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
export const RAMP = makeRamp();

/** Uniforms compartidos por todos los materiales del estilo. */
export const styleUniforms = {
  uRimColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
  uRimStrength: { value: 0.35 },
};

type ToonParams = THREE.MeshToonMaterialParameters & { rim?: number };

export function toon(p: ToonParams = {}) {
  const { rim = 1, ...rest } = p;
  const m = new THREE.MeshToonMaterial({ gradientMap: RAMP, ...rest });
  addRim(m, rim);
  return m;
}

/** Añade el borde de luz encadenando cualquier onBeforeCompile previo (viento, terreno…). */
export function addRim(m: THREE.Material, amount = 1) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    if (sh.fragmentShader.includes('uRimColor')) return; // ya aplicado (material clonado)
    sh.uniforms.uRimColor = styleUniforms.uRimColor;
    sh.uniforms.uRimStrength = styleUniforms.uRimStrength;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float rim = smoothstep(0.55, 0.95, 1.0 - ndv);
          outgoingLight += uRimColor * rim * uRimStrength * ${amount.toFixed(2)} * diffuseColor.rgb;
        }
        #include <opaque_fragment>`,
      );
  };
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (prevKey?.() ?? '') + `rim${amount}`;
}

/** Convierte un material estándar en toon conservando lo que importa. */
export function toToon(src: THREE.Material, opts: { keepMap?: boolean } = {}): THREE.Material {
  if ((src as THREE.MeshToonMaterial).isMeshToonMaterial) return src;
  if (src.userData.keepPBR) return src;
  const s = src as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial && !(src as THREE.MeshLambertMaterial).isMeshLambertMaterial) return src;
  const m = new THREE.MeshToonMaterial({
    gradientMap: RAMP,
    color: s.color.clone(),
    map: opts.keepMap === false ? null : s.map,
    alphaMap: s.alphaMap,
    alphaTest: s.alphaTest,
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    vertexColors: s.vertexColors,
    emissive: s.emissive?.clone(),
    emissiveIntensity: s.emissiveIntensity,
    emissiveMap: s.emissiveMap,
    depthWrite: s.depthWrite,
    fog: s.fog,
  });
  m.name = s.name;
  m.userData = { ...s.userData };
  if (s.onBeforeCompile && s.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    m.onBeforeCompile = s.onBeforeCompile;
    m.customProgramCacheKey = s.customProgramCacheKey.bind(s);
  }
  addRim(m);
  return m;
}

/** Recorre un objeto y pasa todos sus materiales al estilo toon (con caché por material). */
export function stylizeObject(root: THREE.Object3D, opts: { keepMap?: boolean } = {}) {
  const cache = new Map<THREE.Material, THREE.Material>();
  const conv = (m: THREE.Material) => {
    let c = cache.get(m);
    if (!c) {
      c = toToon(m, opts);
      cache.set(m, c);
    }
    return c;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noStylize) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
  });
}

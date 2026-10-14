import * as THREE from 'three';

/**
 * Paleta pintada del terreno. La ortofoto real solo se usa como máscara (bosque / prado /
 * tierra) y el color sale de aquí, con manchas grandes de ruido para que parezca pintado.
 * La misma función existe en GLSL (terreno) y en JS (color de la hierba), así que la
 * hierba nace del color exacto del suelo que pisa.
 */
const lin = (hex: number) => new THREE.Color(hex);
export const PAINT = {
  meadow: lin(0x6f9440),
  meadowDry: lin(0x8e9549),
  forest: lin(0x41602c),
  earth: lin(0x8e7f62),
  rock: lin(0x8f8b7e),
};

export const PAINT_GLSL = /* glsl */ `
uniform vec3 pMeadow, pMeadowDry, pForest, pEarth, pRock;
float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1, 0)), u.x), mix(pHash(i + vec2(0, 1)), pHash(i + vec2(1, 1)), u.x), u.y);
}
// o = color lineal de la ortofoto (desenfocada); w = posición xz de mundo
vec3 paintGround(vec3 o, vec2 w) {
  float lum = dot(o, vec3(0.2126, 0.7152, 0.0722));
  float green = o.g - max(o.r, o.b);
  float n1 = pNoise(w * 0.018);
  float n2 = pNoise(w * 0.07 + 13.0);
  float forest = 1.0 - smoothstep(0.06, 0.1, lum + (n2 - 0.5) * 0.02);
  float bare = smoothstep(0.15, 0.23, lum) * (1.0 - smoothstep(-0.004, 0.014, green));
  vec3 meadow = mix(pMeadow, pMeadowDry, smoothstep(0.35, 0.75, n1 + (n2 - 0.5) * 0.3));
  vec3 c = mix(meadow, pForest, forest);
  c = mix(c, mix(pEarth, meadow, smoothstep(0.55, 0.8, n2) * 0.6), bare);
  return c;
}`;

export function paintUniforms() {
  return {
    pMeadow: { value: PAINT.meadow },
    pMeadowDry: { value: PAINT.meadowDry },
    pForest: { value: PAINT.forest },
    pEarth: { value: PAINT.earth },
    pRock: { value: PAINT.rock },
  };
}

// --- misma lógica en CPU ---------------------------------------------------
const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux;
  return a + (b - a) * uy;
}
const ss = THREE.MathUtils.smoothstep;
const sstep = (e0: number, e1: number, x: number) => (e0 < e1 ? ss(x, e0, e1) : 1 - ss(x, e1, e0));

/** Muestreador de la ortofoto en CPU (baja resolución, ya desenfocada). */
export class OrthoSampler {
  private data: Float32Array;
  private n = 256;
  constructor(
    img: CanvasImageSource,
    private half: number,
  ) {
    const c = document.createElement('canvas');
    c.width = c.height = this.n;
    const g = c.getContext('2d')!;
    g.filter = 'blur(2px)';
    g.drawImage(img, 0, 0, this.n, this.n);
    const px = g.getImageData(0, 0, this.n, this.n).data;
    this.data = new Float32Array(this.n * this.n * 3);
    const toLin = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    for (let i = 0; i < this.n * this.n; i++) for (let k = 0; k < 3; k++) this.data[i * 3 + k] = toLin(px[i * 4 + k]);
  }

  at(x: number, z: number, out: [number, number, number]) {
    const n = this.n;
    const fx = THREE.MathUtils.clamp(((x + this.half) / (2 * this.half)) * n - 0.5, 0, n - 1.001);
    const fz = THREE.MathUtils.clamp(((z + this.half) / (2 * this.half)) * n - 0.5, 0, n - 1.001);
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tx = fx - i0;
    const tz = fz - j0;
    const d = this.data;
    for (let k = 0; k < 3; k++) {
      const a = d[(j0 * n + i0) * 3 + k] * (1 - tx) + d[(j0 * n + i0 + 1) * 3 + k] * tx;
      const b = d[((j0 + 1) * n + i0) * 3 + k] * (1 - tx) + d[((j0 + 1) * n + i0 + 1) * 3 + k] * tx;
      out[k] = a * (1 - tz) + b * tz;
    }
    return out;
  }
}

const tmp: [number, number, number] = [0, 0, 0];
const cMeadow = new THREE.Color();
/** Color pintado del suelo en (x, z), igual que el shader. */
export function paintGroundAt(ortho: OrthoSampler, x: number, z: number, out = new THREE.Color()) {
  const o = ortho.at(x, z, tmp);
  const lum = o[0] * 0.2126 + o[1] * 0.7152 + o[2] * 0.0722;
  const green = o[1] - Math.max(o[0], o[2]);
  const n1 = noise(x * 0.018, z * 0.018);
  const n2 = noise(x * 0.07 + 13, z * 0.07 + 13);
  const forest = sstep(0.1, 0.06, lum + (n2 - 0.5) * 0.02);
  const bare = sstep(0.15, 0.23, lum) * sstep(0.014, -0.004, green);
  cMeadow.copy(PAINT.meadow).lerp(PAINT.meadowDry, sstep(0.35, 0.75, n1 + (n2 - 0.5) * 0.3));
  out.copy(cMeadow).lerp(PAINT.forest, forest);
  const earth = PAINT.earth.clone().lerp(cMeadow, sstep(0.55, 0.8, n2) * 0.6);
  paintGroundAt.bare = bare;
  return out.lerp(earth, bare);
}

/** Máscara de tierra desnuda del último `paintGroundAt` (la hierba la evita). */
paintGroundAt.bare = 0;

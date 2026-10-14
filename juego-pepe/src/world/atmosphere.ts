import * as THREE from 'three';
import { memory } from '../core/engine';
import { styleUniforms } from '../core/stylize';

/** Paleta de una hora del día: cielo pintado, luces y niebla. */
interface Palette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  cloudLight: THREE.Color;
  cloudShade: THREE.Color;
  rim: THREE.Color;
}
const C = (h: number) => new THREE.Color(h);
const DAY: Palette = {
  zenith: C(0x4f86cc),
  horizon: C(0xe9dcc4),
  sun: C(0xfff0d2),
  sunI: 3.0,
  hemiSky: C(0x9cb8de),
  hemiGround: C(0x7d7a52),
  hemiI: 3.0,
  cloudLight: C(0xfffaf0),
  cloudShade: C(0xa9b3cf),
  rim: C(0xffe2a8),
};
const GOLDEN: Palette = {
  zenith: C(0x5a7fc0),
  horizon: C(0xf6c99a),
  sun: C(0xffc98a),
  sunI: 2.9,
  hemiSky: C(0x8fa6d6),
  hemiGround: C(0x7a6248),
  hemiI: 2.6,
  cloudLight: C(0xffe2c0),
  cloudShade: C(0x9a8fb5),
  rim: C(0xffc078),
};
const NIGHT: Palette = {
  zenith: C(0x081226),
  horizon: C(0x22304d),
  sun: C(0x9db4ff),
  sunI: 1.2,
  hemiSky: C(0x34466e),
  hemiGround: C(0x161a22),
  hemiI: 1.4,
  cloudLight: C(0x56658c),
  cloudShade: C(0x1a2236),
  rim: C(0x8fa8ff),
};

function lerpPalette(a: Palette, b: Palette, k: number): Palette {
  const out = {} as Palette;
  for (const key of Object.keys(a) as (keyof Palette)[]) {
    const va = a[key];
    const vb = b[key];
    (out as unknown as Record<string, unknown>)[key] =
      typeof va === 'number' ? THREE.MathUtils.lerp(va, vb as number, k) : (va as THREE.Color).clone().lerp(vb as THREE.Color, k);
  }
  return out;
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uCloudLight, uCloudShade, uFogColor;
uniform float uTime, uFog, uCloudCover, uSunSize;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.75, h), 0.65));
  col = mix(col, uHorizon * 0.92, (1.0 - smoothstep(-0.15, 0.0, h)));
  // halo del sol
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 10.0) * 0.28 + pow(sd, 90.0) * 0.5);
  col = mix(col, uSunColor * 1.6, smoothstep(uSunSize, uSunSize + 0.0015, sd));
  // nubes pintadas: manchas suaves con lado iluminado y lado en sombra
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.55 + vec2(uTime * 0.006, 0.0);
    float n = fbm(uv);
    float c = smoothstep(uCloudCover, uCloudCover + 0.16, n);
    float lit = smoothstep(-0.05, 0.12, fbm(uv + uSunDir.xz * 0.08) - n + 0.06);
    vec3 cc = mix(uCloudShade, uCloudLight, lit);
    c *= smoothstep(0.0, 0.18, h);
    col = mix(col, cc, c * 0.92);
  }
  col = mix(col, uFogColor, uFog);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Cielo, sol, luz ambiente y niebla en estilo pintado. `setTime` elige la paleta según la hora
 * y `setFog` controla la Néboa do Esquecemento (densidad + color + desaturación global).
 */
export class Atmosphere {
  sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a5a32, 1.2);
  fog = new THREE.FogExp2(0xb8c3cc, 0.004);
  private sunDir = new THREE.Vector3();
  /** 0 = despejado, 1 = niebla total */
  fogAmount = 0;
  private fogTarget = 0;
  private clearFogColor = new THREE.Color(0xc9d6e2);
  private oblivionColor = new THREE.Color(0xa9b5c4);
  private static OBLIVION_DAY = new THREE.Color(0xa9b5c4);
  /** Si la niebla desatura el mundo (en el prólogo no: es de noche y aún no hay olvido). */
  greyFromFog = true;
  private skyU: Record<string, THREE.IUniform>;

  constructor(
    _renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    shadowSize: number,
  ) {
    this.skyU = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uCloudLight: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uFog: { value: 0 },
      uCloudCover: { value: 0.5 },
      uSunSize: { value: 0.9992 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -45;
    c.right = c.top = 45;
    c.near = 1;
    c.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
  }

  private apply(p: Palette) {
    const u = this.skyU;
    (u.uZenith.value as THREE.Color).copy(p.zenith);
    (u.uHorizon.value as THREE.Color).copy(p.horizon);
    (u.uSunColor.value as THREE.Color).copy(p.sun);
    (u.uCloudLight.value as THREE.Color).copy(p.cloudLight);
    (u.uCloudShade.value as THREE.Color).copy(p.cloudShade);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunI;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    // perspectiva aérea: lo lejano se funde con el horizonte
    this.clearFogColor.copy(p.horizon).lerp(p.zenith, 0.12);
    styleUniforms.uRimColor.value.copy(p.rim);
  }

  /** Hora del día en horas (0-24). */
  setTime(hour: number, azimuthDeg = 140) {
    // elevación aproximada de un día de otoño en Galicia
    const elev = Math.sin(((hour - 7.8) / 10.4) * Math.PI) * 38;
    // en el juego el sol nunca baja tanto como para dejarlo todo negro
    const e = Math.max(elev, 8);
    const phi = THREE.MathUtils.degToRad(90 - e);
    const theta = THREE.MathUtils.degToRad(azimuthDeg + (hour - 12) * 15);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const golden = 1 - THREE.MathUtils.smoothstep(elev, 6, 26);
    this.skyU.uSunSize.value = 0.9992;
    this.apply(lerpPalette(DAY, GOLDEN, golden));
    this.oblivionColor.copy(Atmosphere.OBLIVION_DAY);
    this.scene.environmentIntensity = 0.06;
  }

  /** Noche de luna: el sol pasa a ser la luna. */
  setNight() {
    this.sunDir.set(-0.4, 0.6, 0.5).normalize();
    this.apply(NIGHT);
    this.skyU.uSunSize.value = 0.9995;
    this.oblivionColor.set(0x2a3546);
    this.scene.environmentIntensity = 0.02;
  }

  /** Niebla del olvido: 0 = mañana limpia con bruma, 1 = Anceu tragada por la néboa. */
  setFog(amount: number, instant = false) {
    this.fogTarget = amount;
    if (instant) this.fogAmount = amount;
  }

  update(dt: number, focus: THREE.Vector3) {
    this.fogAmount = THREE.MathUtils.damp(this.fogAmount, this.fogTarget, 0.6, dt);
    const f = this.fogAmount;
    this.fog.density = THREE.MathUtils.lerp(0.0022, 0.03, f * f);
    this.fog.color.copy(this.clearFogColor).lerp(this.oblivionColor, f);
    if (this.greyFromFog) memory.grey = THREE.MathUtils.smoothstep(f, 0.15, 0.7);
    this.skyU.uTime.value += dt;
    this.skyU.uFog.value = THREE.MathUtils.smoothstep(f, 0.2, 0.9);
    (this.skyU.uFogColor.value as THREE.Color).copy(this.fog.color);
    this.skyU.uCloudCover.value = THREE.MathUtils.lerp(0.52, 0.3, f);
    this.sky.position.copy(focus);

    // la sombra sigue al jugador
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);
  }
}

/** Lámina del encoro y arroyos: agua oscura con normales animadas. */
export function waterMaterial(flow = new THREE.Vector2(0.02, 0.01), tint = 0x24343a) {
  const normal = makeWaterNormal();
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.06,
    metalness: 0.15,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true,
    opacity: 0.92,
  });
  mat.userData.keepPBR = true;
  const offset = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = offset;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace(
        '#include <normal_fragment_maps>',
        `
        vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(${flow.x.toFixed(3)}, ${flow.y.toFixed(3)}) * uT).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vNormalMapUv * 1.7 - vec2(${(flow.y * 0.8).toFixed(3)}, ${(flow.x * 1.3).toFixed(3)}) * uT).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, n1.z * n2.z));
        normal = normalize(tbn * mapN);
        `,
      );
  };
  return { mat, tick: (t: number) => (offset.value = t) };
}

function makeWaterNormal() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const h = (x: number, y: number) => {
    let v = 0;
    for (let k = 1; k <= 5; k++) {
      const f = k * 2 * Math.PI;
      v += Math.sin((x * (k + 1) + y * k * 0.7) * f / S + k * 1.3) / k + Math.cos((y * (k + 2) - x * 0.5 * k) * f / S + k) / k;
    }
    return v;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx, -dy, 2).normalize();
      const i = (y * S + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/**
 * Bancos de niebla a ras de suelo: sprites grandes y suaves que derivan despacio
 * alrededor del jugador. Dan volumen a la néboa sin coste de volumétricos reales.
 */
export class FogBanks {
  group = new THREE.Group();
  private sprites: { s: THREE.Sprite; off: THREE.Vector3; speed: number }[] = [];
  private mat: THREE.SpriteMaterial;
  constructor(count = 40) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    this.mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      color: 0xd5dde3,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      fog: true,
    });
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.mat);
      const scale = 18 + Math.random() * 26;
      s.scale.set(scale, scale * 0.45, 1);
      const off = new THREE.Vector3((Math.random() - 0.5) * 140, 1 + Math.random() * 4, (Math.random() - 0.5) * 140);
      this.sprites.push({ s, off, speed: 0.4 + Math.random() * 0.8 });
      this.group.add(s);
    }
    this.group.renderOrder = 10;
  }

  update(dt: number, focus: THREE.Vector3, amount: number, groundAt: (x: number, z: number) => number) {
    this.mat.opacity = THREE.MathUtils.clamp(amount * 0.9, 0, 0.75);
    this.group.visible = amount > 0.02;
    if (!this.group.visible) return;
    for (const p of this.sprites) {
      p.off.x += p.speed * dt;
      if (p.off.x > 70) p.off.x -= 140;
      // envolvente toroidal alrededor del foco
      let x = p.off.x + focus.x;
      let z = p.off.z + focus.z;
      x = focus.x + (((x - focus.x + 70) % 140) + 140) % 140 - 70;
      z = focus.z + (((z - focus.z + 70) % 140) + 140) % 140 - 70;
      p.s.position.set(x, groundAt(x, z) + p.off.y, z);
    }
  }
}

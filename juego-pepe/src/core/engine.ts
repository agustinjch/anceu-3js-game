import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { isTouch } from './input';

export const MAX_RESTORE = 8;

/**
 * Estado visual global de la "memoria": cuánto color le queda al mundo.
 * `grey` = 1 → todo gris (niebla del olvido); las esferas de `restore` devuelven el color
 * alrededor de los lugares cuya pegada ya se recuperó.
 */
export const memory = {
  grey: 0,
  /** xyz = centro, w = radio */
  restore: Array.from({ length: MAX_RESTORE }, () => new THREE.Vector4(0, -9999, 0, 0)),
  tint: new THREE.Color(0.78, 0.84, 0.92),
};

const quality = (() => {
  const low = isTouch || (navigator.hardwareConcurrency ?? 8) <= 4;
  return {
    low,
    pixelRatio: Math.min(devicePixelRatio, low ? 1.5 : 2),
    shadows: low ? 1024 : 2048,
    msaa: low ? 0 : 4,
    bloom: false, // UnrealBloomPass sobre el RT MSAA corrompe la imagen (negro/blanco); pendiente de rehacer
  };
})();

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
  clock = new THREE.Clock();
  quality = quality;
  /** 0 = sin bandas, 1 = bandas de cine completas */
  letterbox = 0;
  /** 0 = visible, 1 = negro */
  fade = 1;
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bloom?: UnrealBloomPass;
  private updaters = new Set<(dt: number, t: number) => void>();

  constructor(canvasParent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    canvasParent.appendChild(this.renderer.domElement);

    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: quality.msaa,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.rt.depthTexture!.type = THREE.UnsignedIntType;

    const uniforms = {
      tColor: { value: this.rt.texture },
      tDepth: { value: this.rt.depthTexture },
      uInvProj: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
      uGrey: { value: 0 },
      uRestore: { value: memory.restore },
      uTint: { value: memory.tint },
      uExposure: { value: 1.0 },
      uFade: { value: 1 },
      uLetterbox: { value: 0 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 6000 },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uOutline: { value: 1 },
    };
    this.post = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms, vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false }),
    );
    this.post.frustumCulled = false;
    this.postScene.add(this.post);

    if (quality.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.85);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.bloom?.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 55; // móvil en vertical: más campo de visión
    this.camera.updateProjectionMatrix();
    this.post.material.uniforms.uAspect.value = w / h;
    this.post.material.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
  }

  onUpdate(fn: (dt: number, t: number) => void) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    const t = this.clock.elapsedTime;
    for (const fn of this.updaters) fn(dt, t);
    this.render(t);
  }

  render(t: number) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    if (this.bloom) {
      r.autoClear = false;
      this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.rt, 0, false);
      r.autoClear = true;
    }
    const u = this.post.material.uniforms;
    u.tColor.value = this.rt.texture;
    u.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    u.uInvView.value.copy(this.camera.matrixWorld);
    u.uGrey.value = memory.grey;
    u.uFade.value = this.fade;
    u.uLetterbox.value = this.letterbox;
    u.uTime.value = t;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }

  set exposure(v: number) {
    this.post.material.uniforms.uExposure.value = v;
  }
}

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FS = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform float uGrey;
uniform vec4 uRestore[${MAX_RESTORE}];
uniform vec3 uTint;
uniform float uExposure;
uniform float uFade;
uniform float uLetterbox;
uniform float uAspect;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform vec2 uTexel;
uniform float uOutline;
varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb * uExposure;

  // Posición en el mundo reconstruida desde la profundidad
  float depth = texture2D(tDepth, vUv).r;
  vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInvProj * clip;
  view /= view.w;
  vec3 world = (uInvView * vec4(view.xyz, 1.0)).xyz;

  // Contorno de ilustración: discontinuidades de profundidad, más fino a lo lejos
  float d0 = linDepth(depth);
  float e = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0) * uTexel * 1.2;
    float dn = linDepth(texture2D(tDepth, vUv + o).r);
    e = max(e, (dn - d0) / d0);
  }
  float edge = smoothstep(0.06, 0.2, e) * (1.0 - smoothstep(25.0, 160.0, d0)) * uOutline;

  float restored = 0.0;
  for (int i = 0; i < ${MAX_RESTORE}; i++) {
    vec4 s = uRestore[i];
    if (s.w <= 0.0) continue;
    float d = length(world.xz - s.xz);
    // borde orgánico que "respira"
    float edgeR = s.w * (1.0 + 0.04 * sin(uTime * 0.7 + world.x * 0.15) * cos(world.z * 0.13));
    restored = max(restored, 1.0 - smoothstep(edgeR * 0.82, edgeR, d));
  }
  float grey = uGrey * (1.0 - restored);

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 g = mix(vec3(l), vec3(l) * uTint, 0.6);
  col = mix(col, g * 0.95 + 0.02, grey);

  // tono: Reinhard extendido sobre la luminancia (conserva la saturación de la pintura)
  float L = max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float Lc = L * (1.0 + L / 4.0) / (1.0 + L);
  col *= Lc / L;
  // gradación: sombras frías, luces cálidas, algo más de saturación
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.12 - 0.3 * grey);
  col += vec3(-0.012, 0.0, 0.03) * (1.0 - smoothstep(0.0, 0.45, lum));
  col += vec3(0.03, 0.012, -0.02) * smoothstep(0.45, 1.0, lum);
  col = clamp(col, 0.0, 1.0);

  // contorno: oscurece hacia un sepia frío, no negro
  col = mix(col, col * vec3(0.32, 0.3, 0.36), edge * 0.75);

  col = toSRGB(col);

  // viñeta (más intensa en la niebla)
  vec2 q = vUv - 0.5;
  q.x *= mix(1.0, uAspect, 0.5);
  float vig = 1.0 - smoothstep(0.25, 0.85, length(q));
  col *= mix(1.0, vig, 0.3 + 0.25 * uGrey);

  // grano de papel
  col += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.014;

  // bandas de cine 2.39:1
  float barH = uLetterbox * max(0.0, 0.5 - 0.5 * uAspect / 2.39);
  if (vUv.y < barH || vUv.y > 1.0 - barH) col = vec3(0.0);

  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

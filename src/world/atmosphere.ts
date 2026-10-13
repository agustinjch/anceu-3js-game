import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { memory } from '../core/engine';

/**
 * Cielo, sol, luz ambiente y niebla. `setTime` mueve el sol (amanecer, mañana, noche…)
 * y `setFog` controla la Néboa do Esquecemento (densidad + color + desaturación global).
 */
export class Atmosphere {
  sky = new Sky();
  sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a5a32, 0.9);
  fog = new THREE.FogExp2(0xb8c3cc, 0.004);
  private sunDir = new THREE.Vector3();
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky = new Sky();
  private envRT?: THREE.WebGLRenderTarget;
  /** 0 = despejado, 1 = niebla total */
  fogAmount = 0;
  private fogTarget = 0;
  private clearFogColor = new THREE.Color(0xc9d6e2);
  private oblivionColor = new THREE.Color(0x9aa4ad);
  private static OBLIVION_DAY = new THREE.Color(0x9aa4ad);
  /** Si la niebla desatura el mundo (en el prólogo no: es de noche y aún no hay olvido). */
  greyFromFog = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    shadowSize: number,
  ) {
    this.sky.scale.setScalar(5000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.85;
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

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
  }

  /** Hora del día en horas (0-24). Recalcula sol, cielo y reflejos. */
  setTime(hour: number, azimuthDeg = 140) {
    // elevación aproximada de un día de otoño en Galicia
    const elev = Math.sin(((hour - 7.8) / 10.4) * Math.PI) * 38;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azimuthDeg + (hour - 12) * 15);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const)
      this.envSky.material.uniforms[k].value = this.sky.material.uniforms[k].value;

    const day = THREE.MathUtils.smoothstep(elev, -6, 12);
    const warm = 1 - THREE.MathUtils.smoothstep(elev, 4, 30);
    this.sun.intensity = 3.4 * day;
    this.sun.color.setHSL(0.09 - 0.04 * warm, 0.5 + 0.4 * warm, 0.62 + 0.25 * (1 - warm));
    this.hemi.intensity = 0.15 + 0.45 * day;
    this.hemi.color.setHSL(0.6, 0.45, 0.35 + 0.4 * day);
    this.clearFogColor.setHSL(0.58, 0.25 - 0.1 * warm, 0.12 + 0.68 * day);
    if (elev < -4) this.clearFogColor.setHSL(0.63, 0.4, 0.06);
    this.oblivionColor.copy(Atmosphere.OBLIVION_DAY).multiplyScalar(0.2 + 0.8 * day);

    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    // el Sky da valores HDR muy altos: el entorno PMREM necesita una intensidad baja
    this.scene.environmentIntensity = 0.015 + 0.045 * day;
  }

  /** Noche de luna: el cielo con el sol bajo el horizonte y la luz principal como luna. */
  setNight() {
    this.setTime(22.5);
    this.sun.intensity = 0.55;
    this.sun.color.set(0x9db4ff);
    this.sunDir.set(-0.4, 0.6, 0.5).normalize();
    this.hemi.intensity = 0.18;
    this.hemi.color.set(0x5a6fa0);
    this.clearFogColor.set(0x141b26);
    this.oblivionColor.set(0x2a3546);
    this.scene.environmentIntensity = 0.01;
  }

  /** Niebla del olvido: 0 = mañana limpia con bruma, 1 = Anceu tragada por la néboa. */
  setFog(amount: number, instant = false) {
    this.fogTarget = amount;
    if (instant) this.fogAmount = amount;
  }

  update(dt: number, focus: THREE.Vector3) {
    this.fogAmount = THREE.MathUtils.damp(this.fogAmount, this.fogTarget, 0.6, dt);
    const f = this.fogAmount;
    this.fog.density = THREE.MathUtils.lerp(0.0014, 0.03, f * f);
    this.fog.color.copy(this.clearFogColor).lerp(this.oblivionColor, f);
    if (this.greyFromFog) memory.grey = THREE.MathUtils.smoothstep(f, 0.15, 0.7);
    this.sky.material.uniforms.turbidity.value = 6 + 14 * f;
    this.sky.visible = f < 0.98;

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

import * as THREE from 'three';
import type { HeightMap } from '../world/terrain';

function pawTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  const el = (x: number, y: number, rx: number, ry: number, r = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, r, 0, Math.PI * 2);
    g.fill();
  };
  el(64, 82, 24, 20);
  el(32, 52, 9, 13, -0.4);
  el(52, 34, 9, 13, -0.15);
  el(76, 34, 9, 13, 0.15);
  el(96, 52, 9, 13, 0.4);
  return new THREE.CanvasTexture(c);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,230,180,0.6)');
  grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const GOLD = new THREE.Color(0xffc777);
let pawTex: THREE.Texture | null = null;
export let glowTex: THREE.Texture | null = null;
export const getGlowTex = () => (glowTex ??= glowTexture());

/**
 * Rastro de huellas de luz que guía a Pepe. Las huellas "se encienden" en ola
 * desde el jugador hacia el destino.
 */
export class PawTrail {
  mesh: THREE.InstancedMesh;
  private pts: THREE.Vector3[] = [];
  private mat: THREE.MeshBasicMaterial;
  private t = 0;
  visible = 1;

  constructor(path: THREE.Vector3[], hm: HeightMap | null, spacing = 1.6) {
    pawTex ??= pawTexture();
    const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    const n = Math.max(2, Math.floor(curve.getLength() / spacing));
    this.mat = new THREE.MeshBasicMaterial({
      map: pawTex,
      color: GOLD,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.32).rotateX(-Math.PI / 2), this.mat, n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t);
      // pisadas alternas izquierda/derecha
      const side = new THREE.Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(i % 2 ? 0.13 : -0.13);
      p.add(side);
      if (hm) p.y = hm.at(p.x, p.z) + 0.08;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(tg.x, tg.z));
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, m);
      this.pts.push(p);
    }
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    // la huella más cercana al jugador marca el inicio de la ola
    let nearest = 0;
    let best = Infinity;
    this.pts.forEach((p, i) => {
      const d = p.distanceToSquared(player);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    const c = new THREE.Color();
    for (let i = 0; i < this.pts.length; i++) {
      const ahead = i - nearest;
      let k = 0;
      if (ahead >= -2) {
        const wave = Math.max(0, Math.sin(this.t * 2.2 - ahead * 0.35));
        const fade = THREE.MathUtils.clamp(1 - ahead / 40, 0.15, 1);
        k = (0.25 + 0.75 * wave) * fade;
      }
      c.copy(GOLD).multiplyScalar(k * this.visible);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
  }
}

/**
 * Columna de luz sobre un lugar con memoria perdida: se ve a través de la niebla.
 */
export class Beacon {
  group = new THREE.Group();
  private beam: THREE.Mesh;
  private light: THREE.PointLight;
  private motes: THREE.Points;
  private t = Math.random() * 10;
  intensity = 1;

  constructor(pos: THREE.Vector3, height = 40) {
    glowTex ??= glowTexture();
    const beamGeo = new THREE.CylinderGeometry(0.6, 1.8, height, 24, 1, true).translate(0, height / 2, 0);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uI: { value: 1 }, uH: { value: height } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uT; uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          float edge = pow(1.0 - abs(dot(vN, vV)), 1.5);
          float v = (1.0 - vUv.y);
          float flick = 0.75 + 0.25 * sin(vUv.y * 30.0 - uT * 3.0);
          float a = (1.0 - edge) * v * v * flick * 0.55 * uI;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.52) * a, a);
        }`,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.light = new THREE.PointLight(0xffc777, 30, 18, 1.5);
    this.light.position.y = 2;
    const N = 60;
    const pos3 = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos3.set([(Math.random() - 0.5) * 3, Math.random() * 8, (Math.random() - 0.5) * 3], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos3, 3));
    this.motes = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: glowTex, size: 0.25, color: 0xffd99a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.group.add(this.beam, this.light, this.motes);
    this.group.position.copy(pos);
  }

  update(dt: number) {
    this.t += dt;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uT.value = this.t;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uI.value = this.intensity;
    this.light.intensity = 30 * this.intensity * (0.85 + 0.15 * Math.sin(this.t * 2));
    const p = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * (0.4 + (i % 5) * 0.12);
      if (y > 8) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    this.group.visible = this.intensity > 0.01;
  }
}

/** El fragmento de memoria en sí: orbe dorado que flota y se deja recoger. */
export class MemoryOrb {
  group = new THREE.Group();
  private core: THREE.Mesh;
  private halo: THREE.Sprite;
  private t = 0;
  constructor(pos: THREE.Vector3) {
    glowTex ??= glowTexture();
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 2),
      new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }),
    );
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xffc777, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.halo.scale.setScalar(1.6);
    const l = new THREE.PointLight(0xffc777, 8, 6, 1.6);
    this.group.add(this.core, this.halo, l);
    this.group.position.copy(pos);
  }
  update(dt: number) {
    this.t += dt;
    this.core.position.y = Math.sin(this.t * 1.8) * 0.12;
    this.halo.position.y = this.core.position.y;
    this.halo.scale.setScalar(1.4 + Math.sin(this.t * 3) * 0.2);
  }
}

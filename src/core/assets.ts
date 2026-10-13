import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Carga y caché de recursos con progreso global para la pantalla de carga. */
class Assets {
  manager = new THREE.LoadingManager();
  private gltf = new GLTFLoader(this.manager);
  private tex = new THREE.TextureLoader(this.manager);
  private cache = new Map<string, Promise<unknown>>();
  onProgress: (p: number) => void = () => {};

  constructor() {
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.manager.onProgress = (_url, loaded, total) => this.onProgress(total ? loaded / total : 1);
  }

  model(url: string): Promise<GLTF> {
    return this.memo(url, () => this.gltf.loadAsync(url));
  }

  /** Igual que `model`, pero devuelve null si no existe (assets opcionales). */
  async optionalModel(url: string): Promise<GLTF | null> {
    try {
      return await this.model(url);
    } catch {
      return null;
    }
  }

  texture(url: string, opts: { srgb?: boolean; repeat?: boolean } = {}): Promise<THREE.Texture> {
    return this.memo(`${url}|${opts.srgb}|${opts.repeat}`, async () => {
      const t = await this.tex.loadAsync(url);
      if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    });
  }

  async optionalTexture(url: string, opts: { srgb?: boolean; repeat?: boolean } = {}) {
    try {
      return await this.texture(url, opts);
    } catch {
      return null;
    }
  }

  async binary(url: string): Promise<ArrayBuffer> {
    return this.memo(url, async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return r.arrayBuffer();
    });
  }

  async json<T>(url: string): Promise<T> {
    return this.memo(url, async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return r.json();
    });
  }

  private memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let p = this.cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }
}

export const assets = new Assets();

/** Conjunto de texturas PBR (Poly Haven) en public/textures/<name>/ */
export async function pbr(name: string, repeat = 1) {
  const base = `textures/${name}/`;
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
    assets.optionalTexture(base + 'diff.jpg', { srgb: true, repeat: true }),
    assets.optionalTexture(base + 'nor.jpg', { repeat: true }),
    assets.optionalTexture(base + 'rough.jpg', { repeat: true }),
    assets.optionalTexture(base + 'ao.jpg', { repeat: true }),
  ]);
  const c = (t: THREE.Texture | null) => {
    if (!t) return null;
    const k = t.clone(); // la imagen se comparte; el repeat es propio
    k.repeat.set(repeat, repeat);
    return k;
  };
  return { map: c(map), normalMap: c(normalMap), roughnessMap: c(roughnessMap), aoMap: c(aoMap) };
}

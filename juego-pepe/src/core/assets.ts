import * as THREE from 'three';
import { painted } from '../world/painted';
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

/**
 * Texturas de superficie por nombre. Antes eran fotos PBR de Poly Haven; ahora el juego es
 * pintado, así que devuelve la textura pintada a mano (sin normal/rugosidad: el toon no las usa).
 */
export async function pbr(name: string, repeat = 1) {
  const t = painted(name);
  const map = t ? t.clone() : null; // la imagen se comparte; el repeat es propio
  map?.repeat.set(repeat, repeat);
  return { map, normalMap: null, roughnessMap: null, aoMap: null } as {
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
    aoMap: THREE.Texture | null;
  };
}

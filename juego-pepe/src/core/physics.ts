import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

/** Mundo físico (Rapier). Solo hay colisiones estáticas + el controlador de Pepe + algún objeto dinámico. */
export class Physics {
  world!: RAPIER.World;
  private dynamic: { body: RAPIER.RigidBody; obj: THREE.Object3D }[] = [];

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.world.timestep = 1 / 60;
  }

  private acc = 0;
  step(dt: number) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.world.timestep && n < 3) {
      this.world.step();
      this.acc -= this.world.timestep;
      n++;
    }
    for (const d of this.dynamic) {
      const p = d.body.translation();
      const r = d.body.rotation();
      d.obj.position.set(p.x, p.y, p.z);
      d.obj.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Terreno: alturas en filas (z) x columnas (x), mundo centrado en el origen. */
  addHeightfield(heights: Float32Array, n: number, size: number) {
    const hf = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hf[i * n + j] = heights[j * n + i];
    const desc = RAPIER.ColliderDesc.heightfield(n - 1, n - 1, hf, { x: size, y: 1, z: size });
    return this.world.createCollider(desc);
  }

  addBox(center: THREE.Vector3, half: THREE.Vector3, rotY = 0, quat?: THREE.Quaternion) {
    const q = quat ?? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    return this.world.createCollider(desc);
  }

  /** Colisión exacta a partir de una malla (en coordenadas de mundo). */
  addTrimesh(mesh: THREE.Mesh) {
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry.index ? mesh.geometry : mesh.geometry.toNonIndexed();
    const pos = g.attributes.position;
    const v = new Float32Array(pos.count * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      v.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    const idx = g.index ? new Uint32Array(g.index.array) : new Uint32Array(pos.count).map((_, i) => i);
    return this.world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx));
  }

  addDynamicBox(obj: THREE.Object3D, half: THREE.Vector3, mass = 1) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(obj.position.x, obj.position.y, obj.position.z).setLinearDamping(0.6).setAngularDamping(0.8),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setMass(mass).setFriction(0.9), body);
    this.dynamic.push({ body, obj });
    return body;
  }

  remove(c: RAPIER.Collider) {
    this.world.removeCollider(c, true);
  }

  /** Rayo hacia abajo/genérico: devuelve distancia o null. */
  raycast(from: THREE.Vector3, dir: THREE.Vector3, max: number, exclude?: RAPIER.Collider) {
    const hit = this.world.castRay(new RAPIER.Ray(from, dir), max, true, undefined, undefined, exclude);
    return hit ? hit.timeOfImpact : null;
  }
}

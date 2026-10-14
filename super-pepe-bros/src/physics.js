// Static collision via a merged BVH, plus simple dynamic platforms.
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _box = new THREE.Box3(), _seg = new THREE.Line3(), _triPt = new THREE.Vector3(), _capPt = new THREE.Vector3();

export class CollisionWorld {
  constructor() {
    this.static = null;
    this.dynamic = []; // { mesh, prev: Matrix4, delta } for moving platforms
  }
  build(meshes) {
    const geos = [];
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      let g = m.geometry.clone();
      g = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      g.applyMatrix4(m.matrixWorld);
      geos.push(g);
    }
    if (!geos.length) { this.static = null; return; }
    const merged = mergeGeometries(geos, false);
    merged.boundsTree = new MeshBVH(merged);
    this.static = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ wireframe: true }));
    geos.forEach(g => g.dispose());
  }
  addDynamic(mesh) {
    mesh.updateWorldMatrix(true, true);
    mesh.traverse(o => { if (o.isMesh && !o.geometry.boundsTree) o.geometry.boundsTree = new MeshBVH(o.geometry); });
    this.dynamic.push({ mesh, prev: mesh.matrixWorld.clone() });
  }
  clear() { if (this.static) this.static.geometry.dispose(); this.static = null; this.dynamic = []; }

  // Resolve a capsule (feet position, radius, height). Returns adjusted position and whether pushed up.
  resolveCapsule(pos, radius, height) {
    const out = { pushed: new THREE.Vector3() };
    if (!this.static) return out;
    _seg.start.set(pos.x, pos.y + radius, pos.z);
    _seg.end.set(pos.x, pos.y + height - radius, pos.z);
    const start0 = _v2.copy(_seg.start);
    _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end);
    _box.min.addScalar(-radius); _box.max.addScalar(radius);
    const bvh = this.static.geometry.boundsTree;
    for (let iter = 0; iter < 2; iter++) {
      bvh.shapecast({
        intersectsBounds: b => b.intersectsBox(_box),
        intersectsTriangle: tri => {
          const d = tri.closestPointToSegment(_seg, _triPt, _capPt);
          if (d < radius) {
            const depth = radius - d;
            const dir = _capPt.sub(_triPt).normalize();
            _seg.start.addScaledVector(dir, depth);
            _seg.end.addScaledVector(dir, depth);
          }
        },
      });
    }
    out.pushed.subVectors(_seg.start, start0);
    pos.add(out.pushed);
    return out;
  }
  // Downward raycast to find ground. Returns { y, normal, platform } or null
  ground(pos, up = 0.6, down = 0.4) {
    _ray.set(_v.set(pos.x, pos.y + up, pos.z), new THREE.Vector3(0, -1, 0));
    _ray.far = up + down; _ray.firstHitOnly = true;
    let best = null;
    if (this.static) {
      const h = _ray.intersectObject(this.static, false)[0];
      if (h) best = { y: h.point.y, normal: h.face.normal.clone(), platform: null, dist: h.distance };
    }
    for (const d of this.dynamic) {
      if (!d.mesh.visible) continue;
      const hs = _ray.intersectObject(d.mesh, true);
      const h = hs[0];
      if (h && (!best || h.distance < best.dist)) {
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        best = { y: h.point.y, normal: n, platform: d, dist: h.distance };
      }
    }
    return best;
  }
  raycast(origin, dir, far) {
    if (!this.static) return null;
    _ray.set(origin, dir); _ray.far = far; _ray.firstHitOnly = true;
    return _ray.intersectObject(this.static, false)[0] || null;
  }
  // Horizontal push-out from dynamic platforms (treat as their bounding boxes)
  pushFromDynamic(pos, radius, height) {
    for (const d of this.dynamic) {
      if (!d.mesh.visible || d.mesh.userData.noSide) continue;
      _box.setFromObject(d.mesh);
      if (pos.y + height < _box.min.y || pos.y > _box.max.y - 0.25) continue;
      const cx = THREE.MathUtils.clamp(pos.x, _box.min.x, _box.max.x);
      const cz = THREE.MathUtils.clamp(pos.z, _box.min.z, _box.max.z);
      const dx = pos.x - cx, dz = pos.z - cz, dist = Math.hypot(dx, dz);
      if (dist < radius && dist > 1e-4) { pos.x = cx + dx / dist * radius; pos.z = cz + dz / dist * radius; }
    }
  }
  // Call each frame after platforms have moved; computes per-platform delta transforms.
  updateDynamic() {
    for (const d of this.dynamic) {
      d.mesh.updateWorldMatrix(true, true);
      d.delta = new THREE.Matrix4().copy(d.mesh.matrixWorld).multiply(new THREE.Matrix4().copy(d.prev).invert());
      d.prev.copy(d.mesh.matrixWorld);
    }
  }
}

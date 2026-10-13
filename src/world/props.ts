import * as THREE from 'three';
import { assets, pbr } from '../core/assets';
import type { Physics } from '../core/physics';

/** Hórreo galego de granito: pés con tornarratos, cámara de madeira, tellado e cruz. */
export async function buildHorreo(physics: Physics, pos: THREE.Vector3, rotY: number, length = 4.2) {
  const [granite, wood, roof] = await Promise.all([pbr('granite', 1), pbr('wood_weathered', 1), pbr('roof_tiles_old', 1)]);
  const stone = new THREE.MeshStandardMaterial({ color: 0xc9c3b8, map: granite.map, normalMap: granite.normalMap, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8c4a32, map: wood.map, normalMap: wood.normalMap, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc89a82, map: roof.map, normalMap: roof.normalMap, roughness: 0.9, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const W = 1.5;
  const legs = Math.max(2, Math.round(length / 2) + 1);
  for (let i = 0; i < legs; i++) {
    const x = -length / 2 + 0.25 + (i * (length - 0.5)) / (legs - 1);
    for (const z of [-W / 2 + 0.15, W / 2 - 0.15]) {
      add(new THREE.BoxGeometry(0.3, 1.3, 0.3), stone, x, 0.65, z);
      // tornarratos: losa circular sobre cada pé
      add(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 14), stone, x, 1.35, z);
    }
  }
  add(new THREE.BoxGeometry(length + 0.2, 0.18, W + 0.15), stone, 0, 1.49, 0);
  // cámara: esquinais de granito + lamas de madeira
  const chH = 1.6;
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.22, chH, W), stone, (sx * (length - 0.22)) / 2, 1.58 + chH / 2, 0);
  const slats = 9;
  for (const sz of [-1, 1])
    for (let k = 0; k < slats; k++) {
      const x = -length / 2 + 0.35 + (k * (length - 0.7)) / (slats - 1);
      add(new THREE.BoxGeometry(0.28, chH - 0.1, 0.06), woodMat, x, 1.58 + chH / 2, (sz * (W - 0.1)) / 2);
    }
  add(new THREE.BoxGeometry(length - 0.3, chH - 0.1, W - 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1410 }), 0, 1.58 + chH / 2, 0);
  // tellado a dúas augas
  const roofW = W / 2 + 0.35;
  const pitch = 0.55;
  for (const s of [-1, 1]) {
    const r = add(new THREE.PlaneGeometry(length + 0.6, roofW / Math.cos(pitch)), roofMat, 0, 1.58 + chH + Math.tan(pitch) * roofW * 0.5, (s * roofW) / 2);
    // normal hacia fuera y arriba en cada faldón
    r.rotation.x = s > 0 ? -(Math.PI / 2) + pitch : -(Math.PI / 2) - pitch;
  }
  // cruz no cumio
  const topY = 1.58 + chH + Math.tan(pitch) * roofW + 0.05;
  add(new THREE.BoxGeometry(0.08, 0.55, 0.08), stone, length / 2, topY + 0.27, 0);
  add(new THREE.BoxGeometry(0.08, 0.08, 0.32), stone, length / 2, topY + 0.38, 0);
  add(new THREE.BoxGeometry(0.15, 0.3, 0.15), stone, -length / 2, topY + 0.15, 0);

  g.position.copy(pos);
  g.rotation.y = rotY;
  g.updateMatrixWorld(true);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  physics.addBox(pos.clone().add(new THREE.Vector3(0, 2.4, 0)), new THREE.Vector3(length / 2 + 0.1, 0.9, W / 2), 0, q);
  for (let i = 0; i < legs; i++) {
    const x = -length / 2 + 0.25 + (i * (length - 0.5)) / (legs - 1);
    for (const z of [-W / 2 + 0.15, W / 2 - 0.15]) {
      const c = new THREE.Vector3(x, 0.7, z).applyQuaternion(q).add(pos);
      physics.addBox(c, new THREE.Vector3(0.17, 0.7, 0.17), rotY);
    }
  }
  return g;
}

/** Coloca un modelo de props (barril, cesto...) con colisión de caja. */
export async function placeProp(physics: Physics | null, file: string, pos: THREE.Vector3, rotY = 0, height?: number) {
  const gltf = await assets.optionalModel(`models/env/${file}.glb`);
  if (!gltf) return null;
  const obj = gltf.scene.clone();
  if (height) {
    const b = new THREE.Box3().setFromObject(obj);
    obj.scale.setScalar(height / Math.max(0.01, b.max.y - b.min.y));
  }
  obj.position.copy(pos);
  obj.rotation.y = rotY;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = o.receiveShadow = true;
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m.transparent) {
        m.transparent = false;
        m.alphaTest = 0.45;
      }
    }
  });
  if (physics) {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    const c = b.getCenter(new THREE.Vector3());
    const s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    physics.addBox(c, s);
  }
  return obj;
}

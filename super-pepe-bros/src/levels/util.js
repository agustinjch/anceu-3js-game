import * as THREE from 'three';
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export function noise2(x, z) {
  return Math.sin(x * 0.07 + Math.sin(z * 0.05) * 1.3) * 0.5 + Math.sin(z * 0.09 + x * 0.03) * 0.35 + Math.sin((x + z) * 0.21) * 0.15;
}
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Standard terrain colour: grass with variation, dirt paths, rock on steep slopes.
export function grassColor(path, rockY = 999) {
  const c1 = new THREE.Color(0x6aa84f), c2 = new THREE.Color(0x4e8a3a), dirt = new THREE.Color(0xb59a6a), rock = new THREE.Color(0x8d8a80), cob = new THREE.Color(0xa8a090);
  return (x, z, h, ny, out) => {
    out.copy(c1).lerp(c2, (Math.sin(x * 0.3) * Math.sin(z * 0.25) + 1) / 2);
    const p = path ? path(x, z) : 0;
    if (p > 0) out.lerp(p > 1.5 ? cob : dirt, Math.min(1, p));
    if (ny < 0.75 || h > rockY) out.lerp(rock, ny < 0.75 ? smooth(0.75, 0.55, ny) : 0.6);
  };
}
// distance from point to segment
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
export function ringOf(n, cx, cy, cz, r) { const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push(V(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r)); } return out; }
export function lineOf(n, a, b) { const out = []; for (let i = 0; i < n; i++) out.push(a.clone().lerp(b, n === 1 ? 0 : i / (n - 1))); return out; }

// Shared stage helpers: lights, banners, festival bunting.
import * as THREE from 'three';

export function lights(scene, { sun = 0xfff1d6, sunI = 2.6, sunPos = [6, 10, 8], hemiSky = 0xcfe6ff, hemiGround = 0x5a4a3a, hemiI = 1.1 } = {}) {
  scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemiI));
  const d = new THREE.DirectionalLight(sun, sunI);
  d.position.set(...sunPos);
  d.target.position.set(0, 0, 0);
  d.castShadow = true;
  d.shadow.mapSize.set(2048, 2048);
  Object.assign(d.shadow.camera, { left: -9, right: 9, top: 7, bottom: -3, near: 1, far: 40 });
  d.shadow.bias = -0.0004;
  d.shadow.normalBias = 0.02;
  scene.add(d, d.target);
  return d;
}

// A canvas texture with text, for banners and signs.
export function textTexture(lines, { w = 1024, h = 256, bg = '#c62f2f', fg = '#fff6d8', font = 'Bangers, Impact, sans-serif', size = 120 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const arr = [].concat(lines);
  arr.forEach((l, i) => {
    g.font = `${i === 0 ? size : size * 0.45}px ${font}`;
    g.fillText(l, w / 2, h / 2 + (i - (arr.length - 1) / 2) * size * 0.8);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function banner(group, x, y, z, w, h, lines, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: textTexture(lines, opts), roughness: 0.9, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

// String of little triangular flags (bandeirolas) between two points, sagging in the middle.
export function bunting(group, a, b, n = 18, colors = [0xd93b3b, 0xf2c230, 0x2f7fd9, 0x3fa34d, 0xf2efe8]) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.8, a[2] + (b[2] - a[2]) * t));
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0), new THREE.Vector3(0, -0.4, 0)]);
  tri.computeVertexNormals();
  for (let i = 0; i < n; i++) {
    const p = pts[i].clone().lerp(pts[i + 1], 0.5);
    const f = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.8 }));
    f.position.copy(p);
    f.lookAt(p.x, p.y, p.z + 1);
    group.add(f);
  }
}

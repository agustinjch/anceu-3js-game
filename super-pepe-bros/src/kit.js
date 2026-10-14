// Level construction kit: procedural textures, materials and Galician village props.
import * as THREE from 'three';

// ---------- procedural textures ----------
const texCache = {};
function canvasTex(key, size, draw, repeat = true) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  texCache[key] = t; return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function noiseFill(g, s, base, vari, n = 4000, sz = 3) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const l = rnd(-vari, vari);
    g.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`;
    g.fillRect(Math.random() * s, Math.random() * s, rnd(1, sz), rnd(1, sz));
  }
}
export const TEX = {
  grass: () => canvasTex('grass', 256, (g, s) => {
    noiseFill(g, s, '#ffffff', 0.12, 6000, 3);
    for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(0,${Math.random() < .5 ? 40 : 0},0,${rnd(.05, .15)})`; const x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - rnd(3, 7)); g.stroke(); }
  }),
  granite: () => canvasTex('granite', 256, (g, s) => {
    g.fillStyle = '#9a958c'; g.fillRect(0, 0, s, s);
    // irregular stone blocks
    let y = 0;
    while (y < s) {
      const h = rnd(28, 48); let x = -rnd(0, 30);
      while (x < s) {
        const w = rnd(40, 80), l = rnd(130, 185);
        g.fillStyle = `rgb(${l},${l - 4},${l - 12})`; g.fillRect(x + 2, y + 2, w - 4, h - 4);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '30,30,30'},${rnd(.05, .2)})`; g.fillRect(x + rnd(2, w - 4), y + rnd(2, h - 4), 2, 2); }
        x += w;
      }
      y += h;
    }
    g.fillStyle = 'rgba(40,60,20,0.18)'; for (let i = 0; i < 30; i++) g.fillRect(rnd(0, s), rnd(0, s), rnd(4, 20), rnd(2, 6)); // moss
  }),
  cobble: () => canvasTex('cobble', 256, (g, s) => {
    g.fillStyle = '#6f6a60'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) { const l = rnd(120, 170); g.fillStyle = `rgb(${l},${l - 3},${l - 10})`; g.beginPath(); g.ellipse(rnd(0, s), rnd(0, s), rnd(10, 18), rnd(8, 14), rnd(0, 3), 0, 7); g.fill(); }
  }),
  roof: () => canvasTex('roof', 128, (g, s) => {
    g.fillStyle = '#9c4a2a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 * 8; x < s + 16; x += 16) {
      const l = rnd(-20, 20); g.fillStyle = `rgb(${175 + l},${85 + l / 2},${50 + l / 3})`;
      g.beginPath(); g.ellipse(x, y + 8, 7, 9, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 7, y + 14, 14, 2);
    }
  }),
  wood: () => canvasTex('wood', 128, (g, s) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '40,20,5' : '150,110,70'},${rnd(.15, .4)})`; g.beginPath(); const y = rnd(0, s); g.moveTo(0, y); g.bezierCurveTo(s / 3, y + rnd(-4, 4), s * 2 / 3, y + rnd(-4, 4), s, y); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 2);
  }),
  plaster: () => canvasTex('plaster', 128, (g, s) => noiseFill(g, s, '#efe8da', 0.06, 2500, 4)),
  bark: () => canvasTex('bark', 128, (g, s) => {
    g.fillStyle = '#5b4330'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(20,10,0,${rnd(.2, .5)})`; g.lineWidth = rnd(1, 3); const x = rnd(0, s); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rnd(-6, 6), s); g.stroke(); }
  }),
  leaves: () => canvasTex('leaves', 128, (g, s) => {
    noiseFill(g, s, '#ffffff', 0.25, 1500, 6);
  }),
  concrete: () => canvasTex('concrete', 128, (g, s) => {
    noiseFill(g, s, '#8d9196', 0.08, 3000, 3);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  }),
  water: () => canvasTex('water', 256, (g, s) => {
    g.fillStyle = '#2c8db0'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(255,255,255,${rnd(.08, .3)})`; g.lineWidth = rnd(1, 2.5); const x = rnd(0, s), y = rnd(0, s), w = rnd(10, 30); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 4, x + w, y); g.stroke(); }
  }),
  fall: () => canvasTex('fall', 128, (g, s) => {
    g.fillStyle = '#9fd8ee'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${rnd(.2, .7)})`; g.fillRect(rnd(0, s), rnd(0, s), rnd(1, 4), rnd(10, 40)); }
  }),
};

// ---------- materials ----------
const matCache = {};
export function mat(name) {
  if (matCache[name]) return matCache[name];
  const S = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const defs = {
    grass: () => S({ map: TEX.grass(), vertexColors: true }),
    granite: () => S({ map: TEX.granite() }),
    cobble: () => S({ map: TEX.cobble() }),
    roof: () => S({ map: TEX.roof(), roughness: 0.8 }),
    wood: () => S({ map: TEX.wood() }),
    plaster: () => S({ map: TEX.plaster() }),
    bark: () => S({ map: TEX.bark() }),
    leaves: () => S({ map: TEX.leaves(), color: 0x4f8a3a, flatShading: true }),
    leavesDark: () => S({ map: TEX.leaves(), color: 0x2f6a34, flatShading: true }),
    leavesAutumn: () => S({ map: TEX.leaves(), color: 0xc9892e, flatShading: true }),
    pine: () => S({ color: 0x2d5a3a, flatShading: true }),
    rock: () => S({ map: TEX.granite(), color: 0xb8b2a8, flatShading: true }),
    concrete: () => S({ map: TEX.concrete() }),
    metal: () => S({ color: 0x7c8590, metalness: 0.6, roughness: 0.4 }),
    dark: () => S({ color: 0x241c16 }),
    glass: () => S({ color: 0x223344, roughness: 0.1, metalness: 0.5 }),
    window: () => S({ color: 0xffd36b, emissive: 0xffb84a, emissiveIntensity: 0.0 }),
    red: () => S({ color: 0xc23b2e }),
    white: () => S({ color: 0xf2efe8 }),
    gold: () => S({ color: 0xffcf3a, metalness: 0.6, roughness: 0.3, emissive: 0x553300 }),
    mushroom: () => S({ color: 0xd8442f, roughness: 0.6 }),
    stem: () => S({ color: 0xf1e6cf }),
    vcol: () => S({ vertexColors: true, flatShading: true }),
  };
  matCache[name] = defs[name]();
  return matCache[name];
}
export function colorMat(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...o }); }

// Box with UVs scaled to world size (so textures tile consistently)
export function boxGeo(w, h, d, texScale = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / texScale, uv.getY(k) * dims[f][1] / texScale);
  }
  return g;
}

// ---------- Level builder ----------
export class Builder {
  constructor(scene) {
    this.scene = scene; this.colliders = []; this.group = new THREE.Group(); scene.add(this.group);
    this.animated = []; // functions(dt,t)
  }
  add(mesh, collide = true, shadow = true) {
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.colliders.push(mesh);
    return mesh;
  }
  box(x, y, z, w, h, d, m = 'granite', opts = {}) {
    const mesh = new THREE.Mesh(boxGeo(w, h, d, opts.tex || 2), typeof m === 'string' ? mat(m) : m);
    mesh.position.set(x, y + h / 2, z); if (opts.ry) mesh.rotation.y = opts.ry; if (opts.rx) mesh.rotation.x = opts.rx; if (opts.rz) mesh.rotation.z = opts.rz;
    return this.add(mesh, opts.collide !== false, opts.shadow !== false);
  }
  cyl(x, y, z, rt, rb, h, m = 'granite', seg = 12, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof m === 'string' ? mat(m) : m);
    mesh.position.set(x, y + h / 2, z);
    return this.add(mesh, opts.collide !== false, opts.shadow !== false);
  }
  // wedge ramp rising along +z (local), then rotated
  ramp(x, y, z, w, h, d, ry = 0, m = 'granite') {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(d, 0); s.lineTo(d, h); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(-d / 2, 0, -w / 2); g.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, typeof m === 'string' ? mat(m) : m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    mesh.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v / 2));
    return this.add(mesh);
  }
  terrain({ size = 200, seg = 128, height, color, x = 0, z = 0 }) {
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3), uv = g.attributes.uv;
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const wx = p.getX(i) + x, wz = p.getZ(i) + z, h = height(wx, wz);
      p.setY(i, h);
      uv.setXY(i, wx / 4, wz / 4);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      color(p.getX(i) + x, p.getZ(i) + z, p.getY(i), n.getY(i), c);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(g, mat('grass'));
    mesh.position.set(x, 0, z);
    mesh.castShadow = false;
    return this.add(mesh, true, false);
  }

  // ---------- props ----------
  rock(x, y, z, s = 1, collide = true) {
    const g = new THREE.DodecahedronGeometry(s, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rnd(0.8, 1.2), p.getY(i) * rnd(0.6, 0.9), p.getZ(i) * rnd(0.8, 1.2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat('rock')); m.position.set(x, y, z); m.rotation.y = rnd(0, 6);
    return this.add(m, collide);
  }
  tree(x, y, z, kind = 'oak', s = 1) {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.scale.setScalar(s); grp.rotation.y = rnd(0, 6);
    let trunkH = 3, trunkR = 0.35;
    if (kind === 'pine') {
      trunkH = 2; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, trunkH, 6), mat('bark')); t.position.y = trunkH / 2; grp.add(t);
      for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * 0.45, 2.4, 7), mat('pine')); c.position.y = 2.2 + i * 1.3; grp.add(c); }
    } else if (kind === 'eucalyptus') {
      trunkH = 9; trunkR = 0.25; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, trunkH, 6), mat('stem')); t.position.y = trunkH / 2; grp.add(t);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), colorMat(0x6f8f6a)); c.position.y = trunkH; c.scale.set(1, 1.6, 1); grp.add(c);
    } else {
      const big = kind === 'chestnut';
      trunkH = big ? 3.2 : 2.6; trunkR = big ? 0.55 : 0.4;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 7), mat('bark')); t.position.y = trunkH / 2; grp.add(t);
      const lm = kind === 'autumn' ? mat('leavesAutumn') : (big ? mat('leavesDark') : mat('leaves'));
      const blobs = big ? 6 : 4;
      for (let i = 0; i < blobs; i++) {
        const r = rnd(1.4, 2.1) * (big ? 1.25 : 1);
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lm);
        const a = i / blobs * Math.PI * 2;
        b.position.set(Math.cos(a) * rnd(0.8, 1.6), trunkH + rnd(0.6, 1.8), Math.sin(a) * rnd(0.8, 1.6));
        grp.add(b);
      }
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 2.4 : 1.9, 1), lm); top.position.y = trunkH + 2.4; grp.add(top);
    }
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(grp);
    // trunk collider
    const col = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * s, trunkR * s, trunkH * s + 1, 6));
    col.position.set(x, y + trunkH * s / 2, z); col.visible = false; col.updateMatrixWorld();
    this.colliders.push(col);
    grp.userData.sway = rnd(0, 6);
    this.animated.push((dt, t) => { grp.rotation.z = Math.sin(t * 0.8 + grp.userData.sway) * 0.012; });
    return grp;
  }
  stoneHouse(x, y, z, w = 6, d = 5, h = 3.2, ry = 0, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const wall = new THREE.Mesh(boxGeo(w, h, d), mat(opts.plaster ? 'plaster' : 'granite')); wall.position.y = h / 2; g.add(wall);
    // corner quoins
    if (opts.plaster) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = new THREE.Mesh(boxGeo(0.4, h, 0.4), mat('granite')); q.position.set(sx * (w / 2 - 0.15), h / 2, sz * (d / 2 - 0.15)); g.add(q); }
    // gable roof
    const rh = opts.roofH || 1.6;
    const shape = new THREE.Shape(); shape.moveTo(-d / 2 - 0.4, 0); shape.lineTo(0, rh); shape.lineTo(d / 2 + 0.4, 0); shape.lineTo(-d / 2 - 0.4, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false });
    rg.translate(0, 0, -(w + 0.6) / 2); rg.rotateY(Math.PI / 2);
    const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    const roof = new THREE.Mesh(rg, mat('roof')); roof.position.y = h; g.add(roof);
    // gable fill (stone triangle)
    // door
    const door = new THREE.Mesh(boxGeo(1.1, 2.1, 0.15), mat('wood')); door.position.set(opts.doorX || 0, 1.05, d / 2 + 0.03); g.add(door);
    const lintel = new THREE.Mesh(boxGeo(1.5, 0.3, 0.3), mat('granite')); lintel.position.set(opts.doorX || 0, 2.25, d / 2 + 0.05); g.add(lintel);
    // windows
    const wins = [];
    for (const wx of [-w / 2 + 1.3, w / 2 - 1.3]) {
      if (Math.abs(wx - (opts.doorX || 0)) < 1.2) continue;
      const win = new THREE.Mesh(boxGeo(0.8, 0.9, 0.1), mat('window').clone()); win.position.set(wx, 1.9, d / 2 + 0.03); g.add(win); wins.push(win);
      const fr = new THREE.Mesh(boxGeo(1.05, 0.15, 0.25), mat('granite')); fr.position.set(wx, 1.38, d / 2 + 0.06); g.add(fr);
      const sh = new THREE.Mesh(boxGeo(0.35, 0.95, 0.06), colorMat(opts.shutter || 0x2e6b4f)); sh.position.set(wx - 0.62, 1.9, d / 2 + 0.06); g.add(sh);
      const sh2 = sh.clone(); sh2.position.x = wx + 0.62; g.add(sh2);
    }
    // chimney
    const ch = new THREE.Mesh(boxGeo(0.6, 1.4, 0.6), mat('granite')); ch.position.set(w / 2 - 0.8, h + rh - 0.2, 0.6); g.add(ch);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g); g.updateMatrixWorld(true);
    // colliders: walls + roof
    this.colliders.push(wall, roof, ch);
    g.userData.windows = wins;
    return g;
  }
  horreo(x, y, z, ry = 0, len = 5) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const n = Math.max(2, Math.round(len / 2.2) + 1);
    const legs = [];
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const px = -len / 2 + 0.3 + i * (len - 0.6) / (n - 1);
      const leg = new THREE.Mesh(boxGeo(0.45, 1.6, 0.45), mat('granite')); leg.position.set(px, 0.8, s * 0.85); g.add(leg); legs.push(leg);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 10), mat('granite')); cap.position.set(px, 1.67, s * 0.85); g.add(cap);
    }
    const base = new THREE.Mesh(boxGeo(len + 0.3, 0.3, 2.4), mat('granite')); base.position.y = 1.9; g.add(base);
    const body = new THREE.Mesh(boxGeo(len, 1.8, 2.0), mat('wood')); body.position.y = 2.95; g.add(body);
    for (const s of [-1, 1]) { const end = new THREE.Mesh(boxGeo(0.4, 1.8, 2.1), mat('granite')); end.position.set(s * (len / 2), 2.95, 0); g.add(end); }
    // roof
    const shape = new THREE.Shape(); shape.moveTo(-1.4, 0); shape.lineTo(0, 0.9); shape.lineTo(1.4, 0); shape.lineTo(-1.4, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(len + 0.6) / 2); rg.rotateY(Math.PI / 2);
    const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    const roof = new THREE.Mesh(rg, mat('roof')); roof.position.y = 3.85; g.add(roof);
    // cross and pinnacle
    const cross1 = new THREE.Mesh(boxGeo(0.12, 0.8, 0.12), mat('granite')); cross1.position.set(len / 2 + 0.2, 5.0, 0); g.add(cross1);
    const cross2 = new THREE.Mesh(boxGeo(0.12, 0.12, 0.5), mat('granite')); cross2.position.set(len / 2 + 0.2, 5.15, 0); g.add(cross2);
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.8, 6), mat('granite')); pin.position.set(-len / 2 - 0.2, 5.1, 0); g.add(pin);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g); g.updateMatrixWorld(true);
    this.colliders.push(base, body, roof, ...legs);
    return g;
  }
  cruceiro(x, y, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(boxGeo(2.4 - i * 0.6, 0.35, 2.4 - i * 0.6), mat('granite')); st.position.y = 0.175 + i * 0.35; g.add(st); }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.6, 8), mat('granite')); col.position.y = 1.05 + 1.8; g.add(col);
    const v = new THREE.Mesh(boxGeo(0.22, 1.0, 0.22), mat('granite')); v.position.y = 5.2; g.add(v);
    const h = new THREE.Mesh(boxGeo(0.9, 0.2, 0.22), mat('granite')); h.position.y = 5.3; g.add(h);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g); g.updateMatrixWorld(true);
    g.children.slice(0, 4).forEach(m => this.colliders.push(m));
    return g;
  }
  stoneWall(x1, z1, x2, z2, y = 0, h = 1, t = 0.6) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    return this.box((x1 + x2) / 2, y, (z1 + z2) / 2, len, h, t, 'granite', { ry: -Math.atan2(z2 - z1, x2 - x1) });
  }
  church(x, y, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const nave = new THREE.Mesh(boxGeo(7, 6, 12), mat('granite')); nave.position.y = 3; g.add(nave);
    const shape = new THREE.Shape(); shape.moveTo(-4, 0); shape.lineTo(0, 2.6); shape.lineTo(4, 0); shape.lineTo(-4, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: 12.6, bevelEnabled: false }); rg.translate(0, 0, -6.3);
    const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    const roof = new THREE.Mesh(rg, mat('roof')); roof.position.y = 6; g.add(roof);
    // espadana (bell gable) on front facade
    const esp = new THREE.Mesh(boxGeo(4, 5, 1), mat('granite')); esp.position.set(0, 8.5, 6.3); g.add(esp);
    const espTop = new THREE.Mesh(boxGeo(1.5, 1.4, 1), mat('granite')); espTop.position.set(0, 11.7, 6.3); g.add(espTop);
    const crossV = new THREE.Mesh(boxGeo(0.2, 1, 0.2), mat('granite')); crossV.position.set(0, 12.9, 6.3); g.add(crossV);
    const crossH = new THREE.Mesh(boxGeo(0.7, 0.2, 0.2), mat('granite')); crossH.position.set(0, 13.0, 6.3); g.add(crossH);
    const bells = [];
    for (const bx of [-0.9, 0.9]) {
      const hole = new THREE.Mesh(boxGeo(1.1, 1.6, 1.05), mat('dark')); hole.position.set(bx, 9.2, 6.3); g.add(hole);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 0.7, 10), mat('gold')); bell.position.set(bx, 9.2, 6.3); g.add(bell); bells.push(bell);
    }
    const door = new THREE.Mesh(boxGeo(1.8, 3, 0.2), mat('wood')); door.position.set(0, 1.5, 6.05); g.add(door);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16), mat('window').clone()); rose.rotation.x = Math.PI / 2; rose.position.set(0, 4.4, 6.05); g.add(rose);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g); g.updateMatrixWorld(true);
    this.colliders.push(nave, roof, esp, espTop);
    this.animated.push((dt, t) => bells.forEach((b, i) => (b.rotation.z = Math.sin(t * 1.5 + i) * 0.15)));
    return g;
  }
  archBridge(x, y, z, len = 24, w = 4, h = 5, arches = 4, ry = 0) {
    const s = new THREE.Shape();
    s.moveTo(-len / 2, -2); s.lineTo(len / 2, -2); s.lineTo(len / 2, h); s.lineTo(-len / 2, h); s.lineTo(-len / 2, -2);
    const span = len / arches;
    for (let i = 0; i < arches; i++) {
      const cx = -len / 2 + span * (i + 0.5), r = Math.min(span * 0.36, h * 0.35), spring = Math.max(0, h - 1.0 - r);
      const hole = new THREE.Path(); hole.moveTo(cx - r, -2); hole.lineTo(cx - r, spring); hole.absarc(cx, spring, r, Math.PI, 0, true); hole.lineTo(cx + r, -2); hole.lineTo(cx - r, -2);
      s.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    const m = new THREE.Mesh(g, mat('granite')); m.position.set(x, y, z); m.rotation.y = ry;
    this.add(m);
    // parapets
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry; this.group.add(grp);
    for (const sz of [-1, 1]) { const p = new THREE.Mesh(boxGeo(len, 0.7, 0.4), mat('granite')); p.position.set(0, h + 0.35, sz * (w / 2 - 0.2)); grp.add(p); p.castShadow = true; }
    grp.updateMatrixWorld(true); grp.children.forEach(c => this.colliders.push(c));
    return m;
  }
  waterPlane(x, y, z, w, d, opts = {}) {
    const t = TEX.water().clone(); t.needsUpdate = true; t.repeat.set(w / 10, d / 10);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, color: opts.color || 0x9fe3ff, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; this.group.add(m);
    const sp = opts.flow || [0.02, 0.05];
    this.animated.push((dt) => { t.offset.x += sp[0] * dt; t.offset.y += sp[1] * dt; });
    return m;
  }
  waterfall(x, y, z, w, h, ry = 0) {
    const t = TEX.fall().clone(); t.needsUpdate = true; t.repeat.set(w / 4, h / 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0.85, emissive: 0x335566, side: THREE.DoubleSide }));
    m.position.set(x, y + h / 2, z); m.rotation.y = ry; this.group.add(m);
    this.animated.push(dt => { t.offset.y += dt * 1.2; });
    return m;
  }
  mill(x, y, z, ry = 0) {
    const house = this.stoneHouse(x, y, z, 4, 4, 2.6, ry, { roofH: 1.2 });
    const wheel = new THREE.Group();
    const local = new THREE.Vector3(2.6, 1.4, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    wheel.position.set(x + local.x, y + local.y, z + local.z); wheel.rotation.y = ry;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 6, 20), mat('wood')); rim.rotation.y = Math.PI / 2; wheel.add(rim);
    for (let i = 0; i < 8; i++) { const pad = new THREE.Mesh(boxGeo(0.5, 0.1, 1.5), mat('wood')); const a = i / 8 * Math.PI * 2; pad.position.set(0, Math.cos(a) * 1.3, Math.sin(a) * 1.3); pad.rotation.x = -a; wheel.add(pad); }
    wheel.traverse(o => { o.castShadow = true; });
    this.group.add(wheel);
    this.animated.push(dt => { wheel.children.forEach(() => {}); wheel.rotateX(-dt * 1.2); });
    return house;
  }
  lavadoiro(x, y, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const basin = new THREE.Mesh(boxGeo(5, 0.7, 3), mat('granite')); basin.position.y = 0.35; g.add(basin);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x5ab0d0, roughness: 0.1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.72; g.add(water);
    for (const sx of [-2.6, 2.6]) for (const sz of [-1.6, 1.6]) { const p = new THREE.Mesh(boxGeo(0.35, 2.8, 0.35), mat('granite')); p.position.set(sx, 1.4, sz); g.add(p); }
    const roof = new THREE.Mesh(boxGeo(6.2, 0.25, 4.2, 1), mat('roof')); roof.position.y = 2.95; roof.rotation.x = 0.12; g.add(roof);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g); g.updateMatrixWorld(true);
    this.colliders.push(basin, roof, ...g.children.filter(c => c.geometry.parameters && c.geometry.parameters.height === 2.8));
    return g;
  }
  parra(x, y, z, w = 6, d = 4) { // vine pergola
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i <= 2; i++) for (const sz of [-d / 2, d / 2]) { const p = new THREE.Mesh(boxGeo(0.25, 2.6, 0.25), mat('granite')); p.position.set(-w / 2 + i * w / 2, 1.3, sz); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), mat('leaves')); top.position.y = 2.75; g.add(top);
    for (let i = 0; i < 10; i++) { const gr = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), colorMat(0x4a2a5c)); gr.position.set(rnd(-w / 2, w / 2), 2.45, rnd(-d / 2, d / 2)); gr.scale.y = 1.5; g.add(gr); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g); g.updateMatrixWorld(true);
    this.colliders.push(top);
    return g;
  }
  flowers(cx, cz, radius, count, heightFn, colors = [0xffe14d, 0xffffff, 0xd94a8c, 0x9f7be0]) {
    const geo = new THREE.IcosahedronGeometry(0.12, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1 }), count);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      m4.makeTranslation(x, heightFn(x, z) + 0.15, z); im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(colors[i % colors.length]));
    }
    this.group.add(im); return im;
  }
  grassTufts(cx, cz, radius, count, heightFn, color = 0x5d9b3c, filter) {
    const geo = new THREE.ConeGeometry(0.12, 0.6, 3); geo.translate(0, 0.3, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let n = 0;
    for (let i = 0; i < count * 2 && n < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (filter && !filter(x, z)) continue;
      p.set(x, heightFn(x, z), z); q.setFromEuler(e.set(rnd(-.3, .3), rnd(0, 6), rnd(-.3, .3))); s.setScalar(rnd(0.6, 1.4));
      m4.compose(p, q, s); im.setMatrixAt(n++, m4);
    }
    im.count = n; im.receiveShadow = true;
    this.group.add(im); return im;
  }
  clouds(n = 14, radius = 160, y = 60) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x666666 });
    const grp = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group(); const a = Math.random() * Math.PI * 2, r = rnd(radius * 0.4, radius);
      c.position.set(Math.cos(a) * r, y + rnd(-10, 15), Math.sin(a) * r);
      for (let j = 0; j < 5; j++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(4, 8), 1), m); b.position.set(rnd(-8, 8), rnd(-1, 2), rnd(-4, 4)); b.scale.y = 0.6; c.add(b); }
      grp.add(c);
    }
    this.group.add(grp);
    this.animated.push(dt => { grp.rotation.y += dt * 0.004; });
    return grp;
  }
}

// ---------- Sky ----------
export function makeSky(top = 0x3d8fe0, bottom = 0xcfe9ff, sunDir = new THREE.Vector3(0.4, 0.6, 0.3)) {
  const g = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) }, sun: { value: sunDir.clone().normalize() }, sunColor: { value: new THREE.Color(0xfff2c0) }, stars: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; uniform vec3 sunColor; uniform float stars; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float t = clamp(vP.y*1.4+0.15,0.0,1.0); vec3 c = mix(bottom, top, pow(t,0.8));
        float s = max(dot(vP, sun),0.0); c += sunColor*pow(s,250.0)*1.5 + sunColor*pow(s,8.0)*0.15;
        if (stars > 0.0) { vec3 q = floor(vP*300.0); float st = step(0.997, h(q)); c += vec3(st)*stars*t; }
        gl_FragColor = vec4(c,1.0); }`,
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; sky.frustumCulled = false;
  return sky;
}
export { rnd };

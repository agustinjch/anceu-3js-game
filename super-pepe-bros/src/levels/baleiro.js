// Don Baleiro and his grey machines.
import * as THREE from 'three';
import { mat, colorMat, boxGeo } from '../kit.js';

export function makeBaleiro(scale = 1) {
  // Don Baleiro: a tall grey bureaucrat with a top hat, monocle and a red tie.
  const g = new THREE.Group();
  const suit = colorMat(0x5d636b), shirt = colorMat(0xeeeeee), skin = colorMat(0xc9c2b8), dark = colorMat(0x26282c);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.8, 4, 8), suit); l.position.set(s * 0.17, 0.55, 0); g.add(l);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.4), dark); sh.position.set(s * 0.17, 0.06, 0.06); g.add(sh); }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 4, 10), suit); body.position.y = 1.5; body.scale.z = 0.7; g.add(body);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.6), shirt); front.position.set(0, 1.65, 0.255); g.add(front);
  const tie = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.5), colorMat(0xc0202a)); tie.position.set(0, 1.6, 0.26); g.add(tie);
  const arms = [];
  for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(s * 0.45, 1.95, 0); const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.65, 4, 8), suit); a.position.y = -0.38; p.add(a);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.1), colorMat(0xffffff)); h.position.y = -0.78; p.add(h); p.rotation.z = s * 0.15; g.add(p); arms.push(p); }
  const head = new THREE.Group(); head.position.y = 2.42; g.add(head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), skin); hd.scale.set(0.95, 1.15, 1); head.add(hd);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.02, 0.32); head.add(nose);
  const mous = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12, Math.PI), dark); mous.position.set(0, -0.13, 0.26); mous.rotation.z = Math.PI; head.add(mous);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(s * 0.1, 0.07, 0.26); head.add(e);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.03), dark); br.position.set(s * 0.1, 0.16, 0.26); br.rotation.z = s * -0.35; head.add(br); }
  const mono = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), colorMat(0xffd23a, { metalness: 0.8 })); mono.position.set(0.1, 0.07, 0.28); head.add(mono);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), dark); brim.position.y = 0.3; head.add(brim);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.55, 16), dark); top.position.y = 0.58; head.add(top);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16), colorMat(0xc0202a)); band.position.y = 0.36; head.add(band);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(scale);
  g.userData = { arms, head };
  return g;
}

export function makeAirship() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), mat('concrete')); hull.scale.set(1, 0.55, 2); g.add(hull);
  for (let i = 0; i < 6; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(6.02, 0.12, 6, 32), mat('metal')); band.scale.set(1, 0.55, 1); band.position.z = -8 + i * 3.2; band.scale.setScalar(Math.cos((-8 + i * 3.2) / 12 * Math.PI / 2) * 1); band.scale.y *= 0.55; g.add(band); }
  const gond = new THREE.Mesh(boxGeo(4, 2.2, 8, 1), mat('concrete')); gond.position.y = -4; g.add(gond);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshBasicMaterial({ color: 0xff4040 })); win.position.set(0, -3.8, 4.01); g.add(win);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 2.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3e44, side: THREE.DoubleSide })); funnel.position.y = -6.2; g.add(funnel);
  for (const s of [-1, 1]) { const fin = new THREE.Mesh(boxGeo(0.3, 4, 3, 1), mat('concrete')); fin.position.set(s * 2.5, 2, -10); fin.rotation.z = s * 0.6; g.add(fin); }
  const props = [];
  for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(s * 4, -3.5, -3); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(boxGeo(0.3, 2.2, 0.1, 1), mat('metal')); b.rotation.z = k * 2.09; b.position.set(0, 0, 0); p.add(b); } g.add(p); props.push(p); }
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.3), new THREE.MeshBasicMaterial({ map: textTex('BALEIRO CORP.', '#ff3b3b', '#1d1f23'), transparent: true }));
  logo.position.set(6.05, 0.5, 0); logo.rotation.y = Math.PI / 2; g.add(logo);
  const logo2 = logo.clone(); logo2.position.x = -6.05; logo2.rotation.y = -Math.PI / 2; g.add(logo2);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 6, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfc6cc, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = -22; g.add(beam);
  const light = new THREE.PointLight(0xff3030, 30, 40); light.position.y = -5; g.add(light);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { props, beam };
  return g;
}
export function textTex(text, color = '#fff', bg = null, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = `bold ${h * 0.55}px Lilita One, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeGreyTower(h = 120) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 14, h, 6), mat('concrete')); shaft.position.y = h / 2; g.add(shaft);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(12, 7, 10, 6), mat('concrete')); top.position.y = h + 4; g.add(top);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3030 })); eye.position.y = h + 12; g.add(eye);
  for (let i = 0; i < 8; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.2), new THREE.MeshBasicMaterial({ color: 0xff5050 })); const a = i / 8 * Math.PI * 2; w.position.set(Math.sin(a) * 9.5, h * (0.3 + (i % 4) * 0.15), Math.cos(a) * 9.5); w.rotation.y = a; g.add(w); }
  g.userData = { eye };
  return g;
}

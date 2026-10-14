#!/usr/bin/env node
// Render a GLB from several angles (plus a face close-up) next to Pepe for scale/style comparison.
// Uses three + playwright from juego-pepe/node_modules. Usage:
//   node meshy/preview.mjs <model.glb> [out.png] [--no-pepe]
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NM = join(ROOT, 'juego-pepe/node_modules');
const { chromium } = await import(pathToFileURL(join(NM, 'playwright/index.mjs')).href);

const args = process.argv.slice(2);
const noPepe = args.includes('--no-pepe');
const [model, outArg] = args.filter((a) => !a.startsWith('--'));
if (!model) { console.error('usage: node meshy/preview.mjs <model.glb> [out.png] [--no-pepe]'); process.exit(1); }
const modelPath = resolve(model);
const out = resolve(outArg ?? modelPath.replace(/\.glb$/i, '') + '_preview.png');
const pepe = join(ROOT, 'super-pepe-bros/public/models/pepe.glb');

const page = `<!doctype html><html><body style="margin:0;background:#cfd3d8">
<script type="importmap">{"imports":{"three":"/nm/three/build/three.module.js","three/addons/":"/nm/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const W = 480, H = 640;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfd3d8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function load(url) {
  const g = await loader.loadAsync(url); const o = g.scene;
  const b = new THREE.Box3().setFromObject(o); const s = 1.7 / (b.max.y - b.min.y); // normalise to 1.7m
  o.scale.setScalar(s); const b2 = new THREE.Box3().setFromObject(o);
  o.position.y -= b2.min.y; o.position.x -= (b2.min.x + b2.max.x) / 2; o.position.z -= (b2.min.z + b2.max.z) / 2;
  let tris = 0; o.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return { o, tris: Math.round(tris), height: (b.max.y - b.min.y) };
}
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
window.shots = [];
const subj = await load('/model.glb'); scene.add(subj.o);
let pepe = null;
if (${!noPepe}) { pepe = (await load('/pepe.glb')).o; }
const views = [
  ['front', [0, 1.0, 4.2], [0, 0.85, 0]], ['3/4', [2.8, 1.2, 3.2], [0, 0.85, 0]],
  ['side', [4.2, 1.0, 0], [0, 0.85, 0]], ['back', [0, 1.0, -4.2], [0, 0.85, 0]],
  ['face', [0.25, 1.55, 0.9], [0, 1.52, 0]],
];
for (const [name, p, t] of views) {
  cam.position.set(...p); cam.lookAt(...t); r.render(scene, cam); shots.push([name, r.domElement.toDataURL('image/png')]);
}
if (pepe) {
  subj.o.position.x = -0.5; pepe.position.x += 0.5; scene.add(pepe);
  cam.position.set(0, 1.0, 5); cam.lookAt(0, 0.85, 0); r.render(scene, cam); shots.push(['vs pepe', r.domElement.toDataURL('image/png')]);
}
window.info = { tris: subj.tris, rawHeight: subj.height };
window.done = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(page); }
  if (url === '/model.glb') file = modelPath;
  else if (url === '/pepe.glb') file = pepe;
  else if (url.startsWith('/nm/')) file = join(NM, url.slice(4));
  if (!file || !existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const p = await browser.newPage();
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
await p.goto(`http://localhost:${port}/`);
await p.waitForFunction('window.done === true', null, { timeout: 120_000 });
const { shots, info } = await p.evaluate(() => ({ shots: window.shots, info: window.info }));

// Compose a contact sheet in the browser (no image deps).
const sheet = await p.evaluate(async (shots) => {
  const c = document.createElement('canvas'); const w = 300, h = 400;
  c.width = w * shots.length; c.height = h + 28; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.font = '18px sans-serif'; g.fillStyle = '#222';
  for (let i = 0; i < shots.length; i++) {
    const img = new Image(); img.src = shots[i][1]; await img.decode();
    g.drawImage(img, i * w, 0, w, h); g.fillText(shots[i][0], i * w + 8, h + 20);
  }
  return c.toDataURL('image/png');
}, shots);
writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64'));
await browser.close(); server.close();
console.log(`${relative(process.cwd(), out)}  (${info.tris} tris)`);

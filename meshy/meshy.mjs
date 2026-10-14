#!/usr/bin/env node
// Meshy CLI — generate 3D/2D assets for the Anceu games via https://docs.meshy.ai
// Zero dependencies (Node >= 18). Run `node meshy/meshy.mjs help`.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(HERE, 'output');
const BASE = 'https://api.meshy.ai/openapi';

const ENDPOINTS = {
  text3d: '/v2/text-to-3d',
  image3d: '/v1/image-to-3d',
  multi3d: '/v1/multi-image-to-3d',
  image: '/v1/text-to-image',
  img2img: '/v1/image-to-image',
  rig: '/v1/rigging',
  animate: '/v1/animations',
  remesh: '/v1/remesh',
  retexture: '/v1/retexture',
};

// ---------- config ----------

function loadKey() {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY;
  for (const f of [join(HERE, '.env.local'), join(ROOT, '.env.local')]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^\s*MESHY_API_KEY\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
  }
  die('MESHY_API_KEY not found (env var or .env.local at repo root).');
}
const KEY = loadKey();

// ---------- args ----------

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) opt[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opt[k] = argv[++i];
    else opt[k] = true;
  }
  return { pos, opt };
}

// ---------- http ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(method === 'GET' ? 30_000 : 60_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e), headers: new Headers() }));
    if (res.ok) return { data: await res.json(), retryAfter: Number(res.headers.get('retry-after')) || 0 };
    const text = await res.text();
    const transient = res.status === 0 || res.status >= 500 || (res.status === 429 && /rate limit/i.test(text));
    if (transient && attempt < 5) { await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000); continue; }
    die(`${method} ${path} -> ${res.status}: ${text}`);
  }
}

async function create(kind, body) {
  const { data } = await api('POST', ENDPOINTS[kind], body);
  log(`→ ${kind} task ${data.result}`);
  return data.result;
}

async function wait(kind, id) {
  const deadline = Date.now() + 60 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const { data: t, retryAfter } = await api('GET', `${ENDPOINTS[kind]}/${id}`);
    const line = `  ${kind} ${t.status} ${t.progress ?? 0}%`;
    if (line !== last) { process.stderr.write(`\r${line.padEnd(40)}`); last = line; }
    if (t.status === 'SUCCEEDED') { process.stderr.write('\n'); return t; }
    if (t.status === 'FAILED' || t.status === 'CANCELED') {
      process.stderr.write('\n');
      die(`${kind} ${id} ${t.status}: ${t.task_error?.message || 'unknown error'} (credits refunded)`);
    }
    await sleep((retryAfter || 5) * 1000);
  }
  die(`${kind} ${id} still not finished after 60 min — resume later with: get ${kind} ${id}`);
}

// ---------- files ----------

const KEEP_EXT = new Set(['.glb', '.png', '.jpg', '.jpeg', '.webp', '.gif']);

function collectUrls(obj, prefix = '', out = []) {
  if (typeof obj === 'string') {
    if (/^https:\/\/assets\.meshy\.ai\//.test(obj)) out.push([prefix, obj]);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectUrls(v, obj.length > 1 ? `${prefix}${i}_` : prefix, out));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      // skip echoed inputs (e.g. texture_image_url we sent) and preceding task refs
      if (['texture_image_url', 'image_style_url', 'image_url', 'model_url'].includes(k)) continue;
      collectUrls(v, `${prefix}${k.replace(/_?urls?$/, '')}_`, out);
    }
  }
  return out;
}

async function downloadTask(dir, stage, task, allFormats) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${stage}.task.json`), JSON.stringify(task, null, 2));
  const files = [];
  for (const [key, url] of collectUrls(task)) {
    const ext = extname(new URL(url).pathname).toLowerCase();
    if (!allFormats && !KEEP_EXT.has(ext)) continue;
    const name = `${stage}_${key.replace(/_+$/, '').replace(/^model_/, '') || 'file'}${ext}`.replace(/_+/g, '_');
    const res = await fetch(url);
    if (!res.ok) { log(`  ! download failed ${name}: ${res.status}`); continue; }
    writeFileSync(join(dir, name), Buffer.from(await res.arrayBuffer()));
    files.push(name);
  }
  log(`  saved ${files.length} file(s) in ${relative(dir)}: ${files.join(', ')}`);
  appendFileSync(join(OUT, 'index.jsonl'), JSON.stringify({
    at: new Date().toISOString(), dir: relative(dir), stage, kind: task.type, id: task.id,
    prompt: task.prompt || task.texture_prompt || task.text_style_prompt, credits: task.consumed_credits, files,
  }) + '\n');
  return files;
}

function toDataUri(src) {
  if (/^(https?:|data:)/.test(src)) return src;
  const p = resolve(process.cwd(), src);
  if (!existsSync(p)) die(`file not found: ${src}`);
  const mime = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  }[extname(p).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');
const relative = (p) => p.replace(ROOT + '/', '');
const outDir = (opt, fallback) => join(OUT, opt.name ? slug(opt.name) : `${stamp()}-${slug(fallback)}`);
const log = (...a) => console.error(...a);
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
const num = (v) => (v === undefined || v === true ? undefined : Number(v));

// Geometry options shared by text3d / image3d / multi3d.
function geometryOpts(opt) {
  const o = {};
  if (opt.lowpoly) {
    o.model_type = 'smart-topology';
    o.ai_model = 'meshy-t2';
    o.target_polycount = num(opt.polycount) ?? 4000;
  } else {
    if (opt.model) o.ai_model = opt.model;
    if (opt.polycount) { o.should_remesh = true; o.target_polycount = num(opt.polycount); }
    if (opt.quad) { o.should_remesh = true; o.topology = 'quad'; }
    if (opt.ultra) o.geometry_resolution = opt.ultra === true ? '2k' : opt.ultra;
  }
  if (opt.pose) o.pose_mode = opt.pose;
  if (opt['auto-size']) o.auto_size = true;
  o.target_formats = list(opt.formats) ?? ['glb'];
  return o;
}
function textureOpts(opt) {
  const o = {};
  if (opt.pbr) o.enable_pbr = true;
  if (opt.res) o.texture_resolution = opt.res;
  if (opt['texture-prompt']) o.texture_prompt = opt['texture-prompt'];
  if (opt['texture-image']) o.texture_image_url = toDataUri(opt['texture-image']);
  return o;
}

// ---------- commands ----------

const commands = {
  async balance() {
    const { data } = await api('GET', '/v1/balance');
    console.log(JSON.stringify(data, null, 2));
  },

  async text3d({ pos, opt }) {
    const prompt = pos.join(' ');
    if (!prompt) die('usage: text3d "<prompt>" [options]');
    const dir = outDir(opt, prompt);
    const previewId = await create('text3d', { mode: 'preview', prompt, ...geometryOpts(opt) });
    const preview = await wait('text3d', previewId);
    await downloadTask(dir, 'preview', preview, opt['all-formats']);
    if (opt['preview-only']) return done(dir, previewId);
    const refineId = await create('text3d', {
      mode: 'refine', preview_task_id: previewId, target_formats: list(opt.formats) ?? ['glb'], ...textureOpts(opt),
    });
    await downloadTask(dir, 'refine', await wait('text3d', refineId), opt['all-formats']);
    done(dir, refineId);
  },

  async image3d({ pos, opt }) {
    const [src] = pos;
    if (!src) die('usage: image3d <image path|url|text-to-image task id> [options]');
    const dir = outDir(opt, basename(src, extname(src)));
    const input = /^[0-9a-f-]{36}$/.test(src) ? { input_task_id: src } : { image_url: toDataUri(src) };
    const body = { ...input, ...geometryOpts(opt), ...textureOpts(opt) };
    if (opt['no-texture']) body.should_texture = false;
    const id = await create('image3d', body);
    await downloadTask(dir, 'model', await wait('image3d', id), opt['all-formats']);
    done(dir, id);
  },

  async multi3d({ pos, opt }) {
    if (!pos.length || pos.length > 4) die('usage: multi3d <img1> [img2..img4] [options]');
    const dir = outDir(opt, basename(pos[0], extname(pos[0])));
    const body = { image_urls: pos.map(toDataUri), ...geometryOpts(opt), ...textureOpts(opt) };
    if (opt['no-texture']) body.should_texture = false;
    const id = await create('multi3d', body);
    await downloadTask(dir, 'model', await wait('multi3d', id), opt['all-formats']);
    done(dir, id);
  },

  async image({ pos, opt }) {
    const prompt = pos.join(' ');
    if (!prompt) die('usage: image "<prompt>" [options]');
    const dir = outDir(opt, prompt);
    const body = { ai_model: opt.model || 'nano-banana-2', prompt };
    if (opt.aspect) body.aspect_ratio = opt.aspect;
    if (opt.multiview) body.generate_multi_view = true;
    if (opt.pose) body.pose_mode = opt.pose;
    if (opt.nobg) body.remove_background = true;
    const id = await create('image', body);
    await downloadTask(dir, 'image', await wait('image', id));
    done(dir, id);
  },

  async img2img({ pos, opt }) {
    const refs = list(opt.ref);
    const prompt = pos.join(' ');
    if (!prompt || !refs?.length || refs.length > 5) die('usage: img2img "<prompt>" --ref photo1.jpg[,photo2.jpg..5] [options]');
    const dir = outDir(opt, prompt);
    const body = { ai_model: opt.model || 'nano-banana-2', prompt, reference_image_urls: refs.map(toDataUri) };
    if (opt.aspect) body.aspect_ratio = opt.aspect;
    if (opt.multiview) body.generate_multi_view = true;
    if (opt.nobg) body.remove_background = true;
    const id = await create('img2img', body);
    await downloadTask(dir, opt.stage || 'img2img', await wait('img2img', id));
    done(dir, id);
  },

  async rig({ pos, opt }) {
    const [src] = pos;
    if (!src) die('usage: rig <task id | humanoid .glb> [--height 1.7]');
    const dir = outDir(opt, `rig-${basename(src, extname(src))}`);
    const body = /^[0-9a-f-]{36}$/.test(src) ? { input_task_id: src } : { model_url: toDataUri(src) };
    if (opt.height) body.height_meters = num(opt.height);
    const id = await create('rig', body);
    await downloadTask(dir, 'rig', await wait('rig', id), opt['all-formats']);
    done(dir, id);
  },

  async animate({ pos, opt }) {
    const [rigId] = pos;
    const actions = list(opt.actions)?.map(Number);
    if (!rigId || !actions?.length) die('usage: animate <rig task id> --actions 0,1,2 [--fps 30]');
    const dir = outDir(opt, `anim-${actions.join('-')}`);
    const body = { rig_task_id: rigId, ...(actions.length === 1 ? { action_id: actions[0] } : { action_ids: actions }) };
    if (opt.fps) body.post_process = { operation_type: 'change_fps', fps: num(opt.fps) };
    const id = await create('animate', body);
    await downloadTask(dir, 'anim', await wait('animate', id), opt['all-formats']);
    done(dir, id);
  },

  async anims({ pos }) {
    const { data } = await api('GET', '/v1/animations/library');
    const q = pos.join(' ').toLowerCase();
    for (const a of data) {
      const line = `${String(a.action_id).padStart(4)}  ${a.name.padEnd(32)} ${a.category}/${a.sub_category}`;
      if (!q || line.toLowerCase().includes(q)) console.log(line);
    }
  },

  async remesh({ pos, opt }) {
    const [src] = pos;
    if (!src) die('usage: remesh <task id | model file> [--polycount 5000] [--quad]');
    const dir = outDir(opt, `remesh-${basename(src, extname(src))}`);
    const body = /^[0-9a-f-]{36}$/.test(src) ? { input_task_id: src } : { model_url: toDataUri(src) };
    body.target_formats = list(opt.formats) ?? ['glb'];
    if (opt.polycount) body.target_polycount = num(opt.polycount);
    if (opt.quad) body.topology = 'quad';
    const id = await create('remesh', body);
    await downloadTask(dir, 'remesh', await wait('remesh', id), opt['all-formats']);
    done(dir, id);
  },

  async retexture({ pos, opt }) {
    const [src] = pos;
    if (!src || !(opt.prompt || opt.image)) die('usage: retexture <task id | model file> --prompt "..." | --image ref.png');
    const dir = outDir(opt, `retex-${basename(src, extname(src))}`);
    const body = /^[0-9a-f-]{36}$/.test(src) ? { input_task_id: src } : { model_url: toDataUri(src) };
    if (opt.prompt) body.text_style_prompt = opt.prompt;
    if (opt.image) body.image_style_url = toDataUri(opt.image);
    if (opt.pbr) body.enable_pbr = true;
    if (opt.res) body.texture_resolution = opt.res;
    if (opt['keep-uv']) body.enable_original_uv = true;
    body.target_formats = list(opt.formats) ?? ['glb'];
    const id = await create('retexture', body);
    await downloadTask(dir, 'retex', await wait('retexture', id), opt['all-formats']);
    done(dir, id);
  },

  // Resume/download an existing task (e.g. after a timeout or Ctrl+C).
  async get({ pos, opt }) {
    const [kind, id] = pos;
    if (!ENDPOINTS[kind] || !id) die(`usage: get <${Object.keys(ENDPOINTS).join('|')}> <task id>`);
    const dir = outDir(opt, `${kind}-${id.slice(0, 8)}`);
    await downloadTask(dir, kind, await wait(kind, id), opt['all-formats']);
    done(dir, id);
  },

  help() {
    console.log(`Meshy asset CLI  —  node meshy/meshy.mjs <command> [args] [--options]

Generation
  text3d "<prompt>"          Text → 3D (preview mesh + refine texture)       ~30 credits
  image3d <img|url|taskId>   Image → textured 3D                              ~30 credits
  multi3d <img1> .. <img4>   Several views of one object → 3D                ~30 credits
  image "<prompt>"           Text → image (concept art / input for image3d)   3-9 credits
  img2img "<prompt>" --ref a.jpg[,b.jpg]  Edit/restyle photos (e.g. photo → full-body character sheet)  3-12 credits

Characters
  rig <taskId|file.glb>      Auto-rig a textured humanoid (+walk/run clips)   5 credits
  anims [search]             List the animation library (ids for animate)
  animate <rigTaskId> --actions 0,1,30   Add clips (one GLB, many clips)      3/clip

Post-processing
  remesh <taskId|file> --polycount N [--quad]                                  5 credits
  retexture <taskId|file> --prompt "..." | --image ref.png                     10 credits

Other
  balance                    Show remaining credits
  get <kind> <taskId>        Resume/download a task (kind: ${Object.keys(ENDPOINTS).join(', ')})

Common options
  --name <slug>              Output folder name (default: timestamp + prompt)
  --lowpoly                  Meshy T2 smart topology (clean game-ready tris)
  --polycount N              Target faces (lowpoly: 100-15000, default 4000)
  --pose a-pose|t-pose       For characters you plan to rig
  --model <id>               meshy-7.1 (latest) | meshy-6 | meshy-6-lite | nano-banana-2 ...
  --texture-prompt "..."     Guide texturing     --texture-image ref.png
  --pbr  --res 2k|4k|8k      PBR maps / texture resolution
  --preview-only             text3d: skip texturing (20 credits, check shape first)
  --no-texture               image3d/multi3d: mesh only
  --formats glb,fbx          Output formats      --all-formats  download fbx/obj/usdz too
  image: --aspect 16:9  --multiview  --nobg

Output goes to meshy/output/<name>/ (gitignored); log in meshy/output/index.jsonl.
Assets are deleted from Meshy after 3 days — files are downloaded right away.`);
  },
};

function done(dir, id) {
  log(`✓ done — ${relative(dir)}  (task ${id})`);
}

const [cmd = 'help', ...rest] = process.argv.slice(2);
if (!commands[cmd]) die(`unknown command "${cmd}" — try: help`);
mkdirSync(OUT, { recursive: true });
await commands[cmd](parseArgs(rest));

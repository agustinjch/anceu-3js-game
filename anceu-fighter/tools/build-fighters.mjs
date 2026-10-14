#!/usr/bin/env node
// Builds the game's model + animation assets.
//  1. Copies the realistic villager GLBs and Pepe from super-pepe-bros.
//  2. Turns each Meshy animation GLB (meshy/output/fighter-<set>/) into a skeleton-only clip file
//     public/models/clips/<set>.glb (mesh, textures and skin stripped; keyframes resampled).
// Usage: MESHY_OUT=/path/to/meshy/output node tools/build-fighters.mjs
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const REPO = resolve(GAME, '..');
const MESHY_OUT = process.env.MESHY_OUT || join(REPO, 'meshy/output');
const SPB = join(REPO, 'super-pepe-bros/public/models');

// clip sets → Meshy output folders (see docs/superpowers/plans/2026-10-14-anceu-fighter.md, Task 6)
const SETS = {
  common: ['fighter-common1', 'fighter-common2'],
  pepe: ['fighter-pepe'], victor: ['fighter-victor'], se: ['fighter-se'], agus: ['fighter-agus'], rosa: ['fighter-rosa'],
};
const MODELS = ['victor', 'se', 'agustin', 'rosa', 'africa', 'ana', 'andreea', 'flo', 'nacho', 'rosabel'];

mkdirSync(join(GAME, 'public/models/npc'), { recursive: true });
mkdirSync(join(GAME, 'public/models/clips'), { recursive: true });
for (const m of MODELS) copyFileSync(join(SPB, 'npc', `${m}.glb`), join(GAME, 'public/models/npc', `${m}.glb`));
copyFileSync(join(SPB, 'pepe.glb'), join(GAME, 'public/models/npc/pepe.glb'));
console.log(`✓ copied ${MODELS.length + 1} models`);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const [set, dirs] of Object.entries(SETS)) {
  let doc = null;
  for (const d of dirs) {
    const file = join(MESHY_OUT, d, 'anim_result_animation_glb.glb');
    if (!existsSync(file)) throw new Error(`missing ${file}; run the Meshy animate tasks first`);
    const src = await io.read(file);
    if (!doc) { doc = src; continue; }
    // merge: copy the other file's animations onto this skeleton, matching channels by node name
    const byName = new Map(doc.getRoot().listNodes().map(n => [n.getName(), n]));
    const buf = doc.getRoot().listBuffers()[0];
    for (const anim of src.getRoot().listAnimations()) {
      const out = doc.createAnimation(anim.getName());
      for (const ch of anim.listChannels()) {
        const target = byName.get(ch.getTargetNode()?.getName());
        if (!target) continue;
        const s = ch.getSampler();
        const input = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buf);
        const output = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
        const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
        out.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
      }
    }
  }
  // strip everything but the node hierarchy and the animations
  const root = doc.getRoot();
  for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const x of [...root.listMeshes(), ...root.listSkins(), ...root.listMaterials(), ...root.listTextures()]) x.dispose();
  for (const ext of root.listExtensionsUsed()) ext.dispose();
  await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune({ keepLeaves: true }));
  const out = join(GAME, 'public/models/clips', `${set}.glb`);
  await new NodeIO().write(out, doc);
  console.log(`✓ ${set}: ${root.listAnimations().map(a => a.getName()).join(', ')}`);
}

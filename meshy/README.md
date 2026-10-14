# Meshy — asset generation

CLI with no dependencies (Node ≥ 18) that wraps the [Meshy API](https://docs.meshy.ai) to generate
3D models, images, rigs and animations for the games in this repo.

The API key is read from `MESHY_API_KEY`, either as an env var or from `.env.local` at the repo root
(gitignored). Generated files go to `meshy/output/<name>/`, which is also gitignored, and every task
is logged in `meshy/output/index.jsonl`.

```bash
node meshy/meshy.mjs help
node meshy/meshy.mjs balance
```

## Recipes

```bash
# Prop: check the shape first (5 credits), then generate it with texture
node meshy/meshy.mjs text3d "galician horreo granary, granite pillars, wooden slats, tile roof" --lowpoly --preview-only --name horreo
node meshy/meshy.mjs text3d "galician horreo granary, granite pillars, wooden slats, tile roof" --lowpoly --name horreo

# From a photo or concept art (local file, URL or a text-to-image task id)
node meshy/meshy.mjs image3d juego-pepe/assets/ref/foo.jpg --lowpoly --polycount 6000 --name foo

# Concept art first, then 3D from it
node meshy/meshy.mjs image "cute low-poly dog character, side view, white background" --nobg --name pepe-concept
node meshy/meshy.mjs image3d <image task id> --lowpoly --name pepe

# Several views of the same object (e.g. the f2/l2/b2 of Pepe)
node meshy/meshy.mjs multi3d juego-pepe/assets/f2.png juego-pepe/assets/l2.png juego-pepe/assets/b2.png --name pepe-multi

# Humanoid character: A-pose → rig → animations
node meshy/meshy.mjs text3d "galician farmer villager, stylized" --pose a-pose --name labrego
node meshy/meshy.mjs rig <refine task id> --height 1.75 --name labrego-rig
node meshy/meshy.mjs anims walk                   # find action ids
node meshy/meshy.mjs animate <rig task id> --actions 0,1,30 --name labrego-anims

# Lower the polycount or change the texture style of something that already exists
node meshy/meshy.mjs remesh <task id> --polycount 3000
node meshy/meshy.mjs retexture <task id> --prompt "mossy granite, galician rural style"
```

The task id is printed when each step finishes, and you can also find it in `index.jsonl` and in `*.task.json`.
If a task gets interrupted (Ctrl+C, timeout), it keeps running on Meshy's side and you can recover it with
`node meshy/meshy.mjs get <kind> <task id>`.

## Into the game

Pick the GLB from `output/` and optimize it into the game's `public/models/` (same pipeline as `assets:pepe`):

```bash
cd juego-pepe
npx gltf-transform optimize ../meshy/output/horreo/refine_glb.glb public/models/horreo.glb \
  --compress meshopt --texture-compress webp --texture-size 1024
```

## Notes

- **Costs** (credits): text3d preview 20 (5 with `--lowpoly`) + refine 10 · image3d 30 (15 with `--lowpoly`)
  · image 3–9 · rig 5 · animation 3 per clip · remesh 5 · retexture 10. Run `balance` to check what's left.
- `--lowpoly` uses Meshy T2 (smart topology): clean triangles with a controllable face count, which suits the web.
- Rigging only works on **textured humanoids**. Pepe (a dog) can't be auto-rigged.
- Meshy deletes assets after **3 days**. The CLI downloads them as soon as they finish, so nothing is lost.
- Only GLB and images are downloaded by default. Use `--all-formats` (plus `--formats glb,fbx,...`) if you need FBX/OBJ/USDZ.

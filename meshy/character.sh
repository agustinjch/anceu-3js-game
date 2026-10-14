#!/usr/bin/env bash
# Full-body sheet image -> textured 3D (~10k tris, A-pose) -> rig -> NPC clips -> optimised GLB.
# Usage: meshy/character.sh <key> <sheet.png> [height_m] [out_dir]
#   e.g. meshy/character.sh nacho meshy/output/piloto/nacho/realista_image.png 1.78
# Output: <out_dir>/<key>.glb (default super-pepe-bros/public/models/npc), work files in meshy/output/chars/<key>/
set -euo pipefail
cd "$(dirname "$0")/.."
key=$1 sheet=$2 height=${3:-1.7} out=${4:-super-pepe-bros/public/models/npc}
ACTIONS=${ACTIONS:-0,290,56,309}   # Idle, Wave One Hand, Stand and Chat, Talk with Left Hand on Hip
cli() { node meshy/meshy.mjs "$@" 2>&1 | tee -a "meshy/output/chars/$key.log" | grep -o 'task [0-9a-f-]\{36\}' | tail -1 | cut -d' ' -f2; }
mkdir -p meshy/output/chars
model=$(cli image3d "$sheet" --polycount 10000 --pose a-pose --name "chars/$key-model")
[ -n "$model" ] || { echo "image3d failed for $key"; exit 1; }
rig=$(cli rig "$model" --height "$height" --name "chars/$key-rig")
[ -n "$rig" ] || { echo "rig failed for $key"; exit 1; }
cli animate "$rig" --actions "$ACTIONS" --name "chars/$key-anim" >/dev/null
anim=$(ls meshy/output/chars-"$key"-anim/*animation_glb.glb 2>/dev/null || ls meshy/output/chars/"$key"-anim/*animation_glb.glb)
mkdir -p "$out"
npx --prefix juego-pepe gltf-transform optimize "$anim" "$out/$key.glb" \
  --compress meshopt --texture-compress webp --texture-size 1024 >/dev/null
echo "✓ $key -> $out/$key.glb ($(du -h "$out/$key.glb" | cut -f1))"

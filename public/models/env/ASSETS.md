# 3D models (all CC0 1.0)

All GLBs optimized with `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024`
-> three.js needs `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)` (from `three/examples/jsm/libs/meshopt_decoder.module.js`).
Tris = triangles after optimization. Sizes in meters (glTF units) as authored; many need scaling in-game.

## Environment: `public/models/env/`

### Trees (stylized, Quaternius "Stylized Nature MegaKit"-style, textured; leaves use alphaMode BLEND -
consider switching leaves material to `alphaTest=0.5, transparent=false` to avoid sorting issues)
| file | what | tris | size (h) | source | license |
|---|---|---|---|---|---|
| oak.glb | broad leafy tree, use as carballo (oak) | 6265 | ~7 m | https://poly.pizza/m/qZtx0AHhcy (Quaternius) | CC0 |
| chestnut.glb | wide-crowned leafy tree, use as castiñeiro | 5648 | ~7.4 m | https://poly.pizza/m/aVOxaHRPWe (Quaternius) | CC0 |
| oak2.glb | smaller leafy tree variant | 3182 | ~6.8 m | https://poly.pizza/m/t9KbsfYdXz (Quaternius) | CC0 |
| tree_tall.glb | tall slender leafy tree (riverside / birch-alder stand-in) | 4066 | ~9.2 m | https://poly.pizza/m/YWjGDJ9F7g (Quaternius) | CC0 |
| tree_dead.glb | dead bare tree | 6557 | ~11 m | https://poly.pizza/m/Mcd2zYqyww (Quaternius) | CC0 |

No realistic CC0 oak/chestnut under 20k tris exists on Poly Haven (their trees are 1.7M-17M tris), so
the trees are stylized. Tint leaves darker/greener per instance for variety.

### Plants (Poly Haven, realistic, alphaMode MASK, double-sided; each file has several variant nodes)
| file | what | tris | nodes | source | license |
|---|---|---|---|---|---|
| fern.glb | fern (fento) clumps, ~0.4 m tall | 6232 total | fern_02_a..d | https://polyhaven.com/a/fern_02 | CC0 |
| shrub.glb | small leafy shrubs | 8287 total | shrub_03_a..d | https://polyhaven.com/a/shrub_03 | CC0 |
| nettle.glb | nettles (ortigas), walls/ditch edges | 12521 total | nettle_plant_{small,medium,tall}_{a,b}_LOD0 | https://polyhaven.com/a/nettle_plant | CC0 |
| weeds.glb | low weeds/grass clumps | 11116 total | weed_plant_02_a..e_LOD0 | https://polyhaven.com/a/weed_plant_02 | CC0 |
| fern_stylized.glb | stylized fern (cheap, 1 texture, BLEND) ~2.4 m as authored -> scale ~0.2 | 288 | 1 | https://poly.pizza/m/jqcanvH7D6 (Quaternius) | CC0 |
| bush.glb | stylized leafy bush ~1 m | 360 | 1 | https://poly.pizza/m/ooG6CkLyE8 (Quaternius) | CC0 |

Variant nodes are laid out side by side in the file: pick a node by name (`gltf.scene.getObjectByName`) and reset its position before instancing.

### Rocks / ground debris (Poly Haven, photoscanned, simplified)
| file | what | tris | size | source | license |
|---|---|---|---|---|---|
| rocks_mossy.glb | set of 6 mossy rocks (nodes rock_moss_set_01_rock01..06), ~1-2 m each | 9462 total | 8 m spread | https://polyhaven.com/a/rock_moss_set_01 | CC0 |
| rock1.glb | weathered rock, 0.17 m as authored -> scale 5-20x for boulders/river stones | 3710 | 0.17 m | https://polyhaven.com/a/rock_07 | CC0 |
| rock2.glb | flat weathered rock, 0.08 m as authored -> scale up (river stepping stones) | 3724 | 0.08 m | https://polyhaven.com/a/rock_09 | CC0 |
| stone_small.glb | small stone / pebble cluster, 0.15 m | 4280 | 0.15 m | https://polyhaven.com/a/stone_01 | CC0 |
| rock_moss_stylized.glb | stylized grey rock with moss top | 68 | 0.55 m | https://poly.pizza/m/Oar39tFugM (Quaternius) | CC0 |
| rocks_stylized.glb | stylized grey rock cluster | 632 | 0.55 m | https://poly.pizza/m/RtLRqYjfMs (Quaternius) | CC0 |
| stump1.glb | tree stump | 6156 | ~0.6 m | https://polyhaven.com/a/tree_stump_01 | CC0 |
| stump2.glb | tree stump | 7481 | ~0.5 m | https://polyhaven.com/a/tree_stump_02 | CC0 |
| log_dead.glb | fallen dead log, 3 m | 8134 | 3 m long | https://polyhaven.com/a/dead_tree_trunk | CC0 |
| roots.glb | exposed root cluster (river bank / old oak base) | 8992 | 4 m | https://polyhaven.com/a/root_cluster_01 | CC0 |
| branches.glb | dry branch piles (3 nodes a,b,c) | 10081 total | ~1 m | https://polyhaven.com/a/dry_branches_medium_01 | CC0 |

(boulder_01 was dropped: its photoscan mesh would not simplify below 54k tris.)

### Wooden props (Poly Haven, realistic)
| file | what | tris | size | source | license |
|---|---|---|---|---|---|
| barrel.glb | old wine barrel (pipa) | 10820 | 0.87 m | https://polyhaven.com/a/wine_barrel_01 | CC0 |
| bucket.glb | wooden bucket (balde) | 5116 | 0.55 m | https://polyhaven.com/a/wooden_bucket_01 | CC0 |
| crate.glb | old wooden crate | 6576 | 0.82 m wide | https://polyhaven.com/a/wooden_crate_01 | CC0 |
| basket.glb | wicker basket (cesta) | 7796 | 0.38 m | https://polyhaven.com/a/wicker_basket_01 | CC0 |
| stool.glb | worn wooden stool (banco) | 10946 | 0.44 m | https://polyhaven.com/a/wooden_stool_01 | CC0 |

### Kenney Nature Kit fallbacks (flat-shaded low-poly, untextured vertex/material colors; recolor in code)
Source: https://kenney.nl/assets/nature-kit (CC0). Authored at ~1 unit tile scale.
| file | what | tris |
|---|---|---|
| k_tree_oak.glb | low-poly oak | 196 |
| k_tree_detailed.glb | low-poly branching tree | 402 |
| k_tree_fat.glb | low-poly round tree | 50 |
| k_plant_bushLarge.glb | bush | 60 |
| k_grass_large.glb | grass tuft | 224 |
| k_fence_simple.glb | rail fence segment (1 m) | 64 |
| k_fence_planks.glb | plank fence segment (1 m) | 96 |
| k_fence_gate.glb | fence gate | 524 |
| k_log_stack.glb | firewood log stack | 184 |
| k_stump_round.glb | stump | 56 |
| k_bridge_stone.glb | small stone arch bridge (1 m tile) | 252 |

## NPC villagers: `public/models/npc/` (rigged + animated, CC0)
All are skinned; use `SkeletonUtils.clone()` for multiple instances and `AnimationMixer`.
Heights are bind-pose bbox heights as authored -> scale to taste.

| file | what | tris | authored height | animations | source |
|---|---|---|---|---|---|
| farmer.glb | older rural man in overalls + hat (labrego/avó) | 5476 | 1.86 m | CharacterArmature\|Idle, Idle_Neutral, Walk, Run, Run_Back/Left/Right, Wave, Interact, Death, HitRecieve, HitRecieve_2, Roll, Punch_Left/Right, Kick_Left/Right, Sword_Slash, Idle_Sword, Gun_Shoot, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Run_Shoot | https://poly.pizza/m/7pn3R6hPvE (Quaternius) |
| woman.glb | woman in green dress, red hair (tint hair grey for an older aldeá) | 6108 | 1.84 m | same 24 clips as farmer (CharacterArmature\|Idle, Walk, Wave, Interact, ...) | https://poly.pizza/m/nIItLV9nxS (Quaternius) |
| man.glb | simple adult man (t-shirt, shorts) - **has a Sitting clip** | 1852 | 4.84 m -> scale ~0.37 | HumanArmature\|Man_Idle, Man_Walk, Man_Run, Man_Sitting, Man_Standing, Man_Clapping, Man_Jump, Man_RunningJump, Man_Punch, Man_SwordSlash, Man_Death | https://poly.pizza/m/HMnuH5geEG (Quaternius) |
| child.glb | chibi big-head kid/adventurer (use as neno/nena) | 6050 | 2.82 m -> scale ~0.45 | Idle, Walk, Run, PickUp, Roll, Punch, Death, RecieveHit, RecieveHit_Attacking, Attacking_Idle, Dagger_Attack, Dagger_Attack2 (each also duplicated with `CharacterArmature\|` prefix) | https://poly.pizza/m/DgOCW9ZCRJ (Quaternius) |

Not shipped but available CC0 in the scratch download: Kenney Mini Characters
(https://kenney.nl/assets/mini-characters, 12 chibi characters incl. a grey-bun older woman `character-female-c`
and bald older man `character-male-b`, ~580 tris, 32 clips incl. idle/walk/sit/interact) - very cartoony, use only if style fits.
Poly Pizza "Grandmother"/"Little girl"/"OLDMAN" models were skipped: CC-BY, not CC0, and not rigged.

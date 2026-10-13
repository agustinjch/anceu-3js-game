# PBR textures (CC0)

All from Poly Haven (https://polyhaven.com), license **CC0 1.0**. 1024x1024 JPG.
Each folder: `diff.jpg` (sRGB albedo), `nor.jpg` (OpenGL normal, use as-is in three.js),
`rough.jpg` (grayscale), `ao.jpg` (grayscale), `arm.jpg` (packed R=AO, G=Roughness, B=Metal;
can be used for both `aoMap` and `roughnessMap`/`metalnessMap` to save a fetch).
Re-encoded (diff q85, nor q90, rough/ao q82 grayscale, arm q85) for mobile; ~26 MB total.

| folder | Poly Haven id | source | use in Anceu |
|---|---|---|---|
| granite | rustic_stone_wall | https://polyhaven.com/a/rustic_stone_wall | squared granite block house walls (cantería) |
| drystone | stone_wall | https://polyhaven.com/a/stone_wall | irregular light-grey dry-stone walls (muros de pedra), also rough house walls |
| stone_slates | castle_wall_slates | https://polyhaven.com/a/castle_wall_slates | layered rubble masonry / mill walls |
| mossy_stone | mossy_stone_wall | https://polyhaven.com/a/mossy_stone_wall | dark mossy walls near river / shaded walls |
| roof_tiles | clay_roof_tiles_02 | https://polyhaven.com/a/clay_roof_tiles_02 | orange curved "tella" roofs (main) |
| roof_tiles_old | clay_roof_tiles | https://polyhaven.com/a/clay_roof_tiles | darker, aged red curved tiles (variation) |
| forest_floor | brown_mud_leaves_01 | https://polyhaven.com/a/brown_mud_leaves_01 | carballeira floor: mud + mossy leaf litter |
| leaves | leaves_forest_ground | https://polyhaven.com/a/leaves_forest_ground | dry chestnut/oak leaf litter (souto) |
| grass | forrest_ground_01 | https://polyhaven.com/a/forrest_ground_01 | green grass/moss meadow ground |
| dirt_path | stony_dirt_path | https://polyhaven.com/a/stony_dirt_path | dark earthen corredoira paths |
| grass_path | grass_path_3 | https://polyhaven.com/a/grass_path_3 | worn grey-green path / transitions |
| cobblestone | mossy_cobblestone | https://polyhaven.com/a/mossy_cobblestone | mossy stone paving in village core |
| wood_planks | old_planks_02 | https://polyhaven.com/a/old_planks_02 | dark old planks (doors, hórreo, mill) |
| wood_weathered | weathered_planks | https://polyhaven.com/a/weathered_planks | grey weathered planks (shutters, fences) |
| river_rocks | river_small_rocks | https://polyhaven.com/a/river_small_rocks | river bank gravel/stones |
| pebbles | ganges_river_pebbles | https://polyhaven.com/a/ganges_river_pebbles | rounded riverbed pebbles (under water) |
| plaster | worn_mossy_plasterwall | https://polyhaven.com/a/worn_mossy_plasterwall | whitewashed/plastered house walls with lichen |
| bark | bark_brown_02 | https://polyhaven.com/a/bark_brown_02 | oak/chestnut trunk bark (procedural trees) |
| rock_mossy | mossy_rock | https://polyhaven.com/a/mossy_rock | granite outcrops / boulders with moss |

Visual check (thumbnails reviewed): rustic_stone_wall and stone_wall read as grey-beige granite
masonry; clay_roof_tiles_02 is orange barrel/curved tile (good match for Galician tella).
Poly Haven has no true "granite ashlar" texture; tint `granite` slightly grey-cooler in the
material (`color` ~ #d8d6d0) if it reads too brown.

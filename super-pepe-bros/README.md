# Super Pepe Bros — A Faísca de Anceu

A 3D collect-a-thon platformer in the spirit of Super Mario 64, built with three.js.
It stars **Pepe**, the dog of Anceu, a village in Ponte Caldelas, Galicia.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview
```

Dev shortcut: `?dev=hub|river|forest|mountain|boss` skips the title screen and loads that level.

## Story

On the eve of the Rural Hackers Fest, **Don Baleiro**, the grey Minister of Emptiness and CEO of
Baleirópolis, sucks the village's **Faíscas** into his airship. The Faíscas are the sparks of shared
knowledge that keep Anceu alive. Without them the neighbours forget, and the colivers start packing.
Pepe slept through the attack and was untouched by the grey. Rosario sends him to bring the sparks home.

## Worlds and Faíscas (18 + the final one)

| World | How to get there | Faíscas |
|---|---|---|
| **Anceu** (hub) | — | 3: the church's bell gable, clearing the drones, the button in the vegetable patch |
| **O Río Verdugo** | Se's river mural (open from the start) | 5: the old bridge, the top of the waterfall, the miller's wheel, the baker's 8 loaves, the river clean-up |
| **A Fraga dos Trasnos** | forest mural (needs 3) | 5: the hórreo tower, across the bog, the mushroom ledge, the trasnos, the Green Mission |
| **Monte da Fibra** | mountain mural (needs 7) | 5: the summit, over the abyss, the shepherds' chimney, drone-free skies, Lela's flock |
| **Torre Baleira** | north door (needs 12) | Boss: the BALEIRO-MATIC 3000 |

## Controls

| Action | Keyboard / Mouse | Gamepad |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Jump (double / triple chains) | Space | A |
| Spin attack | J / F / click | X |
| Ground pound | Shift in the air | Triggers / bumpers |
| Long jump / backflip | Shift + Space while running / standing | |
| Wall kick | Jump into a wall, then jump again | |
| Talk / read | E | Y |
| Camera | Click to capture the mouse · Q / R rotate · Z re-centre | Right stick |
| Pause | Esc / P | Start |

## Tech

- `src/player.js`: the GLB character (`public/models/pepe.glb`, textures compressed from
  `assets/glb pepe.glb`) and the Mario-style controller. It uses the model's Running, Walking,
  Regular_Jump, climbing_up_wall and open_door clips (open_door also provides the idle pose).
- `src/physics.js`: capsule-vs-BVH collision (three-mesh-bvh) and moving platforms.
- `src/audio.js`, `src/music.js`: all music and sound effects are synthesized live with Web Audio.
  The music includes muiñeiras for gaita, bombo and pandeireta.
- `src/kit.js`: procedural textures and Galician props: hórreos, cruceiros, the espadana,
  the lavadoiro, watermills, the arched stone bridge and vine pergolas.
- `src/story.js`: the intro and ending cinematics and the credits. `src/levels/*`: the worlds.
- Progress is saved to `localStorage`.

Inspired by Anceu village, Anceu Coliving and Rural Hackers.

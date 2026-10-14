# Anceu Fighter

A 2.5D fighting game in the style of Street Fighter, built with three.js. The fighters are Pepe and
people from Anceu, a village in Ponte Caldelas, Galicia. You can fight the CPU or a second player
on the same computer, on two stages from the village.

## Run

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # production build in dist/
npm test           # simulation unit tests (node:test)
npm run smoke      # browser smoke test (needs `npm run dev` running)
```

Dev shortcuts:

- `?dev=fight&p1=pepe&p2=rosa&stage=plaza&cpu=hard` jumps straight into a fight.
  - `p1cpu=hard` makes it CPU vs CPU.
  - `skip=1` skips the intros.
  - `seed=5` makes the CPU repeatable.
- `?dev=select&mode=2p` opens character select.
- `?dev=anim&clip=Roundhouse_Kick` plays one clip on all five fighters.
  - `strip=victor` shows 8 frames of that clip side by side.

## Fighters

| | Style | Specials | Super (PD + KD) |
|---|---|---|---|
| **Pepe**, the village dog (a rescue dog, slow-mode member) | Balanced | ↓P *Ladrido* (bark wave) · →P *Latigazo* (whip) · ↓K *Mordisco giratorio* (anti-air spin) | *A Faísca* |
| **Víctor**, Rural Champs (gives boxing classes) | Boxer, rushdown | →P *Directo* · ↓P *Gancho* (uppercut) · ↓K *Esquiva* (weave + counter) | *Entreno a las nueve* |
| **Se**, the meiga | Zoner | →P *Queimada* (blue fireball) · ↓P *Néboa* (slowing fog) · ↓K *Conxuro* (teleport, H = behind) | *Conxuro da Queimada* |
| **Agus**, rural hacker with rastas, dances muiñeira | Fast, tricky | →K *Paso de muiñeira* · ↓P *Rastazo* · ↓K *Reboot* (router trap) | *Muiñeira infinita* (with gaiteiros) |
| **Rosa**, the lovely grandma | Grappler, 1100 HP | →P *Zapatillazo* (slipper) · ↓P *Abrazo de avoa* (command grab) · ↓K *Caldiño* (heal) | *¡A comer!* |

## Controls

| | Player 1 | Player 2 | Gamepad |
|---|---|---|---|
| Move / jump / crouch | WASD | Arrows | D-pad / stick |
| Light / heavy punch | U / I | Numpad 4 / 5 (or O / P) | X / Y |
| Light / heavy kick | J / K | Numpad 1 / 2 (or L / Ñ) | A / B |
| Throw | LP + LK | LP + LK | LB |
| Super | HP + HK | HP + HK | RB |
| Pause | Esc | Esc | Start |

- **Block:** hold back. Crouch-block stops lows; jump-ins are overheads.
- **Specials:** tap → or ↓, then press punch or kick within 8 frames.
- **Dash:** double-tap forward or back.
- **Combos:** light normals chain into each other. Normals cancel into specials, and specials cancel into the super.

## How it's built

- **`src/sim/`**: the deterministic 60 Hz simulation. It has no three.js and no DOM.
  - Fighter state machine, frame data, hit, block and throw rules, projectiles.
  - Match flow (rounds, timer, KO) and the CPU AI.
  - The same inputs always produce the same match, and it is covered by unit tests.
- **`src/data/`**: per-fighter frame data and specials, plus the timing of each animation clip.
- **`src/render/`**: the three.js view. It reads the sim state and never changes it.
  - `retarget.js` transfers the Meshy library clips onto every fighter in world space. That includes Pepe, who has a Mixamo skeleton.
  - `fighterView.js` drives the upper and lower body as separate layers. That is how a crouching punch is built: a jab on top of a squat.
- **`src/ui/`**: DOM screens and the HUD. **`src/audio/`**: the Web Audio synth from super-pepe-bros, plus fight SFX and a speech-synthesis announcer.

### Assets

Fighter and crowd models are the realistic Meshy villagers from `super-pepe-bros`. The fight
animations come from the Meshy animation library: a common set on Víctor's rig, plus extra clips
per fighter. `tools/build-fighters.mjs` strips them down to skeleton-only clip files in
`public/models/clips/`. To rebuild after generating new clips:

```bash
MESHY_OUT=/path/to/repo/meshy/output npm run assets
```

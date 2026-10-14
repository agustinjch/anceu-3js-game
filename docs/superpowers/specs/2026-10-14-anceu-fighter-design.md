# Anceu Fighter — design

A 2.5D Street Fighter–style fighting game starring Pepe and the people of Anceu, built with
three.js. Comic, festive tone. This document covers the first version: a **vertical slice**
with 5 fighters and 2 stages whose combat feels complete and polished.

## Goals and success criteria

- Two people can sit at one computer (shared keyboard and/or gamepads) and play a full best-of-3
  match that feels like a real fighting game: crisp hits, blocking, combos, specials, supers.
- One person can play the same match against a CPU at easy / normal / hard.
- Each fighter is recognisable as the real person (realistic Meshy models) and plays differently.
- Runs in a desktop browser at 60 fps.

Out of scope for v1: online play, arcade ladder / story / boss, the other 6 villagers as
fighters, mobile/touch controls, training mode, rollback netcode.

## Decisions taken

| Topic | Decision |
|---|---|
| Genre | 2.5D: 3D models, movement on a 2D plane, side view |
| Players | 1P vs CPU + 2P local versus |
| Tone | Comic / festive, village objects, Anceu stages |
| Scope | Vertical slice: 5 fighters, 2 stages, full combat |
| Fighters | Pepe, Víctor, Se, Agus, Rosa |
| Stages | Plaza da igrexa (Anceu), Ponte do Verdugo |
| Controls | 4 buttons (LP HP LK HK) + directional specials (→/↓ + button), super = HP+HK |
| Single-player mode | Free match (pick fighter, rival and stage); no ladder |
| Animation | Meshy animation library clips (~12 per fighter), procedural FX on top |
| Location | New project `anceu-fighter/` in this repo, own Vite setup |
| Name | **Anceu Fighter** |

## Fighters

Character flavour comes from the user and from anceu.com posts (Pepe: rescue dog, "slow mode
member"; Agus: rural hacker founder, rastas, dances muiñeira, "Agustín of the future will take
care of it"; Víctor: Rural Champs, gives boxing classes; Rosa: keeper of the cosy house, lovely
grandma; Se: a meiga).

Notation: P = any punch, K = any kick. Light/heavy versions change speed, distance and damage.

### Pepe — balanced (shoto)
Rescue dog in Indiana Jones gear. Good at everything, best at nothing.
- *Ladrido* (↓+P): sound-wave projectile travelling along the ground.
- *Latigazo* (→+P): mid-range whip lash; hits at a distance, slow recovery.
- *Mordisco giratorio* (↓+K): rising spin attack, invulnerable on startup (anti-air).
- **Super "A Faísca"**: charges with spark light and rams across the screen; multi-hit.
- Intro: wakes up from a nap and stretches. Victory: lies back down for a nap ("slow mode").

### Víctor — boxer (rushdown)
Rural Champs coach. Fast, strong punches; his kicks are short footwork jabs.
- *Directo Rural Champs* (→+P): dashing straight punch; heavy version wall-bounces.
- *Gancho* (↓+P): uppercut anti-air.
- *Esquiva* (↓+K): bob-and-weave; if struck during the weave window, auto-counter punch.
- **Super "Entreno a las nueve"**: punch flurry finishing with a boxing-bell "ding".
- Intro: boxing warm-up. Victory: "Mañana a las nueve. Todos."

### Se — meiga (zoner)
Village witch; her wand is a paintbrush.
- *Queimada* (→+P): blue-flame fireball; light is slow, heavy is fast.
- *Néboa* (↓+P): places a fog cloud at mid range for ~3 s; an opponent inside moves at 60 % speed.
- *Conxuro* (↓+K): teleport in a burst of paint sparks (light = forward, heavy = behind the rival).
- **Super "Conxuro da Queimada"**: a giant pot of queimada drops on the rival from above.
- Intro: stirs a queimada. Victory: "Meigas fóra… menos eu."

### Agus — muiñeira dancer (fast, tricky)
Rural hacker with rastas.
- *Paso de muiñeira* (→+K): advancing dance kicks, 3 hits.
- *Rastazo* (↓+P): spinning hair whip around him, hits both sides.
- *Reboot* (↓+K): drops a router on the floor (one at a time, lasts 5 s); a rival stepping on it
  is stunned by a wifi zap.
- **Super "Muiñeira infinita"**: gaiteiros appear and he dances a cinematic combo.
- Intro: "Agustín do futuro encargarase." Victory: dances muiñeira, "Hack the planet!".

### Rosa — lovely grandma (grappler)
Slow walk, high damage, more health (1100 vs 1000).
- *Zapatillazo* (→+P): thrown slipper projectile in an arc.
- *Abrazo de avoa* (↓+P): command grab at close range, a hug that squeezes too hard. Unblockable,
  loses to jumps.
- *Caldiño* (↓+K): drinks a bowl of caldo and heals 60 HP; long vulnerable animation.
- **Super "¡A comer!"**: command-grab super: sits the rival at the long table and stuffs them
  with empanada.
- Intro: wipes her hands on her apron. Victory: "Límpate os pés."

## Combat rules

- **Match**: best of 3 rounds, 99 s timer. Timeout means the fighter with more health % wins. A
  double KO or a draw on time gives each fighter a round. A match tied 2–2 continues one more
  round (max 5).
- **Health**: 1000 (Rosa 1100). **Super meter**: 3 bars of 100. Gains: +meter on dealing damage
  (hit or blocked) and smaller gain on taking damage. A super costs 1 bar.
- **Simulation**: fixed 60 Hz tick, independent of rendering. All timing is in frames.
- **Move data** per normal/special: startup, active, recovery frames; damage; chip damage;
  hitstun; blockstun; pushback; hit level (high / mid / low / overhead); hitbox rects relative to
  the fighter; optional projectile, invulnerability window, cancel flags.
- **Movement**: walk forward/back; dash with double-tap; neutral / forward / back jump with a
  fixed arc; crouch. Fighters auto-face each other when grounded. Fighters cannot pass through
  each other (pushbox) and are bounded by stage walls.
- **Blocking**: hold back. Standing block stops high/mid/overhead; crouching block stops
  high/mid/low. Jump attacks are overheads. Blocked hits deal chip damage only from specials and
  supers. A KO from chip damage is allowed only with a super.
- **Throws**: LP+LK at close range, 6-frame startup, unblockable. Tech by pressing LP+LK within
  7 frames of being grabbed.
- **Combos**: light normals chain into themselves and into heavier normals. Normals cancel into
  specials on hit or block. Specials cancel into super. A combo counter appears from 2 hits up.
  Damage scaling: −10 % per hit after the 2nd, floored at 30 %.
- **Input buffer**: directional specials are read from the last 8 frames, so →+P works if → was
  pressed up to 8 frames before P. Directions are relative to facing.
- **Hit feel**: hitstop (both fighters freeze 6–12 frames according to strength), camera shake on
  heavy hits, spark particles, synthesized hit sounds, a short flash on super start (super freeze
  of 30 frames).
- **KO**: knockdown animation, slow-motion for 1 s, "K.O." banner.

## CPU AI

A finite-state AI with three difficulties, reading the same game state a human sees and pressing
virtual buttons through the same input buffer (no cheating on timing).

- Considers distance band (close / mid / far), own and rival state, meter.
- Behaviours: approach, retreat, zone with projectiles, anti-air jump-ins, block, punish a move
  the rival whiffed, throw, use super when it would combo or punish.
- Difficulty scales reaction delay (easy 30 f, normal 18 f, hard 10 f), block probability
  (30 / 60 / 85 %), punish probability, and combo length.

## Controls

| Action | P1 keyboard | P2 keyboard | Gamepad |
|---|---|---|---|
| Move | WASD | Arrows | D-pad / left stick |
| LP HP LK HK | U I J K | Numpad 4 5 1 2 | X Y A B |
| Pause | Esc | Esc | Start |

Gamepads are assigned in the order they connect: the first one to P1, the second to P2. The
Controls screen shows the bindings; v1 has no rebinding.

## Screens and flow

1. **Title**: logo, "Press any button".
2. **Main menu**: Versus CPU · Versus 2P · Controls.
3. **Character select**: 5 portraits; a rotating 3D model on a pedestal per side; then stage
   select (2 stages). In Versus CPU the player picks the rival (or random) and difficulty.
4. **Fight**: HUD with health bars (with a lagging red "recent damage" segment), timer, round
   pips, names, super meters, combo counter. "ROUND 1… FIGHT!", "K.O.", "TIME", "PERFECT".
5. **Victory**: winner pose and line; options Rematch · Character select · Main menu.
6. **Pause**: Resume · Controls · Quit to menu.

## Stages

Each stage is a 3D set dressed in the background with a flat fighting floor, walls at ±5 m from
centre (the stage is 10 m wide), and an ambient loop.

- **Praza da igrexa**: espadaña, cruceiro and hórreo; an Anceu Fest banner; the non-fighting
  villagers (Ana, Andreea, Flo, Nacho, Rosabel, África) as an idle / cheering crowd. Afternoon light.
- **Ponte do Verdugo**: the arched stone bridge as the floor, river and watermill wheel turning
  behind, chestnut and oak trees. Late-evening light.

The props reuse or port the procedural props from `super-pepe-bros/src/kit.js`.

## Architecture

New project `anceu-fighter/` (three.js + Vite, plain JS modules like super-pepe-bros).

```
anceu-fighter/
  index.html
  package.json            three, vite; dev: playwright
  src/
    main.js               boot, screen manager, main loop (fixed 60 Hz sim + render interpolation)
    sim/                  pure game logic, no three.js, no DOM — unit-testable in node
      fighter.js          fighter state machine (idle, walk, dash, jump, crouch, attack,
                          hitstun, blockstun, thrown, knockdown, ko, intro, victory)
      moves.js            move execution, cancels, projectile spawning
      collision.js        2D AABB hitbox/hurtbox/pushbox tests
      projectiles.js      projectile and placed-object entities (fireball, slipper, router, fog)
      match.js            rounds, timer, health, meter, win conditions, hitstop
      input.js            per-player input buffer + special-move recognition
      ai.js               CPU controller (writes to an input buffer)
    data/
      fighters/           pepe.js, victor.js, se.js, agus.js, rosa.js — stats + move data +
                          clip names
      common.js           shared tuning (gravity, jump arc, walk speeds, hitstop table)
    render/
      fighterView.js      loads GLB, AnimationMixer; each tick maps sim state + frame to a clip
                          and clip time (animation follows the sim, never drives it)
      retarget.js         maps Meshy bone names onto Pepe's mixamorig skeleton
      camera.js           side camera tracking the midpoint, zoom by distance, shake
      fx.js               hit sparks, projectiles visuals, super flash, slow-mo
      stages/plaza.js, stages/ponte.js
    ui/                   DOM overlay screens + HUD (title, menu, select, hud, victory, pause)
    audio/                synth SFX + muiñeira music (ported from super-pepe-bros)
    devices.js            keyboard + Gamepad API → per-player raw input
  public/models/          fighter GLBs (mesh + fight clips) and crowd GLBs
  tools/build-fighters.mjs  fetch Meshy animation results and merge clips into one GLB per fighter
  test/                   node:test unit tests for src/sim and an e2e smoke test
```

**Key boundary**: `sim/` is deterministic given the inputs per tick. Rendering reads the sim
state and never changes it. This keeps the combat testable and leaves the door open to
rollback netcode later without rewriting the game.

**Dev shortcut**: `?dev=fight&p1=pepe&p2=rosa&stage=plaza&cpu=hard` skips menus;
`?dev=boxes` draws hitboxes/hurtboxes.

## Asset pipeline

- **Models**: reuse the realistic Meshy villagers: `super-pepe-bros/public/models/npc/*.glb` for
  Víctor, Se, Agustín, Rosa and the crowd, and `super-pepe-bros/public/models/pepe.glb` for Pepe.
- **Fight clips (~12 per fighter)**: guard idle, walk forward, walk back, jump, crouch, LP, HP,
  LK, HK (variants per character: boxer jabs for Víctor, kicks/dance for Agus…), block, hit
  reaction, knockdown, victory, intro. They come from the Meshy animation library via
  `node meshy/meshy.mjs animate <rig task id> --actions …` on each character's existing rig
  task (`meshy/output/chars-*-rig`). Candidates: Combat Idle (89), Walk Fight Forward/Back
  (21/20), Left/Right Jab from Guard (191/192), Right Uppercut from Guard (194), Roundhouse
  Kick (207), High Kick (215), Sweeping Kick (217), Block1 (138), Hit Reaction (178),
  Knock Down (187), Victory (412), Boxing Warm-up (385). Cost about 3 credits per clip, so
  roughly 150–180 credits in total (balance at design time: 570).
- **Pepe** uses a Mixamo skeleton (`mixamorig:*`, 36 joints). The Meshy rig uses the same bone
  names without the prefix (Hips, Spine02, LeftArm…). Clips generated on one Meshy rig are
  retargeted to Pepe with a name map in `render/retarget.js`, keeping rotation tracks only (plus
  hips height).
- Special moves reuse the closest clip, played at a different speed or blended, and add FX:
  fireball, slipper, router, fog, pot of queimada, gaiteiros. They don't require bespoke clips.
- If a library clip looks wrong on a model, fall back to a procedural pose for that move;
  clip quality never blocks the combat work.

## Testing

- `node --test` on `src/sim`: special-move recognition from buffered inputs; a move's hitbox
  connects on its active frames and not on others; high/low/overhead blocking rules; throw and
  throw-tech; hitstop and hitstun durations; combo damage scaling; round end on KO and timeout;
  best-of-3 flow; Rosa's heal cap; deterministic replay (the same inputs produce the same state).
- Playwright smoke test: boot with `?dev=fight` CPU vs CPU, run 20 s, assert no console errors
  and that health changed; save a screenshot.
- Manual feel pass: the user plays each fighter and reports tuning issues.

## Risks

- **Meshy clip fit**: library clips may clip through clothing or look off on Pepe's dog
  proportions. Mitigation: retarget early with one clip and check it, then use procedural fallback.
- **Feel tuning** takes iteration. Frame data lives in plain data files, and the `?dev=boxes`
  overlay makes it quick to adjust.
- **Shared keyboard ghosting**: some keyboards drop keys when both players press many at once.
  The bindings are chosen to keep the two players' keys apart; gamepads are recommended.

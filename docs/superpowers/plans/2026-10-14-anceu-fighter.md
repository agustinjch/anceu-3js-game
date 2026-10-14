# Anceu Fighter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Anceu Fighter vertical slice: a 2.5D fighting game with 5 fighters, 2 stages,
1P vs CPU and 2P local versus.

**Architecture:** A deterministic 60 Hz simulation in `src/sim` (no three.js, unit-tested with
`node --test`) plus a three.js view layer that reads sim state and maps it to GLB animation clips,
with a DOM overlay UI. Meshy clips are generated once and retargeted at load time onto every
fighter, Pepe included.

**Tech Stack:** three.js 0.180, Vite 7, plain ES modules, node:test, Playwright (smoke test),
Web Audio (synth).

**Spec:** `docs/superpowers/specs/2026-10-14-anceu-fighter-design.md`

**Execution:** the user said "ejecuta todo", so this plan runs natively in the same session
without stopping for review. A whole-change review happens at the end.

## Global Constraints

- New project dir `anceu-fighter/`, independent `package.json`, same dependency versions as
  super-pepe-bros (three ^0.180.0, vite ^7.1.0, playwright ^1.55.0).
- Simulation at a fixed 60 Hz; all timings in frames; `src/sim` imports nothing from three or
  the DOM.
- Health 1000 (Rosa 1100); 3 super bars of 100; best of 3 rounds (max 5); 99 s timer.
- Stage floor is 10 m wide: walls at x = ±5.
- P1 keys WASD + U I J K; P2 keys arrows + Numpad 4 5 1 2; gamepad X Y A B = LP HP LK HK.
- Commit directly to `main` (user preference). No feature branches.

## Review Focus

1. **Both players pressing at once / simultaneous hits (trades)**: two attacks that connect on the
   same frame must both apply. Test in Task 3 (`trade: both fighters hit on the same frame`).
2. **A fighter cornered at a wall**: pushback that can't move the defender pushes the attacker
   back instead, and nobody leaves [-5, 5]. Test in Task 3 (`corner pushback moves attacker`).
3. **Cross-up / side switch on a jump over**: facing must update when grounded, and "back" must be
   relative to the new facing for blocking. Test in Task 2 (`back is relative to facing`) and
   Task 3 (`fighters face each other after crossing`).
4. **Round transitions mid-action**: inputs during the KO slow-mo / round intro must not trigger
   moves, and projectiles must be cleared between rounds. Test in Task 4 (`round reset clears
   projectiles and states`).
5. **Gamepad disconnect / tab blur**: held keys must be released on window blur so a fighter does
   not walk forever. Covered in Task 7 (devices.js clears state on `blur`; smoke-checked).

---

### Task 1: Project scaffold + input buffer

**Files:** Create `anceu-fighter/{package.json,index.html,vite.config.js}`,
`anceu-fighter/src/sim/input.js`, `anceu-fighter/test/input.test.js`

**Interfaces (produces):**
- Button bitmask constants `U D L R LP HP LK HK` exported from `sim/input.js`.
- `class InputBuffer { push(rawBits: number, facing: 1|-1): void; held(btn): bool;
  pressed(btn): bool; recentDir(dirName: 'fwd'|'down', withinFrames=8): bool;
  get fwd(): bool; get back(): bool; get down(): bool; get up(): bool }`. `fwd`/`back` are
  derived from L/R and facing.

Tests: pressed is only true on the frame of the edge; held stays true; `→ then P within 8
frames` → `recentDir('fwd')` true at the press frame, false after 9 frames; back is relative to
facing (facing -1 makes R = back).

### Task 2: Fighter data + common tuning

**Files:** Create `src/data/common.js`, `src/data/fighters/{pepe,victor,se,agus,rosa}.js`,
`src/data/fighters/index.js`

**Produces:** `FIGHTERS: Record<id, FighterDef>` where
`FighterDef = { id, name, health, walkF, walkB, jumpVx, clips: {...}, moves: Record<moveId, Move>,
specials: [{ input: 'fwd'|'down', btn: 'P'|'K', move: (strength)=>moveId }], super: moveId,
intro: { line }, victory: { line } }`.

`Move = { startup, active, recovery, damage, chip, hitstun, blockstun, pushback, level:
'high'|'mid'|'low'|'overhead', box: {x,y,w,h} (relative, facing-right), cancel: 'chain'|'special'|
'super'|null, clip, clipSpeed?, projectile?, invuln?: [from,to], grab?: bool, heal?: number,
counter?: [from,to], teleport?: 'front'|'behind', place?: 'fog'|'router', vx?: number,
vy?: number, hits?: number, superFreeze?: bool, cinematic?: string }`.

Common normals: standing LP/HP/LK/HK, crouching LP/HP/LK/HK, jumping LP/HP/LK/HK (overheads),
throw. Each fighter overrides a few numbers and clips.

Test: every fighter has all normals, a super, 3 specials; every move has positive frame counts;
every `clip` exists in the fighter's clip map.

### Task 3: Fighter state machine + collision

**Files:** Create `src/sim/collision.js`, `src/sim/fighter.js`, `src/sim/moves.js`,
`src/sim/projectiles.js`, `test/fighter.test.js`

**Produces:**
- `collision.js`: `overlap(a, b): bool` for `{x,y,w,h}` world AABBs; `worldBox(fighter, box)`.
- `class Fighter { constructor(def, side: 0|1, x) ; id; x; y; vx; vy; facing; health; meter;
  state: 'idle'|'walkF'|'walkB'|'crouch'|'jump'|'dash'|'attack'|'hitstun'|'blockstun'|
  'thrown'|'knockdown'|'getup'|'ko'|'intro'|'victory'|'heal'; stateFrame; move; moveFrame;
  hurtbox(); pushbox(); activeHitbox() }`
- `stepFighters(world)` in `moves.js`: reads each fighter's InputBuffer, transitions states,
  starts moves (special recognition priority: super > specials > normals), advances physics and
  resolves hits and pushboxes. `world = { fighters:[f0,f1], projectiles:[], hitstop, events:[] }`.
  It emits events `{type:'hit'|'block'|'whiff'|'ko'|'projectile'|'super'|'throw'|'tech'|'heal'|
  'counter', ...}` that the view uses for FX and sound.

Tests: an LP connects only during active frames; standing block stops mid and fails vs low;
crouching block fails vs overhead; trade (both fighters hit on the same frame) applies both;
hitstop freezes both for N frames; corner pushback moves the attacker; throw is unblockable and
tech within 7 frames; combo damage scaling (3rd hit 90 %, floor 30 %); fighters face each other
after crossing; Rosa's grab misses airborne opponents; Víctor's Esquiva counter fires when hit
during the window; Se's teleport lands behind the rival; projectile is destroyed on hit;
two projectiles cancel each other out.

### Task 4: Match flow

**Files:** Create `src/sim/match.js`, `test/match.test.js`

**Produces:** `class Match { constructor({p1, p2, stage, rng}) ; phase: 'intro'|'roundStart'|
'fight'|'ko'|'roundEnd'|'matchEnd'; round; wins:[n,n]; timer (frames); step(inputs:[bits,bits]);
world; winner; events }`. Inputs are ignored outside the `fight` phase.

Tests: KO ends the round and awards a win; timeout gives the win to the fighter with the higher
health %; a double KO gives each a win; first to 2 wins the match; 2–2 plays round 5; round reset
clears projectiles and states; deterministic replay (same input sequence → identical JSON
snapshot).

### Task 5: CPU AI

**Files:** Create `src/sim/ai.js`, `test/ai.test.js`

**Produces:** `class AI { constructor(level: 'easy'|'normal'|'hard', rng); think(world, selfIdx):
bits }`. Uses a reaction-delay queue of observed state; seeded RNG so it is deterministic.

Tests: AI vs AI on hard for 60 s of frames produces damage on both sides; easy blocks fewer
hits than hard over the same seeded scenario; the AI never sends a special during the
`roundStart` phase (it's simply not stepped).

### Task 6: Assets: fight clips + retargeting

**Files:** Create `tools/build-fighters.mjs`, `src/render/retarget.js`; output
`public/models/fighters/{common,victor,se,agus,rosa,pepe}-clips.glb` and the model GLBs.

- Meshy animate tasks (run on the Meshy rigs): common set on Víctor's rig
  (89,21,20,191,192,209,207,194,213,138,178,187,344); per-fighter extras: Víctor
  93,198,385,403,210; Se 125,129,156,127,59,131; Agus 24,216,274,22,82,36; Rosa
  280,27,342,214,38,59; Pepe extras on Víctor's rig 51,219,94,271,269.
- `build-fighters.mjs`: copies the mesh GLBs from `super-pepe-bros/public/models/{npc,pepe}`,
  optimizes each Meshy clip GLB with gltf-transform (meshopt), and strips its textures so only
  the skeleton and animations ship.
- `retarget.js`: `retargetClip(clip, srcRoot, dstRoot, boneMap?) → AnimationClip`, a world-space
  rest-aligned rotation transfer (handles A-pose vs T-pose and mixamorig names). Hips position is
  scaled by hip height ratio.

Verify: visual check in the browser via `?dev=anim&f=pepe`: a turntable showing every clip.

### Task 7: Rendering, devices, main loop

**Files:** Create `src/main.js`, `src/devices.js`, `src/render/{fighterView,camera,fx}.js`,
`src/audio/{audio,music}.js` (ported), `src/render/stages/{plaza,ponte}.js`, `src/render/kit.js`
(ported subset of super-pepe-bros kit)

- `devices.js`: `readPlayer(i) → bits`; keyboard maps per player plus Gamepad API; clears held
  keys on window blur.
- `fighterView.js`: `new FighterView(def, assets)`, `update(fighter, dt)` maps state → clip and
  sets `action.time` from the move frame so animation follows the sim. Crouch and jump are
  procedural offsets on hips/legs plus a tuck.
- `camera.js`: tracks the midpoint, zooms on distance, `shake(intensity)`.
- `fx.js`: hit sparks, block sparks, projectile meshes (bark wave, whip, queimada fireball, slipper,
  router, fog), super flash, slow-mo.
- Main loop: accumulator → `match.step()` at 60 Hz, hitstop handled in the sim, render each RAF.

Verify: `?dev=fight&p1=pepe&p2=rosa&stage=plaza&cpu=hard` plays a CPU vs CPU match.

### Task 8: UI screens + HUD

**Files:** Create `src/ui/{screens.js,hud.js,style.css}`

Title → Menu (Versus CPU / Versus 2P / Controls) → Select (portraits, 3D pedestal, stage, CPU
difficulty) → Fight (HUD) → Victory (Rematch / Select / Menu). Pause with Esc. Portraits are
rendered at boot from the GLBs into canvases.

### Task 9: Smoke test, README, final review

**Files:** Create `test/e2e/smoke.mjs`, `anceu-fighter/README.md`; modify root `README.md`

- Playwright: launch the vite preview, open `?dev=fight&cpu=hard&p2cpu=hard`, wait 20 s, assert
  no console errors and that both health values dropped, save `test/e2e/smoke.png`.
- Run all unit tests, build, smoke test. Commit and push to main.

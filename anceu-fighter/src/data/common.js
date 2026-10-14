// Shared tuning. Units: metres and frames (60 per second).
export const SIM = {
  FPS: 60,
  WALL: 5,               // stage walls at x = ±WALL
  GRAVITY: 0.0075,
  JUMP_VY: 0.15,         // 40-frame jump, 1.5 m apex
  JUMP_VX: 0.05,
  PREJUMP: 3,
  LANDING: 4,
  DASH_FRAMES: 16,
  DASH_V: 0.095,
  BACKDASH_V: 0.08,
  PUSH_W: 0.55,          // pushbox width
  STAND_H: 1.7,
  CROUCH_H: 1.05,
  THROW_RANGE: 0.95,
  TECH_WINDOW: 7,
  THROW_FRAMES: 32,
  KD_FRAMES: 55,
  GETUP_FRAMES: 24,
  METER_MAX: 300,
  SUPER_COST: 100,
  SUPER_FREEZE: 30,
  ROUND_FRAMES: 99 * 60,
  FOG_SLOW: 0.6,
};

export const HITSTOP = { L: 6, H: 9, S: 11, X: 14 };

const DEF = {
  startup: 5, active: 3, recovery: 10, damage: 0, chip: 0, hitstun: 15, blockstun: 10,
  pushback: 0.06, level: 'mid', box: null, cancel: null, strength: 'L', hits: 1,
};
export const mv = o => ({ ...DEF, ...o });

// Standing / crouching / jumping normals and the throw. Fighters override pieces of it.
export function commonNormals() {
  return {
    sLP: mv({ startup: 4, active: 3, recovery: 8, damage: 30, hitstun: 14, blockstun: 10, box: { x: 0.2, y: 1.15, w: 0.7, h: 0.3 }, cancel: 'chain', clip: 'Left_Jab_from_Guard' }),
    sHP: mv({ startup: 7, active: 4, recovery: 18, damage: 70, hitstun: 20, blockstun: 15, pushback: 0.1, box: { x: 0.2, y: 1.1, w: 0.85, h: 0.35 }, cancel: 'special', strength: 'H', clip: 'Right_Jab_from_Guard' }),
    sLK: mv({ startup: 5, active: 3, recovery: 10, damage: 40, hitstun: 15, blockstun: 11, box: { x: 0.2, y: 0.5, w: 0.85, h: 0.5 }, cancel: 'chain', clip: 'Boxing_Guard_Right_Straight_Kick' }),
    sHK: mv({ startup: 9, active: 4, recovery: 20, damage: 80, hitstun: 21, blockstun: 16, pushback: 0.12, box: { x: 0.2, y: 0.9, w: 1.05, h: 0.55 }, strength: 'H', clip: 'Roundhouse_Kick' }),
    cLP: mv({ startup: 4, active: 3, recovery: 8, damage: 25, hitstun: 13, blockstun: 9, box: { x: 0.2, y: 0.65, w: 0.7, h: 0.3 }, cancel: 'chain', crouch: true, clip: 'Left_Jab_from_Guard' }),
    cHP: mv({ startup: 6, active: 5, recovery: 20, damage: 70, hitstun: 20, blockstun: 14, box: { x: 0.05, y: 0.8, w: 0.7, h: 1.2 }, cancel: 'special', strength: 'H', crouch: true, clip: 'Right_Uppercut_from_Guard' }),
    cLK: mv({ startup: 5, active: 3, recovery: 10, damage: 30, hitstun: 13, blockstun: 9, level: 'low', box: { x: 0.2, y: 0, w: 0.9, h: 0.3 }, cancel: 'chain', crouch: true, clip: 'Flying_Fist_Kick', clipTime: LOW_KICK }),
    cHK: mv({ startup: 9, active: 4, recovery: 24, damage: 70, hitstun: 20, blockstun: 14, level: 'low', knockdown: true, box: { x: 0.2, y: 0, w: 1.15, h: 0.3 }, strength: 'H', crouch: true, clip: 'Flying_Fist_Kick', clipTime: { ...LOW_KICK, to: 1.85 } }),
    jLP: mv({ startup: 4, active: 8, recovery: 2, damage: 35, hitstun: 14, blockstun: 10, level: 'overhead', box: { x: 0.15, y: 0.6, w: 0.65, h: 0.45 }, air: true, clip: 'Left_Jab_from_Guard' }),
    jHP: mv({ startup: 7, active: 6, recovery: 2, damage: 70, hitstun: 19, blockstun: 14, level: 'overhead', box: { x: 0.2, y: 0.0, w: 0.75, h: 0.8 }, air: true, strength: 'H', clip: 'Right_Jab_from_Guard' }),
    jLK: mv({ startup: 5, active: 8, recovery: 2, damage: 40, hitstun: 15, blockstun: 10, level: 'overhead', box: { x: 0.2, y: -0.15, w: 0.75, h: 0.65 }, air: true, clip: 'Boxing_Guard_Right_Straight_Kick' }),
    jHK: mv({ startup: 8, active: 6, recovery: 2, damage: 80, hitstun: 20, blockstun: 15, level: 'overhead', box: { x: 0.2, y: -0.25, w: 0.95, h: 0.75 }, air: true, strength: 'H', clip: 'Roundhouse_Kick' }),
    throw: mv({ startup: 3, active: 2, recovery: 22, damage: 120, grab: 'throw', box: { x: 0, y: 0.4, w: 0.95, h: 1.0 }, clip: 'Punch_Forward_with_Both_Fists' }),
  };
}

// Which clips each Meshy animation GLB (public/models/clips/<set>.glb) contains.
export const CLIP_SETS = {
  common: ['Combat_Stance', 'Walk_Fight_Forward', 'Walk_Fight_Back', 'Left_Jab_from_Guard', 'Right_Jab_from_Guard',
    'Boxing_Guard_Right_Straight_Kick', 'Roundhouse_Kick', 'Right_Uppercut_from_Guard', 'Leg_Sweep', 'Block1',
    'Hit_Reaction', 'Knock_Down', 'Stand_Up1'],
  pepe: ['Shouting_Angrily', 'Right_Hand_Sword_Slash', 'Flying_Fist_Kick', 'Wake_Up_and_Look_Up', 'sleep'],
  victor: ['Dodge_and_Counter', 'Punch_Combo', 'Boxing_Warmup', 'Victory_Fist_Pump', 'Boxing_Guard_Prep_Straight_Punch'],
  se: ['Charged_Spell_Cast', 'mage_soell_cast', 'Stand_Dodge', 'Charged_Ground_Slam', 'Victory_Cheer', 'mage_soell_cast_2'],
  agus: ['FunnyDancing_03', 'Lunge_Spin_Kick', 'Female_Crouch_Pick_Up_Place_Side', 'FunnyDancing_01', 'Shake_It_Off_Dance', 'Confused_Scratch'],
  rosa: ['Female_Crouch_Pick_Throw_Forward', 'Big_Heart_Gesture', 'Stand_and_Drink', 'Punch_Forward_with_Both_Fists', 'Dozing_Elderly', 'Victory_Cheer'],
};
// every fighter also gets these (the throw animation lives in Rosa's set)
export const SHARED_EXTRA = [
  { set: 'rosa', clips: ['Punch_Forward_with_Both_Fists'] },
  { set: 'se', clips: ['Charged_Spell_Cast'] },   // its squat is the crouch / jump-tuck pose
  { set: 'pepe', clips: ['Flying_Fist_Kick'] },   // low floor kick for crouching kicks
];

// Resolve a fighter's clipSets (+ SHARED_EXTRA) into [{set, clip}].
export function fighterClips(def) {
  const out = [];
  for (const s of [...def.clipSets, ...SHARED_EXTRA]) {
    const set = typeof s === 'string' ? s : s.set;
    for (const clip of typeof s === 'string' ? CLIP_SETS[s] : s.clips) if (!out.some(o => o.clip === clip)) out.push({ set, clip });
  }
  return out;
}

// Clip timing: which part of each Meshy clip to play, and the moment of impact (seconds).
// A move's startup maps onto [from, hit] and its active+recovery onto [hit, to].
export const CLIP_TIMING = {
  Combat_Stance: { loop: true },
  Walk_Fight_Forward: { loop: true },
  Walk_Fight_Back: { loop: true },
  Left_Jab_from_Guard: { from: 0.15, hit: 0.55, to: 1.1 },
  Right_Jab_from_Guard: { from: 0.2, hit: 0.65, to: 1.3 },
  Boxing_Guard_Right_Straight_Kick: { from: 0.2, hit: 0.72, to: 1.2 },
  Roundhouse_Kick: { from: 0.6, hit: 1.5, to: 2.4 },
  Right_Uppercut_from_Guard: { from: 0.1, hit: 0.5, to: 0.95 },
  Leg_Sweep: { from: 0.3, hit: 0.9, to: 1.5 },
  Block1: { from: 0.45, hit: 0.45, to: 0.45 },
  Hit_Reaction: { from: 0.0, hit: 0.25, to: 1.0 },
  Knock_Down: { from: 0.0, hit: 0.1, to: 2.1 },
  Stand_Up1: { from: 2.35, hit: 2.35, to: 5.9 },
  Punch_Forward_with_Both_Fists: { from: 0.6, hit: 1.5, to: 2.6 },
  Charged_Spell_Cast: { from: 0.6, hit: 1.9, to: 2.6 },
  Flying_Fist_Kick: { from: 1.0, hit: 2.0, to: 3.4 },
  // fighter extras
  Shouting_Angrily: { from: 0.3, hit: 1.2, to: 2.6 },
  Right_Hand_Sword_Slash: { from: 0.2, hit: 0.7, to: 1.4 },
  Lunge_Spin_Kick: { from: 0.3, hit: 1.0, to: 1.6 },
  Wake_Up_and_Look_Up: { from: 0, hit: 0, to: 3.5 },
  sleep: { from: 0, hit: 0, to: 4.6 },
  Boxing_Guard_Prep_Straight_Punch: { from: 1.0, hit: 1.7, to: 2.8 },
  Dodge_and_Counter: { from: 1.6, hit: 2.7, to: 4.2 },
  Punch_Combo: { from: 0.0, hit: 0.9, to: 2.45 },
  Boxing_Warmup: { from: 0, hit: 0, to: 6.3 },
  Victory_Fist_Pump: { from: 0, hit: 0, to: 1.5, loop: true },
  mage_soell_cast: { from: 0.3, hit: 1.0, to: 2.2 },
  Stand_Dodge: { from: 0, hit: 0.6, to: 1.4 },
  Charged_Ground_Slam: { from: 0.4, hit: 1.7, to: 3.0 },
  Victory_Cheer: { from: 0, hit: 0, to: 9.3, loop: true },
  mage_soell_cast_2: { from: 0, hit: 0, to: 3.0 },
  FunnyDancing_03: { from: 0.3, hit: 1.1, to: 3.4 },
  FunnyDancing_01: { from: 0.3, hit: 1.0, to: 7.0 },
  Female_Crouch_Pick_Up_Place_Side: { from: 0.6, hit: 2.7, to: 4.5 },
  Shake_It_Off_Dance: { from: 0, hit: 0, to: 16, loop: true },
  Confused_Scratch: { from: 0, hit: 0, to: 4.0 },
  Female_Crouch_Pick_Throw_Forward: { from: 0.5, hit: 2.1, to: 3.2 },
  Big_Heart_Gesture: { from: 0.3, hit: 1.0, to: 3.5, loop: true },
  Stand_and_Drink: { from: 0.5, hit: 3.5, to: 6.0 },
  Dozing_Elderly: { from: 0, hit: 0, to: 6.0 },
};

// Poses held by the layered animation (see FighterView): the squat used for crouching / jump tuck.
export const POSES = {
  crouch: { clip: 'Charged_Spell_Cast', t: 1.0 },
  guard: { clip: 'Block1', t: 0.45 },
};
// A crouching kick is the low floor kick inside Flying_Fist_Kick.
export const LOW_KICK = { from: 1.1, hit: 1.5, to: 1.7 };

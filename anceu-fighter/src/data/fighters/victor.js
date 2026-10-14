import { mv, commonNormals } from '../common.js';

const n = commonNormals();
const directo = s => mv({
  startup: s === 'H' ? 12 : 9, active: 5, recovery: s === 'H' ? 22 : 18, damage: s === 'H' ? 110 : 90, chip: 14,
  hitstun: 22, blockstun: 16, pushback: 0.14, strength: 'S', knockdown: s === 'H', cancel: 'super',
  moveVx: { from: 2, to: s === 'H' ? 16 : 13, v: s === 'H' ? 0.15 : 0.11 }, clip: 'Boxing_Guard_Prep_Straight_Punch',
  box: { x: 0.2, y: 1.05, w: 0.8, h: 0.4 },
});
const gancho = s => mv({
  startup: 3, active: 8, recovery: 28, damage: s === 'H' ? 130 : 100, chip: 14, hitstun: 26, blockstun: 16,
  strength: 'S', invuln: [1, 7], knockdown: true, cancel: 'super', clip: 'Right_Uppercut_from_Guard',
  box: { x: 0.0, y: 0.8, w: 0.75, h: 1.4 },
});
const esquiva = s => mv({
  startup: 2, active: 0, recovery: s === 'H' ? 34 : 28, strength: 'S', counter: [3, s === 'H' ? 24 : 18], counterMove: 'counter',
  clip: 'Dodge_and_Counter',
});

export default {
  id: 'victor', name: 'Víctor', title: 'Rural Champs', model: 'victor', height: 1.78, color: '#d64545',
  health: 1000, walkF: 0.052, walkB: 0.04,
  clipSets: ['common', 'victor'],
  moves: {
    ...n,
    // footwork: his kicks are quick, short jabs of the feet
    sLK: { ...n.sLK, damage: 35, box: { ...n.sLK.box, w: 0.7 } },
    sHK: { ...n.sHK, damage: 70, startup: 8 },
    sLP: { ...n.sLP, startup: 3, damage: 32 },
    sHP: { ...n.sHP, damage: 80 },
    directo_L: directo('L'), directo_H: directo('H'),
    gancho_L: gancho('L'), gancho_H: gancho('H'),
    esquiva_L: esquiva('L'), esquiva_H: esquiva('H'),
    counter: mv({
      startup: 2, active: 4, recovery: 18, damage: 120, hitstun: 30, blockstun: 16, strength: 'H', knockdown: true,
      clip: 'Boxing_Guard_Prep_Straight_Punch', box: { x: 0.1, y: 1.0, w: 1.0, h: 0.45 },
    }),
    super: mv({
      startup: 6, active: 40, recovery: 30, damage: 45, chip: 12, hits: 8, hitstun: 30, blockstun: 16, strength: 'X',
      invuln: [0, 12], knockdown: true, superFreeze: true, moveVx: { from: 6, to: 20, v: 0.06 }, clip: 'Punch_Combo',
      box: { x: 0.15, y: 0.8, w: 1.1, h: 0.8 }, fx: 'bell', name: 'Entreno a las nueve',
    }),
  },
  specials: [
    { input: 'fwd', btn: 'P', move: 'directo', name: 'Directo Rural Champs' },
    { input: 'down', btn: 'P', move: 'gancho', name: 'Gancho' },
    { input: 'down', btn: 'K', move: 'esquiva', name: 'Esquiva' },
  ],
  super: 'super',
  intro: { clip: 'Boxing_Warmup', line: 'Guantes postos. Imos alá.' },
  victory: { clip: 'Victory_Fist_Pump', line: 'Mañana a las nueve. Todos.' },
  ai: { antiAir: 'gancho', approach: 'directo', poke: 'sHP' },
};

import { mv, commonNormals } from '../common.js';

const n = commonNormals();
const zapatilla = s => mv({
  startup: 14, active: 2, recovery: 30, damage: s === 'H' ? 85 : 70, chip: 14, hitstun: 22, blockstun: 16,
  strength: 'S', cancel: 'super', clip: 'Female_Crouch_Pick_Throw_Forward',
  projectile: { kind: 'slipper', frame: 14, vx: s === 'H' ? 0.11 : 0.08, vy: 0.09, gravity: 0.004, y: 1.3, w: 0.4, h: 0.35, life: 160 },
});
const abrazo = s => mv({
  startup: 5, active: 3, recovery: 30, damage: s === 'H' ? 190 : 160, strength: 'S', grab: 'command',
  box: { x: 0, y: 0.3, w: s === 'H' ? 1.2 : 1.0, h: 1.1 }, clip: 'Big_Heart_Gesture',
});
const caldino = () => mv({ startup: 70, active: 0, recovery: 4, strength: 'S', heal: { frame: 50, amount: 60 }, clip: 'Stand_and_Drink' });

export default {
  id: 'rosa', name: 'Rosa', title: 'A avoa de Anceu', model: 'rosa', height: 1.62, color: '#c75a7a',
  health: 1100, walkF: 0.035, walkB: 0.03,
  clipSets: ['common', 'rosa'],
  moves: {
    ...n,
    sHP: { ...n.sHP, damage: 85, startup: 8 },
    sHK: { ...n.sHK, damage: 95, startup: 10 },
    zapatilla_L: zapatilla('L'), zapatilla_H: zapatilla('H'),
    abrazo_L: abrazo('L'), abrazo_H: abrazo('H'),
    caldino_L: caldino(), caldino_H: caldino(),
    super: mv({
      startup: 4, active: 4, recovery: 40, damage: 340, strength: 'X', grab: 'command', invuln: [0, 8], superFreeze: true,
      box: { x: 0, y: 0.3, w: 1.3, h: 1.1 }, clip: 'Punch_Forward_with_Both_Fists', cinematic: 'mesa', name: '¡A comer!',
    }),
  },
  specials: [
    { input: 'fwd', btn: 'P', move: 'zapatilla', name: 'Zapatillazo' },
    { input: 'down', btn: 'P', move: 'abrazo', name: 'Abrazo de avoa' },
    { input: 'down', btn: 'K', move: 'caldino', name: 'Caldiño' },
  ],
  super: 'super',
  intro: { clip: 'Dozing_Elderly', line: 'Ai, filliño… ven aquí que te dou un bico.' },
  victory: { clip: 'Big_Heart_Gesture', line: 'Límpate os pés.' },
  ai: { projectile: 'zapatilla', grab: 'abrazo', poke: 'sHK', heal: 'caldino' },
};

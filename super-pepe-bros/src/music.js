// Song data. Notation: NOTE[*steps], chords with '+', 'r' = rest, '|' ignored.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROOTS = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const n = midi => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
function chord(name, oct) {
  const m = /^([A-G][#b]?)(m?)(7?)$/.exec(name);
  const root = ROOTS[m[1]] + (oct + 1) * 12;
  const ivs = [0, m[2] ? 3 : 4, 7];
  if (m[3]) ivs.push(m[2] ? 10 : 10);
  return ivs.map(i => n(root + i));
}
const rep = (s, k) => Array(k).fill(s).join(' ');
const arp6 = chs => chs.map(c => { const [a, b, d] = chord(c, 3), [a4] = chord(c, 4); return `${a} ${b} ${d} ${a4} ${d} ${b}`; }).join(' ');
const arp8 = chs => chs.map(c => { const [a, b, d] = chord(c, 4), [a5] = chord(c, 5); return `${a} ${b} ${d} ${a5} ${d} ${b} ${a} ${b}`; }).join(' ');
const bass6 = chs => chs.map(c => { const [a, , d] = chord(c, 2); return `${a}*3 ${d}*3`; }).join(' ');
const bass8 = chs => chs.map(c => { const [a, , d] = chord(c, 2), [a3] = chord(c, 3); return `${a3} r ${d} r ${a3} r ${d} ${a}`; }).join(' ');
const bassDrive = chs => chs.map(c => { const [a] = chord(c, 2), [a3] = chord(c, 3); return `${a} ${a3} ${a} ${a3} ${a} ${a3} ${a} ${a3}`; }).join(' ');
const pad = (chs, len) => chs.map(c => chord(c, 4).join('+') + '*' + len).join(' ');

// ---- TITLE: a muiñeira for gaita, bombo and pandeireta ----
const titleMel = `
D5*2 E5 F#5*2 G5 | A5*2 F#5 D5*2 F#5 | G5*2 E5 C#5*2 E5 | F#5*2 D5 A4*3 |
D5*2 E5 F#5*2 G5 | A5*2 B5 A5*2 F#5 | G5*2 E5 C#5 D5 E5 | D5*6 |
A5*2 B5 A5*2 F#5 | G5*2 A5 G5*2 E5 | F#5*2 G5 F#5*2 D5 | E5*2 F#5 E5*2 C#5 |
D5*2 E5 F#5*2 A5 | B5*2 A5 G5*2 E5 | F#5*2 A5 E5*2 C#5 | D5*6 |`;
const titleCh = ['D', 'D', 'A', 'D', 'D', 'Bm', 'A', 'D', 'D', 'G', 'D', 'A', 'D', 'G', 'A', 'D'];

// ---- HUB: Anceu village, gentle 6/8 ----
const hubMel = `
B4*2 D5 G5*3 | F#5*2 E5 D5*3 | C5*2 E5 A5*2 G5 | F#5*3 D5*3 |
B4*2 D5 G5*2 A5 | B5*2 A5 G5*2 E5 | D5*2 C5 B4*2 A4 | G4*6 |
E5*2 F#5 G5*2 E5 | D5*2 B4 G4*3 | C5*2 D5 E5*2 C5 | B4*2 A4 B4*3 |
E5*2 F#5 G5*2 B5 | A5*2 G5 F#5*2 D5 | E5*2 F#5 D5*2 F#5 | G5*6 |`;
const hubCh = ['G', 'D', 'Am', 'D', 'G', 'Em', 'D', 'G', 'C', 'G', 'Am', 'Em', 'C', 'D', 'C', 'G'];

// ---- RIVER: bouncy 4/4 ----
const riverMel = `
C5 r E5 G5 r E5 C5 r | D5 r F5 A5*2 G5 F5 r | E5 r G5 C6 r B5 A5 G5 | F5*2 E5 D5 G5*4 |
C5 r E5 G5 r E5 C5 r | D5 r F5 A5*2 G5 F5 r | E5 G5 F5 D5 B4 D5 G4 B4 | C5*8 |
A5*2 G5 F5 E5*2 C5 r | F5*2 E5 D5 C5*2 A4 r | G4 C5 E5 G5 C6*2 B5 A5 | G5*6 r*2 |
A5*2 G5 F5 E5*2 C5 r | F5*2 E5 D5 C5*2 A4 r | B4 D5 G5 F5 E5 D5 B4 G4 | C5*4 r*4 |`;
const riverCh = ['C', 'Dm', 'C', 'G', 'C', 'Dm', 'G', 'C', 'F', 'Dm', 'C', 'G', 'F', 'Dm', 'G', 'C'];

// ---- FOREST: A Fraga, mysterious 3/4 ----
const forestMel = `
E5*4 G5 F#5 | E5*2 B4*4 | C5*4 D5 E5 | D5*2 A4*4 | B4*4 D5 E5 | F#5*2 B5*2 A5 G5 | F#5*3 E5 D#5*2 | E5*6 |
G5*3 A5 B5*2 | A5*2 G5*2 F#5*2 | E5*3 F#5 G5*2 | F#5*2 D5*4 | C5*3 D5 E5*2 | D5*2 B4*2 G4*2 | A4*2 B4*2 D#5*2 | E5*6 |`;
const forestCh = ['Em', 'Em', 'Am', 'D', 'G', 'Bm', 'B7', 'Em', 'C', 'D', 'Em', 'D', 'Am', 'G', 'B7', 'Em'];

// ---- MOUNTAIN: Monte da Fibra, heroic ----
const mtnMel = `
D5*3 A4 D5 E5 F5*2 | G5*3 F5 E5*2 C5*2 | D5*3 A4 D5 E5 F5 G5 | A5*6 r*2 |
A#5*3 A5 G5*2 F5*2 | G5*3 F5 E5*2 C5*2 | F5 E5 D5 C5 E5*2 C#5*2 | D5*6 r*2 |`;
const mtnCh = ['Dm', 'C', 'Dm', 'A', 'Bb', 'C', 'A', 'Dm'];

// ---- BOSS ----
const bossMel = `
C5*2 D#5*2 G5*2 F5 D#5 | D5*2 D#5*2 F5*4 | G#5*2 G5*2 F5*2 D#5 D5 | G5*4 B4*4 |
C5*2 D#5*2 G5*2 C6*2 | A#5*2 G#5*2 G5*4 | G#5 G5 F5 D#5 D5 D#5 F5 D5 | C5*8 |`;
const bossCh = ['Cm', 'Bb', 'Ab', 'G', 'Cm', 'Eb', 'Ab', 'Cm'];

// ---- INTRO / DARK ----
const introMel = `G5*6 | F#5*3 E5*3 | D5*6 | B4*6 | C5*3 E5*3 | D5*6 | A4*6 | B4*6 |`;
const darkMel = `E5*12 | D#5*6 F#5*6 | G5*12 | F#5*12 |`;

export const SONGS = {
  title: {
    bpm: 112, div: 3, gain: 1, reverb: 0.4,
    tracks: [
      { i: 'gaita', p: titleMel, v: 0.6 },
      { i: 'drone', p: 'D3+A3*96', v: 0.5 },
      { i: 'bass', p: bass6(titleCh), v: 0.6 },
      { i: 'harp', p: arp6(titleCh), v: 0.25 },
      { i: 'drum', p: rep('b r t s r t', 15) + ' b t t s s s', v: 0.6 },
    ],
  },
  hub: {
    bpm: 84, div: 3, gain: 0.9, reverb: 0.6,
    tracks: [
      { i: 'flute', p: hubMel, v: 0.55 },
      { i: 'bass', p: bass6(hubCh), v: 0.5 },
      { i: 'harp', p: arp6(hubCh), v: 0.3 },
      { i: 'pad', p: pad(hubCh, 6), v: 0.4 },
      { i: 'drum', p: rep('k r t r t r', 16), v: 0.35 },
    ],
  },
  river: {
    bpm: 138, div: 2, gain: 0.9, reverb: 0.35,
    tracks: [
      { i: 'brass', p: riverMel, v: 0.55 },
      { i: 'bass', p: bass8(riverCh), v: 0.55 },
      { i: 'pluck', p: arp8(riverCh), v: 0.18 },
      { i: 'drum', p: rep('k h s h k k s h', 16), v: 0.5 },
    ],
  },
  forest: {
    bpm: 96, div: 2, gain: 0.9, reverb: 0.8,
    tracks: [
      { i: 'flute', p: forestMel, v: 0.5 },
      { i: 'harp', p: arp6(forestCh), v: 0.3 },
      { i: 'pad', p: pad(forestCh, 6), v: 0.5 },
      { i: 'bass', p: forestCh.map(c => chord(c, 2)[0] + '*6').join(' '), v: 0.4 },
      { i: 'drum', p: rep('k r r t r t', 16), v: 0.25 },
    ],
  },
  mountain: {
    bpm: 150, div: 2, gain: 0.9, reverb: 0.35,
    tracks: [
      { i: 'gaita', p: mtnMel + mtnMel, v: 0.5 },
      { i: 'bass', p: bassDrive(mtnCh.concat(mtnCh)), v: 0.45 },
      { i: 'pad', p: pad(mtnCh.concat(mtnCh), 8), v: 0.45 },
      { i: 'drum', p: rep('k h s h k h s s', 16), v: 0.5 },
    ],
  },
  boss: {
    bpm: 168, div: 2, gain: 0.9, reverb: 0.3,
    tracks: [
      { i: 'square', p: bossMel, v: 0.6 },
      { i: 'brass', p: bossMel.replace(/([A-G]#?)5/g, '$14'), v: 0.35 },
      { i: 'bass', p: bassDrive(bossCh), v: 0.55 },
      { i: 'drum', p: rep('k h s h k k s h', 7) + ' k s s s s s s s', v: 0.55 },
    ],
  },
  intro: {
    bpm: 70, div: 3, gain: 0.9, reverb: 0.9,
    tracks: [
      { i: 'bell', p: introMel, v: 0.5 },
      { i: 'pad', p: pad(['G', 'D', 'Bm', 'G', 'C', 'G', 'D', 'G'], 6), v: 0.5 },
      { i: 'harp', p: arp6(['G', 'D', 'Bm', 'G', 'C', 'G', 'D', 'G']), v: 0.2 },
    ],
  },
  dark: {
    bpm: 60, div: 3, gain: 0.9, reverb: 1,
    tracks: [
      { i: 'bell', p: darkMel, v: 0.4 },
      { i: 'drone', p: 'E2+B2*48', v: 0.7 },
      { i: 'pad', p: pad(['Em', 'B', 'Em', 'B'], 12), v: 0.5 },
      { i: 'drum', p: rep('b r r r r r r r r r r r', 4), v: 0.5 },
    ],
  },
  ending: {
    bpm: 96, div: 3, gain: 1, reverb: 0.6,
    tracks: [
      { i: 'gaita', p: hubMel, v: 0.55 },
      { i: 'flute', p: hubMel.replace(/([A-G]#?)(\d)/g, (m, a, b) => a + (+b - 1)), v: 0.3 },
      { i: 'drone', p: 'G2+D3*96', v: 0.4 },
      { i: 'bass', p: bass6(hubCh), v: 0.55 },
      { i: 'harp', p: arp6(hubCh), v: 0.3 },
      { i: 'drum', p: rep('b r t s t t', 16), v: 0.55 },
    ],
  },
};

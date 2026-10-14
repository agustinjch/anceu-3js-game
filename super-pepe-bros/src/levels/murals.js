// Se's painted murals — canvas paintings that become portals.
function base(w = 512, h = 384) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function sky(g, w, h, a, b) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
function brushNoise(g, w, h) { for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},0.04)`; g.fillRect(Math.random() * w, Math.random() * h, 6, 2); } }
function tree(g, x, y, s, c) { g.fillStyle = '#5b4330'; g.fillRect(x - 3 * s, y - 10 * s, 6 * s, 14 * s); g.fillStyle = c; g.beginPath(); g.arc(x, y - 20 * s, 14 * s, 0, 7); g.fill(); }
function frameSign(g, w, h, text) { g.font = 'bold 30px Lilita One, sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#2b1a10'; g.strokeText(text, w / 2, h - 18); g.fillStyle = '#ffd23a'; g.fillText(text, w / 2, h - 18); }

export function paintRiver() {
  const [c, g] = base(), w = 512, h = 384;
  sky(g, w, h, '#58a8f0', '#d8f0ff');
  g.fillStyle = '#4c9a3c'; g.beginPath(); g.moveTo(0, 170); g.quadraticCurveTo(150, 110, 260, 160); g.quadraticCurveTo(380, 210, 512, 140); g.lineTo(512, 384); g.lineTo(0, 384); g.fill();
  // waterfall
  g.fillStyle = '#9ad8f0'; g.fillRect(380, 120, 40, 120);
  // river
  g.fillStyle = '#2f8fc0'; g.beginPath(); g.moveTo(370, 240); g.quadraticCurveTo(260, 270, 230, 384); g.lineTo(330, 384); g.quadraticCurveTo(350, 290, 430, 240); g.fill();
  // stone bridge
  g.fillStyle = '#a9a294'; g.fillRect(150, 255, 300, 30);
  g.fillStyle = '#2f8fc0'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(190 + i * 72, 300, 26, Math.PI, 0); g.fill(); g.fillRect(164 + i * 72, 300, 52, 30); }
  g.fillStyle = '#a9a294'; g.fillRect(150, 300, 300, 0);
  // mill
  g.fillStyle = '#9a958c'; g.fillRect(60, 200, 70, 50); g.fillStyle = '#b4532f'; g.beginPath(); g.moveTo(50, 200); g.lineTo(95, 170); g.lineTo(140, 200); g.fill();
  tree(g, 40, 330, 1.6, '#3f8a3a'); tree(g, 470, 320, 1.4, '#3f8a3a'); tree(g, 300, 160, 1, '#3f8a3a');
  // trout
  g.fillStyle = '#e8a060'; g.beginPath(); g.ellipse(280, 330, 18, 8, -0.5, 0, 7); g.fill();
  brushNoise(g, w, h); frameSign(g, w, h, 'O RÍO VERDUGO');
  return c;
}
export function paintForest() {
  const [c, g] = base(), w = 512, h = 384;
  sky(g, w, h, '#1d2a50', '#5a6aa0');
  g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(400, 80, 34, 0, 7); g.fill();
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(Math.random() * w, Math.random() * 160, 2, 2); }
  g.fillStyle = '#1f4a2c'; g.fillRect(0, 230, w, 160);
  for (let i = 0; i < 9; i++) tree(g, 20 + i * 60, 260 + (i % 2) * 20, 2 + (i % 3) * 0.4, i % 2 ? '#2e6a3a' : '#245a30');
  // mushrooms
  for (const [x, y, s] of [[120, 330, 1.4], [330, 340, 1], [430, 320, 1.2]]) { g.fillStyle = '#f1e6cf'; g.fillRect(x - 6 * s, y - 20 * s, 12 * s, 22 * s); g.fillStyle = '#d8442f'; g.beginPath(); g.arc(x, y - 20 * s, 22 * s, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 8 * s, y - 30 * s, 4 * s, 0, 7); g.fill(); }
  // wisps
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(180,255,170,.8)'; g.beginPath(); g.arc(Math.random() * w, 160 + Math.random() * 180, 3, 0, 7); g.fill(); }
  // horreo silhouette
  g.fillStyle = '#7a5434'; g.fillRect(220, 250, 80, 30); g.fillStyle = '#9c4a2a'; g.beginPath(); g.moveTo(212, 250); g.lineTo(260, 228); g.lineTo(308, 250); g.fill();
  g.fillStyle = '#9a958c'; for (let i = 0; i < 3; i++) g.fillRect(225 + i * 30, 280, 8, 26);
  brushNoise(g, w, h); frameSign(g, w, h, 'A FRAGA DOS TRASNOS');
  return c;
}
export function paintMountain() {
  const [c, g] = base(), w = 512, h = 384;
  sky(g, w, h, '#ff9a5a', '#ffe2a8');
  g.fillStyle = '#7a6a8a'; g.beginPath(); g.moveTo(0, 300); g.lineTo(120, 120); g.lineTo(220, 260); g.lineTo(330, 70); g.lineTo(512, 300); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(300, 120); g.lineTo(330, 70); g.lineTo(360, 120); g.fill();
  // grey tower on top
  g.fillStyle = '#5c6066'; g.fillRect(318, 20, 24, 60); g.fillStyle = '#ff3030'; g.fillRect(326, 30, 8, 8);
  // wind turbines
  for (const [x, y] of [[90, 200], [170, 230], [420, 220]]) { g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 80); g.stroke(); for (let k = 0; k < 3; k++) { const a = k * 2.09 + 0.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.stroke(); } }
  g.fillStyle = '#5a8a3c'; g.fillRect(0, 300, w, 84);
  brushNoise(g, w, h); frameSign(g, w, h, 'MONTE DA FIBRA');
  return c;
}

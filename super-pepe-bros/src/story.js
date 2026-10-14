// Story: intro & ending cinematics, credits, controls.
import * as THREE from 'three';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { wait } from './ui.js';
import { makeAirship, makeBaleiro } from './levels/baleiro.js';
import { makeSparkMesh } from './entities.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const controlsHTML = `<div class="panel"><table>
<tr><td>Move</td><td>WASD / Arrows · Left stick</td></tr>
<tr><td>Jump</td><td>Space / K · Ⓐ — press again on landing for double & triple jumps</td></tr>
<tr><td>Spin attack</td><td>J / F / Left click · Ⓧ — also a little air-boost</td></tr>
<tr><td>Ground pound</td><td>Shift / C in the air · ZL/ZR/LB/RB</td></tr>
<tr><td>Long jump</td><td>Shift + Space while running</td></tr>
<tr><td>Backflip</td><td>Shift + Space while standing</td></tr>
<tr><td>Wall kick</td><td>Jump into a wall, then Space again</td></tr>
<tr><td>Ledge climb</td><td>Jump toward a ledge and keep moving</td></tr>
<tr><td>Talk / Read</td><td>E · Ⓨ (or spin next to someone)</td></tr>
<tr><td>Camera</td><td>Click to capture mouse · Q / R rotate · Z re-center · Right stick</td></tr>
<tr><td>Pause</td><td>Esc / P · Start</td></tr>
</table></div>`;

export function sparkMilestone(n) {
  return ({
    3: 'The forest mural is awake! (3 Faíscas)',
    7: 'The mountain mural is awake! (7 Faíscas)',
    9: 'Lights are coming back on in Anceu…',
    12: 'Twelve Faíscas! The seal on the north door can be broken!',
    18: 'Every Faísca recovered! Anceu shines again!',
  })[n];
}

export function creditsHTML(final) {
  return `
  <h1>SUPER PEPE BROS</h1>
  <p>A Faísca de Anceu</p>
  ${final ? '<p class="quote">"A village doesn\'t die when people leave. It dies when it forgets."<br>— Rosario, Anceu</p>' : ''}
  <h3>Starring</h3><p>Pepe — the dog who takes it slow</p>
  <h3>The neighbours of Anceu</h3><p>Rosario · Manolo · O Panadeiro</p>
  <h3>The house team</h3><p>Rosa — keeper of the cosy house</p><p>Africa — making the magic happen</p><p>Agustín — rural hacker</p><p>Se — artista da pista</p>
  <h3>Colivers</h3><p>Kenji · Maya · and over a thousand people from forty countries</p>
  <h3>Villain (reformed)</h3><p>Don Baleiro, Minister of Emptiness</p>
  <h3>Inspired by</h3><p>Anceu village, Ponte Caldelas, Galicia</p><p>Anceu Coliving · Rural Hackers</p>
  <h3>Music</h3><p>Muiñeiras for synthesized gaita, bombo & pandeireta</p>
  <h3>Built with</h3><p>three.js · Web Audio · a lot of caldo</p>
  <h3>Thanks for playing</h3><p>Now go take it slow. 🐾</p>
  <div style="height:30vh"></div>`;
}

// ---------------- INTRO ----------------
export async function intro(game) {
  const ui = game.ui, cine = game.cine;
  game.state = 'cutscene';
  await game.loadLevel('hub', { title: true, intro: true });
  const ctx = game.ctx;
  ui.showHUD(false); ui.letterbox(true);
  game.cam.cinematic = true;
  // hide village NPCs for the night scene, put Pepe asleep by the cruceiro
  Object.values(ctx.npcs).forEach(n => (n.obj.visible = false));
  game.entities.filter(e => e.constructor.name === 'Baleirino').forEach(e => e.remove());
  const pl = game.player; pl.setPosition(V(2.2, 0.05, 2.2), -2.4); pl.locked = true;
  ctx.setMood(1); ctx.setWindows(true); ctx.tableItems.visible = true;
  // golden-hour light
  game.sky.material.uniforms.top.value.set(0x4a78c8); game.sky.material.uniforms.bottom.value.set(0xffc890);
  game.fog.color.set(0xffc890); game.sun.color.set(0xffc080);
  audio.playSong('intro', 0.5);
  cine.cam(V(60, 30, 70), V(0, 4, 0), 0);
  ui.fade(0, 2000);
  await cine.cam(V(40, 18, 48), V(0, 3, 0), 7);
  await ui.caption('Galicia. High in the green hills above the Verdugo river…', 3800);
  cine.cam(V(-34, 10, 20), V(-24, 8, -4), 8);
  await ui.caption('…lies Anceu: a village of a hundred souls, a dozen hórreos, and one very relaxed dog.', 4200);
  cine.cam(V(12, 4, 2), V(0, 3, -16), 8);
  await ui.caption('For generations, the neighbours kept the Faíscas — sparks of shared knowledge. How to bake the bread. How to graft a chestnut tree. How to mend the mill and sing the muiñeira.', 5600);
  // show sparks floating above the village
  const floating = [];
  for (let i = 0; i < 18; i++) { const s = makeSparkMesh(false, 0.6); const a = i / 18 * Math.PI * 2; s.position.set(Math.cos(a) * 16, 9 + Math.sin(i * 1.7) * 2, Math.sin(a) * 16 - 4); game.scene.add(s); floating.push(s); }
  const spinner = { on: true }; (async () => { while (spinner.on) { floating.forEach((s, i) => { s.rotation.y += 0.03; s.position.y += Math.sin(game.time * 2 + i) * 0.01; }); await wait(16); } })();
  cine.cam(V(0, 14, 34), V(0, 8, -4), 9);
  await ui.caption('When the young people left for the cities, the sparks grew dim. But then new people came — hackers, artists, dreamers from forty countries.', 5200);
  await ui.caption('They learned from the neighbours. The neighbours learned from them. And the Faíscas shone again.', 4200);
  cine.cam(V(5.5, 1.6, 5.5), V(2.2, 0.8, 2.2), 5);
  await ui.caption('It was the night before the Rural Hackers Fest…', 3600);

  // ---- the grey night ----
  audio.playSong('dark', 2);
  const sky = game.sky.material.uniforms;
  const fromTop = sky.top.value.clone(), fromBot = sky.bottom.value.clone();
  await cine.tween(2.5, k => {
    sky.top.value.copy(fromTop).lerp(new THREE.Color(0x10141c), k); sky.bottom.value.copy(fromBot).lerp(new THREE.Color(0x5a6068), k);
    game.fog.color.copy(sky.bottom.value); game.sun.intensity = 2.6 * (1 - k) + 0.25; game.hemi.intensity = 1.1 - k * 0.75; sky.stars.value = k;
    game.hemi.color.set(0xcfe8ff).lerp(new THREE.Color(0x4060a0), k); game.scene.environmentIntensity = 0.35 - k * 0.28; game.renderer.toneMappingExposure = 1.05 - k * 0.4;
  });
  const ship = makeAirship(); ship.position.set(0, 40, 120); ship.rotation.y = Math.PI; game.scene.add(ship);
  const shipTick = { on: true }; (async () => { while (shipTick.on) { ship.userData.props.forEach(p => (p.rotation.z += 0.3)); await wait(16); } })();
  cine.cam(V(7, 3, 15), V(0, 22, -10), 0);
  audio.sfx('shock');
  await cine.tween(6, k => { ship.position.z = 120 - k * 124; ship.position.y = 40 - k * 16; });
  const don = makeBaleiro(1.0); don.position.set(0, -3.2, 4.2); ship.add(don);
  await cine.cam(V(0, 22, 20), V(0, 21, -4), 2);
  await ui.dialog('???', ['Hmm. Anceu. A hundred people, a thousand chestnut trees, zero quarterly growth.', 'Not on any of my spreadsheets.'], 160);
  await ui.dialog('Don Baleiro', ['Allow me to introduce myself: DON BALEIRO. Minister of Emptiness. CEO of Baleirópolis — the greyest, most efficient city ever built!', 'Villages are SO inefficient. All that chatting. All that sharing. All those… long tables.', 'Those little sparks of yours? Excellent fuel for my Grey Tower. I\'ll be taking them.'], 160);
  // vacuum
  const beam = ship.userData.beam;
  audio.sfx('portal'); game.cam.shake(0.3, 3);
  cine.cam(V(26, 10, 26), V(0, 10, -4), 6);
  beam.material.opacity = 0;
  await cine.tween(1, k => (beam.material.opacity = k * 0.35));
  await cine.tween(4, k => {
    floating.forEach((s, i) => { const kk = Math.min(1, Math.max(0, k * 1.6 - i / 30)); s.position.lerp(V(ship.position.x, ship.position.y - 6, ship.position.z), kk * 0.08); s.scale.setScalar(0.6 * (1 - kk * 0.8)); });
    if (Math.random() < 0.3) ctx.windows[Math.floor(Math.random() * ctx.windows.length)].material.emissiveIntensity = 0;
  });
  spinner.on = false; floating.forEach(s => game.scene.remove(s));
  ctx.setWindows(false); ctx.tableItems.visible = false;
  await cine.tween(0.8, k => (beam.material.opacity = 0.35 * (1 - k)));
  await ui.dialog('Don Baleiro', ['Delightful. My drones will guard them — down by the river, in that dreadful forest, up on the mountain.', 'Without their sparks, your people will pack their bags and come live in my lovely grey city. One box each. Very tidy.', 'Ho ho h— ahem. Efficiently.'], 160);
  cine.cam(V(-20, 18, 40), V(0, 30, -120), 4);
  await cine.tween(5, k => { ship.position.z = -4 - k * 260; ship.position.y = 24 + k * 50; });
  shipTick.on = false; game.scene.remove(ship);
  await ui.fade(1, 1500);

  // ---- morning: grey ----
  audio.stopSong(1);
  ctx.setMood(0.25);
  sky.stars.value = 0; game.scene.environmentIntensity = 0.35; game.renderer.toneMappingExposure = 1.05; game.hemi.color.set(0xcfe8ff);
  Object.values(ctx.npcs).forEach(n => (n.obj.visible = true));
  const ros = ctx.npcs['Rosario'];
  ros.obj.position.set(6, 0.05, 6);
  pl.setPosition(V(2.2, 0.05, 2.2), 0.9); pl.locked = true;
  cine.cam(V(7, 2.2, -1), V(3.5, 1, 3.5), 0);
  await wait(400);
  await ui.fade(0, 1500);
  await ui.caption('The next morning, Anceu woke up grey.', 3000);
  audio.sfx('bark');
  pl.vel.y = 5; pl.onGround = false;
  await wait(900);
  audio.playSong('hub', 1);
  await ui.dialog('Rosario', ['Pepe! Pepiño! At last you\'re awake.', 'The sparks are gone. The bread is gone. The colivers are packing their bags and nobody remembers why they came.', 'You slept right through it, didn\'t you? Bah. Maybe that\'s why the grey didn\'t touch you.'], 300);
  pl.facing = Math.atan2(ros.obj.position.x - pl.pos.x, ros.obj.position.z - pl.pos.z);
  await ui.dialog('Rosario', ['Listen. A village doesn\'t die when people leave. It dies when it forgets.', 'Go and bring our Faíscas home, Pepe. Se says her murals on the east wall have started to shimmer — talk to her.'], 300);
  audio.sfx('bark'); await wait(300); audio.sfx('bark', { vol: 0.7 });
  await ui.dialog('', ['WOOF!'], 700);
  game.flag('introDone', true);
  await ui.fade(1, 700);
  ui.letterbox(false); game.cam.cinematic = false;
  await game.loadLevel('hub', { spawn: 'start', quiet: true });
  game.ui.bigText('SUPER PEPE BROS', 'Bring the Faíscas home', 2800);
  game.ui.toast('Talk to the villagers with E. Agustín knows the controls!', 5000);
}

// ---------------- ENDING ----------------
export async function ending(game) {
  const ui = game.ui, cine = game.cine;
  game.state = 'cutscene';
  await ui.fade(1, 1200, true);
  await game.loadLevel('hub', { title: true, ending: true });
  const ctx = game.ctx;
  ui.showHUD(false); ui.letterbox(true); game.cam.cinematic = true;
  game.entities.filter(e => e.constructor.name === 'Baleirino').forEach(e => e.remove());
  const pl = game.player; pl.setPosition(V(0, 0.05, -12.5), Math.PI); pl.locked = true;
  ctx.setMood(0.25); ctx.setWindows(false);
  // dusk
  const sky = game.sky.material.uniforms;
  audio.playSong('intro', 0.5);
  cine.cam(V(0, 40, 60), V(0, 0, -10), 0);
  await ui.fade(0, 1500, true);
  // the Gran Faísca flies home and bursts
  const big = makeSparkMesh(false, 3); big.position.set(0, 60, -200); game.scene.add(big);
  await cine.tween(4, k => { big.position.set(0, 60 - k * 40, -200 + k * 190); big.rotation.y += 0.1; cine.look = big.position.clone(); game.camera.lookAt(big.position); });
  audio.sfx('spark'); audio.sfx('explode'); fx.sparkle(big.position, 80, 0xffe080, 14);
  game.scene.remove(big);
  await cine.tween(3, k => {
    ctx.setMood(0.25 + k * 0.75);
    sky.top.value.lerp(new THREE.Color(0x2a3a80), k * 0.5); sky.bottom.value.lerp(new THREE.Color(0xff9a6a), k * 0.6);
    game.fog.color.copy(sky.bottom.value);
    if (Math.random() < 0.4) { const w = ctx.windows[Math.floor(Math.random() * ctx.windows.length)]; w.material.emissiveIntensity = 1.4; w.material.color.set(0xffd36b); }
  });
  ctx.setWindows(true); ctx.tableItems.visible = true;
  audio.playSong('ending', 1);
  // everyone gathers at the long table
  const N = ctx.npcs;
  const seats = { Rosario: V(-4, 0, -14.6), Rosa: V(-2, 0, -14.6), Africa: V(0, 0, -17.4), 'Agustín': V(2, 0, -14.6), Se: V(4, 0, -17.4), 'O Panadeiro': V(-2, 0, -17.4), Kenji: V(4, 0, -14.6), Maya: V(-4, 0, -17.4), Manolo: V(2, 0, -17.4) };
  for (const k in seats) if (N[k]) { N[k].obj.position.copy(seats[k]); N[k].obj.rotation.y = seats[k].z > -16 ? Math.PI : 0; N[k].anim = 'idle'; }
  const lanterns = [];
  for (let i = 0; i < 7; i++) { const l = new THREE.PointLight(0xffb050, 4, 7); l.position.set(-6 + i * 2, 3, -16); game.scene.add(l); lanterns.push(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xffd080 })); bulb.position.copy(l.position); game.scene.add(bulb); lanterns.push(bulb); }
  await cine.cam(V(9, 4, -6), V(0, 1.2, -16), 3);
  await ui.dialog('Rosario', ['Look at that. Lights in every window. Bags unpacked.', 'You see, Pepe? A village isn\'t its stones. It\'s what we share.'], 300);
  await ui.dialog('Agustín', ['The fibre\'s back, the router is happy, and the Rural Hackers Fest is ON!', 'Problems are opportunities. And that was a very big opportunity.'], 260);
  await ui.dialog('Africa', ['Magic: made. Pepe, you\'re officially on the house team.'], 560);
  await ui.dialog('O Panadeiro', ['Bread at nine o\'clock tomorrow. Eight loaves, all for the long table!'], 220);
  // Don Baleiro arrives, sooty and small
  const don = makeBaleiro(0.85); don.position.set(0, 0, 6); don.rotation.y = Math.PI; game.scene.add(don);
  await cine.cam(V(4, 2.4, -6), V(0, 1.6, 2), 2);
  await cine.tween(3, k => { don.position.z = 6 - k * 6.5; don.position.y = Math.abs(Math.sin(k * 20)) * 0.06; });
  await ui.dialog('Don Baleiro', ['Ahem. Good evening. My tower… fell down. Rather inefficiently.', 'And Baleirópolis is very quiet at night. Very… grey. I was wondering if perhaps there was…', '…a chair free?'], 160);
  await cine.cam(V(-5, 2.4, -9), V(0, 1.4, -14), 1.5);
  await ui.dialog('Rosa', ['There\'s always room at the long table. Sit. Wipe your feet first.'], 420);
  don.position.set(0, 0, -14.6); don.rotation.y = Math.PI;
  await ui.dialog('Don Baleiro', ['…Is that empanada?', '…Oh. Oh, this is terribly inefficient.', 'I love it.'], 160);
  await ui.dialog('Se', ['Next summer we paint a new mural. Don Baleiro, you\'re holding the ladder.'], 640);
  // fireworks
  const fw = { on: true };
  (async () => { while (fw.on) { const p = V((Math.random() - 0.5) * 40, 25 + Math.random() * 15, -30 - Math.random() * 20); fx.sparkle(p, 40, [0xff5050, 0xffd23a, 0x50c0ff, 0x80ff80][Math.floor(Math.random() * 4)], 9); audio.sfx('pound', { vol: 0.25 }); await wait(500 + Math.random() * 600); } })();
  cine.cam(V(0, 8, 14), V(0, 14, -30), 6);
  N.Africa && (N.Africa.anim = 'dance'); N.Se && (N.Se.anim = 'dance'); N.Maya && (N.Maya.anim = 'dance'); N.Kenji && (N.Kenji.anim = 'dance');
  await ui.caption('That night, the long table of Anceu was the longest it had ever been.', 4500);
  await ui.caption('And Pepe — hero of the village — did what he does best.', 3500);
  pl.setPosition(V(2.2, 0.05, 2.2), 0.6); pl.locked = true;
  await cine.cam(V(5, 1.4, 5.5), V(2.2, 0.6, 2.2), 3);
  const zz = [];
  for (let i = 0; i < 3; i++) setTimeout(() => fx.spawn(V(2.4, 1.6, 2.4), V(0.2, 0.6, 0), 2.5, 0.4, 0xffffff, { star: true }), i * 700);
  await ui.caption('He took it slow.', 3500);
  await ui.bigText('THE END', 'Obrigado por xogar!', 3500);
  fw.on = false;
  await ui.credits(creditsHTML(true), 50);
  lanterns.forEach(l => game.scene.remove(l)); game.scene.remove(don);
  game.flag('beaten', true);
  await ui.fade(1, 1000);
  game.state = 'title';
  game.titleScreen();
}

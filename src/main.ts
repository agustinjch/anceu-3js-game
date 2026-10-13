import { audio } from './core/audio';
import { detectLang, loadLang, t } from './core/i18n';
import { input } from './core/input';
import { save } from './core/save';
import { Game } from './game/game';
import { Story } from './story/story';
import { ui } from './ui/ui';

async function boot() {
  await loadLang(save.get().lang ?? detectLang());
  ui.init();
  ui.loading(0.02, t('load.start'));
  await audio.init();

  const container = document.getElementById('game')!;
  input.init(container);
  const game = new Game(container);
  // exponer para depuración en consola
  (window as unknown as { game: Game }).game = game;

  await game.load((p, label) => ui.loading(p * 0.9, label));
  const story = new Story(game);
  (window as unknown as { story: Story }).story = story;
  await story.setup();
  ui.loading(1, '');
  audio.preloadSfx();

  game.engine.start();
  const stopBackdrop = story.titleBackdrop();
  await ui.hideLoading();

  const params = new URLSearchParams(location.search);
  const canContinue = save.get().checkpoint !== undefined || save.get().pegadas.length > 0;
  const dbg = params.get('debug');
  if (dbg) {
    stopBackdrop();
    document.getElementById('title')?.classList.add('hidden');
    return story.debug(dbg);
  }
  const choice = await ui.showTitle(canContinue);
  stopBackdrop();
  audio.playMusic(null, 2);
  if (choice === 'new') await story.newGame();
  else await story.continueGame();
}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading-label');
  if (l) l.textContent = `Erro: ${e?.message ?? e}`;
});

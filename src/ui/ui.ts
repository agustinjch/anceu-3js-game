import { audio } from '../core/audio';
import { LANGS, lang, loadLang, onLangChange, t, type Lang } from '../core/i18n';
import { input, isTouch } from '../core/input';
import { save } from '../core/save';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const show = (el: HTMLElement, on = true) => el.classList.toggle('hidden', !on);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Datos de un personaje para el diálogo. */
export interface Speaker {
  name: string;
  portrait?: string;
}

class UI {
  private dialogueResolve: (() => void) | null = null;
  private typing: { full: string; timer: number } | null = null;
  onPause: (paused: boolean) => void = () => {};
  paused = false;

  init() {
    this.applyI18n();
    onLangChange(() => this.applyI18n());

    $('#dialogue').addEventListener('click', () => this.advanceDialogue());
    $('#btn-pause').addEventListener('click', () => this.setPaused(true));
    $('#btn-resume').addEventListener('click', () => this.setPaused(false));
    $('#btn-lang2').addEventListener('click', () => this.cycleLang());
    $('#btn-lang').addEventListener('click', () => this.cycleLang());
    $('#btn-credits').addEventListener('click', () => this.showCredits());
    $('#btn-quit').addEventListener('click', () => location.reload());
    $('#credits').addEventListener('click', () => show($('#credits'), false));
    const vm = $<HTMLInputElement>('#vol-music');
    const vs = $<HTMLInputElement>('#vol-sfx');
    vm.value = String(save.get().volume.music);
    vs.value = String(save.get().volume.sfx);
    const setVol = () => audio.setVolumes(+vm.value, +vs.value);
    vm.addEventListener('input', setVol);
    vs.addEventListener('input', setVol);
    document.querySelectorAll('#ui button').forEach((b) => {
      b.addEventListener('pointerenter', () => audio.sfx('ui_hover', { volume: 0.3 }));
      b.addEventListener('click', () => audio.sfx('ui_click', { volume: 0.5 }));
    });
  }

  private applyI18n() {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n!);
    });
    $('#btn-lang').textContent = `${t('menu.lang')}: ${t('lang.' + lang())}`;
    $('#btn-lang2').textContent = `${t('menu.lang')}: ${t('lang.' + lang())}`;
  }

  async cycleLang() {
    const next = LANGS[(LANGS.indexOf(lang()) + 1) % LANGS.length] as Lang;
    await loadLang(next);
    save.update({ lang: next });
  }

  // --- carga ---
  loading(p: number, label?: string) {
    $('#loading-bar').style.width = `${Math.round(p * 100)}%`;
    if (label !== undefined) $('#loading-label').textContent = label;
  }

  async hideLoading() {
    $('#loading').classList.add('fade');
    await sleep(1200);
    show($('#loading'), false);
  }

  // --- título ---
  showTitle(canContinue: boolean): Promise<'new' | 'continue'> {
    show($('#title'));
    show($('#btn-continue'), canContinue);
    return new Promise((res) => {
      const done = (r: 'new' | 'continue') => {
        audio.sfx('ui_confirm');
        show($('#title'), false);
        res(r);
      };
      $('#btn-new').onclick = () => done('new');
      $('#btn-continue').onclick = () => done('continue');
    });
  }

  private showCredits() {
    const c = $('.credits-panel');
    c.innerHTML = t('credits.html');
    show($('#credits'));
  }

  // --- juego ---
  hud(on: boolean) {
    show($('#hud'), on);
    show($('#touch'), on && isTouch);
  }

  objective(text: string) {
    $('#objective').textContent = text;
  }

  pegadas(n: number, total: number, bump = false) {
    $('#pegadas-n').textContent = `${n}/${total}`;
    if (bump) {
      const el = $('#pegadas');
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  prompt(text: string | null) {
    const el = $('#prompt');
    show(el, !!text);
    show($('.tb-action'), !!text && isTouch);
    if (text) el.querySelector('span')!.textContent = text;
  }

  async chapter(kicker: string, title: string) {
    const el = $('#chapter');
    el.querySelector('.ch-kicker')!.textContent = kicker;
    el.querySelector('.ch-title')!.textContent = title;
    show(el, false);
    void el.offsetWidth;
    show(el);
    await sleep(5000);
    show(el, false);
  }

  toast(title: string, sub = '') {
    const el = $('#toast');
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    show(el, false);
    void el.offsetWidth;
    show(el);
    setTimeout(() => show(el, false), 4000);
  }

  // --- subtítulos de cinemática ---
  subtitle(line: string | null, who = '') {
    const el = $('#subtitle');
    if (!line) return show(el, false);
    el.querySelector('.who')!.textContent = who;
    el.querySelector('.line')!.textContent = line;
    show(el, false);
    void el.offsetWidth;
    show(el);
  }

  skipHint(on: boolean) {
    $('#skip').textContent = t(isTouch ? 'ui.skip_touch' : 'ui.skip');
    show($('#skip'), on);
  }

  // --- diálogo con retrato ---
  async say(speaker: Speaker, text: string) {
    const el = $('#dialogue');
    const portrait = el.querySelector<HTMLElement>('.portrait')!;
    portrait.style.backgroundImage = speaker.portrait ? `url(${speaker.portrait})` : '';
    portrait.dataset.initial = speaker.name.slice(0, 1);
    el.querySelector('.who')!.textContent = speaker.name;
    const line = el.querySelector('.line')!;
    show(el);
    line.textContent = '';
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      line.textContent = text.slice(0, i);
      if (i % 3 === 0 && text[i] !== ' ') audio.sfx('ui_hover', { volume: 0.06, rate: 1.4 });
      if (i >= text.length) this.finishTyping();
    }, 26);
    this.typing = { full: text, timer };
    await new Promise<void>((res) => (this.dialogueResolve = res));
    show(el, false);
  }

  private finishTyping() {
    if (!this.typing) return;
    clearInterval(this.typing.timer);
    $('#dialogue .line').textContent = this.typing.full;
    this.typing = null;
  }

  /** Avanza el diálogo: primero completa el texto, luego pasa a la siguiente línea. */
  advanceDialogue() {
    if (this.typing) return this.finishTyping();
    if (this.dialogueResolve) {
      const r = this.dialogueResolve;
      this.dialogueResolve = null;
      audio.sfx('ui_click', { volume: 0.3 });
      r();
    }
  }

  get inDialogue() {
    return this.dialogueResolve !== null;
  }

  /** Llamar cada frame: teclas para avanzar diálogo y pausar. */
  update() {
    if (this.inDialogue && (input.consume('action') || input.consume('jump'))) this.advanceDialogue();
    if (input.consume('pause') && $('#hud').offsetParent !== null) this.setPaused(!this.paused);
  }

  setPaused(p: boolean) {
    this.paused = p;
    show($('#pause'), p);
    if (p) document.exitPointerLock?.();
    this.onPause(p);
  }
}

export const ui = new UI();

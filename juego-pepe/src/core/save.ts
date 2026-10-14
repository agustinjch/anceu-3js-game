import type { Lang } from './i18n';

export interface SaveData {
  lang?: Lang;
  /** Pegadas recuperadas (ids de fase). */
  pegadas: string[];
  /** Último punto de control. */
  checkpoint?: string;
  seenIntro: boolean;
  volume: { music: number; sfx: number };
}

const KEY = 'pepe-pegadas-save-v1';
const defaults = (): SaveData => ({ pegadas: [], seenIntro: false, volume: { music: 0.7, sfx: 0.9 } });

let data: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* almacenamiento no disponible */
  }
  return defaults();
}

export const save = {
  get: () => data,
  update(patch: Partial<SaveData>) {
    data = { ...data, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignorado */
    }
  },
  addPegada(id: string) {
    if (!data.pegadas.includes(id)) save.update({ pegadas: [...data.pegadas, id] });
  },
  reset() {
    const lang = data.lang;
    data = { ...defaults(), lang };
    save.update({});
  },
};

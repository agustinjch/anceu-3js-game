export type Lang = 'gl' | 'es' | 'en';
export const LANGS: Lang[] = ['gl', 'es', 'en'];

type Dict = Record<string, string>;
const dicts: Partial<Record<Lang, Dict>> = {};
let current: Lang = 'gl';
const listeners = new Set<() => void>();

export async function loadLang(lang: Lang): Promise<void> {
  if (!dicts[lang]) {
    const res = await fetch(`i18n/${lang}.json`);
    dicts[lang] = await res.json();
  }
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

export function lang(): Lang {
  return current;
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Traduce una clave. `{nombre}` se sustituye con `vars`. Falla a gallego y luego a la clave. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dicts[current]?.[key] ?? dicts.gl?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function detectLang(): Lang {
  const nav = navigator.language.slice(0, 2);
  return nav === 'es' ? 'es' : nav === 'en' ? 'en' : 'gl';
}

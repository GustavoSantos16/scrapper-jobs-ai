import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'ajh-theme';
export const THEME_LABEL: Record<ThemePreference, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePreference): void {
  if (pref === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', pref);
}

/** Theme preference persisted in localStorage; "system" follows prefers-color-scheme. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(read);
  useEffect(() => apply(pref), [pref]);
  const set = useCallback((next: ThemePreference) => {
    setPref(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this session only */
    }
  }, []);
  const cycle = useCallback(() => set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!), [pref, set]);
  return { pref, set, cycle };
}

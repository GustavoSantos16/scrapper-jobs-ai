import { THEME_LABEL, useTheme, type ThemePreference } from '../lib/theme.ts';
import { Icon, type IconName } from './Icon.tsx';

const ICON: Record<ThemePreference, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

/** Cycles Sistema → Claro → Escuro. */
export function ThemeToggle() {
  const { pref, cycle } = useTheme();
  const next = { system: 'light', light: 'dark', dark: 'system' }[pref] as ThemePreference;
  return (
    <button className="btn btn-ghost" onClick={cycle} title={`Tema: ${THEME_LABEL[pref]} (clique para ${THEME_LABEL[next]})`} aria-label={`Tema atual: ${THEME_LABEL[pref]}. Alternar para ${THEME_LABEL[next]}`}>
      <Icon name={ICON[pref]} />
    </button>
  );
}

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'medivault.dashboard.theme';

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

const DEFAULT_THEME: ThemeMode = 'light';

/**
 * Manages the dashboard's light/dark theme, scoped to the dashboard root
 * (via a `data-mv-theme` attribute) rather than the whole document, so it
 * doesn't affect the marketing site's own theme. Defaults to light — the
 * primary design direction — unless the viewer already chose dark before.
 */
export function useTheme(): { theme: ThemeMode; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme() ?? DEFAULT_THEME);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore write failures (private browsing, storage disabled, etc.)
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    // Several components (mv-tile, mv-icon-btn, mv-nav-item, ...) declare
    // their own `transition: background-color, border-color, box-shadow`
    // for hover/press micro-interactions. Those rules don't know *why* a
    // property changed — they animate a theme swap the same as a hover,
    // which (since text-color isn't in their list) briefly renders new-theme
    // text over an old-theme background: a washed-out, slow-to-settle look,
    // worse the more nodes the page has. Blanket-disable every transition
    // for the two frames the swap takes, so it snaps instead; hover/press
    // transitions resume normally right after.
    if (typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { transition: none !important; }';
      document.head.appendChild(style);
      // Force a reflow so the override is active before the theme (and any
      // resulting style recalculation) actually changes.
      void document.body.offsetHeight;
      setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          style.remove();
        });
      });
    } else {
      setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }
  }, []);

  return { theme, toggleTheme };
}

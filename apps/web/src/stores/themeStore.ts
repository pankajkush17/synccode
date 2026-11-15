import { create } from 'zustand'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'synccode:theme'

type ThemeStore = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Non-fatal: the choice simply will not persist.
  }
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  // The real value is read from <html data-theme> after mount (see useThemeSync).
  theme: 'light',
  setTheme: (theme) => {
    apply(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the
 * wrong scheme: stored choice first, otherwise the OS preference.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`

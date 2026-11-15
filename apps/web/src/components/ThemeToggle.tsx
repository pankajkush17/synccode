'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { type Theme, useThemeStore } from '@/stores/themeStore'

/** Adopts the scheme the boot script already applied to <html>, then keeps the store in charge. */
export function useThemeSync(): Theme {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    const applied = document.documentElement.dataset.theme
    if (applied === 'dark' || applied === 'light') useThemeStore.setState({ theme: applied })
  }, [])
  return theme
}

export function ThemeToggle() {
  const theme = useThemeSync()
  const toggle = useThemeStore((s) => s.toggle)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

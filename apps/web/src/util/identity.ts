const ADJECTIVES = [
  'Swift',
  'Quiet',
  'Bright',
  'Clever',
  'Bold',
  'Calm',
  'Lucky',
  'Keen',
  'Merry',
  'Nimble',
  'Sunny',
  'Witty',
]
const ANIMALS = [
  'Otter',
  'Falcon',
  'Lynx',
  'Heron',
  'Fox',
  'Panda',
  'Koala',
  'Wren',
  'Orca',
  'Gecko',
  'Moth',
  'Ibis',
]

const STORAGE_KEY = 'synccode:name'
export const NAME_MAX_LENGTH = 24

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function randomName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`
}

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH)
}

/** The display name survives reloads; storage failures (private mode) just mean a fresh one. */
export function loadName(): string {
  try {
    const stored = sanitizeName(window.localStorage.getItem(STORAGE_KEY) ?? '')
    if (stored) return stored
  } catch {
    // fall through
  }
  const name = randomName()
  saveName(name)
  return name
}

export function saveName(name: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // Non-fatal: the name simply will not persist.
  }
}

export function initials(name: string): string {
  // Letters and digits only, so "Jun (node B)" gives "JN" rather than "J(".
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  const letters = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

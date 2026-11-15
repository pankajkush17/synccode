export interface PeerColor {
  /** Solid colour: cursor bar, avatar ring, name flag. */
  readonly color: string
  /** Translucent variant: selection highlight. */
  readonly soft: string
}

/**
 * Deterministic peer colours: the same seed always maps to the same palette entry,
 * so every participant sees a given peer in the same colour without coordination.
 */
export class ColorPalette {
  static readonly DEFAULT_COLORS: readonly string[] = [
    '#8b7bff',
    '#ff7a90',
    '#2fd3b8',
    '#ffb454',
    '#4fb3ff',
    '#e58bff',
    '#9bdb5a',
    '#ff9166',
  ]

  static readonly default = new ColorPalette(ColorPalette.DEFAULT_COLORS)

  constructor(private readonly colors: readonly string[]) {
    if (colors.length === 0) throw new Error('ColorPalette needs at least one colour')
  }

  get size(): number {
    return this.colors.length
  }

  pick(seed: string | number): PeerColor {
    const color = this.colors[ColorPalette.hash(String(seed)) % this.colors.length]!
    return { color, soft: `${color}40` }
  }

  /** FNV-1a, 32 bit. Small, fast, well distributed for short strings. */
  static hash(input: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
}

import { describe, expect, it } from 'vitest'
import { ColorPalette } from '../src'

describe('ColorPalette', () => {
  it('is deterministic for a given seed', () => {
    const a = ColorPalette.default.pick('swift-otter')
    const b = ColorPalette.default.pick('swift-otter')
    expect(a).toEqual(b)
  })

  it('always returns a palette member with a soft variant', () => {
    for (let i = 0; i < 200; i++) {
      const { color, soft } = ColorPalette.default.pick(i)
      expect(ColorPalette.DEFAULT_COLORS).toContain(color)
      expect(soft).toBe(`${color}40`)
    }
  })

  it('spreads seeds across the whole palette', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(ColorPalette.default.pick(`peer-${i}`).color)
    expect(seen.size).toBe(ColorPalette.default.size)
  })

  it('rejects an empty palette', () => {
    expect(() => new ColorPalette([])).toThrow()
  })
})

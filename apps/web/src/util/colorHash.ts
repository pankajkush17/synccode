import { ColorPalette, type PeerColor } from '@synccode/shared'

/** Deterministic peer colour: the same seed gives the same colour on every screen. */
export function colorFor(seed: string | number): PeerColor {
  return ColorPalette.default.pick(seed)
}

/** Translucent variant of a solid `#rrggbb` colour, for selection highlights. */
export function softColor(color: string, alphaHex = '40'): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alphaHex}` : color
}

/** Peer-supplied colours are untrusted input that ends up inside a stylesheet. */
export function isSafeColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

import { randomInt } from 'node:crypto'
import { SLUG_LENGTH } from '@synccode/shared'

/** Random room slugs: 10 chars of [a-z0-9] ≈ 51 bits — unguessable enough for read links. */
export class SlugGenerator {
  private static readonly ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

  generate(): string {
    let slug = ''
    for (let i = 0; i < SLUG_LENGTH; i++) {
      slug += SlugGenerator.ALPHABET[randomInt(SlugGenerator.ALPHABET.length)]
    }
    return slug
  }
}

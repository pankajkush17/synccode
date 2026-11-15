import {
  CreateRoomRequestSchema,
  type CreateRoomResponse,
  DEFAULT_LANGUAGE,
  isLanguageId,
  type RoomMeta,
  SlugSchema,
} from '@synccode/shared'
import type { Hono } from 'hono'
import type { TokenService } from '../../auth/TokenService'
import { NotFoundError, ValidationError } from '../../errors'
import { type RoomRepository, SlugTakenError } from '../../persistence/RoomRepository'
import type { SlugGenerator } from '../../rooms/SlugGenerator'

/**
 * `POST /rooms`            → create a room; the edit token is returned exactly once.
 * `GET  /rooms/:slug/meta` → public metadata (never the token hash).
 */
export class RoomsRoutes {
  private static readonly MAX_SLUG_ATTEMPTS = 5

  constructor(
    private readonly rooms: RoomRepository,
    private readonly tokens: TokenService,
    private readonly slugs: SlugGenerator,
  ) {}

  register(app: Hono): void {
    app.post('/rooms', async (c) => {
      const body: unknown = await c.req.json().catch(() => ({}))
      const parsed = CreateRoomRequestSchema.safeParse(body ?? {})
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '))
      }
      const response = await this.createRoom(parsed.data.language, parsed.data.title)
      return c.json(response, 201)
    })

    app.get('/rooms/:slug/meta', async (c) => {
      const slug = SlugSchema.safeParse(c.req.param('slug'))
      if (!slug.success) throw new NotFoundError('room not found')
      const row = await this.rooms.findBySlug(slug.data)
      if (!row) throw new NotFoundError('room not found')

      const meta: RoomMeta = {
        slug: row.slug,
        language: isLanguageId(row.language) ? row.language : DEFAULT_LANGUAGE,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        lastActiveAt: row.lastActiveAt.toISOString(),
      }
      return c.json(meta)
    })
  }

  private async createRoom(
    language = DEFAULT_LANGUAGE,
    title?: string,
  ): Promise<CreateRoomResponse> {
    for (let attempt = 1; ; attempt++) {
      const slug = this.slugs.generate()
      // The token is bound to the slug, so mint per attempt.
      const { token, tokenHash } = this.tokens.mintEditToken(slug)
      try {
        const row = await this.rooms.create({
          slug,
          editTokenHash: tokenHash,
          language,
          title: title ?? null,
        })
        return { slug: row.slug, editToken: token, language, title: row.title }
      } catch (err) {
        if (!(err instanceof SlugTakenError) || attempt >= RoomsRoutes.MAX_SLUG_ATTEMPTS) throw err
      }
    }
  }
}

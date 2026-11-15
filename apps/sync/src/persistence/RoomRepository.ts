import { type DbExecutor, type RoomRow, rooms } from '@synccode/db'
import { eq } from 'drizzle-orm'
import type { Database } from './Database'

export interface NewRoom {
  readonly slug: string
  readonly editTokenHash: string
  readonly language?: string
  readonly title?: string | null
}

export interface RoomMetaPatch {
  language?: string
  title?: string | null
}

const UNIQUE_VIOLATION = '23505'

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`slug already taken: ${slug}`)
    this.name = 'SlugTakenError'
  }
}

/** The `rooms` table. */
export class RoomRepository {
  constructor(private readonly database: Database) {}

  async create(room: NewRoom, executor: DbExecutor = this.database.db): Promise<RoomRow> {
    try {
      const [row] = await executor.insert(rooms).values(room).returning()
      return row!
    } catch (err) {
      if (RoomRepository.isUniqueViolation(err)) throw new SlugTakenError(room.slug)
      throw err
    }
  }

  async findBySlug(slug: string): Promise<RoomRow | null> {
    const [row] = await this.database.db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1)
    return row ?? null
  }

  async touch(id: string, patch: RoomMetaPatch = {}): Promise<void> {
    await this.database.db
      .update(rooms)
      .set({ ...patch, lastActiveAt: new Date() })
      .where(eq(rooms.id, id))
  }

  private static isUniqueViolation(err: unknown): boolean {
    // drizzle wraps driver errors; the pg error (with `.code`) may sit on `.cause`.
    for (let e: unknown = err; e instanceof Error; e = e.cause) {
      if ((e as { code?: string }).code === UNIQUE_VIOLATION) return true
    }
    return false
  }
}

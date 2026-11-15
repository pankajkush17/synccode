import { bigserial, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './bytea'
import { rooms } from './rooms'

export const documentUpdates = pgTable(
  'document_updates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    update: bytea('update').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_updates_room_id').on(t.roomId, t.id)],
)

export type UpdateRow = typeof documentUpdates.$inferSelect

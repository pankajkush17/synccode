import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './bytea'
import { rooms } from './rooms'

export const documentSnapshots = pgTable(
  'document_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    state: bytea('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_snapshots_room_created').on(t.roomId, t.createdAt)],
)

export type SnapshotRow = typeof documentSnapshots.$inferSelect

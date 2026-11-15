import { z } from 'zod'
import { EDIT_TOKEN_PATTERN } from '../auth/TokenShape'
import { isLanguageId, type LanguageId } from './Languages'

export const SLUG_PATTERN = /^[a-z0-9]{10}$/
export const SLUG_LENGTH = 10
export const TITLE_MAX_LENGTH = 80

export const SlugSchema = z.string().regex(SLUG_PATTERN, 'invalid room slug')
export const LanguageSchema = z.custom<LanguageId>(isLanguageId, 'unsupported language')
export const TitleSchema = z.string().trim().min(1).max(TITLE_MAX_LENGTH)

export const CreateRoomRequestSchema = z.object({
  language: LanguageSchema.optional(),
  title: TitleSchema.optional(),
})
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>

export const CreateRoomResponseSchema = z.object({
  slug: SlugSchema,
  editToken: z.string().regex(EDIT_TOKEN_PATTERN),
  language: LanguageSchema,
  title: z.string().nullable(),
})
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>

export const RoomMetaSchema = z.object({
  slug: SlugSchema,
  language: LanguageSchema,
  title: z.string().nullable(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
})
export type RoomMeta = z.infer<typeof RoomMetaSchema>

/**
 * Names shared by client and server for the collaborative document's structure.
 * `content` is the editor text; `meta` holds room-level settings that must sync
 * in real time (language, title).
 */
export const DocKeys = {
  CONTENT: 'content',
  META: 'meta',
  META_LANGUAGE: 'language',
  META_TITLE: 'title',
} as const

/** Shape of each peer's awareness state. Ephemeral — never persisted. */
export interface PresenceUser {
  readonly name: string
  readonly color: string
}

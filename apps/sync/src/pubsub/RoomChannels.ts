import { SLUG_PATTERN } from '@synccode/shared'
import type { EnvelopeKind } from './MessageEnvelope'

export type ChannelTopic = 'updates' | 'awareness'

export interface ParsedChannel {
  readonly slug: string
  readonly topic: ChannelTopic
}

/** Builds Redis channel names (`room:<slug>:<topic>`) and parses them back. */
export class RoomChannels {
  private static readonly PREFIX = 'room'
  private static readonly TOPICS: readonly ChannelTopic[] = ['updates', 'awareness']

  static updates(slug: string): string {
    return `${RoomChannels.PREFIX}:${slug}:updates`
  }

  static awareness(slug: string): string {
    return `${RoomChannels.PREFIX}:${slug}:awareness`
  }

  /** Every channel a node must subscribe to in order to serve a room. */
  static all(slug: string): string[] {
    return [RoomChannels.updates(slug), RoomChannels.awareness(slug)]
  }

  /** Document traffic (updates and sync requests) is kept apart from presence chatter. */
  static forKind(slug: string, kind: EnvelopeKind): string {
    return kind === 'awareness' ? RoomChannels.awareness(slug) : RoomChannels.updates(slug)
  }

  static parse(channel: string): ParsedChannel | null {
    const [prefix, slug, topic, ...rest] = channel.split(':')
    if (prefix !== RoomChannels.PREFIX || rest.length > 0) return null
    if (!slug || !SLUG_PATTERN.test(slug)) return null
    if (!RoomChannels.TOPICS.includes(topic as ChannelTopic)) return null
    return { slug, topic: topic as ChannelTopic }
  }
}

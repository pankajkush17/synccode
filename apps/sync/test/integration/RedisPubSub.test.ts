import { afterEach, describe, expect, inject, it } from 'vitest'
import { NodeIdentity } from '../../src/identity/NodeIdentity'
import { Logger } from '../../src/logging/Logger'
import { MetricsRegistry } from '../../src/metrics/MetricsRegistry'
import type { MessageEnvelope } from '../../src/pubsub/MessageEnvelope'
import { RedisPubSub } from '../../src/pubsub/RedisPubSub'
import { SlugGenerator } from '../../src/rooms/SlugGenerator'
import { sleep, waitFor } from '../helpers/waitFor'

describe('RedisPubSub (real Redis)', () => {
  const open: RedisPubSub[] = []
  const slugs = new SlugGenerator()

  async function node(): Promise<{ pubsub: RedisPubSub; identity: NodeIdentity }> {
    const identity = new NodeIdentity()
    const pubsub = new RedisPubSub(
      inject('redisUrl'),
      identity,
      Logger.silent(),
      new MetricsRegistry({ collectDefaults: false }),
    )
    await pubsub.connect()
    open.push(pubsub)
    return { pubsub, identity }
  }

  afterEach(async () => {
    await Promise.all(open.splice(0).map((p) => p.quit()))
  })

  it('delivers binary payloads to other nodes, stamped with the sender', async () => {
    const a = await node()
    const b = await node()
    const slug = slugs.generate()
    const received: MessageEnvelope[] = []
    await b.pubsub.subscribe(slug, (env) => received.push(env))

    const payload = new Uint8Array([0, 255, 10, 13, 0, 128])
    a.pubsub.publish(slug, 'update', payload)
    a.pubsub.publish(slug, 'awareness', new Uint8Array([1]))
    a.pubsub.publish(slug, 'sync-request', new Uint8Array([2]))

    await waitFor(() => received.length === 3, 'three envelopes')
    const update = received.find((e) => e.kind === 'update')!
    expect(update.nodeId).toBe(a.identity.id)
    expect(Array.from(update.payload)).toEqual(Array.from(payload))
    expect(received.map((e) => e.kind).sort()).toEqual(['awareness', 'sync-request', 'update'])
  })

  it('suppresses a node’s own echo', async () => {
    const a = await node()
    const b = await node()
    const slug = slugs.generate()
    const seenByA: MessageEnvelope[] = []
    const seenByB: MessageEnvelope[] = []
    await a.pubsub.subscribe(slug, (env) => seenByA.push(env))
    await b.pubsub.subscribe(slug, (env) => seenByB.push(env))

    a.pubsub.publish(slug, 'update', new Uint8Array([1]))
    await waitFor(() => seenByB.length === 1, 'delivery to B')
    await sleep(50)
    expect(seenByA).toHaveLength(0)
  })

  it('isolates rooms and stops delivering after unsubscribe', async () => {
    const a = await node()
    const b = await node()
    const [one, two] = [slugs.generate(), slugs.generate()]
    const seen: string[] = []
    await b.pubsub.subscribe(one, () => seen.push('one'))
    await b.pubsub.subscribe(two, () => seen.push('two'))

    a.pubsub.publish(one, 'update', new Uint8Array([1]))
    await waitFor(() => seen.length === 1, 'first delivery')
    expect(seen).toEqual(['one'])

    await b.pubsub.unsubscribe(one)
    a.pubsub.publish(one, 'update', new Uint8Array([1]))
    a.pubsub.publish(two, 'update', new Uint8Array([1]))
    await waitFor(() => seen.includes('two'), 'second room delivery')
    await sleep(50)
    expect(seen).toEqual(['one', 'two'])
  })

  it('answers ping and survives a double quit', async () => {
    const a = await node()
    expect(await a.pubsub.ping()).toBe(true)
    await a.pubsub.quit()
    await a.pubsub.quit()
    expect(await a.pubsub.ping()).toBe(false)
  })
})

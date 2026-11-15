import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { TestCluster } from '../helpers/TestCluster'
import { waitFor } from '../helpers/waitFor'

describe('reconnection and recovery', () => {
  const cluster = new TestCluster()

  afterEach(async () => {
    await cluster.stop()
  })

  it('a dropped client catches up with one small diff and loses nothing', async () => {
    const node = await cluster.startNode('node-a')
    const { slug, editToken } = await cluster.createRoom(node)
    const alice = await cluster.connect(node, slug, editToken)
    const bob = await cluster.connect(node, slug, editToken)

    alice.text.insert(0, 'x'.repeat(20_000))
    await waitFor(() => bob.text.length === 20_000, 'initial sync')

    await bob.disconnect()
    bob.text.insert(0, '[offline edit]') // made while disconnected
    alice.text.insert(alice.text.length, '[while bob was away]')

    await bob.connect() // state-vector handshake
    await waitFor(() => alice.text.toString() === bob.text.toString(), 'post-reconnect convergence')

    const text = bob.text.toString()
    expect(text.startsWith('[offline edit]')).toBe(true)
    expect(text.endsWith('[while bob was away]')).toBe(true)
    expect(text.length).toBe(20_000 + 14 + 20)
    // The catch-up carried only the delta, not the 20 KB document.
    expect(bob.lastSyncStep2Bytes).toBeLessThan(200)
  })

  it('the document survives a full server restart', async () => {
    const first = await cluster.startNode('node-a')
    const { slug, editToken } = await cluster.createRoom(first)
    const alice = await cluster.connect(first, slug, editToken)
    alice.text.insert(0, 'durable text')
    alice.meta.set('language', 'python')
    await alice.ping()
    await cluster.stopNode(first) // graceful: flushes before exit

    const second = await cluster.startNode('node-a2')
    const fresh = await cluster.connect(second, slug, editToken)
    expect(fresh.text.toString()).toBe('durable text')
    expect(fresh.meta.get('language')).toBe('python')

    const meta = await fetch(`${TestCluster.httpUrl(second)}/rooms/${slug}/meta`)
    expect(await meta.json()).toMatchObject({ language: 'python' })
  })

  it('graceful shutdown flushes edits that were still waiting for the debounce', async () => {
    const node = await cluster.startNode('node-a', { FLUSH_INTERVAL_MS: 60_000 })
    const { slug, editToken } = await cluster.createRoom(node)
    const alice = await cluster.connect(node, slug, editToken)
    alice.text.insert(0, 'typed just before SIGTERM')
    await alice.ping()

    const closed = alice.waitForClose()
    await cluster.stopNode(node)
    expect((await closed).code).toBe(1001)

    const next = await cluster.startNode('node-b')
    const fresh = await cluster.connect(next, slug)
    expect(fresh.text.toString()).toBe('typed just before SIGTERM')
  })

  it('a client that reconnects to a different node keeps its offline edits', async () => {
    const [nodeA, nodeB] = await Promise.all([
      cluster.startNode('node-a'),
      cluster.startNode('node-b'),
    ])
    const { slug, editToken } = await cluster.createRoom(nodeA)
    const alice = await cluster.connect(nodeA, slug, editToken)
    alice.text.insert(0, 'before')
    await alice.ping()
    await alice.disconnect()
    alice.text.insert(alice.text.length, ' + offline')

    // Same document, different node — as a load balancer would do.
    const moved = cluster.client(nodeB, slug, editToken)
    // Carry Alice's local state over, as a browser tab holding the doc would.
    Y.applyUpdate(moved.doc, Y.encodeStateAsUpdate(alice.doc))
    await moved.connect()

    const observer = await cluster.connect(nodeA, slug)
    await waitFor(
      () => observer.text.toString() === 'before + offline',
      'offline edit reached node A',
    )
  })

  it('an idle room is evicted and reloads intact', async () => {
    const node = await cluster.startNode('node-a', { IDLE_EVICTION_MS: 50 })
    const { slug, editToken } = await cluster.createRoom(node)
    const alice = await cluster.connect(node, slug, editToken)
    alice.text.insert(0, 'still here after eviction')
    await alice.ping()
    await alice.disconnect()

    await waitFor(() => node.roomManager.size === 0, 'eviction')
    const back = await cluster.connect(node, slug)
    expect(back.text.toString()).toBe('still here after eviction')
    expect(node.roomManager.size).toBe(1)
  })

  it('compaction on a live node keeps the document intact for the next cold start', async () => {
    const node = await cluster.startNode('node-a', {
      COMPACTION_THRESHOLD: 5,
      FLUSH_INTERVAL_MS: 10,
    })
    const { slug, editToken } = await cluster.createRoom(node)
    const alice = await cluster.connect(node, slug, editToken)
    for (let i = 0; i < 30; i++) {
      alice.text.insert(alice.text.length, String(i % 10))
      await alice.ping()
    }
    await waitFor(() => !node.roomManager.peek(slug)!.hasUnflushedChanges, 'flush')
    await node.compaction.runOnce()

    const metrics = await node.metrics.render()
    expect(metrics).toMatch(/^synccode_compactions_total 1$/m)

    await cluster.stopNode(node)
    const next = await cluster.startNode('node-b')
    const fresh = await cluster.connect(next, slug)
    expect(fresh.text.toString()).toBe(alice.text.toString())
    expect(fresh.text.length).toBe(30)
  })
})

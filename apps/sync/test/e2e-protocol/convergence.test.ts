import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SyncServer } from '../../src/SyncServer'
import { TestCluster } from '../helpers/TestCluster'
import { sleep, waitFor } from '../helpers/waitFor'

/**
 * The most important test file in the project: two sync nodes, one Postgres,
 * one Redis. A client on node A and a client on node B must converge — this is
 * the horizontal-scaling claim, proven mechanically.
 */
describe('convergence across nodes', () => {
  const cluster = new TestCluster()
  let nodeA: SyncServer
  let nodeB: SyncServer

  beforeEach(async () => {
    ;[nodeA, nodeB] = await Promise.all([cluster.startNode('node-a'), cluster.startNode('node-b')])
  })

  afterEach(async () => {
    await cluster.stop()
  })

  it('an edit on node A appears on node B, and vice versa', async () => {
    const { slug, editToken } = await cluster.createRoom(nodeA)
    const alice = await cluster.connect(nodeA, slug, editToken)
    const bob = await cluster.connect(nodeB, slug, editToken)
    expect(alice.auth?.nodeId).toBe('node-a')
    expect(bob.auth?.nodeId).toBe('node-b')

    alice.text.insert(0, 'hello from A')
    await waitFor(() => bob.text.toString() === 'hello from A', 'A → B')

    bob.text.insert(bob.text.length, ' / hello from B')
    await waitFor(() => alice.text.toString() === 'hello from A / hello from B', 'B → A')
  })

  it('concurrent typing on both nodes converges to identical text', async () => {
    const { slug, editToken } = await cluster.createRoom(nodeA)
    const alice = await cluster.connect(nodeA, slug, editToken)
    const bob = await cluster.connect(nodeB, slug, editToken)

    // Both type at the same position at the same time — the classic conflict.
    for (let i = 0; i < 100; i++) {
      alice.text.insert(0, 'a')
      bob.text.insert(0, 'b')
      if (i % 10 === 0) await sleep(1)
    }

    await waitFor(
      () => alice.text.length === 200 && alice.text.toString() === bob.text.toString(),
      'convergence',
    )
    const text = alice.text.toString()
    expect(text.replaceAll('b', '')).toBe('a'.repeat(100))
    expect(text.replaceAll('a', '')).toBe('b'.repeat(100))

    // Both nodes hold the same document too.
    const onA = nodeA.roomManager.peek(slug)!.doc.getText('content').toString()
    const onB = nodeB.roomManager.peek(slug)!.doc.getText('content').toString()
    expect(onA).toBe(text)
    expect(onB).toBe(text)
  })

  it('four clients across two nodes all converge, including deletes', async () => {
    const { slug, editToken } = await cluster.createRoom(nodeB)
    const clients = await Promise.all([
      cluster.connect(nodeA, slug, editToken),
      cluster.connect(nodeA, slug, editToken),
      cluster.connect(nodeB, slug, editToken),
      cluster.connect(nodeB, slug, editToken),
    ])

    clients[0]!.text.insert(0, 'the quick brown fox')
    await waitFor(() => clients.every((c) => c.text.length === 19), 'seed text')

    clients[1]!.text.delete(4, 6) // "quick "
    clients[2]!.text.insert(19, ' jumps')
    clients[3]!.text.insert(0, '>> ')

    await waitFor(
      () => clients.every((c) => c.text.toString() === '>> the brown fox jumps'),
      'final text',
    )
  })

  it('persists each update exactly once, on the node where it originated', async () => {
    const { slug, editToken } = await cluster.createRoom(nodeA)
    const alice = await cluster.connect(nodeA, slug, editToken)
    const bob = await cluster.connect(nodeB, slug, editToken)

    for (let i = 0; i < 5; i++) alice.text.insert(alice.text.length, 'a')
    await waitFor(() => bob.text.length === 5, 'A edits on B')
    for (let i = 0; i < 3; i++) bob.text.insert(bob.text.length, 'b')
    await waitFor(() => alice.text.length === 8, 'B edits on A')

    const persisted = async (node: SyncServer) => {
      const metrics = await node.metrics.render()
      return Number(/^synccode_updates_persisted_total (\d+)/m.exec(metrics)?.[1] ?? 0)
    }
    await waitFor(
      async () => (await persisted(nodeA)) + (await persisted(nodeB)) === 8,
      'all flushed',
    )
    expect(await persisted(nodeA)).toBe(5)
    expect(await persisted(nodeB)).toBe(3)
  })

  it('presence crosses nodes and disappears when a peer disconnects', async () => {
    const { slug, editToken } = await cluster.createRoom(nodeA)
    const alice = await cluster.connect(nodeA, slug, editToken)
    const bob = await cluster.connect(nodeB, slug, editToken)

    alice.awareness.setLocalState({ user: { name: 'Alice', color: '#8b7bff' } })
    bob.awareness.setLocalState({ user: { name: 'Bob', color: '#ff7a90' } })

    await waitFor(() => bob.awareness.getStates().has(alice.doc.clientID), 'Alice visible to Bob')
    await waitFor(() => alice.awareness.getStates().has(bob.doc.clientID), 'Bob visible to Alice')
    expect(bob.awareness.getStates().get(alice.doc.clientID)).toEqual({
      user: { name: 'Alice', color: '#8b7bff' },
    })

    await alice.disconnect()
    await waitFor(() => !bob.awareness.getStates().has(alice.doc.clientID), 'Alice gone from Bob')
  })

  it('a peer joining through another node sees who is already there', async () => {
    const { slug, editToken } = await cluster.createRoom(nodeA)
    const alice = await cluster.connect(nodeA, slug, editToken)
    alice.awareness.setLocalState({ user: { name: 'Alice', color: '#8b7bff' } })
    await sleep(50)

    const bob = await cluster.connect(nodeB, slug) // node B loads the room cold
    await waitFor(
      () => bob.awareness.getStates().has(alice.doc.clientID),
      'existing presence on join',
    )
  })

  it('a node that loads a room late receives edits not yet flushed to Postgres', async () => {
    // Node C flushes so rarely that its edits live only in memory during this test.
    const nodeC = await cluster.startNode('node-c', { FLUSH_INTERVAL_MS: 60_000 })
    const { slug, editToken } = await cluster.createRoom(nodeC)
    const carol = await cluster.connect(nodeC, slug, editToken)
    carol.text.insert(0, 'not in postgres yet')
    await carol.ping() // the server has processed the update

    const bob = await cluster.connect(nodeB, slug, editToken)
    await waitFor(() => bob.text.toString() === 'not in postgres yet', 'catch-up via sync request')
  })
})

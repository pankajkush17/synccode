# Scaling walkthrough: an update's journey

Starting state: Alice is connected to **node A**, Bob to **node B**, both in room `abc123def4`.
Alice types `x`.

## The journey

1. **Monaco → Yjs.** `y-monaco` turns the keystroke into an insertion on the shared `Y.Text`. Yjs
   emits an update blob `U` (about 20 bytes).
2. **Client → node A.** `ConnectionManager` wraps it: `UPDATE | roomRef | U`, one binary frame.
3. **Gateway → session.** The socket's `RoomSession` decodes the frame, checks `roomRef`, and checks
   the socket has WRITE permission.
4. **Session → room.** `room.applyRemoteUpdate(U, origin = Alice's session)`.
5. **Room applies it.** `Y.applyUpdate` integrates `U` into node A's copy of the document. The
   document's `update` event fires with the same origin.
6. **Fan-out on node A.** `RoomBroadcaster.onDocUpdate`:
   - sends `UPDATE(U)` to every other local session (none, since Bob is on node B);
   - publishes `MessageEnvelope { nodeId: A, kind: 'update', payload: U }` to `room:abc123def4:updates`.
7. **Persistence is scheduled.** `U` joins the room's dirty set; within 500 ms it is written to
   `document_updates` in a batched `INSERT`.
8. **Redis fans out.** Every node subscribed to that channel receives the message, including node A.
9. **Echo suppression.** Node A reads the envelope header, sees its own `nodeId`, and drops it.
   Without this, A would re-apply and re-publish its own message forever.
10. **Node B applies it.** `room.applyRemoteUpdate(U, origin = REDIS)`.
11. **Fan-out on node B.** The origin is `REDIS`, so node B sends `UPDATE(U)` to all its local
    sessions and does **not** publish or persist. Bob's client applies it; Bob sees `x`.

Hops: one WebSocket send, one Redis publish, one WebSocket send. Measured locally with 50 clients
across two nodes: p50 1.7 ms, p95 4.4 ms.

## Why pub/sub and not streams

Pub/sub is fire-and-forget with no history. That is the right tool here because durability lives in
Postgres. The bus only needs to make hot rooms agree _now_; anything a node misses, it can recover.

## What a node can miss, and how it recovers

Pub/sub drops messages for a subscriber that is not connected. Three gaps exist; each has a closer.

| Gap                                                                            | How it is closed                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A node loads a room while another node holds edits not yet flushed to Postgres | The loading node subscribes **before** it reads Postgres, then publishes a `sync-request` carrying its state vector. Nodes holding the room answer with the diff and their presence states |
| A node's Redis subscriber reconnects after a blip                              | `RedisPubSub.onReconnect` → `RoomManager.resyncAll()` sends a `sync-request` for every hot room                                                                                            |
| A client's socket drops                                                        | The client's next handshake exchanges state vectors with whatever node it lands on                                                                                                         |

All three use the same mechanism: send a state vector, receive a diff.

## Hot and cold rooms

- A room is **hot** on a node while it is in that node's `RoomManager` map.
- When the last socket on a node leaves, the node schedules eviction (`IDLE_EVICTION_MS`, 5 min).
  On eviction it flushes, unsubscribes from the room's channels, and frees the document.
- The next connection anywhere rebuilds the room from Postgres: one snapshot read plus a bounded
  replay of the update log. Later connections to that node hit memory.
- Concurrent first connections share one load (`RoomManager.inflight`). A connection that arrives
  while a room is being evicted waits for the flush, then reloads.

## Who writes what

Every node sees every update, but each node persists only updates that **originated** from its own
clients. Since an update originates on exactly one node, it is written exactly once, with no leader
and no locking. The convergence suite asserts this by counting: five edits through node A and three
through node B produce exactly five and three persisted rows.

## Deploys

On SIGTERM a node fails readiness, stops accepting sockets, closes its clients with `1001`, flushes
every dirty room, then drops Redis and Postgres. Clients reconnect through the load balancer to a
surviving node, exchange state vectors, and continue. The reconnection suite types text, sends
SIGTERM-equivalent shutdown while the flush debounce is still pending, and reads the text back from
a fresh node.

## Limits of this design

- **Fan-out is O(nodes holding the room).** Every hot node receives every update for the room. Fine
  for collaborative editing (rooms are small); a broadcast to 100k viewers would want a different shape.
- **Redis is a single point for liveness, not for data.** If Redis is down, nodes stop seeing each
  other's edits; nothing is lost, and they re-sync when it returns.
- **One Postgres writer per update, but all nodes share one database.** Write volume scales with
  edits, not connections; the batched flush keeps it to a few statements per room per second.

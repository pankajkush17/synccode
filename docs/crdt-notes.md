# CRDT notes

Working notes on why this editor converges. Written to be said out loud at a whiteboard.

## The problem

Two people edit the same text at the same time, each on their own copy. Messages arrive late, out of
order, sometimes twice. Every copy must end up identical, and nobody's keystrokes may be lost.

**Operational transformation** (Google Docs) solves this with a central server that rewrites each
operation against the ones it raced with. It works, but the server is a serialisation point and the
transform functions are notoriously hard to get right.

**CRDTs** take the other route: design the operations so that applying them is _commutative_,
_associative_ and _idempotent_. Then order and duplication stop mattering, and the server needs no
logic at all. In SyncCode the server never inspects an edit. It stores bytes and forwards bytes.

## YATA: how Yjs orders text

A `Y.Text` is a linked list of **items**. Each item has:

- `id = (clientID, clock)` — `clientID` is random per document instance, `clock` counts that
  client's insertions. Globally unique without coordination.
- `origin` — the id of the item that was immediately to the left when it was inserted.
- `rightOrigin` — the id of the item immediately to the right at that moment.
- `content` — the characters.

An insertion does not say "put X at index 5". It says "put X between these two specific items".
Indexes shift as others type; item ids do not.

### The conflict

Alice and Bob both insert at the same spot, between `A` and `B`:

```
Alice:  A [x] B        x.origin = A, x.rightOrigin = B
Bob:    A [y] B        y.origin = A, y.rightOrigin = B
```

Both items claim the same gap. YATA's rule: among items with the same origin, order by `clientID`.
Every replica applies the same rule to the same two ids, so every replica picks the same order
(`A x y B` or `A y x B`, but the _same one_ everywhere). The full rule also handles items whose
origins interleave, so one person's run of characters is never split by another's.

That deterministic tie-break is the whole trick. Convergence is a proven property of the algorithm,
not something that might break under load.

The convergence test types `a` and `b` at position 0 from two nodes at once, a hundred times each,
and checks that both clients and both servers hold the same 200 characters with neither run reordered.

### Deletes

Deleting marks an item as deleted (a tombstone) rather than removing it, so a concurrent insert that
names it as an origin still has something to attach to. Yjs garbage-collects the _content_ of
tombstones and keeps compact delete ranges (the delete set).

## Updates are opaque, mergeable blobs

`Y.encodeStateAsUpdate(doc)` serialises items and the delete set to a compact binary. Properties the
server relies on:

- **Idempotent.** Applying an update twice changes nothing. Replaying the whole log on top of a
  snapshot that already contains half of it is safe.
- **Commutative.** Any order gives the same document. If an update arrives before the one it depends
  on, Yjs parks it as pending and integrates it when the dependency shows up.
- **Mergeable.** Many updates fold into one equivalent update. That is compaction.

This is why persistence can be "append blobs, occasionally squash" and why two nodes can both apply
the same update without coordinating.

## State vectors: why reconnection is cheap

A **state vector** is `Map<clientID, highestClockSeen>`: a few bytes per client that ever edited.

```
client → server   SYNC_STEP_1   "I have Alice up to 41, Bob up to 17"
server → client   SYNC_STEP_2   every item with a higher clock, in one blob
```

`Y.encodeStateAsUpdate(doc, remoteStateVector)` computes exactly that difference. The cost of
catching up is proportional to what was missed, not to the document or to the time away. Offline for
ten minutes while ten thousand operations happened: one message.

The exchange runs in both directions. The server sends its own state vector, and the client answers
with whatever it produced while offline. Nothing is queued on the client; the document _is_ the queue.

The reconnection test holds a 20 KB document, drops a client, edits on both sides, reconnects, and
asserts the catch-up payload is under 200 bytes.

## Awareness is not a CRDT document

Cursor positions, selections, names and colours are ephemeral. Nobody needs yesterday's cursor.
The awareness protocol is separate from document sync:

- Each client owns one entry, keyed by its `clientID`, with a clock. Last write wins per client.
- State is re-broadcast every 15 s; entries not refreshed within 30 s are dropped. A peer that
  vanishes without closing its socket still disappears.
- It is never written to Postgres. The server holds it in memory to greet newcomers.

Cursor positions are stored as **relative positions** (an item id, not an index), so a remote cursor
stays attached to the same character while others type before it.

When a socket closes, its session removes the awareness entries it introduced and that removal is
broadcast (and published to Redis), so peers on every node see the cursor go at once.

## What the server is, and is not

It is a durable fan-out: authenticate, apply, persist, forward. It is not a transform engine and it
is not the source of truth for ordering. Any node can vanish and any other can take over, because
the state is a pure function of the set of updates, and Postgres has the set.

## Limits worth knowing

- **Tombstones.** A document's size reflects its history, not just its text. Snapshots keep it
  compact but cannot make it smaller than the CRDT metadata.
- **Intent.** The merge is deterministic, not clever. Two people rewriting the same line get both
  rewrites, interleaved by run. That is a correct merge and a bad sentence.
- **Undo.** Monaco's undo stack is local and does not know about remote edits; a collaborative undo
  would use `Y.UndoManager` scoped to the local origin.
- **Awareness trust.** A client can claim any name or colour. They are sanitised before rendering
  but not authenticated.

# Architecture

## Topology

```
Browser ──HTTPS──► Next.js (landing, room shell, POST /api/rooms proxy)
   │                              │ HTTP (server side only)
   │ WSS                          ▼
   └───────────────────────► Sync node A ◄──┐
                                  │         │ PUBLISH / SUBSCRIBE
                                  ▼         │
                               Redis ───────┤
                                  ▲         │
                                  │         │
                             Sync node B ◄──┘
                                  │
                                  ▼
                              Postgres   (snapshots + update log)
```

Every sync node is identical. A node holds a room in memory only while someone is connected to it
through that node; the state can be dropped at any time and rebuilt from Postgres. Scaling out means
starting more nodes behind the load balancer. There is no room-to-node assignment anywhere.

## Sync server (`apps/sync`)

Composition root: [`SyncServer`](../apps/sync/src/SyncServer.ts) builds every class once and wires
them by constructor injection. One `SyncServer` is one node; the tests create two in one process.

| Class                                                                                    | Responsibility                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Config`                                                                                 | Parse and validate the environment once (zod); typed getters                          |
| `Logger`                                                                                 | Pino wrapper; `child()` for per-room / per-session context; redacts tokens            |
| `HttpServer`                                                                             | Hono app, CORS, body limit; hands `Upgrade` requests to the gateway                   |
| `HealthRoutes`, `MetricsRoutes`, `RoomsRoutes`                                           | `/healthz` `/readyz`, `/metrics`, `POST /rooms` + `GET /rooms/:slug/meta`             |
| `WebSocketGateway`                                                                       | Validate path and origin, resolve the room, decide READ/WRITE from the token, upgrade |
| `RoomSession`                                                                            | One per socket: decode frames, enforce permission, route into the `Room`              |
| `MessageCodec`                                                                           | Server face of the shared frame codec; maps decode errors to `ProtocolError`          |
| `HeartbeatManager`                                                                       | ws ping/pong; terminates sockets that stop answering                                  |
| `BackpressureGuard`                                                                      | Disconnects a socket whose send buffer grows past the limit                           |
| `RoomManager`                                                                            | `Map<slug, Room>`; lazy load with de-duplicated in-flight loads; idle eviction        |
| `Room`                                                                                   | Owns the `Y.Doc` and `Awareness`; applies updates; dirty-set and debounced flush      |
| `RoomHydrator`                                                                           | Snapshot + remaining update rows → `Y.Doc`                                            |
| `RoomBroadcaster`                                                                        | Fan-out to local sockets and, for local changes, to Redis                             |
| `RedisPubSub`                                                                            | Two ioredis connections (pub, sub); envelope + echo suppression; reconnect hook       |
| `RoomChannels`, `MessageEnvelope`                                                        | Channel naming; `nodeId (16)                                                          | kind (1) | payload` |
| `Database`, `RoomRepository`, `UpdateRepository`, `SnapshotRepository`                   | Drizzle access                                                                        |
| `CompactionJob`                                                                          | Fold the update log into a snapshot, transactionally                                  |
| `TokenService`                                                                           | Mint and verify HMAC edit tokens                                                      |
| `NodeIdentity`                                                                           | One UUID per process                                                                  |
| `MetricsRegistry`                                                                        | prom-client metrics on a private registry                                             |
| `GracefulShutdown`                                                                       | Ordered teardown on SIGTERM/SIGINT                                                    |
| `DomainError` → `NotFoundError`, `UnauthorizedError`, `ProtocolError`, `ValidationError` | Expected failures with a `kind` and an HTTP status                                    |

### Update origins

The origin attached to a Yjs transaction decides what a node does with the change:

| Origin                                         | Send to local sockets | Publish to Redis | Persist |
| ---------------------------------------------- | --------------------- | ---------------- | ------- |
| a `RoomSession` (a client on this node)        | all but the sender    | yes              | yes     |
| `UpdateOrigin.REDIS` (another node)            | all                   | no               | no      |
| `UpdateOrigin.HYDRATE` (loading from Postgres) | —                     | no               | no      |

Each node persists only what its own clients produced. Every update is seen by every node but
originates on exactly one, so it is written exactly once with no coordination.

## Wire protocol

All frames are binary: `type (1 byte) | roomRef (2 bytes, big-endian) | payload`.
The layout is implemented once, in [`packages/shared/src/protocol/Codec.ts`](../packages/shared/src/protocol/Codec.ts),
and used by both ends.

| Type                    | Direction               | Payload                         |
| ----------------------- | ----------------------- | ------------------------------- |
| `SYNC_STEP_1` (0)       | either                  | state vector                    |
| `SYNC_STEP_2` (1)       | reply                   | update (the diff)               |
| `UPDATE` (2)            | either                  | update                          |
| `AWARENESS` (3)         | either                  | awareness update                |
| `AUTH_ACK` (4)          | server → client         | JSON `{ permission, nodeId }`   |
| `ERROR` (5)             | server → client         | JSON `{ kind, message }`        |
| `PING` (6) / `PONG` (7) | client → server / reply | opaque (the client's send time) |

Handshake:

```
client                                   server
  │ ── GET /ws/<slug>?t=<token> ───────────► │  resolve room, verify token
  │ ◄───────────── AUTH_ACK(roomRef) ────── │  + current presence
  │ ── SYNC_STEP_1(my state vector) ──────► │
  │ ◄────────── SYNC_STEP_2(diff for me) ── │  client is now OPEN
  │ ◄──── SYNC_STEP_1(server state vector)  │  (writers only)
  │ ── SYNC_STEP_2(diff for server) ──────► │  carries edits made offline
  │ ◄──────────── UPDATE / AWARENESS ─────► │
```

Close codes: `4400` protocol violation, `4401` invalid edit token, `4404` no such room. These are
fatal: the client does not retry. Anything else triggers reconnect with exponential backoff.
Authorisation failures complete the WebSocket handshake and then close, because browsers hide the
HTTP status of a failed upgrade.

## Data model

```
rooms              id, slug (unique), edit_token_hash, language, title, created_at, last_active_at
document_updates   id bigserial, room_id → rooms, update bytea, created_at      index (room_id, id)
document_snapshots id, room_id → rooms, state bytea, created_at
```

- **Write path.** `Room` collects locally originated updates and writes them in one batched
  `INSERT` at most every `FLUSH_INTERVAL_MS`. A failed batch is kept in order and retried.
- **Read path.** Latest snapshot, then every remaining update row, streamed by id in batches.
- **Compaction.** In one transaction, under `pg_try_advisory_xact_lock(room)`: take `max(id)`,
  rebuild the document from the previous snapshot plus rows up to that id, insert the new snapshot,
  delete those rows and older snapshots. Rows inserted concurrently have higher ids and survive.

## Authorisation

```
roomSecret = 32 random bytes                              (exists only during room creation)
token      = base64url(HMAC-SHA256(roomSecret, 'edit:' + slug))    → returned once
tokenHash  = hex(HMAC-SHA256(EDIT_SECRET, slug + ':' + token))     → stored
```

The edit link is `/r/<slug>#t=<token>`. The fragment is never sent to a web server, so the token
stays out of access logs and `Referer`. No fragment means a READ socket; the server rejects
`UPDATE` and `SYNC_STEP_2` from READ sockets and closes them. A wrong token is refused, not downgraded.

## Web client (`apps/web`)

| Layer                | Files                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Views                | `TopBar`, `PeerAvatars`, `RemoteCursors`, `StatusBar`, `DisconnectBanner`, `ShareModal`, `EditorView`  |
| Hooks                | `useYjsDoc`, `useAwareness`, `useConnection`, `useRoomSettings`, `useMonacoEditor`, `useYMonacoBridge` |
| Stores (Zustand)     | `connectionStore`, `editorStore`, `presenceStore`, `themeStore`                                        |
| Framework-free logic | `ConnectionManager`, `ExponentialBackoff`, `protocolCodec`, `colorHash`, `slug`                        |

`ConnectionManager` is a plain class (state machine, backoff, heartbeat); `useConnection` only ties
its lifetime to a component. Connection state machine:

```
IDLE ──start──► CONNECTING ──auth-ack──► SYNCING ──sync-step-2──► OPEN
                    ▲                                               │
                    └────────── backoff ── RECONNECTING ◄── close ──┘
```

## Shutdown order

1. Fail readiness and refuse new sockets.
2. Stop the compaction and heartbeat timers.
3. Close every socket with `1001` (clients reconnect to another node) and flush every dirty room.
4. Quit Redis, then close the Postgres pool.
5. Release the port.

A hard deadline (`SHUTDOWN_GRACE_MS`, default 25 s) keeps this under the orchestrator's 30 s SIGKILL.

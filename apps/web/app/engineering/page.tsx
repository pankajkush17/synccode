import type { Metadata } from 'next'
import Link from 'next/link'
import { ConvergenceLab } from '@/components/engineering/ConvergenceLab'
import {
  CompactionFigure,
  DataTable,
  FrameLayout,
  Handshake,
  Mono,
  Section,
  StateMachine,
} from '@/components/engineering/figures'
import { KeystrokeJourney } from '@/components/engineering/KeystrokeJourney'
import { Footer } from '@/components/landing/Footer'
import { CONTAINER } from '@/components/layout'
import { MeasuredStats } from '@/components/MeasuredStats'
import { SiteHeader } from '@/components/SiteHeader'
import { cn } from '@/util/cn'

export const metadata: Metadata = {
  title: 'Engineering',
  description:
    'How SyncCode works: CRDTs, a binary WebSocket protocol, stateless sync nodes sharing rooms over Redis pub/sub, and an update log compacted into snapshots in Postgres.',
}

const CONTENTS = [
  ['journey', 'One keystroke, end to end'],
  ['convergence', 'Why edits never conflict'],
  ['protocol', 'The wire protocol'],
  ['scaling', 'Any server, any room'],
  ['persistence', 'Storing a history'],
  ['failure', 'What happens when things break'],
  ['links', 'Share links without accounts'],
  ['proof', 'Every claim has a test'],
  ['decisions', 'What changed along the way'],
] as const

export default function EngineeringPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader current="engineering" />

      <main className={cn(CONTAINER, 'flex-1 pb-16')}>
        <header className="pt-6 pb-10 lg:pt-10">
          <h1 className="max-w-3xl font-display text-[clamp(2.1rem,4.6vw,3.5rem)] leading-[1.06] font-semibold tracking-[-0.03em] text-balance">
            How a keystroke reaches everyone, on any server, in a few milliseconds
          </h1>
          <p className="mt-5 max-w-[68ch] text-lg leading-relaxed text-muted">
            SyncCode is a horizontally scaled WebSocket backend. Identical, stateless sync nodes
            share each room over Redis pub/sub; Yjs CRDTs guarantee that every copy of a document
            converges no matter which node a client lands on; Postgres keeps the history. This page
            walks through how each part works, and how each claim is proven.
          </p>

          <MeasuredStats className="mt-8" />
        </header>

        <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="On this page" className="hidden lg:block">
            <ul className="sticky top-8 flex flex-col gap-1 border-l border-line text-sm">
              {CONTENTS.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-4 text-muted hover:border-brand hover:text-ink"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <Section
              id="journey"
              title="One keystroke, end to end"
              lede="Alice and Bob are in the same room but connected to different servers. Follow a single character from Alice’s keyboard to Bob’s screen. Select a step, or let it play."
            >
              <KeystrokeJourney />
            </Section>

            <Section
              id="convergence"
              title="Why edits never conflict"
              lede={
                <>
                  The document is a CRDT (Yjs). An insert does not say “put x at index 5”; it says
                  “put x between these two specific characters”, and every character has a globally
                  unique id of <Mono>(clientID, clock)</Mono>. When two people insert into the same
                  gap, a deterministic tie-break on client id orders them the same way on every
                  machine. So the server never resolves anything: it stores bytes and forwards
                  bytes. Try it. These are two real Yjs documents running in this page.
                </>
              }
            >
              <ConvergenceLab />
              <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-muted">
                The line under each box is that copy’s{' '}
                <strong className="font-medium text-ink">state vector</strong>: how many operations
                from each author it has seen. On reconnect the two sides swap vectors and each sends
                only what the other lacks. That is why a client that was offline for ten minutes
                catches up with one small message instead of a replay.
              </p>
            </Section>

            <Section
              id="protocol"
              title="The wire protocol"
              lede="Every message is one binary WebSocket frame with a three-byte header. Yjs updates are already compact binary, so they are forwarded as they are. The frame layout is implemented once, in a shared package that both the browser and the server import."
            >
              <FrameLayout />
              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-center">
                <Handshake />
                <ul className="flex flex-col gap-4 text-sm leading-relaxed text-muted">
                  <li>
                    <strong className="font-medium text-ink">The server speaks first.</strong>{' '}
                    AUTH_ACK tells the client its permission and the roomRef to stamp on every later
                    frame.
                  </li>
                  <li>
                    <strong className="font-medium text-ink">Sync runs in both directions.</strong>{' '}
                    Each side sends a state vector and gets a diff back, so offline edits flow up as
                    well as down.
                  </li>
                  <li>
                    <strong className="font-medium text-ink">
                      Presence is a separate message type.
                    </strong>{' '}
                    Cursors and names are ephemeral: routed to an awareness object, never to
                    Postgres.
                  </li>
                </ul>
              </div>
            </Section>

            <Section
              id="scaling"
              title="Any server, any room"
              lede="There is no room-to-server assignment and no sticky sessions. A node holds a room in memory only while someone is connected through it, and rebuilds it from Postgres on demand. What a node does with a change depends only on where the change came from."
            >
              <DataTable
                head={[
                  'Where the change came from',
                  'Send to local sockets',
                  'Publish to Redis',
                  'Write to Postgres',
                ]}
                rows={[
                  ['A client on this node', 'All except the sender', 'Yes', 'Yes'],
                  [
                    'Another node, via Redis',
                    'All',
                    'No (it would loop)',
                    'No (the origin node writes it)',
                  ],
                  ['Postgres, while loading', 'Nobody is attached yet', 'No', 'No'],
                ]}
              />
              <p className="mt-4 max-w-[68ch] text-sm leading-relaxed text-muted">
                Every update is seen by every node but originates on exactly one, so it is persisted
                exactly once with no leader election and no locks. A test counts it: five edits
                through node A and three through node B produce five and three rows.
              </p>

              <h3 className="mt-9 font-display text-lg font-semibold tracking-tight">
                Pub/sub forgets. The system does not.
              </h3>
              <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted">
                Redis pub/sub has no history, so a node can miss messages. There are three ways that
                happens, and all three are closed by the same move: send a state vector, receive a
                diff.
              </p>
              <div className="mt-4">
                <DataTable
                  head={['The gap', 'How it is closed']}
                  rows={[
                    [
                      'A node loads a room while another node holds edits not yet flushed',
                      'It subscribes before reading Postgres, then publishes a sync-request with its state vector. Nodes holding the room answer with the diff.',
                    ],
                    [
                      'A node’s Redis connection blips',
                      'On reconnect it sends a sync-request for every room it holds.',
                    ],
                    [
                      'A client’s socket drops',
                      'Its next handshake exchanges state vectors with whichever node it reaches.',
                    ],
                  ]}
                />
              </div>
            </Section>

            <Section
              id="persistence"
              title="Storing a document that is really a history"
              lede="Saving the whole file on every keystroke would be simple and ruinous. Instead each room buffers its updates and writes them as one batched INSERT at most every 500 ms. A background job folds the log into a snapshot once it passes 1,000 rows."
            >
              <CompactionFigure />
              <ol className="mt-6 grid gap-x-8 gap-y-3 text-sm leading-relaxed text-muted sm:grid-cols-2">
                {[
                  'Take a per-room advisory lock, so two nodes never compact the same room at once.',
                  'Read max(id): the cut. Everything at or below it goes into the snapshot.',
                  'Rebuild the document from the previous snapshot plus those rows, from Postgres only.',
                  'Insert the new snapshot, delete rows up to the cut and the old snapshot, commit.',
                ].map((text, index) => (
                  <li key={text} className="flex gap-3">
                    <span className="font-mono text-brand">{index + 1}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-muted">
                Building the snapshot from the database, rather than from a node’s memory, matters:
                memory may be missing another node’s rows. A test runs ten compactions concurrently
                with ten writers and checks the reloaded document character for character.
              </p>
            </Section>

            <Section
              id="failure"
              title="What happens when things break"
              lede="Most of the server exists for the unhappy paths. Each has one class responsible for it."
            >
              <div className="mb-7">
                <StateMachine />
              </div>
              <DataTable
                head={['Failure', 'What the system does', 'Where']}
                rows={[
                  [
                    'A client loses its connection',
                    'Keeps editing locally, reconnects with exponential backoff and jitter, then syncs by state vector. Nothing is queued: the document is the queue.',
                    <Mono key="c">ConnectionManager</Mono>,
                  ],
                  [
                    'A server is deployed (SIGTERM)',
                    'Fails readiness, refuses new sockets, closes clients with 1001, flushes every dirty room, then drops Redis and Postgres. Clients land on another node.',
                    <Mono key="c">GracefulShutdown</Mono>,
                  ],
                  [
                    'A laptop lid closes without a FIN',
                    'Protocol pings every 30 s; a socket that misses one is terminated and its cursor removed for everyone.',
                    <Mono key="c">HeartbeatManager</Mono>,
                  ],
                  [
                    'A client reads slower than the room writes',
                    'Its send buffer is capped at 4 MB. Past that it is disconnected, and catches up by diff when it returns.',
                    <Mono key="c">BackpressureGuard</Mono>,
                  ],
                  [
                    'A Postgres write fails',
                    'The batch is kept, in order, ahead of newer edits, and retried. Editing continues meanwhile.',
                    <Mono key="c">Room.flush</Mono>,
                  ],
                  [
                    'Fifty people open a cold room at once',
                    'They share one load from Postgres instead of racing fifty.',
                    <Mono key="c">RoomManager</Mono>,
                  ],
                  [
                    'A client sends garbage or writes without permission',
                    'It gets an ERROR frame and close code 4400. The room is untouched.',
                    <Mono key="c">RoomSession</Mono>,
                  ],
                ]}
              />
            </Section>

            <Section
              id="links"
              title="Share links without accounts"
              lede="A room has two links. Holding the edit link is the permission; there is no user table. The edit token lives in the URL fragment, which browsers never send to a server, so it stays out of access logs and Referer headers."
            >
              <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed text-ink">
                {`roomSecret = 32 random bytes                              exists only while the room is created
token      = base64url( HMAC(roomSecret, "edit:" + slug) )   returned once, as  /r/<slug>#t=<token>
tokenHash  = hex( HMAC(SERVER_SECRET, slug + ":" + token) )  the only thing stored`}
              </pre>
              <ul className="mt-5 grid gap-x-8 gap-y-3 text-sm leading-relaxed text-muted sm:grid-cols-2">
                <li>
                  No fragment means a read-only socket. The server rejects its UPDATE and
                  SYNC_STEP_2 frames and disconnects it.
                </li>
                <li>A wrong token is refused, not quietly downgraded to read-only.</li>
                <li>
                  Verification is constant-time, and a leaked database cannot be turned back into
                  working links.
                </li>
                <li>
                  Names and colours from other users are treated as untrusted input and sanitised
                  before rendering.
                </li>
              </ul>
            </Section>

            <Section
              id="proof"
              title="Every claim has a test"
              lede="107 automated tests run against a real Postgres and a real Redis, plus 12 browser tests that drive two Chromium contexts. The most important file starts two sync nodes in one process and checks that clients on different nodes converge."
            >
              <DataTable
                head={['Claim', 'What proves it']}
                rows={[
                  [
                    'Clients on different servers converge',
                    'Two nodes, concurrent inserts at the same position 100 times each; both clients and both servers must hold the same 200 characters.',
                  ],
                  [
                    'Reconnection costs a diff, not a replay',
                    'Drop a client from a 20 KB document, edit on both sides, reconnect; the catch-up payload must be under 200 bytes.',
                  ],
                  [
                    'A restart loses nothing',
                    'Type, shut the node down while the write is still debounced, start a fresh node, read the text back.',
                  ],
                  [
                    'Each update is written once',
                    'Count persisted rows per node after edits through each.',
                  ],
                  [
                    'Compaction is safe under load',
                    'Ten compactions racing ten writers; reloaded text must match exactly.',
                  ],
                  [
                    'View-only really is view-only',
                    'A read socket forges UPDATE and SYNC_STEP_2 frames; both are rejected and the document is unchanged. Repeated in a real browser.',
                  ],
                  [
                    'Presence crosses servers',
                    'A cursor set on node A appears on node B and disappears when its socket closes.',
                  ],
                ]}
              />
            </Section>

            <Section
              id="decisions"
              title="What changed along the way"
              lede="The first design had three flaws that only showed up once it was running. Each is now covered by a test."
            >
              <div className="grid gap-x-8 gap-y-7 md:grid-cols-3">
                {[
                  {
                    title: 'A cold node could miss fresh edits',
                    body: 'A node loading a room read Postgres, but another node’s last half-second of edits was still in memory. Fix: a third bus message, sync-request, that asks peers for the diff.',
                  },
                  {
                    title: 'Compaction trusted memory and clocks',
                    body: 'Snapshotting the in-memory document and deleting by timestamp can drop another node’s rows. Fix: rebuild from Postgres up to a row id, in one transaction, under a lock.',
                  },
                  {
                    title: 'The client spoke too early',
                    body: 'The design had the client send first, before it knew its roomRef. Fix: the server opens with AUTH_ACK and the client syncs after it.',
                  },
                ].map((item) => (
                  <article key={item.title} className="border-t-2 border-line pt-4">
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                  </article>
                ))}
              </div>

              <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-accent-soft p-6">
                <p className="max-w-md font-display text-xl font-semibold tracking-tight">
                  The quickest way to check all of this is to open a room in two windows.
                </p>
                <Link
                  href="/"
                  className="inline-flex h-11 items-center rounded-xl bg-accent px-5 font-medium text-accent-ink hover:bg-accent-hover"
                >
                  Start a room
                </Link>
              </div>
            </Section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

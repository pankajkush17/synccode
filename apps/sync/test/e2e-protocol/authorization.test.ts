import { CloseCode, MessageType, RoomMetaSchema } from '@synccode/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as Y from 'yjs'
import type { SyncServer } from '../../src/SyncServer'
import { TestCluster } from '../helpers/TestCluster'
import { sleep, waitFor } from '../helpers/waitFor'

describe('share-link authorization and HTTP API', () => {
  const cluster = new TestCluster()
  let node: SyncServer

  beforeAll(async () => {
    node = await cluster.startNode('node-a', { ALLOWED_ORIGINS: 'http://localhost:3000' })
  })

  afterAll(async () => {
    await cluster.stop()
  })

  it('the edit token grants write; no token grants read', async () => {
    const { slug, editToken } = await cluster.createRoom(node)
    const editor = await cluster.connect(node, slug, editToken)
    const viewer = await cluster.connect(node, slug)
    expect(editor.auth?.permission).toBe('write')
    expect(viewer.auth?.permission).toBe('read')

    editor.text.insert(0, 'visible to viewers')
    await waitFor(() => viewer.text.toString() === 'visible to viewers', 'viewer receives edits')
  })

  it('a read-only socket that tries to write is rejected and disconnected', async () => {
    const { slug, editToken } = await cluster.createRoom(node)
    const editor = await cluster.connect(node, slug, editToken)
    const viewer = await cluster.connect(node, slug)

    const forged = new Y.Doc()
    forged.getText('content').insert(0, 'forged')
    const closed = viewer.waitForClose()
    viewer.sendRaw(MessageType.UPDATE, Y.encodeStateAsUpdate(forged))

    expect((await closed).code).toBe(CloseCode.PROTOCOL_ERROR)
    expect(viewer.errors[0]).toMatchObject({
      kind: 'protocol',
      message: 'write on read-only socket',
    })
    await sleep(50)
    expect(editor.text.toString()).toBe('')
    expect(node.roomManager.peek(slug)!.doc.getText('content').toString()).toBe('')
  })

  it('a read-only socket cannot smuggle a write through SYNC_STEP_2 either', async () => {
    const { slug } = await cluster.createRoom(node)
    const viewer = await cluster.connect(node, slug)
    const forged = new Y.Doc()
    forged.getText('content').insert(0, 'forged')
    const closed = viewer.waitForClose()
    viewer.sendRaw(MessageType.SYNC_STEP_2, Y.encodeStateAsUpdate(forged))
    expect((await closed).code).toBe(CloseCode.PROTOCOL_ERROR)
  })

  it('an invalid token is refused rather than downgraded', async () => {
    const { slug, editToken } = await cluster.createRoom(node)
    const other = await cluster.createRoom(node)

    for (const bad of [
      'A'.repeat(43),
      other.editToken,
      `${editToken.slice(0, -1)}${editToken.endsWith('A') ? 'B' : 'A'}`,
    ]) {
      const client = cluster.client(node, slug, bad)
      await expect(client.connect()).rejects.toThrow(String(CloseCode.UNAUTHORIZED))
      expect(client.errors[0]?.kind).toBe('unauthorized')
    }
  })

  it('an unknown room closes with NOT_FOUND', async () => {
    const client = cluster.client(node, 'zzzzzzzzzz')
    await expect(client.connect()).rejects.toThrow(String(CloseCode.NOT_FOUND))
  })

  it('rejects bad paths and disallowed origins at the HTTP layer', async () => {
    const { slug } = await cluster.createRoom(node)
    const attempt = (url: string, origin?: string) =>
      new Promise<number>((resolve) => {
        const ws = new WebSocket(url, origin ? { origin } : {})
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
        ws.on('open', () => {
          ws.close()
          resolve(101)
        })
        ws.on('error', () => {})
      })

    const base = `ws://127.0.0.1:${node.port}`
    expect(await attempt(`${base}/ws/NOT-A-SLUG`)).toBe(404)
    expect(await attempt(`${base}/elsewhere`)).toBe(404)
    expect(await attempt(`${base}/ws/${slug}`, 'http://evil.example')).toBe(403)
    expect(await attempt(`${base}/ws/${slug}`, 'http://localhost:3000')).toBe(101)
  })

  it('garbage frames close the socket without harming the room', async () => {
    const { slug, editToken } = await cluster.createRoom(node)
    const editor = await cluster.connect(node, slug, editToken)
    const vandal = await cluster.connect(node, slug, editToken)

    const closed = vandal.waitForClose()
    vandal.sendRaw(MessageType.UPDATE, new Uint8Array([255, 255, 255, 255, 255, 255]))
    expect((await closed).code).toBe(CloseCode.PROTOCOL_ERROR)

    editor.text.insert(0, 'room still works')
    const check = await cluster.connect(node, slug)
    await waitFor(() => check.text.toString() === 'room still works', 'room healthy')
  })

  it('answers application pings', async () => {
    const { slug } = await cluster.createRoom(node)
    const client = await cluster.connect(node, slug)
    expect(await client.ping()).toBeGreaterThanOrEqual(0)
  })

  describe('HTTP', () => {
    const url = () => TestCluster.httpUrl(node)

    it('POST /rooms creates a room and returns the token once', async () => {
      const room = await cluster.createRoom(node, { language: 'python', title: 'Interview' })
      expect(room.language).toBe('python')
      expect(room.title).toBe('Interview')

      const res = await fetch(`${url()}/rooms/${room.slug}/meta`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(RoomMetaSchema.parse(body)).toMatchObject({
        slug: room.slug,
        language: 'python',
        title: 'Interview',
      })
      expect(JSON.stringify(body)).not.toContain('oken')
    })

    it('validates input and maps errors to the documented shape', async () => {
      const bad = await fetch(`${url()}/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: 'klingon' }),
      })
      expect(bad.status).toBe(400)
      expect(await bad.json()).toMatchObject({ status: 'error', kind: 'validation' })

      const missing = await fetch(`${url()}/rooms/zzzzzzzzzz/meta`)
      expect(missing.status).toBe(404)
      expect(await missing.json()).toMatchObject({ status: 'error', kind: 'not_found' })

      const malformed = await fetch(`${url()}/rooms/..%2Fetc/meta`)
      expect(malformed.status).toBe(404)

      const unknown = await fetch(`${url()}/nope`)
      expect(unknown.status).toBe(404)
      expect(await unknown.json()).toMatchObject({ status: 'error', kind: 'not_found' })
    })

    it('accepts an empty POST body', async () => {
      const res = await fetch(`${url()}/rooms`, { method: 'POST' })
      expect(res.status).toBe(201)
    })

    it('exposes health, readiness and metrics', async () => {
      expect(await (await fetch(`${url()}/healthz`)).json()).toEqual({
        status: 'ok',
        node: 'node-a',
      })
      expect(await (await fetch(`${url()}/readyz`)).json()).toEqual({
        status: 'ready',
        node: 'node-a',
        checks: { postgres: true, redis: true },
      })
      const metrics = await (await fetch(`${url()}/metrics`)).text()
      expect(metrics).toContain('synccode_ws_connections')
      expect(metrics).toContain('synccode_broadcast_latency_seconds_bucket')
    })

    it('sends CORS headers only for allowed origins', async () => {
      const allowed = await fetch(`${url()}/healthz`, {
        headers: { origin: 'http://localhost:3000' },
      })
      expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
      const denied = await fetch(`${url()}/healthz`, { headers: { origin: 'http://evil.example' } })
      expect(denied.headers.get('access-control-allow-origin')).toBeNull()
    })
  })
})

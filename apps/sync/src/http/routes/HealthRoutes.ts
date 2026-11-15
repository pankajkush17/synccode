import type { Hono } from 'hono'
import type { NodeIdentity } from '../../identity/NodeIdentity'

export interface ReadinessProbe {
  readonly name: string
  check(): Promise<boolean>
}

/**
 * `/healthz` — liveness: the process is up and its event loop turns.
 * `/readyz`  — readiness: dependencies answer and we are not draining. Load
 *              balancers stop routing here the moment shutdown begins.
 */
export class HealthRoutes {
  constructor(
    private readonly identity: NodeIdentity,
    private readonly probes: readonly ReadinessProbe[],
    private readonly isDraining: () => boolean,
  ) {}

  register(app: Hono): void {
    app.get('/healthz', (c) => c.json({ status: 'ok', node: this.identity.name }))

    app.get('/readyz', async (c) => {
      if (this.isDraining()) return c.json({ status: 'draining', node: this.identity.name }, 503)

      const results = await Promise.all(
        this.probes.map(async (probe) => [probe.name, await probe.check()] as const),
      )
      const ready = results.every(([, ok]) => ok)
      return c.json(
        {
          status: ready ? 'ready' : 'unavailable',
          node: this.identity.name,
          checks: Object.fromEntries(results),
        },
        ready ? 200 : 503,
      )
    })
  }
}

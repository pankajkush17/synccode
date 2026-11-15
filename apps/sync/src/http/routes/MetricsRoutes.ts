import type { Hono } from 'hono'
import type { MetricsRegistry } from '../../metrics/MetricsRegistry'

/** `/metrics` in Prometheus text format. */
export class MetricsRoutes {
  constructor(private readonly metrics: MetricsRegistry) {}

  register(app: Hono): void {
    app.get('/metrics', async (c) =>
      c.body(await this.metrics.render(), 200, { 'Content-Type': this.metrics.contentType }),
    )
  }
}

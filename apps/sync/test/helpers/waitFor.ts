/** Polls until `predicate` is truthy; fails with `label` after `timeoutMs`. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label = 'condition',
  timeoutMs = 5_000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await sleep(intervalMs)
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

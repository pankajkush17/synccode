import { expect, test } from '@playwright/test'

test('the landing page links to the engineering page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Write code together')
  await page.getByRole('banner').getByRole('link', { name: 'Engineering' }).click()
  await expect(page).toHaveURL(/\/engineering$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'How a keystroke reaches everyone',
  )
})

test('the convergence lab diverges offline and merges on reconnect', async ({ page }) => {
  await page.goto('/engineering')
  const alice = page.getByTestId('lab-text-0')
  const bob = page.getByTestId('lab-text-1')
  await expect(page.getByTestId('lab-status')).toHaveText('In sync')

  // Linked: a keystroke in one copy appears in the other.
  await alice.pressSequentially('// hi ')
  await expect(bob).toHaveValue(/\/\/ hi /)
  expect(await bob.inputValue()).toBe(await alice.inputValue())

  // Both insert at the same position while apart.
  await page.getByRole('button', { name: 'Both type at the same spot' }).click()
  await expect(page.getByTestId('lab-status')).toHaveText('Diverged')
  expect(await alice.inputValue()).not.toBe(await bob.inputValue())

  await page.getByTestId('lab-reconnect').click()
  await expect(page.getByTestId('lab-status')).toHaveText('In sync')
  const merged = await alice.inputValue()
  expect(merged).toBe(await bob.inputValue())
  expect(merged).toContain('tax + ')
  expect(merged).toContain('shipping + ')
})

test('the keystroke journey can be stepped through', async ({ page }) => {
  await page.goto('/engineering')
  await page.getByRole('button', { name: /Node A publishes to Redis/ }).click()
  await expect(page.getByRole('img', { name: /Step 4/ })).toBeVisible()
  await expect(page.getByText('nodeId (16) │ kind (1) │ U')).toBeVisible()
})

for (const path of ['/', '/engineering']) {
  test(`${path} fits a phone screen without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await page.goto(path)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('the header button starts a room from any page', async ({ page }) => {
  await page.goto('/engineering')
  await page.getByTestId('start-room-header').click()
  await page.waitForURL(/\/r\/[a-z0-9]{10}#t=/)
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'OPEN')
})

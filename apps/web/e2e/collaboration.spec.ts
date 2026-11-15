import { type Browser, expect, type Page, test } from '@playwright/test'

/** Text of the Monaco document, in line order, with Monaco's non-breaking spaces normalised. */
async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.monaco-editor .view-line')]
    return lines
      .sort((a, b) => a.offsetTop - b.offsetTop)
      .map((line) => (line.textContent ?? '').replace(/ /g, ' '))
      .join('\n')
  })
}

async function waitUntilConnected(page: Page): Promise<void> {
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'OPEN')
  await expect(page.locator('.monaco-editor textarea')).toBeAttached()
}

async function type(page: Page, text: string): Promise<void> {
  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

/** Creates a room from the landing page; returns its edit URL and view-only URL. */
async function startRoom(page: Page): Promise<{ editUrl: string; viewUrl: string }> {
  await page.goto('/')
  await page.getByTestId('start-room').click()
  await page.waitForURL(/\/r\/[a-z0-9]{10}#t=/)
  await waitUntilConnected(page)
  const editUrl = page.url()
  return { editUrl, viewUrl: editUrl.split('#')[0]! }
}

async function join(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await waitUntilConnected(page)
  return page
}

test('two people in one room see each other’s edits and presence', async ({ page, browser }) => {
  const { editUrl } = await startRoom(page)
  const guest = await join(browser, editUrl)

  // Presence: each sees two avatars and the count in the status bar.
  await expect(page.getByTestId('peer-avatar')).toHaveCount(2)
  await expect(guest.getByTestId('peer-avatar')).toHaveCount(2)
  await expect(page.getByTestId('editor-count')).toHaveText('2 people here')

  await type(page, 'const host = 1')
  await expect.poll(() => editorText(guest)).toContain('const host = 1')

  await type(guest, ' // guest was here')
  await expect.poll(() => editorText(page)).toContain('const host = 1 // guest was here')
  expect(await editorText(page)).toBe(await editorText(guest))

  // The guest's cursor is drawn in the host's editor, labelled with a name.
  await expect(page.locator('.yRemoteSelectionHead')).toHaveCount(1)
  await expect
    .poll(() => page.getByTestId('remote-cursor-styles').evaluate((style) => style.textContent))
    .toMatch(/\.yRemoteSelectionHead-\d+::after \{ content: "[^"]+"/)

  // Leaving removes the avatar.
  await guest.context().close()
  await expect(page.getByTestId('peer-avatar')).toHaveCount(1)
})

test('a view-only link shows live edits but blocks typing', async ({ page, browser }) => {
  const { viewUrl } = await startRoom(page)
  const viewer = await join(browser, viewUrl)

  await expect(viewer.getByTestId('read-only-badge')).toBeVisible()
  await expect(viewer.getByTestId('language-picker')).toBeDisabled()

  await type(page, 'visible to viewers')
  await expect.poll(() => editorText(viewer)).toContain('visible to viewers')

  // Typing in the viewer changes nothing, anywhere.
  await viewer.locator('.monaco-editor .view-lines').click()
  await viewer.keyboard.type('SHOULD NOT APPEAR')
  await viewer.waitForTimeout(500)
  expect(await editorText(viewer)).not.toContain('SHOULD NOT APPEAR')
  expect(await editorText(page)).not.toContain('SHOULD NOT APPEAR')

  // A viewer can only hand out the view-only link.
  await viewer.getByTestId('share-button').click()
  await expect(viewer.getByTestId('tab-edit')).toBeDisabled()
  await expect(viewer.getByTestId('share-url')).toHaveValue(viewUrl)
})

test('the document and its language survive a reload', async ({ page }) => {
  await startRoom(page)
  await type(page, 'print("persisted")')

  await page.getByTestId('language-picker').click()
  await page.getByRole('option', { name: 'Python' }).click()
  await expect(page.getByTestId('language-picker')).toContainText('Python')

  // Give the debounced flush time to reach Postgres, then come back cold.
  await page.waitForTimeout(1200)
  await page.reload()
  await waitUntilConnected(page)
  await expect.poll(() => editorText(page)).toContain('print("persisted")')
  await expect(page.getByTestId('language-picker')).toContainText('Python')
})

test('a language change reaches the other person', async ({ page, browser }) => {
  const { editUrl } = await startRoom(page)
  const guest = await join(browser, editUrl)

  await page.getByTestId('language-picker').click()
  await page.getByRole('option', { name: 'Rust' }).click()
  await expect(guest.getByTestId('language-picker')).toContainText('Rust')
})

test('the share dialog offers an edit link and a view-only link', async ({ page }) => {
  const { editUrl, viewUrl } = await startRoom(page)
  await page.getByTestId('share-button').click()
  await expect(page.getByTestId('share-url')).toHaveValue(editUrl)

  await page.getByTestId('tab-view').click()
  await expect(page.getByTestId('share-url')).toHaveValue(viewUrl)
})

test('a forged edit token is refused', async ({ page }) => {
  const { viewUrl } = await startRoom(page)
  await page.goto(`${viewUrl}#t=${'A'.repeat(43)}`)
  await page.reload()
  await expect(page.getByTestId('fatal-banner')).toContainText(
    'This edit link is not valid for this room',
  )
  await expect(page.getByTestId('connection-status')).toContainText('Disconnected')
})

test('an unknown room shows the not-found page', async ({ page }) => {
  const response = await page.goto('/r/zzzzzzzzzz')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'This room does not exist' })).toBeVisible()
})

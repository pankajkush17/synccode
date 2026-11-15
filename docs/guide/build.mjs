// Builds the learning guide PDF from the HTML fragments in this folder.
//   pnpm --filter @synccode/web exec node ../../docs/guide/build.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Playwright is a dependency of apps/web; resolve it from wherever the command is run.
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test')

const html = readdirSync(here)
  .filter((name) => /^\d\d-.*\.html$/.test(name))
  .sort()
  .map((name) => readFileSync(join(here, name), 'utf8'))
  .join('\n')
const source = join(here, 'guide.html')
writeFileSync(source, html)

const footer = `<div style="width:100%;font:8px -apple-system,Helvetica,Arial,sans-serif;color:#8a8d98;padding:0 18mm;display:flex;justify-content:space-between"><span>SyncCode: a learning guide</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
const output = join(here, '..', 'SyncCode-Learning-Guide.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(source).href)
await page.pdf({ path: output, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer, preferCSSPageSize: true })
await browser.close()
console.log(`wrote ${output}`)

import * as monaco from 'monaco-editor'

export const LIGHT_THEME = 'synccode-light'
export const DARK_THEME = 'synccode-dark'

/**
 * Monaco runs its language services in web workers. Bundling them from the
 * installed package (rather than a CDN) keeps the editor self-hosted and the
 * `monaco` instance identical to the one y-monaco imports.
 *
 * Monaco is mounted directly rather than through @monaco-editor/react: that
 * wrapper disposes its editor in an effect cleanup but does not recreate it
 * when React re-runs effects (StrictMode, Fast Refresh), which crashes the page.
 */
function createWorker(label: string): Worker {
  switch (label) {
    case 'json':
      return new Worker(
        new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
        { type: 'module' },
      )
    case 'css':
    case 'scss':
    case 'less':
      return new Worker(
        new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url),
        { type: 'module' },
      )
    case 'html':
    case 'handlebars':
    case 'razor':
      return new Worker(
        new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url),
        { type: 'module' },
      )
    case 'typescript':
    case 'javascript':
      return new Worker(
        new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url),
        { type: 'module' },
      )
    default:
      return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
        type: 'module',
      })
  }
}

function defineThemes(): void {
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8a8fae', fontStyle: 'italic' },
      { token: 'keyword', foreground: '5b45f0' },
      { token: 'string', foreground: '0c8f6f' },
      { token: 'number', foreground: 'c2570c' },
      { token: 'type', foreground: '0b78c2' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#14152b',
      'editor.lineHighlightBackground': '#f6f6f8',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#b3b7cf',
      'editorLineNumber.activeForeground': '#5d6283',
      'editorCursor.foreground': '#5b45f0',
      'editor.selectionBackground': '#5b45f033',
      'editorIndentGuide.background1': '#eceef7',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#dde0ee',
      'scrollbarSlider.background': '#14152b1f',
      'scrollbarSlider.hoverBackground': '#14152b33',
    },
  })

  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6f7499', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a094ff' },
      { token: 'string', foreground: '2fd3b8' },
      { token: 'number', foreground: 'ffb454' },
      { token: 'type', foreground: '4fb3ff' },
    ],
    colors: {
      'editor.background': '#121317',
      'editor.foreground': '#eceefb',
      'editor.lineHighlightBackground': '#191a20',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#4a4f7a',
      'editorLineNumber.activeForeground': '#9a9fc4',
      'editorCursor.foreground': '#8b7bff',
      'editor.selectionBackground': '#8b7bff44',
      'editorIndentGuide.background1': '#1c1d23',
      'editorWidget.background': '#1c1d23',
      'editorWidget.border': '#25272e',
      'scrollbarSlider.background': '#eceefb1f',
      'scrollbarSlider.hoverBackground': '#eceefb33',
    },
  })
}

let initialised = false

/** Idempotent one-time setup; must run in the browser before the first editor mounts. */
export function setupMonaco(): typeof monaco {
  if (initialised) return monaco
  initialised = true

  self.MonacoEnvironment = { getWorker: (_workerId, label) => createWorker(label) }
  defineThemes()

  // A shared scratch file has no project around it: unresolved imports are not errors here.
  const diagnostics = { noSemanticValidation: true, noSyntaxValidation: false }
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnostics)
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnostics)

  return monaco
}

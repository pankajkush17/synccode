export interface LanguageOption {
  /** Monaco language id. */
  readonly id: string
  readonly label: string
}

export const LANGUAGES = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'shell', label: 'Shell' },
  { id: 'plaintext', label: 'Plain text' },
] as const satisfies readonly LanguageOption[]

export type LanguageId = (typeof LANGUAGES)[number]['id']

export const DEFAULT_LANGUAGE: LanguageId = 'typescript'

const LANGUAGE_IDS: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.id))

export function isLanguageId(value: unknown): value is LanguageId {
  return typeof value === 'string' && LANGUAGE_IDS.has(value)
}

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id
}

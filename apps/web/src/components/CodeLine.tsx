import type { ReactNode } from 'react'

const TOKEN =
  /(\/\/.*$)|('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(function|const|let|return|import|from|export|new|await|async|if|for|of|test|expect)\b|\b(\d+)\b/gm

const CLASS = [
  'text-muted italic',
  'text-ok',
  'text-brand',
  'text-[#c2570c] dark:text-[#ffb454]',
] as const

/** Just enough syntax colouring for the marketing snippets; the real editor uses Monaco. */
export function CodeLine({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) out.push(text.slice(last, index))
    const group = match.slice(1).findIndex((g) => g !== undefined)
    out.push(
      <span key={index} className={CLASS[group]}>
        {match[0]}
      </span>,
    )
    last = index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

import { cn } from '@/util/cn'

/** Two carets side by side: two people, one line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-6', className)}>
      <rect x="6" y="3" width="3" height="18" rx="1.5" fill="#8b7bff" />
      <rect x="15" y="3" width="3" height="18" rx="1.5" fill="#ff7a90" />
      <rect x="6" y="10.5" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.18" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink',
        className,
      )}
    >
      <LogoMark />
      SyncCode
    </span>
  )
}

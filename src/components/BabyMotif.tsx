/** Motivos decorativos: ignorados por leitores de tela e sem interação. */
export function BabyMotif({ variant = 'welcome', small = false }: { variant?: 'welcome' | 'stars' | 'bear' | 'leaf'; small?: boolean }) {
  return <svg className={`baby-motif${small ? ' baby-motif-small' : ''}`} viewBox="0 0 200 80" fill="none" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="var(--motif-stroke)" strokeLinecap="round" strokeLinejoin="round">
    {variant === 'welcome' && <>
      <path d="M56 62h79c16 0 20-19 6-24-3-19-29-20-34-4-13-15-36-6-35 10-14-6-28 13-16 18Z" fill="var(--color-surface)" />
      <path d="M151 12c-13 0-18 18-5 24 7 3 13-1 15-6-14 3-20-9-10-18Z" fill="var(--color-champagne)" stroke="var(--color-champagne)" />
      <path d="m39 15 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" />
      <path d="M95 49c-7-8-16 1-8 8l8 6 8-6c8-7-1-16-8-8Z" fill="var(--color-blush)" />
    </>}
    {variant === 'stars' && <>
      <path d="m100 16 6 18 18 6-18 6-6 18-6-18-18-6 18-6Z" />
      <path d="m49 31 3 7 7 2-7 2-3 7-2-7-7-2 7-2Zm101 0 3 7 7 2-7 2-3 7-2-7-7-2 7-2Z" stroke="var(--color-champagne)" />
    </>}
    {variant === 'bear' && <>
      <path d="M78 30c-18-17-26 7-12 14-12 32 56 44 67 11 3-8 0-16-4-21 13-16-9-30-19-12-11-3-24 0-32 8Z" />
      <path d="M91 47h1m20 0h1m-16 8q5 6 10 0m-5 4v5m-7 0q7 6 14 0" />
    </>}
    {variant === 'leaf' && <>
      <path d="M68 67q14-27 61-52M86 43q-26-5-22-25 22 1 22 25Zm14-13q-9-23 8-28 10 15-8 28Zm-4 5q25-10 33 7-20 10-33-7ZM76 58q24-9 34 7-19 10-34-7Z" />
    </>}
  </svg>
}

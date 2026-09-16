// Barra só visual: o número correspondente precisa estar escrito ao lado.
export function Progress({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const filled = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0
  const complete = max > 0 && value >= max
  return <div className={`meter ${complete ? 'meter-complete' : ''} ${className}`.trim()} aria-hidden="true"><span style={{ width: `${filled}%` }} /></div>
}

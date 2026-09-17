// Barra de progresso. Sem `label` é decorativa (o número está escrito ao lado);
// com `label`, vira progressbar com o valor por extenso para o leitor de tela.
export function Progress({ value, max, label, className = '' }: { value: number; max: number; label?: string; className?: string }) {
  const filled = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0
  const complete = max > 0 && value >= max
  const a11y = label
    ? { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.min(value, max), 'aria-valuetext': label }
    : { 'aria-hidden': true }
  return <div className={`meter ${complete ? 'meter-complete' : ''} ${className}`.trim()} {...a11y}><span style={{ width: `${filled}%` }} /></div>
}

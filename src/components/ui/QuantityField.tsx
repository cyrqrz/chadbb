import { useId } from 'react'

// Stepper: − | valor | + num único controle. O valor continua editável pelo
// teclado; nos limites, − e + usam aria-disabled para não soltar o foco.
// `busy` (envio em curso) bloqueia sem `disabled`, para o foco não ir ao body.
export function QuantityField({ label = 'Quantidade', context, unit, value, onChange, min = 1, max, disabled = false, busy = false }: {
  label?: string; context?: string; unit: string; value: string; onChange: (value: string) => void; min?: number; max: number; disabled?: boolean; busy?: boolean
}) {
  const id = useId()
  const labelId = `${id}-rotulo`
  const number = /^[0-9]+$/.test(value) ? Number(value) : null
  const atMin = busy || number === null || number <= min
  const atMax = busy || number !== null && number >= max
  // Campo vazio ou inválido: o + recomeça do mínimo.
  const step = (delta: number) => onChange(String(number === null ? min : Math.min(max, Math.max(min, number + delta))))
  return <div className="field">
    <label id={labelId} htmlFor={id}>{label}{context && <span className="sr-only"> de {context}</span>}</label>
    <div className="stepper" role="group" aria-labelledby={labelId}>
      <button type="button" className="btn-icon" aria-label={`Diminuir ${unit}`} aria-controls={id} disabled={disabled} aria-disabled={!disabled && atMin ? true : undefined} onClick={() => { if (!atMin) step(-1) }}><span aria-hidden="true">−</span></button>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} required disabled={disabled} readOnly={busy} aria-disabled={busy || undefined} value={value} onChange={e => { if (!busy) onChange(e.target.value) }} />
      <button type="button" className="btn-icon" aria-label={`Aumentar ${unit}`} aria-controls={id} disabled={disabled} aria-disabled={!disabled && atMax ? true : undefined} onClick={() => { if (!atMax) step(1) }}><span aria-hidden="true">+</span></button>
    </div>
  </div>
}

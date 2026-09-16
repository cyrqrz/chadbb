import { useId } from 'react'
import type { ReactNode } from 'react'

export type FieldControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }

// Rótulo, dica e erro ligados ao controle por id; o controle vem do chamador.
export function Field({ label, hint, error, children }: {
  label: ReactNode; hint?: ReactNode; error?: string; children: (props: FieldControlProps) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-dica`
  const errorId = `${id}-erro`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
    {hint && <span id={hintId} className="hint">{hint}</span>}
    {error && <span id={errorId} className="field-error">{error}</span>}
  </div>
}

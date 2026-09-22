import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'

type Props = {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// G5.1: `<dialog>` nativo no lugar de `window.confirm` — foco preso e Esc vêm
// de graça, sem dependência nova (Radix não está instalado). O foco de volta ao
// botão que abriu não é garantido pelo navegador, então é feito à mão.
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancelar', tone = 'default', busy = false, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) { restoreFocus.current = document.activeElement as HTMLElement | null; dialog.showModal() }
    else if (!open && dialog.open) { dialog.close(); restoreFocus.current?.focus(); restoreFocus.current = null }
  }, [open])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Esc dispara `cancel`, cancelável, antes do `close` nativo: intercepta aqui
    // para que o fechamento passe sempre por `onCancel`.
    const cancel = (e: Event) => { e.preventDefault(); onCancel() }
    dialog.addEventListener('cancel', cancel)
    return () => dialog.removeEventListener('cancel', cancel)
  }, [onCancel])
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
    onClick={e => { if (e.target === ref.current) onCancel() }}>
    <h2 id={titleId} className="text-h3">{title}</h2>
    {description && <p id={descId} className="mt-2 text-muted">{description}</p>}
    <div className="mt-5 confirm-dialog-actions">
      <Button variant="ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
      <Button variant={tone === 'danger' ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </dialog>
}

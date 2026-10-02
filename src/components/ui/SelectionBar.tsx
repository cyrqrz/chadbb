import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'

// Barra de ações em lote (padrão do Shopify Polaris e afins): caixa “Selecionar todos”
// (marcada, parcial ou vazia), a contagem ao lado e a ação na mesma linha; no celular, a
// ação desce para a largura toda. Ação destrutiva confirma ali mesmo (`confirm`), com o
// foco na pergunta; a que só inclui (sem `confirm`) age direto.
export function SelectionBar({ label, count, total, onAll, action, confirm, children, className = 'mt-8' }: {
  label: string; count: number; total: number; onAll: (on: boolean) => void
  action: { label: ReactNode; icon: ReactNode; variant: 'danger' | 'secondary'; busy?: boolean; disabled?: boolean; expanded?: boolean; onClick: () => void }
  confirm?: { question: ReactNode; label: ReactNode; icon: ReactNode; busy: boolean; onConfirm: () => void; onCancel: () => void } | null
  children?: ReactNode; className?: string
}) {
  const question = useRef<HTMLParagraphElement>(null)
  const all = useRef<HTMLInputElement>(null)
  const asking = !!confirm
  useEffect(() => { if (asking) question.current?.focus() }, [asking])
  const partial = count > 0 && count < total
  useEffect(() => { if (all.current) all.current.indeterminate = partial }, [partial])
  return <section aria-label={label} className={`card selection-bar ${className}`}>
    <div className="selection-head">
      <label className="choice selection-all"><input ref={all} type="checkbox" checked={count > 0 && count === total} onChange={e => onAll(e.target.checked)} />Selecionar todos</label>
      <p className="selection-count" aria-live="polite">{count ? `${count} selecionado${count === 1 ? '' : 's'}` : 'Nenhum selecionado'}</p>
      <Button variant={action.variant} size="sm" className="selection-action" busy={action.busy} disabled={action.disabled} aria-expanded={action.expanded} onClick={action.onClick}>{action.icon}{action.label}</Button>
    </div>
    {confirm && <div className="card-disclosure selection-confirm">
      <p ref={question} tabIndex={-1}>{confirm.question}</p>
      <div className="flow-actions">
        <Button variant="danger" size="sm" className="btn-danger-strong" busy={confirm.busy} onClick={confirm.onConfirm}>{confirm.icon}{confirm.label}</Button>
        <Button variant="ghost" size="sm" disabled={confirm.busy} onClick={confirm.onCancel}>Cancelar</Button>
      </div>
    </div>}
    {children}
  </section>
}

import type { ReactNode } from 'react'

// Estados das telas com o mesmo acabamento. Só o carregamento inicial, o erro e o
// sucesso usam região viva; a atualização periódica aparece sem anúncio, para o
// leitor de tela não repetir a página a cada consulta.

export function LoadingState({ children }: { children: ReactNode }) {
  return <p role="status" className="state state-loading"><span className="spinner" aria-hidden="true" />{children}</p>
}

export function ErrorState({ title, message, onRetry, retryLabel = 'Tentar novamente', busy = false }: {
  title?: string; message: ReactNode; onRetry?: () => void; retryLabel?: string; busy?: boolean
}) {
  return <div role="alert" className="state state-error">
    {title && <p className="font-semibold">{title}</p>}
    <p>{message}</p>
    {onRetry && <button type="button" className="secondary" disabled={busy} onClick={onRetry}>{retryLabel}</button>}
  </div>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="state state-empty"><p className="font-semibold">{title}</p>{children && <div className="text-stone-600">{children}</div>}</div>
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  return <p role="status" className="state state-success">{children}</p>
}

// Texto visível sem região viva: indica que a tela está sendo reconsultada e,
// se a última consulta falhou, avisa que os dados são da consulta anterior.
export function RefreshStatus({ fetching, failed, onRetry, label = 'Atualizando…' }: {
  fetching: boolean; failed: boolean; onRetry: () => void; label?: string
}) {
  if (failed) return <div role="alert" className="state state-error mt-4">
    <p>Não foi possível atualizar. Os dados abaixo são da última consulta.</p>
    {/* Texto fixo: a região de alerta é relida a cada mudança, e a tela tenta de novo sozinha. */}
    <button type="button" className="secondary" disabled={fetching} onClick={onRetry}>Tentar novamente</button>
  </div>
  return <p className="refresh-status" aria-hidden={!fetching}>{fetching ? label : ''}</p>
}

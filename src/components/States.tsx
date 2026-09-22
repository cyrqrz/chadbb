import { useDelayedFlag } from '../lib/useDelayedFlag'
import type { ReactNode } from 'react'
import { Button } from './ui/Button'

// Estados das telas com o mesmo acabamento. Só o carregamento inicial, o erro e o
// sucesso usam região viva; a atualização periódica aparece sem anúncio, para o
// leitor de tela não repetir a página a cada consulta.

export function LoadingState({ children }: { children: ReactNode }) {
  return <p role="status" className="state state-loading"><span className="spinner" aria-hidden="true" />{children}</p>
}

export function ErrorState({ title, message, onRetry, retryLabel = 'Tentar novamente', busy = false }: {
  title?: string; message: ReactNode; onRetry?: () => void; retryLabel?: string; busy?: boolean
}) {
  return <>
    <div role="alert" className="state state-error">
      {title && <p className="font-semibold">{title}</p>}
      <p>{message}</p>
      {onRetry && <Button variant="secondary" busy={busy} onClick={onRetry}>{retryLabel}</Button>}
    </div>
    {/* A14: fora do `alert` de propósito — um teste garante zero mutações ali durante a
        tentativa (automática ou manual), para o aviso de erro não ser relido. O botão fica
        aria-disabled sem trocar de nome (foco e outros testes dependem do nome fixo); quem
        usa leitor de tela ouve a tentativa em andamento por aqui, num `status` à parte. */}
    {busy && <span role="status" className="sr-only">Tentando de novo…</span>}
  </>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="state state-empty"><p className="font-semibold">{title}</p>{children && <div className="text-stone-600">{children}</div>}</div>
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  return <p role="status" className="state state-success">{children}</p>
}

// Texto visível sem região viva: indica que a tela está sendo reconsultada e,
// se a última consulta falhou, avisa que os dados são da consulta anterior.
// `message` e `retryLabel` distinguem avisos que podem aparecer juntos na mesma tela.
export function RefreshStatus({ fetching, failed, onRetry, label = 'Atualizando…', message = 'Não foi possível atualizar. Os dados abaixo são da última consulta.', retryLabel = 'Tentar novamente' }: {
  fetching: boolean; failed: boolean; onRetry: () => void; label?: string; message?: string; retryLabel?: string
}) {
  if (failed) return <>
    <div role="alert" className="state state-error mt-4">
      <p>{message}</p>
      {/* Texto fixo: a região de alerta é relida a cada mudança, e a tela tenta de novo sozinha. */}
      <Button variant="secondary" busy={fetching} onClick={onRetry}>{retryLabel}</Button>
    </div>
    {/* A14: fora do `alert` — mesmo motivo do `ErrorState`. */}
    {fetching && <span role="status" className="sr-only">Tentando de novo…</span>}
  </>
  return <SlowRefresh fetching={fetching} label={label} />
}

// Espaço sempre reservado: o aviso aparece só em reconsulta lenta e não empurra a tela.
export function SlowRefresh({ fetching, label = 'Atualizando…', className = '' }: { fetching: boolean; label?: string; className?: string }) {
  const slow = useDelayedFlag(fetching)
  return <p className={`refresh-status ${className}`.trim()} aria-hidden={!slow}>{slow ? label : ''}</p>
}

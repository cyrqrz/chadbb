import type { ReactNode } from 'react'

export type StatusTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger'
const icons: Record<StatusTone, string> = { brand: '•', neutral: '•', success: '✓', warning: '!', danger: '×' }

// Estado com ícone e texto: a cor nunca é a única pista.
// `icon` troca o ícone padrão do tom quando dois selos do mesmo tom dizem coisas diferentes.
export function StatusBadge({ tone = 'brand', icon, children }: { tone?: StatusTone; icon?: string; children: ReactNode }) {
  return <span className={tone === 'brand' ? 'badge' : `badge badge-${tone}`}><span aria-hidden="true">{icon ?? icons[tone]}</span>{children}</span>
}

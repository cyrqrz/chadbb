import { useId } from 'react'
import type { ReactNode } from 'react'

// Seção aberta (sem caixa): título, descrição curta e conteúdo.
export function Section({ title, description, children, className = '', level = 2 }: {
  title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; level?: 2 | 3
}) {
  const id = useId()
  const Heading = level === 2 ? 'h2' : 'h3'
  return <section aria-labelledby={id} className={`section ${className}`.trim()}>
    <Heading id={id} className="section-title">{title}</Heading>
    {description && <p className="section-description">{description}</p>}
    {children}
  </section>
}

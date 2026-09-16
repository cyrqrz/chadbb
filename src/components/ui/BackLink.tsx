import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Alvo de toque de 44 px; a seta é decorativa e fica fora do nome acessível.
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="back-link"><span aria-hidden="true">←</span>{children}</Link>
}

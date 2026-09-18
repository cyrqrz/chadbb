import { Button } from './Button'

// Nas pontas, `busy` (aria-disabled) em vez de `disabled`: quem chega à última
// página pelo teclado continua com o foco no botão, e não volta ao topo.
export function Pagination({ page, count, pageSize, onChange, label }: {
  page: number; count: number; pageSize: number; onChange: (page: number) => void; label: string
}) {
  if (count <= pageSize) return null
  return <nav aria-label={label} className="mt-6 flex flex-wrap items-center gap-4">
    <Button variant="secondary" busy={page === 0} onClick={() => onChange(page - 1)}>Anterior</Button>
    <span>Página {page + 1} de {Math.ceil(count / pageSize)}</span>
    <Button variant="secondary" busy={(page + 1) * pageSize >= count} onClick={() => onChange(page + 1)}>Próxima</Button>
  </nav>
}

export function Pagination({ page, count, pageSize, onChange, label }: {
  page: number; count: number; pageSize: number; onChange: (page: number) => void; label: string
}) {
  if (count <= pageSize) return null
  return <nav aria-label={label} className="mt-6 flex flex-wrap items-center gap-4">
    <button type="button" className="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</button>
    <span>Página {page + 1} de {Math.ceil(count / pageSize)}</span>
    <button type="button" className="secondary" disabled={(page + 1) * pageSize >= count} onClick={() => onChange(page + 1)}>Próxima</button>
  </nav>
}

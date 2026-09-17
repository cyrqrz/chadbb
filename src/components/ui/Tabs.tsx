// Abas em pílula como botões com aria-pressed: o conteúdo troca na mesma página.
export function Tabs<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void
}) {
  return <nav aria-label={label}><div className="segmented">
    {options.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}
  </div></nav>
}

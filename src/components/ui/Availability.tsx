import { Progress } from './Progress'

// Disponibilidade padrão dos cards: texto primeiro, barra como complemento.
// Os números vêm prontos do servidor; o card não faz conta.
export function Availability({ available, limit, committed, unit }: { available: number; limit: number; committed: number; unit: string }) {
  return <div className="availability">
    <p className="availability-text">{available} de {limit} disponíveis</p>
    <Progress value={committed} max={limit} label={`${committed} de ${limit} ${unit} reservados`} />
  </div>
}

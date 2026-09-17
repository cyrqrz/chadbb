// Espaço reservado enquanto carrega; o anúncio fica a cargo do LoadingState.
export function Skeleton({ width = '100%', height = '1rem' }: { width?: string; height?: string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />
}

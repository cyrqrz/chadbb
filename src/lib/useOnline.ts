import { useEffect, useState } from 'react'

// G5.3: `navigator.onLine` só reflete a interface de rede do dispositivo, não se o
// servidor responde — por isso o banner avisa que a página está offline, mas as
// telas continuam reconsultando sozinhas quando a conexão volta (`refetchOnReconnect`
// em src/lib/query.ts) em vez de prometer que tudo já está salvo.
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => {
    function set() { setOnline(navigator.onLine) }
    window.addEventListener('online', set)
    window.addEventListener('offline', set)
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set) }
  }, [])
  return online
}

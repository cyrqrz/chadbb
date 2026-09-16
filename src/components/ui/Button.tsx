import type { ButtonHTMLAttributes } from 'react'

// Hierarquia (G2.1): uma `primary` por contexto; `secondary` para ações
// importantes; `ghost` para auxiliares; `danger` para destrutivas; `icon` só
// com nome acessível; `link` só para ação dentro de uma frase.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'link'
const variants: Record<ButtonVariant, string> = {
  primary: 'button', secondary: 'secondary', ghost: 'btn-ghost', danger: 'btn-danger', icon: 'btn-icon', link: 'text-link',
}
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; size?: 'md' | 'sm' }
  & ({ variant?: Exclude<ButtonVariant, 'icon'> } | { variant: 'icon'; 'aria-label': string })

// `busy` deixa o botão indisponível com aria-disabled em vez de `disabled`:
// o foco continua nele durante a tentativa (com `disabled`, o navegador o solta).
export function Button({ variant = 'primary', size = 'md', busy = false, type = 'button', className = '', onClick, ...props }: Props) {
  const classes = [variants[variant], size === 'sm' && variant !== 'link' ? 'btn-sm' : '', className].filter(Boolean).join(' ')
  return <button {...props} type={type} aria-disabled={busy || undefined} className={classes}
    onClick={event => { if (busy) { event.preventDefault(); return } onClick?.(event) }} />
}

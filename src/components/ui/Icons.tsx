import type { ReactNode } from 'react'

// Ícones decorativos de linha: o nome vem do rótulo ou do aria-label do botão.
function Icon({ size, children }: { size: number; children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
}

export function TrashIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}>
    <path d="M4 7h16" /><path d="M10 11.5v5.5" /><path d="M14 11.5v5.5" />
    <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" /><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
  </Icon>
}

export function PencilIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}>
    <path d="M14.5 5.5l4 4" /><path d="M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19 4 20Z" />
  </Icon>
}

export function PlusIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
}

export function RefreshIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}><path d="M20 11a8 8 0 0 0-14.7-4.3L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.7 4.3L20 16" /><path d="M20 20v-4h-4" /></Icon>
}

export function BanIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></Icon>
}

export function EyeIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.75" /></Icon>
}

export function SendIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z" /></Icon>
}

export function UndoIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
}

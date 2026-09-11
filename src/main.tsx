import { captureInvitation } from './features/invitations/guest'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

captureInvitation()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

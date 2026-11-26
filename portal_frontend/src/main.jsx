/**
 * FILE: src/main.jsx
 * FLOW: Bootstrap -> project/global styles -> shared management tokens/styles -> App.
 * Scope: management CSS targets authenticated dashboard content; public/login unaffected.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "bootstrap/dist/css/bootstrap.min.css";
import './index.css'
import './styles/global.css'
import './styles/admin-table-borders.css'
import './styles/tokens.css'
import './styles/management.css'
import './styles/viwanda-polish.css'
import App from './App.jsx'
import { ToastProvider } from './components/Toast/ToastProvider.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
// Dark mode for every page (11 Nov 2026): generated from the light CSS; loaded after the app styles.
import './styles/dark-mode.generated.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LanguageProvider>
  </StrictMode>,
)

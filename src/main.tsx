import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ModelProvider } from './context/ModelContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModelProvider>
      <App />
    </ModelProvider>
  </StrictMode>,
)

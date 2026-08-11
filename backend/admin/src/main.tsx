import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './estilo.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* O Express serve o painel sob /admin; sem o basename as rotas quebram. */}
    <BrowserRouter basename="/admin">
      <App />
    </BrowserRouter>
  </StrictMode>,
);

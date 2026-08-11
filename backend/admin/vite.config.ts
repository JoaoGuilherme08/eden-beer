import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // O Express serve o painel em /admin, entao os assets tem de sair com esse prefixo.
  base: '/admin/',
  server: {
    port: 5173,
    // Proxy para a API em dev: o navegador enxerga tudo na mesma origem, entao
    // o cookie de sessao funciona igual em dev e em producao.
    proxy: {
      '/admin/api': 'http://localhost:3000',
      '/admin/login': 'http://localhost:3000',
      '/admin/logout': 'http://localhost:3000',
      '/admin/sessao': 'http://localhost:3000',
    },
  },
});

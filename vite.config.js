import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Não vigiar a saída do build nem o código do servidor: no Windows, rodar "npm run build"
    // com o localhost aberto derrubava o servidor (EBUSY ao vigiar dist/).
    watch: { ignored: ['**/dist/**', '**/api/**', '**/server/**', '**/backups/**'] },
  },
})

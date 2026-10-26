import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Número da versão deste build: vai embutido no app (__APP_VERSION__) e publicado em /version.json.
// O app aberto compara os dois para saber que saiu uma versão nova (ver src/atualizacao.js).
const VERSAO = new Date().toISOString()

function publicarVersao() {
  return {
    name: 'publicar-versao',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ versao: VERSAO }) })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), publicarVersao()],
  define: { __APP_VERSION__: JSON.stringify(command === 'build' ? VERSAO : 'dev') },
  server: {
    // Não vigiar a saída do build nem o código do servidor: no Windows, rodar "npm run build"
    // com o localhost aberto derrubava o servidor (EBUSY ao vigiar dist/).
    watch: { ignored: ['**/dist/**', '**/api/**', '**/server/**', '**/backups/**'] },
  },
}))

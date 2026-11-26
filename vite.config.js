import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? '/rompe-el-algoritmo-maipu/' : './',
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/data/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:5174',
    },
  },
});

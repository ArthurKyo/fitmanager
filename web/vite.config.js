import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// FM_LAN=1 abre o servidor para a rede local com HTTPS (certificado em .cert/),
// necessário para testar GPS e compartilhamento no celular: o navegador só libera
// esses recursos em páginas seguras.
const lan = process.env.FM_LAN === '1';
const https = lan && fs.existsSync('.cert/key.pem') ? { key: fs.readFileSync('.cert/key.pem'), cert: fs.readFileSync('.cert/cert.pem') } : undefined;

// FM_DEMO=1 gera a demonstração estática (GitHub Pages): a API de api/src roda no navegador,
// com SQLite em WebAssembly. Os módulos do Node que ela usa viram os substitutos de src/demo/shims.
const demo = process.env.FM_DEMO === '1';
const shim = (f) => fileURLToPath(new URL(`./src/demo/shims/${f}`, import.meta.url));

export default defineConfig({
  base: demo ? process.env.FM_BASE || '/fitmanager/' : '/',
  plugins: [react()],
  define: {
    __FM_DEMO__: JSON.stringify(demo),
    __FM_DEMO_VERSION__: JSON.stringify(demo ? String(Date.now()) : ''),
    // Configuração que a API lê de process.env. Na demonstração tudo é local ao navegador do visitante,
    // então a chave que assina as sessões pode ser fixa e pública.
    ...(demo ? { 'process.env': JSON.stringify({ FM_SECRET: 'fitmanager-demonstracao-no-navegador', FM_PLATFORM_KEY: 'demo' }) } : {}),
  },
  resolve: {
    alias: {
      express: shim('express.js'),
      'node:sqlite': shim('sqlite.js'),
      'node:crypto': shim('crypto.js'),
      'node:fs': shim('node.js'),
      'node:path': shim('node.js'),
      'node:url': shim('node.js'),
      'node:events': shim('node.js'),
    },
  },
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  server: {
    port: lan ? 5174 : 5173,
    host: lan ? true : 'localhost',
    https,
    fs: { allow: ['..'] },
    proxy: demo ? undefined : { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
});

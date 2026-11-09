import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// FM_LAN=1 abre o servidor para a rede local com HTTPS (certificado em .cert/),
// necessário para testar GPS e compartilhamento no celular: o navegador só libera
// esses recursos em páginas seguras.
const lan = process.env.FM_LAN === '1';
const https = lan && fs.existsSync('.cert/key.pem') ? { key: fs.readFileSync('.cert/key.pem'), cert: fs.readFileSync('.cert/cert.pem') } : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: lan ? 5174 : 5173,
    host: lan ? true : 'localhost',
    https,
    proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
});

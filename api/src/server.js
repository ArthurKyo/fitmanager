import './lib/time.js'; // fixa o fuso antes de qualquer Date
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './lib/http.js';
import { auth } from './middleware.js';
import { closeExpiredContracts } from './domain/billing.js';
import publicRoutes from './routes/public.js';
import members from './routes/members.js';
import { plans, contracts, invoices } from './routes/finance.js';
import { staffPayments, paySettings, payWebhooks, platform, platformKey } from './routes/payments.js';
import { runAutopay } from './payments/service.js';
import { access, bridge } from './routes/access.js';
import crm from './routes/crm.js';
import training from './routes/training.js';
import { dashboard, settings } from './routes/dashboard.js';
import me from './routes/me.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => (req.rawBody = buf.toString()) }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', publicRoutes);
app.use('/api/webhooks', payWebhooks);
app.use('/api/platform', platform);
app.use('/api/bridge', bridge);

app.use('/api/members', auth, members);
app.use('/api/plans', auth, plans);
app.use('/api/contracts', auth, contracts);
app.use('/api/invoices', auth, invoices);
app.use('/api/access', auth, access);
app.use('/api/crm', auth, crm);
app.use('/api/training', auth, training);
app.use('/api/dashboard', auth, dashboard);
app.use('/api/settings/payments', auth, paySettings);
app.use('/api/settings', auth, settings);
app.use('/api', auth, staffPayments);
app.use('/api/me', auth, me);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada')));

// Em produção, a API também serve o front compilado (web/dist).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (String(err.message).includes('UNIQUE constraint')) return res.status(409).json({ error: 'Registro duplicado' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

const hourly = async () => {
  closeExpiredContracts();
  const r = await runAutopay().catch((e) => (console.error('[débito automático]', e), null));
  if (r?.tried) console.log(`[débito automático] ${r.tried} tentativas: ${r.approved} aprovadas, ${r.declined} recusadas`);
};
hourly();
setInterval(hourly, 3600_000).unref();

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, () => {
  console.log(`FitManager API em http://localhost:${PORT}`);
  console.log(`Painel da plataforma: /plataforma (chave em api/.platform-key)`);
  platformKey();
});

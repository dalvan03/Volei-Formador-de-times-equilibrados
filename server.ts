import express from 'express';
import { startBackupScheduler } from './src/db/backup';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { client } from './src/db/index';
import { createApi } from './src/server/api';
import { seasonTransaction } from './src/db/seasonService';
import { whatsappConfig, whatsappTick } from './src/server/whatsapp';

async function startServer() {
  const [{ ready }] = await client`SELECT to_regclass('public.seasons') IS NOT NULL AS ready`;
  if (!ready) throw new Error('Execute npm run db:migrate para gerar o backup e migrar antes de iniciar.');
  await seasonTransaction(async () => undefined);
  if (process.env.NODE_ENV === 'production') startBackupScheduler();
  whatsappConfig(); // Fail clearly if explicitly enabled with incomplete configuration.
  const app = express();
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', createApi());
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'dist/index.html')));
  }
  const timer = setInterval(() => seasonTransaction(async sql => {
    await sql`DELETE FROM sessions WHERE expires_at < clock_timestamp()`;
    await sql`DELETE FROM auth_attempts WHERE window_start < clock_timestamp() - interval '1 day'`;
  }).catch(err => console.error('Falha no fechamento de temporadas:', err.message)), 30000);
  timer.unref();
  const whatsappTimer = setInterval(() => {
    void whatsappTick().catch(() => console.error('Falha no agendador WhatsApp; verificar configuração e banco.'));
  }, 30000);
  whatsappTimer.unref();
  app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Servidor de vôlei iniciado.'));
}
startServer().catch(err => { console.error(err.message); process.exitCode = 1; client.end(); });

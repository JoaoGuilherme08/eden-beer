import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { csrf, exigirSessao } from './src/auth.js';
import { pool, ssl } from './src/db.js';
import rotasAdmin from './src/rotas/admin.js';
import rotasLogin from './src/rotas/login.js';
import rotasPublicas from './src/rotas/publico.js';

const raiz = dirname(fileURLToPath(import.meta.url));
const producao = process.env.NODE_ENV === 'production';
const PORTA = process.env.PORT || 3000;

if (producao && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET obrigatoria em producao');
}

const app = express();

// A Railway fica atras de proxy: sem isso o cookie `secure` nunca e enviado.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.use(
  session({
    store: new (connectPgSimple(session))({ pool, tableName: 'session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'segredo-de-desenvolvimento',
    name: 'eden.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: producao,
      maxAge: 1000 * 60 * 60 * 12,
    },
  }),
);

// Endpoint lido pelo build da Vercel. Aberto de proposito: o conteudo e o mesmo
// catalogo que qualquer visitante ve no site.
app.use('/api/public', rotasPublicas);

app.use(
  '/admin/login',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'tentativas demais, tente de novo em alguns minutos' },
  }),
);
app.use('/admin', rotasLogin);
app.use('/admin/api', exigirSessao, csrf, rotasAdmin);

// SPA do painel. O catch-all so responde o index para navegacao (Accept: html),
// senao um /admin/api/x inexistente devolveria a pagina em vez de 404.
const dist = join(raiz, 'admin', 'dist');
app.use('/admin', express.static(dist));
app.get('/admin/*', (req, res, next) => {
  if (!req.accepts('html')) return next();
  res.sendFile(join(dist, 'index.html'), (e) => (e ? next() : null));
});

/**
 * Diz numa olhada o que esta de pe. Serve de healthcheck na Railway e,
 * principalmente, transforma "o deploy nao sobe" em uma causa nomeada.
 */
app.get('/health', async (_req, res) => {
  const estado = { ok: true, banco: 'ok', tabelas: 'ok', s3: !!process.env.S3_BUCKET, deployHook: !!process.env.VERCEL_DEPLOY_HOOK_URL };
  try {
    await pool.query('select 1');
  } catch (e) {
    estado.ok = false;
    estado.banco = `falhou: ${e.message}`;
    return res.status(503).json(estado);
  }
  try {
    const { rows } = await pool.query(
      "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('admin_users','bebidas','barris','config','session')",
    );
    if (rows[0].n < 5) {
      estado.ok = false;
      estado.tabelas = `faltam tabelas (${rows[0].n}/5) — rode: npm run migrar`;
      return res.status(503).json(estado);
    }
  } catch (e) {
    estado.ok = false;
    estado.tabelas = `falhou: ${e.message}`;
    return res.status(503).json(estado);
  }
  res.json(estado);
});

app.get('/', (_req, res) => res.redirect('/admin'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno' });
});

// Log de boot: numa primeira subida, quase todo problema e variavel faltando
// ou banco sem migration. Melhor dizer isso do que deixar adivinhar pelo log.
const marca = (v) => (v ? 'ok' : 'FALTA');
console.log(
  [
    `[boot] NODE_ENV=${process.env.NODE_ENV || '(vazio)'} porta=${PORTA} ssl-no-banco=${ssl}`,
    `[boot] DATABASE_URL=${marca(process.env.DATABASE_URL)} SESSION_SECRET=${marca(process.env.SESSION_SECRET)}`,
    `[boot] SITE_PUBLIC_URL=${marca(process.env.SITE_PUBLIC_URL)} VERCEL_DEPLOY_HOOK_URL=${marca(process.env.VERCEL_DEPLOY_HOOK_URL)}`,
    `[boot] S3_BUCKET=${marca(process.env.S3_BUCKET)} AWS_REGION=${marca(process.env.AWS_REGION)}`,
    `[boot] painel: ${existsSync(join(dist, 'index.html')) ? 'ok' : 'FALTA admin/dist — rode npm run build'}`,
  ].join('\n'),
);

const servidor = app.listen(PORTA, '0.0.0.0', () => {
  console.log(`[boot] escutando em :${PORTA} — confira /health`);
});

// Sem isto, banco fora do ar so aparece como request pendurada. Com tentativas
// porque o Postgres costuma subir alguns segundos depois da app — uma unica
// tentativa dava "BANCO NAO RESPONDEU" com o banco perfeitamente no ar.
(async () => {
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    try {
      await pool.query('select 1');
      console.log(`[boot] banco respondeu${tentativa > 1 ? ` (tentativa ${tentativa})` : ''}`);
      return;
    } catch (e) {
      if (tentativa === 5) {
        console.error(`[boot] BANCO NAO RESPONDEU apos 5 tentativas: ${e.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, tentativa * 1000));
    }
  }
})();

for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => servidor.close(() => pool.end().finally(() => process.exit(0))));
}

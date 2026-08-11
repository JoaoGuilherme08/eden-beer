import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { csrf, exigirSessao } from './src/auth.js';
import { pool } from './src/db.js';
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

app.get('/', (_req, res) => res.redirect('/admin'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno' });
});

app.listen(PORTA, () => console.log(`backend em http://localhost:${PORTA}`));

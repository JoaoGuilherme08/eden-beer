import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL nao definida. Na Railway ela aparece sozinha ao adicionar o plugin Postgres ' +
      'e vincular o servico; local, use a do docker (veja o README).',
  );
}

/**
 * Decide TLS pelo host, nao so pelo `sslmode=` da URL.
 *
 * A rede privada da Railway (postgres.railway.internal) fala sem TLS, e o
 * docker local tambem. Ja a URL publica (*.railway.app / *.rlwy.net) exige TLS
 * e normalmente vem SEM sslmode na string — olhar so o parametro fazia a
 * conexao falhar com um erro que nao explica nada.
 */
function querSsl(url) {
  if (/[?&]sslmode=disable/.test(url)) return false;
  if (/[?&]sslmode=(require|prefer|verify-full|verify-ca)/.test(url)) return true;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  const interno = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(host) || host.endsWith('.internal');
  return !interno;
}

export const ssl = querSsl(process.env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // O certificado da Railway nao valida na cadeia publica padrao.
  ssl: ssl ? { rejectUnauthorized: false } : false,
  max: 10,
});

pool.on('error', (e) => console.error('[db] erro no pool:', e.message));

export const q = (texto, valores) => pool.query(texto, valores);

/** Roda `fn` numa transacao, desfazendo tudo se ela lancar. */
export async function emTransacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const r = await fn(cliente);
    await cliente.query('commit');
    return r;
  } catch (e) {
    await cliente.query('rollback');
    throw e;
  } finally {
    cliente.release();
  }
}

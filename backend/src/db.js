import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL nao definida');
}

// A Railway serve Postgres com certificado proprio; fora dela (docker local)
// nao ha TLS. `?sslmode=` na URL decide, com o local como padrao sem SSL.
const precisaSsl = /[?&]sslmode=(require|prefer)/.test(process.env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: precisaSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

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

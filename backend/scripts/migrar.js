// Roda os .sql de migrations/ em ordem. Cada um e idempotente (if not exists),
// entao rodar de novo nao quebra nada — nao vale uma tabela de controle ainda.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q } from '../src/db.js';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.sql')).sort();
for (const arquivo of arquivos) {
  process.stdout.write(`  ${arquivo} ... `);
  await q(await readFile(join(pasta, arquivo), 'utf8'));
  console.log('ok');
}

console.log(`\n${arquivos.length} migration(s) aplicada(s)`);
await pool.end();

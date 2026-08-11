// Cria ou atualiza a senha de um admin. Nao existe cadastro pela web de proposito.
//   npm run criar-admin -- email@dominio.com 'senha-forte'
import { gerarHash } from '../src/auth.js';
import { pool, q } from '../src/db.js';

const [email, senha] = process.argv.slice(2);

if (!email || !senha) {
  console.error("uso: npm run criar-admin -- email@dominio.com 'senha'");
  process.exit(1);
}
if (senha.length < 10) {
  console.error('senha muito curta: use pelo menos 10 caracteres');
  process.exit(1);
}

const { rows } = await q(
  `insert into admin_users (email, senha_hash) values ($1, $2)
   on conflict (email) do update set senha_hash = excluded.senha_hash
   returning id, email, criado_em`,
  [email.trim().toLowerCase(), await gerarHash(senha)],
);

console.log(`admin pronto: ${rows[0].email} (id ${rows[0].id})`);
await pool.end();

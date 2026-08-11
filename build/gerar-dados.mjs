// Roda no build da Vercel. Faz duas coisas:
//   1. busca o catalogo na API e grava data.js (o site le window.EDEN_DATA);
//   2. copia o .dc.html para index.html, para a raiz do site funcionar sem
//      depender de rewrite.
//
//   API_BASE_URL=https://... node build/gerar-dados.mjs
import { copyFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = 'Eden Beer - Site.dc.html';
const API = (process.env.API_BASE_URL || '').replace(/\/$/, '');

await copyFile(join(raiz, ENTRADA), join(raiz, 'index.html'));
console.log(`index.html gerado a partir de "${ENTRADA}"`);

if (!API) {
  // Sem API configurada o site ainda sobe: o .dc.html tem o catalogo embutido
  // como fallback. Melhor publicar com dado velho do que falhar o build.
  console.warn('API_BASE_URL nao definida — data.js nao sera gerado, o site usa o catalogo embutido');
  await writeFile(join(raiz, 'data.js'), '/* sem API_BASE_URL no build */\n');
  process.exit(0);
}

const url = `${API}/api/public/site`;
console.log(`buscando ${url}`);

let dados;
try {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`a API respondeu ${r.status}`);
  dados = await r.json();
} catch (e) {
  // Um deploy que falha inteiro por causa da API fora do ar tira o site do ar.
  // Preferimos publicar com o catalogo embutido e gritar no log.
  console.error(`ERRO ao buscar a API: ${e.message}`);
  console.error('publicando com o catalogo embutido no .dc.html');
  await writeFile(join(raiz, 'data.js'), `/* API indisponivel no build: ${e.message} */\n`);
  process.exit(0);
}

for (const chave of ['latas', 'growlers', 'barris']) {
  if (!Array.isArray(dados[chave])) throw new Error(`resposta da API sem a lista "${chave}"`);
}
if (!dados.latas.length && !dados.growlers.length) {
  throw new Error('a API devolveu catalogo vazio — nao vou publicar um site sem bebida');
}

await writeFile(
  join(raiz, 'data.js'),
  `/* Gerado por build/gerar-dados.js em ${new Date().toISOString()}. Nao editar a mao. */\n` +
    `window.EDEN_DATA = ${JSON.stringify(dados, null, 2)};\n`,
);

console.log(`data.js: ${dados.latas.length} latas, ${dados.growlers.length} growlers, ${dados.barris.length} barris`);

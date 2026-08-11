// Migra o catalogo que hoje vive dentro do .dc.html para o banco, uma vez.
// Preserva os ids atuais ('thesea', 'g7x1'...) para nada que os referencie quebrar.
//   npm run semear
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emTransacao, pool, q } from '../src/db.js';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Eden Beer - Site.dc.html');
const html = await readFile(SITE, 'utf8');

/**
 * Puxa o literal de array de `const NOME = ... [ ... ];`. Aceita tanto a forma
 * atual quanto a com fallback (`= window.EDEN_DATA?.x ?? [`), para o script
 * continuar valendo depois que o site passar a ler do snapshot.
 */
function extrairLista(nome) {
  const m = html.match(new RegExp(`const ${nome}\\s*=[^[]*?(\\[[\\s\\S]*?\\n\\]);`));
  if (!m) throw new Error(`nao achei a lista ${nome} em ${SITE}`);
  return new Function(`return ${m[1]}`)();
}

function extrairProps() {
  const m = html.match(/data-props="([^"]*)"/);
  if (!m) return {};
  const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const props = JSON.parse(json);
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.default]));
}

const latas = extrairLista('PRODUCTS');
const growlers = extrairLista('GROWLERS');
const barris = extrairLista('BARRELS');
const props = extrairProps();

console.log(`lidos do site: ${latas.length} latas, ${growlers.length} growlers, ${barris.length} barris`);

const linha = (b, tipo, i) => [
  b.id, tipo, b.name, b.style ?? null, b.accent ?? null, b.image ?? null,
  b.description ?? null, b.abv ?? null, b.ibu ?? null, b.volume ?? null,
  b.tags ?? [], i, true,
];

await emTransacao(async (c) => {
  for (const [lista, tipo] of [[latas, 'lata'], [growlers, 'growler']]) {
    for (const [i, b] of lista.entries()) {
      await c.query(
        `insert into bebidas (id, tipo, nome, estilo, accent, imagem_url, descricao, abv, ibu, volume, tags, posicao, visivel)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (id) do update set
           tipo = excluded.tipo, nome = excluded.nome, estilo = excluded.estilo,
           accent = excluded.accent, imagem_url = excluded.imagem_url,
           descricao = excluded.descricao, abv = excluded.abv, ibu = excluded.ibu,
           volume = excluded.volume, tags = excluded.tags, posicao = excluded.posicao`,
        linha(b, tipo, i),
      );
    }
  }

  await c.query('delete from barris');
  for (const [i, b] of barris.entries()) {
    await c.query('insert into barris (tamanho, preco, posicao) values ($1,$2,$3)', [b.size, b.price, i]);
  }

  const config = {
    whatsapp_number: props.whatsappNumber ?? '+55 18 99625-4970',
    instagram_handle: props.instagramHandle ?? 'edenbeerbirigui',
    ifood_url: props.ifoodUrl ?? '',
    mostrar_preco_barril: String(props.showBarrilPrices ?? true),
  };
  for (const [chave, valor] of Object.entries(config)) {
    await c.query(
      'insert into config (chave, valor) values ($1,$2) on conflict (chave) do update set valor = excluded.valor',
      [chave, valor],
    );
  }
});

const { rows } = await q('select tipo, count(*)::int as n from bebidas group by tipo order by tipo');
console.log('no banco:', rows.map((r) => `${r.n} ${r.tipo}`).join(', '));
console.log('config:', (await q('select chave from config order by chave')).rows.map((r) => r.chave).join(', '));
await pool.end();

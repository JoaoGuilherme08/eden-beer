// Sobe TODAS as imagens de uploads/ para o bucket e reescreve as referencias:
// as do catalogo no banco, e as fixas dentro do .dc.html.
//
//   npm run subir-imagens            (mostra o que faria)
//   npm run subir-imagens -- --valendo
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardar, novaChave } from '../src/s3.js';
import { emTransacao, pool, q } from '../src/db.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UPLOADS = join(RAIZ, 'uploads');
const SITE = join(RAIZ, 'Eden Beer - Site.dc.html');
const VALENDO = process.argv.includes('--valendo');
// Reescrever o .dc.html e opcional de proposito: as referencias fixas nele sao
// o logo, o hero e os icones. Aponta-las para a Railway faria o site perder a
// identidade visual se ela caisse — hoje viajam junto com o site na Vercel.
// As do catalogo saem do banco e nao dependem disto.
const TAMBEM_HTML = process.argv.includes('--html');

const TIPO = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };

async function listar(pasta) {
  const achados = [];
  for (const item of await readdir(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, item.name);
    if (item.isDirectory()) achados.push(...(await listar(caminho)));
    else if (TIPO[extname(item.name).toLowerCase()]) achados.push(caminho);
  }
  return achados;
}

const arquivos = (await listar(UPLOADS)).sort();
console.log(`${arquivos.length} imagens em uploads/${VALENDO ? '' : '  (simulacao — use --valendo para subir)'}\n`);

// caminho relativo como aparece nas referencias -> URL nova
const mapa = new Map();
let bytes = 0;

for (const caminho of arquivos) {
  const rel = relative(RAIZ, caminho).split('\\').join('/');
  const contentType = TIPO[extname(caminho).toLowerCase()];
  const dados = await readFile(caminho);
  bytes += dados.length;

  if (!VALENDO) {
    mapa.set(rel, `/fotos/${novaChave(caminho, contentType, 'site')}`);
    continue;
  }
  const { url } = await guardar({ corpo: dados, contentType, nomeArquivo: caminho, chave: novaChave(caminho, contentType, 'site') });
  mapa.set(rel, url);
  process.stdout.write('.');
}
if (VALENDO) console.log('');
console.log(`${(bytes / 1024 / 1024).toFixed(1)}MB\n`);

// ---- banco: imagens do catalogo -------------------------------------------
const { rows: bebidas } = await q('select id, imagem_url from bebidas where imagem_url is not null');
const paraTrocar = bebidas.filter((b) => mapa.has(b.imagem_url));
console.log(`banco: ${paraTrocar.length}/${bebidas.length} bebidas apontam para uploads/`);

if (VALENDO && paraTrocar.length) {
  await emTransacao(async (c) => {
    for (const b of paraTrocar) {
      await c.query('update bebidas set imagem_url = $1, atualizado_em = now() where id = $2', [mapa.get(b.imagem_url), b.id]);
    }
  });
  console.log('  atualizadas');
}

// ---- site: imagens fixas no html ------------------------------------------
let html = await readFile(SITE, 'utf8');
let trocasHtml = 0;
for (const [rel, url] of mapa) {
  // So as referencias que sobraram no html — as do catalogo saem do banco.
  const partes = html.split(rel);
  if (partes.length > 1) {
    trocasHtml += partes.length - 1;
    html = partes.join(url);
  }
}
console.log(`site: ${trocasHtml} referencias fixas no .dc.html${TAMBEM_HTML ? '' : '  (mantidas — use --html para trocar)'}`);

if (VALENDO && TAMBEM_HTML && trocasHtml) {
  // As URLs no html sao absolutas: o site roda noutro dominio.
  const base = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('API_PUBLIC_URL nao definida (ex: https://eden-beer-production.up.railway.app)');
  await writeFile(SITE, html.split('"/fotos/').join(`"${base}/fotos/`));
  console.log(`  reescritas com base ${base}`);
}

console.log(VALENDO ? '\npronto' : '\nnada foi alterado');
await pool.end();

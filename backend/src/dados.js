import { q } from './db.js';

export const CHAVES_CONFIG = [
  'whatsapp_number',
  'instagram_handle',
  'ifood_url',
  'mostrar_preco_barril',
  'ultima_publicacao',
];

/** Linha do banco -> objeto no formato que o site ja consome. */
export const paraSite = (b) => ({
  id: b.id,
  name: b.nome,
  style: b.estilo,
  accent: b.accent,
  image: b.imagem_url,
  description: b.descricao,
  abv: b.abv,
  ibu: b.ibu,
  volume: b.volume,
  tags: b.tags?.length ? b.tags : undefined,
});

export async function lerConfig() {
  const { rows } = await q('select chave, valor from config');
  return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
}

/** O payload completo que o build da Vercel consome. */
export async function montarSnapshot() {
  const [bebidas, barris, config] = await Promise.all([
    q('select * from bebidas where visivel = true order by tipo, posicao, nome'),
    q('select tamanho, preco from barris order by posicao, id'),
    lerConfig(),
  ]);

  return {
    latas: bebidas.rows.filter((b) => b.tipo === 'lata').map(paraSite),
    growlers: bebidas.rows.filter((b) => b.tipo === 'growler').map(paraSite),
    barris: barris.rows.map((b) => ({ size: b.tamanho, price: b.preco })),
    config: {
      whatsappNumber: config.whatsapp_number ?? null,
      instagramHandle: config.instagram_handle ?? null,
      ifoodUrl: config.ifood_url ?? null,
      showBarrilPrices: config.mostrar_preco_barril !== 'false',
    },
    geradoEm: new Date().toISOString(),
  };
}

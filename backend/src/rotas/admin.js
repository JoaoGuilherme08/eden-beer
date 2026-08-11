import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { CHAVES_CONFIG, lerConfig } from '../dados.js';
import { emTransacao, q } from '../db.js';
import { assinarUpload } from '../s3.js';

const router = Router();

const TIPOS = new Set(['lata', 'growler']);
const texto = (v) => (v == null || v === '' ? null : String(v).trim());

/** Vira um id estavel a partir do nome, quando o admin cria uma bebida nova. */
const idPorNome = (nome) =>
  String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40) || randomUUID().slice(0, 8);

/**
 * `criando` distingue os dois contratos: no POST, nome e tipo sao obrigatorios;
 * no PATCH so se valida o que veio, porque mandar um campo so e o caso normal.
 */
function validarBebida(corpo, { criando }) {
  const erros = [];
  if (criando) {
    if (!texto(corpo.nome)) erros.push('nome e obrigatorio');
    if (!TIPOS.has(corpo.tipo)) erros.push("tipo deve ser 'lata' ou 'growler'");
  } else {
    if ('nome' in corpo && !texto(corpo.nome)) erros.push('nome nao pode ficar vazio');
    if ('tipo' in corpo && !TIPOS.has(corpo.tipo)) erros.push("tipo deve ser 'lata' ou 'growler'");
  }
  if (corpo.accent != null && corpo.accent !== '' && !/^#[0-9a-fA-F]{6}$/.test(corpo.accent)) {
    erros.push('accent deve ser hex tipo #17B4CE');
  }
  if ('tags' in corpo && corpo.tags != null && !Array.isArray(corpo.tags)) erros.push('tags deve ser lista');
  if ('visivel' in corpo && typeof corpo.visivel !== 'boolean') erros.push('visivel deve ser booleano');
  return erros;
}

// ---- bebidas ----------------------------------------------------------------

router.get('/bebidas', async (_req, res, next) => {
  try {
    const { rows } = await q('select * from bebidas order by tipo, posicao, nome');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/bebidas', async (req, res, next) => {
  try {
    const erros = validarBebida(req.body ?? {}, { criando: true });
    if (erros.length) return res.status(400).json({ erro: erros.join('; ') });

    const b = req.body;
    const id = texto(b.id) || idPorNome(b.nome);
    const { rows: existe } = await q('select 1 from bebidas where id = $1', [id]);
    if (existe.length) return res.status(409).json({ erro: `ja existe uma bebida com o id "${id}"` });

    // Entra no fim da lista do seu tipo.
    const { rows: fim } = await q('select coalesce(max(posicao), -1) + 1 as p from bebidas where tipo = $1', [b.tipo]);

    const { rows } = await q(
      `insert into bebidas (id, tipo, nome, estilo, accent, imagem_url, descricao, abv, ibu, volume, tags, posicao, visivel)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [
        id, b.tipo, texto(b.nome), texto(b.estilo), texto(b.accent), texto(b.imagem_url),
        texto(b.descricao), texto(b.abv), texto(b.ibu), texto(b.volume),
        (b.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
        fim[0].p, b.visivel !== false,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Colunas que o PATCH pode tocar, e como o valor do corpo vira valor de coluna.
const CAMPOS = {
  tipo: (v) => v,
  nome: texto,
  estilo: texto,
  accent: texto,
  imagem_url: texto,
  descricao: texto,
  abv: texto,
  ibu: texto,
  volume: texto,
  tags: (v) => (v ?? []).map((t) => String(t).trim()).filter(Boolean),
  visivel: (v) => v,
};

router.patch('/bebidas/:id', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const erros = validarBebida(b, { criando: false });
    if (erros.length) return res.status(400).json({ erro: erros.join('; ') });

    // Monta o SET so com o que veio no corpo. Um update fixo com todas as
    // colunas apagaria os campos ausentes — editar so o nome zerava estilo,
    // accent e abv.
    const alvos = Object.keys(CAMPOS).filter((k) => k in b);
    if (!alvos.length) return res.status(400).json({ erro: 'nada para atualizar' });

    const sets = alvos.map((coluna, i) => `${coluna} = $${i + 2}`);
    const valores = alvos.map((coluna) => CAMPOS[coluna](b[coluna]));

    const { rows } = await q(
      `update bebidas set ${sets.join(', ')}, atualizado_em = now() where id = $1 returning *`,
      [req.params.id, ...valores],
    );
    if (!rows.length) return res.status(404).json({ erro: 'bebida nao encontrada' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/bebidas/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('delete from bebidas where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: 'bebida nao encontrada' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Recebe { tipo, ids: [...] } na ordem nova. */
router.patch('/bebidas/ordem/:tipo', async (req, res, next) => {
  try {
    const { tipo } = req.params;
    const ids = req.body?.ids;
    if (!TIPOS.has(tipo)) return res.status(400).json({ erro: 'tipo invalido' });
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ erro: 'ids deve ser lista' });

    await emTransacao(async (c) => {
      for (const [i, id] of ids.entries()) {
        await c.query('update bebidas set posicao = $1 where id = $2 and tipo = $3', [i, id, tipo]);
      }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- barris -----------------------------------------------------------------

router.get('/barris', async (_req, res, next) => {
  try {
    const { rows } = await q('select * from barris order by posicao, id');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** Substitui a lista inteira: sao 3 linhas, e simples do que casar diffs. */
router.put('/barris', async (req, res, next) => {
  try {
    const lista = req.body?.barris;
    if (!Array.isArray(lista)) return res.status(400).json({ erro: 'barris deve ser lista' });
    for (const b of lista) {
      if (!texto(b.tamanho) || !texto(b.preco)) {
        return res.status(400).json({ erro: 'cada barril precisa de tamanho e preco' });
      }
    }

    const rows = await emTransacao(async (c) => {
      await c.query('delete from barris');
      const salvos = [];
      for (const [i, b] of lista.entries()) {
        const { rows: r } = await c.query(
          'insert into barris (tamanho, preco, posicao) values ($1,$2,$3) returning *',
          [texto(b.tamanho), texto(b.preco), i],
        );
        salvos.push(r[0]);
      }
      return salvos;
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ---- config -----------------------------------------------------------------

router.get('/config', async (_req, res, next) => {
  try {
    res.json(await lerConfig());
  } catch (e) {
    next(e);
  }
});

router.patch('/config', async (req, res, next) => {
  try {
    const entradas = Object.entries(req.body ?? {}).filter(([k]) => CHAVES_CONFIG.includes(k));
    if (!entradas.length) return res.status(400).json({ erro: 'nenhuma chave conhecida enviada' });

    await emTransacao(async (c) => {
      for (const [chave, valor] of entradas) {
        await c.query(
          'insert into config (chave, valor) values ($1,$2) on conflict (chave) do update set valor = excluded.valor',
          [chave, valor == null ? null : String(valor)],
        );
      }
    });
    res.json(await lerConfig());
  } catch (e) {
    next(e);
  }
});

// ---- upload e publicacao ----------------------------------------------------

router.post('/upload/assinar', async (req, res, next) => {
  try {
    const { nomeArquivo, contentType, tamanho } = req.body ?? {};
    const assinado = await assinarUpload({ nomeArquivo, contentType, tamanho });
    res.json(assinado);
  } catch (e) {
    if (e.codigoHttp) return res.status(e.codigoHttp).json({ erro: e.message });
    next(e);
  }
});

router.post('/publicar', async (_req, res, next) => {
  try {
    const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
    if (!hook) return res.status(503).json({ erro: 'VERCEL_DEPLOY_HOOK_URL nao configurada' });

    const r = await fetch(hook, { method: 'POST' });
    if (!r.ok) return res.status(502).json({ erro: `a Vercel respondeu ${r.status}` });

    const agora = new Date().toISOString();
    await q(
      "insert into config (chave, valor) values ('ultima_publicacao', $1) on conflict (chave) do update set valor = excluded.valor",
      [agora],
    );
    res.json({ ok: true, ultima_publicacao: agora });
  } catch (e) {
    next(e);
  }
});

export default router;

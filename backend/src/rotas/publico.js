import { Router } from 'express';
import { montarSnapshot } from '../dados.js';

const router = Router();

router.get('/site', async (_req, res, next) => {
  try {
    // NUNCA cachear. Quem le isto e o build da Vercel, uma vez por publicacao,
    // e tem de ver o estado do banco naquele instante. Com o CDN da Railway
    // ligado, um cache aqui fazia o build gerar data.js com catalogo velho: o
    // cliente clicava em Publicar e o site nao mudava.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(await montarSnapshot());
  } catch (e) {
    next(e);
  }
});

export default router;

import { Router } from 'express';
import { montarSnapshot } from '../dados.js';

const router = Router();

router.get('/site', async (_req, res, next) => {
  try {
    // Cache curto: quem le isto e o build da Vercel, uma vez por deploy.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await montarSnapshot());
  } catch (e) {
    next(e);
  }
});

export default router;

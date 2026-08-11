import { Router } from 'express';
import { buscarAdminPorEmail, conferirSenha, emitirCsrf } from '../auth.js';

const router = Router();
const producao = process.env.NODE_ENV === 'production';

router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body ?? {};
    if (typeof email !== 'string' || typeof senha !== 'string' || !email || !senha) {
      return res.status(400).json({ erro: 'email e senha sao obrigatorios' });
    }

    const admin = await buscarAdminPorEmail(email);
    // Mesma resposta para email inexistente e senha errada, para nao revelar
    // quais emails existem.
    const ok = admin ? await conferirSenha(senha, admin.senha_hash) : false;
    if (!ok) return res.status(401).json({ erro: 'email ou senha invalidos' });

    // Sessao nova a cada login, para nao herdar um id que alguem ja conhecia.
    req.session.regenerate((e) => {
      if (e) return next(e);
      req.session.adminId = admin.id;
      req.session.email = admin.email;
      req.session.save((e2) => {
        if (e2) return next(e2);
        emitirCsrf(res, producao);
        res.json({ email: admin.email });
      });
    });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('eden.sid');
    res.clearCookie('csrf');
    res.json({ ok: true });
  });
});

/** Usada pelo painel ao abrir, para saber se ja ha sessao e renovar o csrf. */
router.get('/sessao', (req, res) => {
  if (!req.session?.adminId) return res.status(401).json({ erro: 'nao autenticado' });
  emitirCsrf(res, producao);
  res.json({ email: req.session.email });
});

export default router;

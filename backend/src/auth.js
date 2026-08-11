import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { q } from './db.js';

const scryptAsync = promisify(scrypt);

// N=2^15 e o custo recomendado atual para scrypt interativo; 64 bytes de saida.
const CUSTO = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAM = 64;

export async function gerarHash(senha) {
  const salt = randomBytes(16);
  const chave = await scryptAsync(senha.normalize('NFKC'), salt, TAM, CUSTO);
  return `${salt.toString('hex')}:${chave.toString('hex')}`;
}

export async function conferirSenha(senha, hashGuardado) {
  const [saltHex, chaveHex] = String(hashGuardado).split(':');
  if (!saltHex || !chaveHex) return false;
  const esperado = Buffer.from(chaveHex, 'hex');
  if (esperado.length !== TAM) return false;
  const calculado = await scryptAsync(senha.normalize('NFKC'), Buffer.from(saltHex, 'hex'), TAM, CUSTO);
  return timingSafeEqual(esperado, calculado);
}

export async function buscarAdminPorEmail(email) {
  const { rows } = await q('select id, email, senha_hash from admin_users where email = $1', [
    String(email).trim().toLowerCase(),
  ]);
  return rows[0] ?? null;
}

/** Barra qualquer rota /admin/api que nao tenha sessao. */
export function exigirSessao(req, res, next) {
  if (!req.session?.adminId) return res.status(401).json({ erro: 'nao autenticado' });
  next();
}

// CSRF double-submit: o token vive num cookie legivel pelo JS e tem de voltar no
// header. Um site de terceiros consegue disparar o POST, mas nao consegue ler o
// cookie para montar o header — e sameSite=lax ja barra o cookie de sessao em
// navegacao cross-site. As duas camadas juntas cobrem o caso.
export function csrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const doCookie = req.cookies?.csrf;
  const doHeader = req.get('x-csrf-token');
  if (!doCookie || !doHeader || doCookie !== doHeader) {
    return res.status(403).json({ erro: 'token csrf invalido' });
  }
  next();
}

export function emitirCsrf(res, seguro) {
  const token = randomBytes(24).toString('base64url');
  res.cookie('csrf', token, { httpOnly: false, sameSite: 'lax', secure: seguro, path: '/' });
  return token;
}

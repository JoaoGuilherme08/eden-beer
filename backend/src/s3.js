import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const TIPOS_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const TAMANHO_MAX = 8 * 1024 * 1024;
const EXPIRA_EM = 60; // segundos

const erro = (codigoHttp, msg) => Object.assign(new Error(msg), { codigoHttp });

let cliente;
function pegarCliente() {
  if (!cliente) cliente = new S3Client({ region: process.env.AWS_REGION });
  return cliente;
}

const extensao = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

const apelido = (nome) =>
  String(nome || 'foto')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'foto';

/**
 * Devolve uma URL PUT de vida curta. O arquivo vai do navegador direto para o
 * S3 — a Railway nunca ve os bytes. O content-type entra na assinatura, entao
 * quem tiver a URL nao consegue subir outra coisa com ela.
 */
export async function assinarUpload({ nomeArquivo, contentType, tamanho }) {
  // O que o cliente mandou vem primeiro: erro dele e 400, e nao pode ser
  // mascarado por 503 de configuracao faltando no servidor.
  if (!TIPOS_OK.has(contentType)) {
    throw erro(400, `tipo ${contentType || '(vazio)'} nao permitido; use jpeg, png, webp ou avif`);
  }
  if (!Number.isFinite(tamanho) || tamanho <= 0) throw erro(400, 'tamanho invalido');
  if (tamanho > TAMANHO_MAX) throw erro(413, `arquivo acima de ${TAMANHO_MAX / 1024 / 1024}MB`);

  if (!process.env.S3_BUCKET) throw erro(503, 'S3_BUCKET nao configurado');

  const chave = `catalogo/${randomUUID()}-${apelido(nomeArquivo)}.${extensao[contentType]}`;

  const urlPut = await getSignedUrl(
    pegarCliente(),
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: chave,
      ContentType: contentType,
      ContentLength: tamanho,
    }),
    // Sem signableHeaders o SDK deixa content-type de fora da assinatura, e a
    // URL passaria a aceitar qualquer tipo de arquivo. Assinando os dois, o
    // navegador tem de mandar exatamente o tipo e o tamanho declarados aqui.
    { expiresIn: EXPIRA_EM, signableHeaders: new Set(['content-type', 'content-length']) },
  );

  const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return { urlPut, urlFinal: `${base}/${chave}`, chave, expiraEm: EXPIRA_EM };
}

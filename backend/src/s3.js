import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Armazenamento das fotos no bucket da Railway (S3-compativel, endpoint proprio).
 *
 * Duas restricoes do bucket definiram o desenho, e as duas foram medidas:
 *  - Objeto nao pode ser publico. ACL public-read e aceito mas ignorado, e
 *    PutBucketPolicy responde NotImplemented. Por isso as fotos saem por
 *    GET /fotos/*, servidas por este app (com CDN da Railway na frente).
 *  - Nao ha CORS. O preflight volta 200 sem Access-Control-Allow-Origin, entao
 *    upload assinado direto do navegador seria recusado. O arquivo sobe pelo
 *    app; como app e bucket estao dentro da Railway, o salto e barato.
 */

const TIPOS_OK = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);
export const TAMANHO_MAX = 8 * 1024 * 1024;

const erro = (codigoHttp, msg) => Object.assign(new Error(msg), { codigoHttp });

export const configurado = () =>
  !!(process.env.AWS_S3_BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

let cliente;
function pegarCliente() {
  if (!cliente) {
    cliente = new S3Client({
      region: process.env.AWS_DEFAULT_REGION || 'auto',
      // Sem endpoint o SDK iria para a AWS de verdade.
      endpoint: process.env.AWS_ENDPOINT_URL || undefined,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return cliente;
}

const apelido = (nome) =>
  String(nome || 'foto')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'foto';

/** Chave nova, sempre unica: trocar a foto nunca reaproveita URL em cache. */
export const novaChave = (nomeArquivo, contentType, pasta = 'catalogo') =>
  `${pasta}/${randomUUID()}-${apelido(nomeArquivo)}.${TIPOS_OK.get(contentType)}`;

export async function guardar({ corpo, contentType, nomeArquivo, chave }) {
  if (!TIPOS_OK.has(contentType)) {
    throw erro(400, `tipo ${contentType || '(vazio)'} nao permitido; use jpeg, png, webp ou avif`);
  }
  if (!corpo?.length) throw erro(400, 'arquivo vazio');
  if (corpo.length > TAMANHO_MAX) throw erro(413, `arquivo acima de ${TAMANHO_MAX / 1024 / 1024}MB`);
  if (!configurado()) throw erro(503, 'bucket nao configurado no servidor');

  const Key = chave || novaChave(nomeArquivo, contentType);
  await pegarCliente().send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key,
      Body: corpo,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return { chave: Key, url: `/fotos/${Key}` };
}

/** Usado por GET /fotos/*: o bucket e privado, quem serve e este app. */
export async function buscar(chave) {
  const r = await pegarCliente().send(
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: chave }),
  );
  return { corpo: r.Body, contentType: r.ContentType, tamanho: r.ContentLength, etag: r.ETag };
}

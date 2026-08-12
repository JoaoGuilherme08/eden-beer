import type { AssinaturaUpload, Barril, Bebida, BebidaEntrada, Config, Tipo } from './tipos';

export interface Sessao {
  email: string;
  /** Dominio do site publico, para resolver fotos de caminho relativo. */
  siteUrl: string;
}

/**
 * As fotos antigas estao gravadas como caminho relativo (uploads/foto.jpg) e so
 * existem no dominio do site. Sem isto o painel mostraria imagem quebrada, ja
 * que ele roda noutro dominio.
 */
export function urlFoto(valor: string | null, siteUrl: string): string {
  if (!valor) return '';
  if (/^(https?:)?\/\//.test(valor) || valor.startsWith('data:')) return valor;
  // /fotos/... e servido por este mesmo dominio (o painel roda no backend).
  if (valor.startsWith('/')) return valor;
  if (!siteUrl) return valor;
  return `${siteUrl.replace(/\/$/, '')}/${valor.replace(/^\//, '')}`;
}

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

/** O backend poe o token csrf num cookie legivel; ele volta no header. */
function tokenCsrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function chamar<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const r = await fetch(caminho, {
    ...opcoes,
    credentials: 'same-origin',
    headers: {
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.method && opcoes.method !== 'GET' ? { 'x-csrf-token': tokenCsrf() } : {}),
      ...opcoes.headers,
    },
  });

  if (r.status === 204) return undefined as T;

  const texto = await r.text();
  let corpo: unknown;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!r.ok) {
    const msg = (corpo as { erro?: string })?.erro ?? `erro ${r.status}`;
    throw new ErroApi(r.status, msg);
  }
  return corpo as T;
}

const corpo = (dados: unknown) => JSON.stringify(dados);

export const api = {
  sessao: () => chamar<Sessao>('/admin/sessao'),
  entrar: (email: string, senha: string) =>
    chamar<Sessao>('/admin/login', { method: 'POST', body: corpo({ email, senha }) }),
  sair: () => chamar<{ ok: true }>('/admin/logout', { method: 'POST' }),

  listarBebidas: () => chamar<Bebida[]>('/admin/api/bebidas'),
  criarBebida: (b: BebidaEntrada) => chamar<Bebida>('/admin/api/bebidas', { method: 'POST', body: corpo(b) }),
  editarBebida: (id: string, b: BebidaEntrada) =>
    chamar<Bebida>(`/admin/api/bebidas/${encodeURIComponent(id)}`, { method: 'PATCH', body: corpo(b) }),
  apagarBebida: (id: string) =>
    chamar<{ ok: true }>(`/admin/api/bebidas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reordenar: (tipo: Tipo, ids: string[]) =>
    chamar<{ ok: true }>(`/admin/api/bebidas/ordem/${tipo}`, { method: 'PATCH', body: corpo({ ids }) }),

  listarBarris: () => chamar<Barril[]>('/admin/api/barris'),
  salvarBarris: (barris: Barril[]) => chamar<Barril[]>('/admin/api/barris', { method: 'PUT', body: corpo({ barris }) }),

  lerConfig: () => chamar<Config>('/admin/api/config'),
  salvarConfig: (c: Config) => chamar<Config>('/admin/api/config', { method: 'PATCH', body: corpo(c) }),

  publicar: () => chamar<{ ok: true; ultima_publicacao: string }>('/admin/api/publicar', { method: 'POST' }),

  assinarUpload: (arquivo: File) =>
    chamar<AssinaturaUpload>('/admin/api/upload/assinar', {
      method: 'POST',
      body: corpo({ nomeArquivo: arquivo.name, contentType: arquivo.type, tamanho: arquivo.size }),
    }),
};

/**
 * Sobe o arquivo direto para o S3 com a URL assinada. O content-type tem de ser
 * exatamente o que foi assinado, senao o S3 recusa.
 */
export async function subirFoto(arquivo: File): Promise<string> {
  const { urlPut, urlFinal } = await api.assinarUpload(arquivo);
  const r = await fetch(urlPut, {
    method: 'PUT',
    body: arquivo,
    headers: { 'content-type': arquivo.type },
  });
  if (!r.ok) throw new ErroApi(r.status, `o S3 recusou o upload (${r.status})`);
  return urlFinal;
}

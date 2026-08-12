export type Tipo = 'lata' | 'growler';

/** Espelha as colunas de `bebidas`. Os nomes vem do banco, nao do site. */
export interface Bebida {
  id: string;
  tipo: Tipo;
  nome: string;
  estilo: string | null;
  accent: string | null;
  imagem_url: string | null;
  descricao: string | null;
  abv: string | null;
  ibu: string | null;
  volume: string | null;
  tags: string[];
  posicao: number;
  visivel: boolean;
  atualizado_em: string;
}

/** O que o formulario manda: so os campos editaveis, todos opcionais no PATCH. */
export type BebidaEntrada = Partial<
  Pick<
    Bebida,
    'tipo' | 'nome' | 'estilo' | 'accent' | 'imagem_url' | 'descricao' | 'abv' | 'ibu' | 'volume' | 'tags' | 'visivel'
  >
>;

export interface Barril {
  id?: number;
  tamanho: string;
  preco: string;
  posicao?: number;
}

export interface Config {
  whatsapp_number?: string;
  instagram_handle?: string;
  ifood_url?: string;
  mostrar_preco_barril?: string;
  ultima_publicacao?: string;
}

export interface FotoSalva {
  chave: string;
  /** Caminho relativo (/fotos/...), servido pelo proprio backend. */
  url: string;
}

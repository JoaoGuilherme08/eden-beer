-- Esquema inicial do admin da Eden Beer.
-- Rodar com: npm run migrar

create table if not exists admin_users (
  id         serial primary key,
  email      text unique not null,
  senha_hash text not null,               -- scrypt: salt:hash em hex
  criado_em  timestamptz not null default now()
);

-- Latas e growlers na mesma tabela: sao o mesmo objeto com fichas quase iguais,
-- e o site ja os renderiza com o mesmo card. `tipo` separa as duas abas.
create table if not exists bebidas (
  id            text primary key,          -- mantem os ids atuais: 'thesea', 'g7x1'...
  tipo          text not null check (tipo in ('lata', 'growler')),
  nome          text not null,
  estilo        text,
  accent        text,                      -- cor de destaque, ex '#17B4CE'
  imagem_url    text,
  descricao     text,
  -- Texto, nao numero: os dados atuais misturam '4.5%' e '4,5%', '473ml' e null.
  -- Guardar numero obrigaria a decidir formatacao e mudaria o que ja esta no ar.
  abv           text,
  ibu           text,
  volume        text,
  tags          text[] not null default '{}',
  posicao       int not null default 0,
  visivel       boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_bebidas_ordem on bebidas (tipo, posicao);

create table if not exists barris (
  id      serial primary key,
  tamanho text not null,                   -- '20L'
  preco   text not null,                   -- 'R$ 280,00'
  posicao int not null default 0
);

-- Chave/valor simples: sao 4 ajustes que o cliente edita, nao vale uma tabela por um.
create table if not exists config (
  chave text primary key,
  valor text
);

-- Sessoes do express-session (connect-pg-simple).
create table if not exists "session" (
  sid    varchar not null collate "default" primary key,
  sess   json not null,
  expire timestamp(6) not null
);

create index if not exists idx_session_expire on "session" (expire);

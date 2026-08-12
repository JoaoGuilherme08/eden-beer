# Backend + painel admin — Eden Beer

API, banco e o painel onde o cliente gerencia catálogo, barris e contatos.
Vai para a **Railway**. O site público continua estático na **Vercel** e recebe
os dados por um `data.js` gerado no build.

```
navegador do admin ──► Railway (Express + painel React)
                         │  ├─ Postgres
                         │  └─ URL pré-assinada ──► S3 (o arquivo vai direto,
                         │                              sem passar pela Railway)
                         └─ "Publicar site" ──► Deploy Hook da Vercel
                                                  └─ build lê /api/public/site
                                                     e grava data.js
```

## Rodar local

```bash
docker run -d --name eden-pg -e POSTGRES_PASSWORD=eden -e POSTGRES_DB=eden \
  -p 55432:5432 postgres:16-alpine

export DATABASE_URL="postgres://postgres:eden@127.0.0.1:55432/eden"
export SESSION_SECRET=dev
export SITE_PUBLIC_URL="http://127.0.0.1:8123"   # onde o site roda, para as fotos antigas

npm install
npm run migrar                                    # cria as tabelas
npm run semear                                    # traz o catálogo do .dc.html
npm run criar-admin -- voce@edenbeer.com 'uma-senha-longa'

npm --prefix admin install
npm --prefix admin run dev &                      # painel com HMR em :5173
npm run dev                                       # API em :3000
```

Em desenvolvimento use **http://localhost:5173/admin/** — o Vite faz proxy da API,
então o navegador vê tudo na mesma origem e o cookie de sessão funciona igual
em produção. Para testar o painel como ele vai rodar de verdade:
`npm run build && npm start` e abra `http://localhost:3000/admin/`.

## Testes

```bash
node check-api.js                   # 41 checagens: sessão, csrf, validação, crud, snapshot
```

O painel tem checagem de navegador junto das suítes do site, na raiz do repo.

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | a Railway injeta ao adicionar o Postgres |
| `SESSION_SECRET` | sim em produção | assina o cookie de sessão. Use algo longo e aleatório |
| `SITE_PUBLIC_URL` | recomendada | domínio do site; sem ela o painel não exibe as fotos de caminho relativo |
| `VERCEL_DEPLOY_HOOK_URL` | para publicar | Deploy Hook criado em Vercel → Settings → Git |
| `AWS_REGION` | para upload | ex. `us-east-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | para upload | usuário IAM só com `s3:PutObject` no bucket |
| `S3_BUCKET` | para upload | nome do bucket |
| `S3_PUBLIC_BASE_URL` | para upload | ex. `https://SEU-BUCKET.s3.us-east-1.amazonaws.com` |
| `NODE_ENV` | em produção | `production` — liga o cookie `secure` |

Sem as variáveis de S3 o painel funciona inteiro, só o upload de foto responde
503; dá para colar URL de imagem à mão enquanto isso.

## Deploy na Railway

1. Novo projeto a partir do repositório, **Root Directory `backend/`**.
2. Adicionar o plugin **Postgres** (ele injeta `DATABASE_URL`).
3. Build: `npm ci && npm run build` · Start: `npm start`.
4. Preencher as variáveis acima.
5. Uma vez, pelo console da Railway: `npm run migrar`, `npm run semear` e
   `npm run criar-admin -- email 'senha'`.

## S3

Bucket com **Block Public Access desligado só para leitura** e esta política:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::SEU-BUCKET/catalogo/*"
  }]
}
```

E CORS permitindo `PUT` do domínio da Railway:

```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["PUT"],
  "AllowedOrigins": ["https://SEU-APP.up.railway.app"],
  "ExposeHeaders": []
}]
```

O upload é assinado com `content-type` e `content-length` fixos e expira em 60s,
então a URL não serve para subir outra coisa nem vale depois.

## Quando o deploy não sobe

O boot imprime o que encontrou e `GET /health` diz o que falta:

```bash
curl https://SEU-APP.up.railway.app/health
```

| Resposta | Significa |
|---|---|
| `200 {"ok":true}` | tudo de pé |
| `"faltam tabelas (0/5)"` | falta rodar `npm run migrar` |
| `banco: falhou: ECONNREFUSED` | `DATABASE_URL` errada, ou o Postgres não foi vinculado ao serviço |
| `banco: falhou: ... SSL` | está usando a URL pública sem TLS — veja a nota de SSL abaixo |
| crash com `DATABASE_URL nao definida` | a variável não chegou no serviço |
| `painel: FALTA admin/dist` | o build command não rodou (`npm ci && npm run build`) |

**SSL:** a URL *privada* da Railway (`postgres.railway.internal`) fala sem TLS;
a *pública* (`.rlwy.net` / `.railway.app`) exige. O código decide pelo host, então
os dois casos funcionam sem você tocar em nada. Prefira a privada — é mais rápida
e não sai da rede deles.

## Notas de segurança

- Senha com `scrypt` do `node:crypto`, comparada com `timingSafeEqual`.
- Sessão em cookie `httpOnly` guardada no Postgres; regenerada a cada login.
- CSRF double-submit: cookie legível + header `x-csrf-token` nas rotas que escrevem.
- Rate limit de 10 tentativas por 10 minutos no login.
- **Não existe cadastro pela web** — admin só nasce pelo CLI.

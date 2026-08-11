// Checa a API do admin de ponta a ponta contra um backend rodando.
//   API=http://localhost:3000 EMAIL=... SENHA=... node check-api.js
const API = process.env.API || 'http://localhost:3000';
const EMAIL = process.env.EMAIL || 'joao@edenbeer.com';
const SENHA = process.env.SENHA || 'senha-de-teste-123';

const A = (c, m) => {
  if (!c) throw new Error('FALHOU: ' + m);
  console.log('  ok ' + m);
};

// Guarda cookies entre chamadas, como um navegador faria.
const potes = new Map();
const cookieHeader = () => [...potes].map(([k, v]) => `${k}=${v}`).join('; ');

async function chamar(caminho, opcoes = {}) {
  const r = await fetch(API + caminho, {
    ...opcoes,
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
      ...(potes.get('csrf') ? { 'x-csrf-token': potes.get('csrf') } : {}),
      ...opcoes.headers,
    },
  });
  for (const linha of r.headers.getSetCookie?.() ?? []) {
    const [par] = linha.split(';');
    const i = par.indexOf('=');
    potes.set(par.slice(0, i), par.slice(i + 1));
  }
  const texto = await r.text();
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    corpo = texto;
  }
  return { status: r.status, corpo };
}

console.log('\nsem sessao');
A((await chamar('/admin/api/bebidas')).status === 401, 'GET /admin/api/bebidas devolve 401');
A((await chamar('/admin/sessao')).status === 401, 'GET /admin/sessao devolve 401');
A((await chamar('/admin/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, senha: 'errada' }) })).status === 401,
  'senha errada devolve 401');
A((await chamar('/admin/login', { method: 'POST', body: JSON.stringify({ email: 'ninguem@x.com', senha: 'x' }) })).status === 401,
  'email inexistente devolve 401 (mesma resposta, nao revela quem existe)');

console.log('\nlogin');
const login = await chamar('/admin/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, senha: SENHA }) });
A(login.status === 200 && login.corpo.email === EMAIL, 'login com senha certa');
A(potes.has('eden.sid') && potes.has('csrf'), 'recebeu cookie de sessao e de csrf');

console.log('\ncsrf');
const semToken = await fetch(API + '/admin/api/bebidas', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: cookieHeader() },
  body: JSON.stringify({ tipo: 'lata', nome: 'X' }),
});
A(semToken.status === 403, 'POST sem header x-csrf-token e recusado');
A((await chamar('/admin/api/bebidas')).status === 200, 'GET nao exige csrf');

console.log('\nvalidacao');
A((await chamar('/admin/api/bebidas', { method: 'POST', body: JSON.stringify({ tipo: 'lata' }) })).status === 400,
  'sem nome devolve 400');
A((await chamar('/admin/api/bebidas', { method: 'POST', body: JSON.stringify({ tipo: 'garrafa', nome: 'X' }) })).status === 400,
  'tipo invalido devolve 400');
A((await chamar('/admin/api/bebidas', { method: 'POST', body: JSON.stringify({ tipo: 'lata', nome: 'X', accent: 'azul' }) })).status === 400,
  'accent fora de hex devolve 400');

console.log('\ncrud de bebida');
const criada = await chamar('/admin/api/bebidas', {
  method: 'POST',
  body: JSON.stringify({ tipo: 'lata', nome: 'Teste Automático', estilo: 'IPA', accent: '#F2670A', abv: '5,0%' }),
});
A(criada.status === 201, 'cria bebida');
A(criada.corpo.id === 'testeautomatico', `id gerado sem acento: ${criada.corpo.id}`);
const id = criada.corpo.id;

A((await chamar('/admin/api/bebidas', { method: 'POST', body: JSON.stringify({ tipo: 'lata', nome: 'Teste Automático' }) })).status === 409,
  'id repetido devolve 409');

const editada = await chamar(`/admin/api/bebidas/${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ nome: 'Teste Editado', tags: ['nova', 'tag'] }),
});
A(editada.status === 200 && editada.corpo.nome === 'Teste Editado', 'edita bebida');
A(JSON.stringify(editada.corpo.tags) === '["nova","tag"]', 'grava tags');

// PATCH parcial nao pode zerar o resto: mandar so o nome ja apagou estilo,
// accent e abv uma vez.
A(editada.corpo.estilo === 'IPA', 'PATCH parcial preserva estilo');
A(editada.corpo.accent === '#F2670A', 'PATCH parcial preserva accent');
A(editada.corpo.abv === '5,0%', 'PATCH parcial preserva abv');

const limpo = await chamar(`/admin/api/bebidas/${id}`, { method: 'PATCH', body: JSON.stringify({ ibu: null }) });
A(limpo.status === 200 && limpo.corpo.ibu === null, 'mandar null limpa o campo de proposito');
A(limpo.corpo.estilo === 'IPA', 'e ainda assim nao mexe nos outros');

const antes = (await chamar('/api/public/site')).corpo;
A(antes.latas.some((l) => l.id === id), 'bebida nova aparece no snapshot publico');

const ocultar = await chamar(`/admin/api/bebidas/${id}`, { method: 'PATCH', body: JSON.stringify({ visivel: false }) });
A(ocultar.status === 200, 'PATCH so com visivel e aceito (nao exige nome)');
const oculta = (await chamar('/api/public/site')).corpo;
A(!oculta.latas.some((l) => l.id === id), 'bebida invisivel some do snapshot publico');

A((await chamar(`/admin/api/bebidas/${id}`, { method: 'PATCH', body: JSON.stringify({ nome: '' }) })).status === 400,
  'PATCH com nome vazio devolve 400');
A((await chamar(`/admin/api/bebidas/${id}`, { method: 'PATCH', body: JSON.stringify({}) })).status === 400,
  'PATCH sem nenhum campo devolve 400');
A((await chamar('/admin/api/bebidas/nao-existe', { method: 'PATCH', body: JSON.stringify({ nome: 'X' }) })).status === 404,
  'PATCH em id inexistente devolve 404');

console.log('\nordem');
const latas = (await chamar('/admin/api/bebidas')).corpo.filter((b) => b.tipo === 'lata');
const invertido = latas.map((b) => b.id).reverse();
A((await chamar('/admin/api/bebidas/ordem/lata', { method: 'PATCH', body: JSON.stringify({ ids: invertido }) })).status === 200,
  'reordena');
const depois = (await chamar('/admin/api/bebidas')).corpo.filter((b) => b.tipo === 'lata');
A(depois[0].id === invertido[0], 'a ordem nova valeu');
await chamar('/admin/api/bebidas/ordem/lata', { method: 'PATCH', body: JSON.stringify({ ids: invertido.reverse() }) });

A((await chamar(`/admin/api/bebidas/${id}`, { method: 'DELETE' })).status === 200, 'apaga bebida');
A((await chamar(`/admin/api/bebidas/${id}`, { method: 'DELETE' })).status === 404, 'apagar de novo devolve 404');

console.log('\nbarris e config');
const barris = await chamar('/admin/api/barris', {
  method: 'PUT',
  body: JSON.stringify({ barris: [{ tamanho: '20L', preco: 'R$ 300,00' }, { tamanho: '50L', preco: 'R$ 720,00' }] }),
});
A(barris.status === 200 && barris.corpo.length === 2, 'substitui a lista de barris');
A((await chamar('/api/public/site')).corpo.barris[0].price === 'R$ 300,00', 'preco novo no snapshot');
A((await chamar('/admin/api/barris', { method: 'PUT', body: JSON.stringify({ barris: [{ tamanho: '20L' }] }) })).status === 400,
  'barril sem preco devolve 400');

const cfg = await chamar('/admin/api/config', { method: 'PATCH', body: JSON.stringify({ instagram_handle: 'edenteste' }) });
A(cfg.status === 200 && cfg.corpo.instagram_handle === 'edenteste', 'edita config');
A((await chamar('/admin/api/config', { method: 'PATCH', body: JSON.stringify({ chave_inventada: 'x' }) })).status === 400,
  'chave desconhecida devolve 400');
await chamar('/admin/api/config', { method: 'PATCH', body: JSON.stringify({ instagram_handle: 'edenbeerbirigui' }) });

console.log('\nupload e publicacao (sem credenciais configuradas)');
const semBucket = await chamar('/admin/api/upload/assinar', {
  method: 'POST',
  body: JSON.stringify({ nomeArquivo: 'a.jpg', contentType: 'image/jpeg', tamanho: 1000 }),
});
A([503, 400].includes(semBucket.status), `sem S3_BUCKET responde ${semBucket.status}, nao 500`);
A((await chamar('/admin/api/upload/assinar', { method: 'POST', body: JSON.stringify({ contentType: 'application/pdf', tamanho: 10 }) })).status === 400,
  'tipo de arquivo nao permitido devolve 400');
A((await chamar('/admin/api/publicar', { method: 'POST' })).status === 503, 'publicar sem deploy hook devolve 503');

console.log('\nlogout');
A((await chamar('/admin/logout', { method: 'POST' })).status === 200, 'logout');
potes.delete('eden.sid');
A((await chamar('/admin/api/bebidas')).status === 401, 'sessao encerrada volta a 401');

console.log('\nTudo passou');

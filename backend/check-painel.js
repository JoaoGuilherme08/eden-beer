// Checa o painel admin no navegador, contra o backend rodando.
//
//   npm i playwright  (com o backend rodando em :3000)
//   node check-painel.js
const { chromium } = require('playwright');
const A = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('  ok ' + m); };
const ADMIN = 'http://localhost:3000/admin/';

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const errosJs = [];
  const respostasRuins = [];
  p.on('pageerror', (e) => errosJs.push(e.message));
  p.on('response', (r) => {
    // /admin/sessao 401 antes do login e /admin/login 401 do teste de senha
    // errada sao esperados; qualquer outro >=400 e bug.
    const esperado = /\/admin\/(sessao|login)$/.test(r.url()) && r.status() === 401;
    if (r.status() >= 400 && !esperado) respostasRuins.push(`${r.status()} ${r.url()}`);
  });
  // So excecoes de verdade: o 401 da checagem de sessao antes do login e
  // esperado e aparece no console como erro de rede.
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosJs.push(m.text());
  });

  console.log('\nlogin');
  await p.goto(ADMIN, { waitUntil: 'networkidle' });
  A(await p.getByLabel('E-mail').isVisible(), 'sem sessao cai na tela de login');
  A(await p.locator('nav').count() === 0, 'e nao mostra o menu do painel');

  await p.getByLabel('E-mail').fill('joao@edenbeer.com');
  await p.getByLabel('Senha').fill('errada');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForTimeout(600);
  A(await p.locator('.aviso').isVisible(), 'senha errada mostra aviso na tela');

  await p.getByLabel('Senha').fill('senha-de-teste-123');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForSelector('nav');
  A(true, 'login entra no painel');

  console.log('\nbebidas');
  await p.waitForSelector('.item');
  const contaLatas = await p.locator('.item').count();
  A(contaLatas === 11, `abre em Latas com 11 itens (${contaLatas})`);
  A(/Latas \(11\)/.test(await p.locator('[role=tab]').first().textContent()), 'aba mostra a contagem');

  await p.getByRole('tab', { name: /Growlers/ }).click();
  await p.waitForTimeout(400);
  A(await p.locator('.item').count() === 23, 'aba Growlers mostra 23');

  await p.getByRole('tab', { name: /Latas/ }).click();
  await p.waitForTimeout(400);

  console.log('\nbusca');
  await p.getByPlaceholder('buscar por nome ou estilo').fill('weizen');
  await p.waitForTimeout(400);
  A(await p.locator('.item').count() === 1, 'busca filtra');
  A(await p.locator('.botoes-ordem button').first().isDisabled(), 'reordenar fica desligado durante a busca');
  await p.getByPlaceholder('buscar por nome ou estilo').fill('');
  await p.waitForTimeout(400);

  console.log('\nreordenar');
  const nomes = () => p.locator('.item-nome').allTextContents();
  const antes = await nomes();
  await p.locator('.item').nth(1).locator('button[title=subir]').click();
  await p.waitForTimeout(700);
  const depois = await nomes();
  A(depois[0] === antes[1] && depois[1] === antes[0], `subir trocou (${antes[0]} <-> ${antes[1]})`);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.item');
  A((await nomes())[0] === antes[1], 'a ordem persistiu apos recarregar');
  await p.locator('.item').nth(1).locator('button[title=subir]').click();
  await p.waitForTimeout(700);

  console.log('\neditar');
  await p.locator('.item').first().getByRole('button', { name: 'Editar' }).click();
  await p.waitForSelector('.modal');
  const nomeOriginal = await p.getByLabel('Nome').inputValue();
  const estiloOriginal = await p.getByLabel('Estilo').inputValue();
  await p.getByLabel('Nome').fill('Nome Editado No Painel');
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.waitForTimeout(800);
  A((await nomes())[0] === 'Nome Editado No Painel', 'edicao aparece na lista');

  await p.locator('.item').first().getByRole('button', { name: 'Editar' }).click();
  await p.waitForSelector('.modal');
  A(await p.getByLabel('Estilo').inputValue() === estiloOriginal, 'editar o nome nao apagou o estilo');
  await p.getByLabel('Nome').fill(nomeOriginal);
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.waitForTimeout(800);

  console.log('\nocultar');
  await p.locator('.item').first().getByRole('button', { name: 'Ocultar' }).click();
  await p.waitForTimeout(700);
  A(await p.locator('.item.oculto').count() === 1, 'item fica marcado como oculto');
  const pub = await (await fetch('http://localhost:3000/api/public/site')).json();
  A(pub.latas.length === 10, `snapshot publico cai para 10 latas (${pub.latas.length})`);
  await p.locator('.item').first().getByRole('button', { name: 'Mostrar' }).click();
  await p.waitForTimeout(700);

  console.log('\nnavegacao');
  await p.getByRole('link', { name: 'Barris' }).click();
  await p.waitForTimeout(500);
  A(p.url().endsWith('/admin/barris'), 'a URL muda ao navegar');
  A((await p.locator('.linha .field').count()) >= 6, 'barris carregou os campos');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  A(p.url().endsWith('/admin/barris'), 'F5 numa rota do SPA nao perde a pagina');
  A(await p.getByRole('link', { name: 'Barris' }).isVisible(), 'e continua logado');

  await p.getByRole('link', { name: 'Contatos' }).click();
  await p.waitForTimeout(600);
  const dica = await p.locator('small').first().textContent();
  A(/wa\.me\/5518996254970/.test(dica), `contatos mostram o link real: ${dica}`);

  console.log('\nsair');
  await p.getByRole('button', { name: 'Sair' }).click();
  await p.waitForTimeout(700);
  A(await p.getByLabel('E-mail').isVisible(), 'logout volta para o login');

  A(errosJs.length === 0, `nenhuma excecao de js (${errosJs.slice(0, 2).join(' | ')})`);
  A(respostasRuins.length === 0, `nenhuma requisicao falhou (${respostasRuins.slice(0, 3).join(' | ')})`);
  await b.close();
  console.log('\nTudo passou');
})().catch((e) => { console.error(e.message); process.exit(1); });

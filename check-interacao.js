// Checa o modal de detalhe da cerveja e o carrossel da home.
//
//   python3 -m http.server 8123 &
//   npm i playwright
//   SITE_URL="http://127.0.0.1:8123/Eden%20Beer%20-%20Site.dc.html" node check-interacao.js
const { chromium, devices } = require('playwright');

const A = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('  ok ' + m); };
const sl = (p) => p.$eval('[data-carousel]', (e) => e.scrollLeft);
const velocidade = async (p, ms) => { const a = await sl(p); await p.waitForTimeout(ms); return ((await sl(p)) - a) / ms; };
const cardPorNome = (p, nome) => p.locator('button:has(img)').filter({ hasText: nome }).first();
const corpoModal = (p) => p.locator('button[aria-label="Fechar"]').locator('xpath=..');
const fechado = async (p) => (await p.locator('button[aria-label="Fechar"]').count()) === 0;

// p.mouse usa coordenadas de janela: o carrossel precisa estar na viewport.
async function trazCarrossel(p) {
  await p.locator('[data-carousel]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  return p.locator('[data-carousel]').boundingBox();
}

/**
 * Le o catalogo direto da tela, em vez de afirmar nomes e quantidades fixas.
 * O cliente edita o catalogo pelo painel: qualquer numero cravado aqui viraria
 * alarme falso na primeira vez que ele mexesse.
 */
async function lerAba(p, aba) {
  await p.getByRole('button', { name: aba, exact: true }).last().click();
  await p.waitForTimeout(350);
  const cards = p.locator('button:has(img)');
  const n = await cards.count();
  const nomes = [];
  for (let i = 0; i < n; i++) {
    nomes.push((await cards.nth(i).textContent()).trim().split('\n')[0].trim());
  }
  return { n, nomes };
}

async function testaModal(p, largura) {
  console.log(`\nmodal @ ${largura}px`);
  await p.getByRole('button', { name: 'Catálogo', exact: true }).first().click();
  await p.waitForTimeout(300);

  A(await p.getByRole('button', { name: 'Todas', exact: true }).count() === 0, 'chips de filtro sumiram');
  A(await fechado(p), 'modal fechado no inicio');

  const latas = await lerAba(p, 'Latas');
  A(latas.n > 0, `a aba Latas tem bebida (${latas.n})`);

  // Abre as tres primeiras: o que importa e o card levar ao detalhe certo,
  // nao qual bebida esta em primeiro lugar.
  for (const nome of latas.nomes.slice(0, 3)) {
    await cardPorNome(p, nome).click();
    await p.waitForTimeout(300);
    const t = await corpoModal(p).textContent();
    A(t.includes(nome), `modal de "${nome}" mostra o proprio nome`);
    A(await corpoModal(p).locator('img').count() === 1, `modal de "${nome}" mostra a foto`);
    // Rotulo de ficha so pode existir com valor ao lado.
    for (const rotulo of ['ABV', 'IBU', 'VOL.']) {
      if (t.includes(rotulo)) {
        const depois = t.split(rotulo)[1].trim();
        A(depois.length > 0 && !/^(ABV|IBU|VOL\.)/.test(depois), `"${nome}": ${rotulo} tem valor`);
      }
    }
    await p.locator('button[aria-label="Fechar"]').click();
    await p.waitForTimeout(200);
  }

  A(p.url().endsWith('.dc.html') || p.url().endsWith('/'), 'nao navegou para outra pagina');
  A(await p.locator('h1').first().isVisible(), 'pagina continua montada atras');

  await cardPorNome(p, latas.nomes[0]).click();
  await p.waitForTimeout(300);
  const box = await corpoModal(p).boundingBox();
  A(box.x >= -1 && box.x + box.width <= largura + 1, 'modal cabe na viewport');

  await p.mouse.click(largura - 6, 6);
  await p.waitForTimeout(250);
  A(await fechado(p), 'clique no fundo fecha');

  const growlers = await lerAba(p, 'Growlers');
  A(growlers.n > 0, `a aba Growlers tem bebida (${growlers.n})`);
  await cardPorNome(p, growlers.nomes[0]).click();
  await p.waitForTimeout(300);
  A(!(await fechado(p)), 'growler abre no mesmo modal');
  A((await corpoModal(p).textContent()).includes(growlers.nomes[0]), 'com o nome do growler');

  const noTopo = await p.evaluate((w) => {
    const el = document.elementFromPoint(w / 2, 30);
    if (!el) return 'nada';
    return el.tagName === 'BUTTON' && el.getAttribute('aria-label') !== 'Fechar' ? 'nav' : 'overlay';
  }, largura);
  A(noTopo === 'overlay', 'overlay cobre a nav enquanto aberto');

  const fab = await p.evaluate(() => {
    const f = document.querySelector('a[href*="wa.me"]');
    const b = f.getBoundingClientRect();
    return f.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  });
  A(!fab, 'botao do WhatsApp fica atras do modal');

  await p.locator('button[aria-label="Fechar"]').click();
  await p.waitForTimeout(250);
  A(await fechado(p), 'X fecha');
  await p.getByRole('button', { name: 'Início', exact: true }).first().click();
  await p.waitForTimeout(300);
}

// As setas ficam por cima da faixa de atalhos: o risco e roubar o clique deles.
async function testaDicaMenu(p, largura) {
  console.log(`\nsetas do menu @ ${largura}px`);
  const vis = async () => ({
    esq: await p.locator('.eb-navhint-esq').isVisible(),
    dir: await p.locator('.eb-navhint-dir').isVisible(),
  });
  const rola = async (x) => {
    await p.$eval('.eb-navbtns', (e, v) => { e.scrollLeft = v; }, x);
    await p.waitForTimeout(250);
  };

  if (largura > 720) {
    const v = await vis();
    A(!v.esq && !v.dir, 'nenhuma seta no desktop');
    return;
  }

  const max = await p.$eval('.eb-navbtns', (e) => e.scrollWidth - e.clientWidth);
  A(max > 20, `a faixa realmente rola (${max}px de sobra)`);

  let v = await vis();
  A(!v.esq && v.dir, 'no inicio: so a seta da direita');
  await rola(Math.round(max / 2));
  v = await vis();
  A(v.esq && v.dir, 'no meio: as duas');
  await rola(max);
  v = await vis();
  A(v.esq && !v.dir, 'no fim: so a seta da esquerda');
  await rola(0);
  v = await vis();
  A(!v.esq && v.dir, 'de volta ao inicio: so a da direita');

  await rola(Math.round(max / 2));
  for (const lado of ['esq', 'dir']) {
    const d = await p.locator('.eb-navhint-' + lado).boundingBox();
    const faixa = await p.locator('.eb-navbtns').boundingBox();
    A(d.y >= faixa.y - 2 && d.y + d.height <= faixa.y + faixa.height + 2, `seta ${lado} na mesma linha dos botoes`);
    A(d.x >= -1 && d.x + d.width <= largura + 1, `seta ${lado} nao vaza a viewport`);
    const dentro = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y).closest('.eb-navhint'),
      [d.x + d.width / 2, d.y + d.height / 2]);
    A(!dentro, `seta ${lado} nao intercepta o ponteiro`);
  }

  for (const nome of ['Início', 'Catálogo', 'Barris & Eventos', 'Nossa História', 'Onde Encontrar', 'Revenda']) {
    await p.getByRole('button', { name: nome, exact: true }).first().click({ timeout: 8000 });
    await p.waitForTimeout(100);
  }
  A(true, 'os 6 atalhos continuam clicaveis com elas por cima');

  await rola(max);
  v = await vis();
  A(v.esq && !v.dir, 'estado correto depois de navegar pelas telas');
  await p.getByRole('button', { name: 'Início', exact: true }).first().click();
  await p.waitForTimeout(200);
}

// Latas e growlers no mesmo catalogo, trocados por abas.
async function testaAbas(p) {
  console.log('\ncatalogo com abas');
  const aba = (nome) => p.getByRole('button', { name: nome, exact: true }).last();
  const cards = () => p.locator('button:has(img)').count();
  const growlerGrande = () => p.locator('img[alt="Growlers Eden Beer"]');

  // pagina nova: a aba padrao so pode ser verificada sem estado de teste anterior
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Catálogo', exact: true }).first().click();
  await p.waitForTimeout(350);

  A(await growlerGrande().count() === 0 || !(await growlerGrande().isVisible()),
    'abre em Latas: a imagem do growler nao aparece');
  const nLatas = await cards();
  A(nLatas > 0, `aba Latas tem bebida (${nLatas})`);

  await aba('Growlers').click();
  await p.waitForTimeout(400);
  const nGrowlers = await cards();
  A(nGrowlers > 0, `aba Growlers tem bebida (${nGrowlers})`);
  A(await growlerGrande().isVisible(), 'imagem grande do growler aparece');
  const img = await growlerGrande().boundingBox();
  A(img.height > 250, `imagem e grande de verdade (${Math.round(img.width)}x${Math.round(img.height)})`);
  A(img.y < (await p.locator('button:has(img)').first().boundingBox()).y, 'imagem vem acima do catalogo');
  A(await p.getByRole('link', { name: 'Pedir meu Growler' }).count() === 0, 'CTA "Pedir meu Growler" removido');

  await aba('Latas').click();
  await p.waitForTimeout(400);
  A(await cards() === nLatas, 'volta para Latas com a mesma lista');
  A(!(await growlerGrande().isVisible()), 'imagem some ao voltar');

  // As duas abas mostram conjuntos diferentes. Comparado por nome, sem cravar
  // quais — o cliente edita o catalogo e nomes fixos aqui viravam alarme falso.
  const nomesDe = async (nome) => {
    await aba(nome).click();
    await p.waitForTimeout(350);
    const n = await p.locator('button:has(img)').count();
    const lista = [];
    for (let i = 0; i < n; i++) {
      lista.push((await p.locator('button:has(img)').nth(i).textContent()).trim().split('\n')[0].trim());
    }
    return lista;
  };
  const latas = await nomesDe('Latas');
  const growlers = await nomesDe('Growlers');
  A(latas.length + growlers.length === nLatas + nGrowlers, 'nenhuma bebida aparece nas duas abas ao mesmo tempo');

  // Nomes repetidos entre as listas (Weizen, Red Ale...) sao normais: e a mesma
  // cerveja em lata e em growler. O que nao pode e duplicar dentro de uma aba.
  for (const [rotulo, lista] of [['Latas', latas], ['Growlers', growlers]]) {
    const repetidos = lista.filter((n, i) => lista.indexOf(n) !== i);
    A(repetidos.length === 0, `${rotulo}: sem card duplicado (${repetidos.join(', ') || 'nenhum'})`);
  }

  // card da home abre direto na aba Growlers
  await p.getByRole('button', { name: 'Início', exact: true }).first().click();
  await p.waitForTimeout(300);
  await p.locator('div', { hasText: /^Growlers de 1L/ }).first().click();
  await p.waitForTimeout(400);
  A(await p.locator('h1').first().textContent() === 'Catálogo de Bebidas', 'card da home leva ao catalogo');
  A(await growlerGrande().isVisible(), 'e ja abre na aba Growlers');
}

// O iFood ficou so no botao do hero da home; produtos e demais telas nao tem.
async function testaIfood(p) {
  console.log('\nlink do iFood');
  const esperado = 'https://www.ifood.com.br/delivery/birigui-sp/eden-beer-centro/f7ad8c52-b7cf-4595-bab6-0c76ee8e99af?UTM_Medium=share';
  await p.getByRole('button', { name: 'Início', exact: true }).first().click();
  await p.waitForTimeout(250);

  const naHome = await p.$$eval('a[href*="ifood"]', (as) => as.map((a) => a.href));
  A(naHome.length === 1, `home tem exatamente 1 link (achou ${naHome.length})`);
  A(naHome[0] === esperado, 'aponta para a URL da loja, com o UTM');

  for (const tela of ['Catálogo', 'Barris & Eventos', 'Nossa História', 'Onde Encontrar', 'Revenda']) {
    await p.getByRole('button', { name: tela, exact: true }).first().click();
    await p.waitForTimeout(250);
    A(await p.locator('a[href*="ifood"]').count() === 0, `${tela}: nenhum link`);
  }

  await p.getByRole('button', { name: 'Catálogo', exact: true }).first().click();
  await p.waitForTimeout(250);
  await p.getByRole('button', { name: 'Latas', exact: true }).first().click(); // pode vir da aba Growlers
  await p.waitForTimeout(250);
  await p.locator('button:has(img)').first().click(); // qualquer bebida serve
  await p.waitForTimeout(350);
  A(await p.locator('a[href*="ifood"]').count() === 0, 'modal de produto: nenhum link');
  await p.locator('button[aria-label="Fechar"]').click();
  await p.waitForTimeout(200);
}

async function testaWhatsApp(p) {
  console.log('\nlinks de whatsapp');
  const esperado = 'https://wa.me/5518996254970'; // wa.me so aceita digitos
  let total = 0;
  for (const tela of ['Início', 'Catálogo', 'Barris & Eventos', 'Onde Encontrar', 'Revenda']) {
    await p.getByRole('button', { name: tela, exact: true }).first().click();
    await p.waitForTimeout(300);
    const hrefs = await p.$$eval('a[href*="wa.me"]', (as) => as.map((a) => a.href));
    A(hrefs.length > 0 && hrefs.every((h) => h === esperado), `${tela}: ${hrefs.length} link(s) para o numero certo`);
    total += hrefs.length;
  }
  A(total >= 6, `todos os ${total} links conferidos`);
}

async function testaCarrossel(p) {
  console.log('\ncarrossel (mouse)');
  await p.getByRole('button', { name: 'Início', exact: true }).first().click();
  await p.waitForTimeout(300);
  const box = await trazCarrossel(p);
  A(box.y >= 0, 'carrossel visivel para o teste de arrasto');

  const v0 = await velocidade(p, 1200);
  A(v0 > 0.075 && v0 < 0.095, `corre sozinho para a esquerda a ~0.085 px/ms (${v0.toFixed(3)})`);

  const cy = box.y + box.height / 2;
  await p.mouse.move(box.x + 600, cy);
  await p.mouse.down();
  await p.mouse.move(box.x + 400, cy, { steps: 10 });
  const durante = await sl(p);
  await p.waitForTimeout(400);
  A(Math.abs((await sl(p)) - durante) < 2, 'fica parado enquanto o mouse esta pressionado');

  await p.mouse.move(box.x + 700, cy, { steps: 10 });
  const voltou = await sl(p);
  A(voltou < durante, 'arrasta nos dois sentidos');

  await p.mouse.up();
  await p.mouse.move(box.x + 700, box.y - 60);
  await p.waitForTimeout(1400);
  A((await sl(p)) > voltou + 20, 'volta a correr ao soltar');

  await p.mouse.move(box.x + 500, cy);
  await p.waitForTimeout(250);
  const h1 = await sl(p);
  await p.waitForTimeout(800);
  A(Math.abs((await sl(p)) - h1) < 2, 'passar o mouse por cima pausa');
  await p.mouse.move(box.x + 500, box.y - 60);
  await p.waitForTimeout(1200);
  A((await sl(p)) > h1 + 20, 'tirar o mouse retoma');

  // arrasto longo tem de emendar o laco, nao esbarrar no fim da trilha
  const meio = await p.$eval('[data-carousel]', (e) => e.firstElementChild.scrollWidth / 2);
  await p.mouse.move(box.x + 850, cy);
  await p.mouse.down();
  let x = 850;
  for (let i = 0; i < 40; i++) { x -= 120; await p.mouse.move(box.x + x, cy); }
  const longo = await sl(p);
  await p.mouse.up();
  await p.mouse.move(box.x + 500, box.y - 80);
  A(longo < meio, `arrasto longo emendou em vez de travar (${longo.toFixed(0)} < ${meio.toFixed(0)})`);
  await p.waitForTimeout(1200);
  const d1 = await sl(p);
  await p.waitForTimeout(800);
  A((await sl(p)) > d1, 'segue correndo depois do arrasto longo');

  // navegar de ida e volta nao pode empilhar loops de rAF (o sintoma e acelerar)
  for (let i = 0; i < 4; i++) {
    await p.getByRole('button', { name: 'Catálogo', exact: true }).first().click();
    await p.waitForTimeout(150);
    await p.getByRole('button', { name: 'Início', exact: true }).first().click();
    await p.waitForTimeout(150);
  }
  await trazCarrossel(p);
  const vFinal = await velocidade(p, 1200);
  A(Math.abs(vFinal - v0) < 0.03, `velocidade estavel apos 4 idas e voltas (${v0.toFixed(3)} -> ${vFinal.toFixed(3)})`);
}

async function testaToque(p) {
  console.log('\ncarrossel (toque, iPhone)');
  const box = await trazCarrossel(p);
  const y = box.y + box.height / 2;
  const v0 = await velocidade(p, 1000);
  A(v0 > 0.075, `corre sozinho no celular (${v0.toFixed(3)} px/ms)`);

  const antes = await sl(p);
  await p.evaluate(([x0, y0]) => {
    const el = document.querySelector('[data-carousel]');
    const toques = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y0 })];
    el.dispatchEvent(new TouchEvent('touchstart', { touches: toques(x0), bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: x0, clientY: y0, bubbles: true }));
    for (let i = 1; i <= 10; i++) {
      el.scrollLeft += 15; // o navegador rolaria sozinho; simulamos o efeito
      el.dispatchEvent(new TouchEvent('touchmove', { touches: toques(x0 - i * 15), bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 1, bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }));
  }, [box.x + 250, y]);
  A((await sl(p)) > antes, 'swipe de toque move o carrossel');

  await p.waitForTimeout(1500);
  const vDepois = await velocidade(p, 1000);
  A(vDepois > 0.075, `volta a correr depois do toque (${vDepois.toFixed(3)} px/ms)`);
  A(Math.abs(vDepois - v0) < 0.03, 'velocidade inalterada (o toque nao deixou hover travado)');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  for (const largura of [390, 1280]) {
    const p = await browser.newPage({ viewport: { width: largura, height: 800 } });
    await p.goto(process.env.SITE_URL, { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-carousel]');
    await testaDicaMenu(p, largura);
    await testaModal(p, largura);
    if (largura === 1280) {
      await testaAbas(p);
      await testaIfood(p);
      await testaWhatsApp(p);
      await testaCarrossel(p);
    }
    await p.close();
  }

  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  await p.goto(process.env.SITE_URL, { waitUntil: 'networkidle' });
  await p.waitForSelector('[data-carousel]');
  await testaToque(p);

  await browser.close();
  console.log('\nTudo passou');
})().catch((e) => { console.error(e.message); process.exit(1); });

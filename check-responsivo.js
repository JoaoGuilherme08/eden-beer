// Checa responsividade: nenhum elemento nem texto pode vazar a viewport, e todo
// botao da nav tem de ser clicavel — em 8 larguras x 7 telas.
//
//   python3 -m http.server 8123 &
//   npm i playwright
//   SITE_URL="http://127.0.0.1:8123/Eden%20Beer%20-%20Site.dc.html" node check-responsivo.js
const { chromium } = require('playwright');

const URL = process.env.SITE_URL;
const PAGES = ['Início', 'Catálogo', 'Barris & Eventos', 'Nossa História', 'Onde Encontrar', 'Revenda'];

// Um elemento so "estoura" se nenhum ancestral recorta o overflow — a marquee
// e larga de proposito dentro de um overflow:hidden.
const FIND_OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX !== 'visible') return true;
    }
    return false;
  };
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const txt = (el.textContent || '').trim().slice(0, 40);
    if (r.right > vw + 1 || r.left < -1) {
      if (!clipped(el)) bad.push('viewport: ' + el.tagName.toLowerCase() + ' @' + Math.round(r.left) + '..' + Math.round(r.right) + ' :: ' + txt);
    }
    // Texto vazando da caixa que deveria conte-lo. scrollWidth so enxerga overflow
    // a direita, entao texto right-aligned que vaza a esquerda passa batido — e o
    // no com texto costuma ser um <span> inline, cuja propria caixa acompanha o
    // texto. Logo: mede-se o Range contra o bloco ancestral mais proximo.
    if (el.children.length === 0 && txt) {
      let block = el;
      while (block && getComputedStyle(block).display === 'inline') block = block.parentElement;
      if (block) {
        const bs = getComputedStyle(block);
        if (bs.overflowX === 'visible') {
          const range = document.createRange();
          range.selectNodeContents(el);
          const t = range.getBoundingClientRect();
          const br = block.getBoundingClientRect();
          const lo = br.left + parseFloat(bs.paddingLeft), hi = br.right - parseFloat(bs.paddingRight);
          if (t.width && (t.left < lo - 1 || t.right > hi + 1)) {
            bad.push('texto: ' + Math.round(t.left) + '..' + Math.round(t.right) +
                     ' vs caixa ' + Math.round(lo) + '..' + Math.round(hi) + ' :: ' + txt);
          }
        }
      }
    }
  }
  return bad.slice(0, 8);
})()`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  let failures = 0;

  for (const width of [320, 360, 390, 430, 500, 600, 720, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 760 }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('button', { timeout: 15000 });

    for (const label of PAGES) {
      await page.getByRole('button', { name: label, exact: true }).first().click({ timeout: 15000 });
      await page.waitForTimeout(350);

      const bad = await page.evaluate(FIND_OVERFLOW);
      const tag = `${width}px / ${label}`;
      if (bad.length) {
        failures++;
        console.log(`FAIL ${tag}`);
        bad.forEach((b) => console.log(`       ${b}`));
      } else {
        console.log(`ok   ${tag}`);
      }
    }
    await page.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} tela(s) com overflow` : '\nSem overflow horizontal em nenhuma tela');
  process.exit(failures ? 1 : 0);
})();

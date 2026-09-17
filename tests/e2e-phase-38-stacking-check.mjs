import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const rows = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll('#clubs [aria-label^="Карточка клуба"]')) {
    const h3 = card.querySelector('h3'); const img = card.querySelector('img'); const badge = card.querySelector('[data-testid="verified-badge"]');
    h3.scrollIntoView({ block: 'center' });
    const r = h3.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
    const rating = card.querySelector('[aria-label^="Рейтинг"]'); const rr = rating?.getBoundingClientRect(); const hitR = rr ? document.elementFromPoint(rr.left + 4, rr.top + rr.height / 2) : null;
    out.push(`${card.getAttribute('aria-label').replace('Карточка клуба: ', '')}: img ${img ? 'есть, opacity ' + getComputedStyle(img).opacity + ', complete ' + img.complete + ', natural ' + img.naturalWidth : 'нет'}; под именем ${hit?.tagName} ${hit?.className?.toString().slice(0, 40)}; под рейтингом ${hitR?.tagName}; бейдж ${badge ? getComputedStyle(badge).backgroundColor + ' / ' + getComputedStyle(badge).color : 'нет'}`);
  }
  const hero = document.querySelector('#hero aside h3'); const hr = hero.getBoundingClientRect(); window.scrollTo(0, 0); const hh = document.elementFromPoint(hr.left + 8, hr.top + hr.height / 2);
  out.push(`герой: под именем ${hh?.tagName}, img opacity ${getComputedStyle(document.querySelector('#hero aside img')).opacity}`);
  const cat = document.querySelector('#clubs [aria-label^="Карточка клуба"]');
  return out;
});
console.log(rows.join('\n'));
await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
console.log(await page.evaluate(() => { const card = Array.from(document.querySelectorAll('#results [aria-label^="Карточка клуба"]')).find((c) => c.querySelector('img')) ?? document.querySelector('#results [aria-label^="Карточка клуба"]'); const h3 = card.querySelector('h3'); h3.scrollIntoView({ block: 'center' }); const r = h3.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2); return `/catalog первая карточка (${card.getAttribute('data-variant')}): под именем ${hit?.tagName}, img ${card.querySelector('img') ? 'opacity ' + getComputedStyle(card.querySelector('img')).opacity : 'нет'}`; }));
await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
const card = page.locator('#clubs [aria-label^="Карточка клуба"]').first(); await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: 'tests/screenshots/phase-38-visual/ours-club-card-1440-after4.png' });
await card.hover(); await page.waitForTimeout(400); await card.screenshot({ path: 'tests/screenshots/phase-38-visual/ours-club-card-hover-1440-after4.png' });
await browser.close();

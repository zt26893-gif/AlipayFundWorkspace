import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'J:\\AlipayFundWorkspace\\test';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });

  // 1000 份华夏成长，确认日 2026-10-22
  await page.evaluate(() => {
    const buy = {
      id: 'b1', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 982, shares: 1000, nav: 0.982, fee: 1.47, netAmount: 980.53,
      orderTime: '2026-10-20T02:00:00.000Z', confirmDate: '2026-10-22', status: 'confirmed',
      createdAt: '2026-10-20T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [buy], dcaPlans: [] }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);

  out.hasDateInput = await page.evaluate(() => !!document.querySelector('.trade-date-input'));
  out.defaultDate = await page.evaluate(() => document.querySelector('.trade-date-input')?.value);
  out.hintNow = await page.evaluate(() => document.querySelector('.convert-date-hint')?.innerText);

  // 选转入基金 + 份额
  await page.select('.convert-select', '161725');
  await page.click('.convert-shares-input');
  await page.type('.convert-shares-input', '500', { delay: 40 });
  await sleep(1500);

  out.latestNav = await page.evaluate(() =>
    (document.querySelector('.convert-fund-meta')?.innerText || '').replace(/\s+/g, ' ')
  );
  out.previewNow = await page.evaluate(() =>
    [...document.querySelectorAll('.trade-preview .preview-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );

  // 改成历史日期 2026-10-28 10:00
  await page.evaluate(() => {
    const el = document.querySelector('.trade-date-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '2026-10-28T10:00');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(2500);

  out.hintBackdated = await page.evaluate(() => document.querySelector('.convert-date-hint')?.innerText);
  out.backdatedMeta = await page.evaluate(() =>
    (document.querySelector('.convert-fund-meta')?.innerText || '').replace(/\s+/g, ' ')
  );
  out.hasHistoricalTag = await page.evaluate(() => !!document.querySelector('.convert-nav-tag'));
  out.previewBackdated = await page.evaluate(() =>
    [...document.querySelectorAll('.trade-preview .preview-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );
  out.tip = await page.evaluate(() => document.querySelector('.trade-tip')?.innerText.trim());

  await page.screenshot({ path: `${OUT}\\23-convert-date.png` });

  // 提交，检查落库的确认日
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认转换'))?.click();
  });
  await sleep(2000);
  out.stored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('fund-trades') || '{}');
    const c = (raw.transactions || []).find((t) => t.type === 'convert');
    return c ? { orderTime: c.orderTime, confirmDate: c.confirmDate, nav: c.nav, toNav: c.toNav, toShares: c.toShares } : null;
  });
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

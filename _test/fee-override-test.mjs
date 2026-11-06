import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await page.evaluate(() => {
    const buy = {
      id: 'b1', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 982, shares: 1000, nav: 0.982, fee: 1.47, netAmount: 980.53,
      orderTime: '2026-10-20T02:00:00.000Z', confirmDate: '2026-10-22', status: 'confirmed',
      createdAt: '2026-10-20T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [buy], dcaPlans: [], cashBalance: 0 }));
    localStorage.removeItem('fund-fees');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  // 打开费率设置 → 选 161725 → 覆盖申购费率为 0.80%
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '费率')?.click();
  });
  await sleep(1000);
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '费率')?.click();
  });
  await sleep(800);
  await page.select('.fee-section .convert-select', '161725');
  await sleep(600);
  out.inputCountAfterSelect = await page.evaluate(() => document.querySelectorAll('.fee-input').length);
  await page.evaluate(() => {
    const el = document.querySelectorAll('.fee-input')[5]; // 目标基金的申购费率
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.80');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(800);
  out.stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fund-fees') || '{}').fundOverrides);
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\30-fund-override.png' });

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '完成')?.click();
  });
  await sleep(800);

  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);
  await page.select('.convert-select', '161725');
  await page.click('.convert-shares-input');
  await page.type('.convert-shares-input', '500', { delay: 40 });
  await sleep(1500);
  out.rows = await page.evaluate(() =>
    [...document.querySelectorAll('.trade-preview .preview-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );
  out.meta = await page.evaluate(() =>
    [...document.querySelectorAll('.convert-fund-meta')].map((e) => e.innerText.replace(/\s+/g, ' ').trim())
  );
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

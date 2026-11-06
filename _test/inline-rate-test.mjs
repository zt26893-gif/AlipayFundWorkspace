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

const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.trade-preview .preview-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );

const editRate = async (index, text) => {
  await page.evaluate((i) => {
    document.querySelectorAll('.inline-rate')[i]?.click();
  }, index);
  await sleep(500);
  await page.evaluate((val) => {
    const el = document.querySelector('.inline-rate-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, text);
  await sleep(900);
};

const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await page.evaluate(() => {
    const buy = {
      id: 'b1', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 97.04, shares: 98.83, nav: 0.982, fee: 0.15, netAmount: 96.89,
      orderTime: '2026-10-20T02:00:00.000Z', confirmDate: '2026-10-22', status: 'confirmed',
      createdAt: '2026-10-20T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [buy], dcaPlans: [], cashBalance: 0 }));
    localStorage.removeItem('fund-fees');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);
  await page.select('.convert-select', '161725');
  await page.click('.convert-shares-input');
  await page.type('.convert-shares-input', '50', { delay: 40 });
  await sleep(1200);

  out.inlineCount = await page.evaluate(() => document.querySelectorAll('.inline-rate').length);
  out.inlineTexts = await page.evaluate(() =>
    [...document.querySelectorAll('.inline-rate')].map((b) => b.innerText.replace(/\s+/g, ' ').trim())
  );
  out.rowsBefore = await rows();

  // 1) 改赎回费率 0.50% → 0.20%
  await editRate(0, '0.20');
  out.rowsAfterRedeem = await rows();
  out.feesAfterRedeem = await page.evaluate(() => JSON.parse(localStorage.getItem('fund-fees') || '{}'));

  // 2) 改转入申购费率 0.15% → 0.80%
  await editRate(2, '0.80');
  out.rowsAfterSpread = await rows();
  out.feesAfterSpread = await page.evaluate(() => JSON.parse(localStorage.getItem('fund-fees') || '{}'));

  await page.screenshot({ path: `${OUT}\\31-inline-rate.png` });
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

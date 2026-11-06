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

const setInput = async (handleIndex, text) => {
  await page.evaluate((i, val) => {
    const el = document.querySelectorAll('.fee-input')[i];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, handleIndex, text);
};

const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });

  await page.evaluate(() => localStorage.removeItem('fund-fees'));
  await page.evaluate(() => {
    const buy = {
      id: 'b1', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 982, shares: 1000, nav: 0.982, fee: 1.47, netAmount: 980.53,
      orderTime: '2026-10-20T02:00:00.000Z', confirmDate: '2026-10-22', status: 'confirmed',
      createdAt: '2026-10-20T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [buy], dcaPlans: [], cashBalance: 0 }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  // 打开费率设置
  out.hasFeeButton = await page.evaluate(() =>
    [...document.querySelectorAll('.portfolio-actions button')].some((b) => b.innerText.trim() === '费率')
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '费率')?.click();
  });
  await sleep(1000);
  out.feeRowCount = await page.evaluate(() => document.querySelectorAll('.fee-row').length);
  out.defaultValues = await page.evaluate(() =>
    [...document.querySelectorAll('.fee-input')].map((el) => el.value)
  );

  // 改全局申购费率 0.15% → 0.10%，赎回第一档 1.5% → 0.5%
  await setInput(0, '0.10');
  await setInput(1, '0.50');
  await sleep(800);
  out.storedFees = await page.evaluate(() => localStorage.getItem('fund-fees'));
  await page.screenshot({ path: `${OUT}\\28-fee-settings.png` });

  // 关闭费率弹窗
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '完成')?.click();
  });
  await sleep(800);

  // 打开转换弹窗，看是否用了新费率
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);
  await page.select('.convert-select', '161725');
  await page.click('.convert-shares-input');
  await page.type('.convert-shares-input', '500', { delay: 40 });
  await sleep(1500);
  out.convertRows = await page.evaluate(() =>
    [...document.querySelectorAll('.trade-preview .preview-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );
  out.fundMeta = await page.evaluate(() =>
    [...document.querySelectorAll('.convert-fund-meta')].map((e) => e.innerText.replace(/\s+/g, ' ').trim())
  );
  await page.screenshot({ path: `${OUT}\\29-convert-with-custom-fees.png` });
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

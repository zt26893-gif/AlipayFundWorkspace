import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
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
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [buy], dcaPlans: [], cashBalance: 5 }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);
  await page.select('.convert-select', '161725');
  await page.click('.convert-shares-input');
  await page.type('.convert-shares-input', '500', { delay: 40 });
  await sleep(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll('.convert-round-btn')].find((b) => b.innerText.includes('份额补扣'))?.click();
  });
  await sleep(900);

  // 弹窗是否在视口内
  out.modalBox = await page.evaluate(() => {
    const el = document.querySelector('.trade-modal');
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), height: Math.round(r.height), viewport: window.innerHeight, scrollable: el.scrollHeight > el.clientHeight };
  });
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\26-convert-modal-fit.png' });

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认转换'))?.click();
  });
  await sleep(2200);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('历史交易明细'))?.click();
  });
  await sleep(1200);
  out.history = await page.evaluate(() =>
    [...document.querySelectorAll('.tx-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  out.pending = await page.evaluate(() =>
    [...document.querySelectorAll('.pending-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  out.info = await page.evaluate(() =>
    [...document.querySelectorAll('.info-row')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\27-history-adjust.png' });
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

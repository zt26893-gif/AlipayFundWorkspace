import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });

  // 预置一笔"确认日已过"的买入 + 一笔"确认日未到"的买入
  await page.evaluate(() => {
    const past = {
      id: 'tx-past', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 1000, shares: 1016.8, nav: 0.982, fee: 1.5, netAmount: 998.5,
      orderTime: '2026-10-20T02:00:00.000Z', confirmDate: '2026-10-22', status: 'confirmed',
      createdAt: '2026-10-20T02:00:00.000Z',
    };
    const future = {
      id: 'tx-future', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 500, shares: 505.1, nav: 0.982, fee: 0.75, netAmount: 499.25,
      orderTime: '2026-11-05T02:00:00.000Z', confirmDate: '2026-11-09', status: 'confirmed',
      createdAt: '2026-11-05T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [past, future], dcaPlans: [] }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  out.header = await page.evaluate(() => (document.querySelector('.detail-header')?.innerText || '').replace(/\s+/g, ' '));
  out.panel = await page.evaluate(() => (document.querySelector('.portfolio-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 380));
  out.pendingCount = await page.evaluate(() => document.querySelectorAll('.pending-item').length);
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\18-mixed-positions.png' });
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

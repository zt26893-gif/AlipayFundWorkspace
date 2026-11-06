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
    const conv = {
      id: 'c1', type: 'convert', fundCode: '000001', fundName: '华夏成长混合',
      toFundCode: '161725', toFundName: '招商中证白酒指数',
      shares: 500, nav: 0.982, toNav: 0.5843, toShares: 836.11,
      amount: 491, fee: 2.46, redeemFee: 2.46, spreadFee: 0, netAmount: 488.54,
      holdingDays: 14, orderTime: '2026-10-24T02:00:00.000Z', confirmDate: '2026-10-27',
      status: 'confirmed', createdAt: '2026-10-24T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [buy, conv], dcaPlans: [] }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  const readPanel = () =>
    page.evaluate(() => {
      const p = document.querySelector('.portfolio-panel');
      if (!p) return null;
      const pick = (sel) => p.querySelector(sel)?.innerText.trim() || null;
      return {
        heroValue: pick('.hero-card-balance'),
        shares: [...p.querySelectorAll('.hero-grid-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
        infos: [...p.querySelectorAll('.info-row')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
        pending: p.querySelectorAll('.pending-item').length,
      };
    });

  out.source = await readPanel();

  // 切到转入基金
  await page.evaluate(() => {
    const items = document.querySelectorAll('.fund-list .fund-item');
    if (items.length >= 2) items[1].click();
  });
  await sleep(4000);
  out.target = await readPanel();

  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\22-convert-confirmed.png' });
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

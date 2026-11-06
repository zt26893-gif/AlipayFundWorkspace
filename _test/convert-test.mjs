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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 180));
});
const logs = [];
page.on('console', (m) => logs.push(m.text()));

const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });

  // 造一笔已确认的历史买入：1000 份华夏成长，确认日 2026-10-22
  await page.evaluate(() => {
    const tx = {
      id: 'seed-buy-1', fundCode: '000001', fundName: '华夏成长混合', type: 'buy', method: 'manual',
      amount: 982, shares: 1000, nav: 0.982, fee: 1.47, netAmount: 980.53,
      orderTime: '2026-10-20T02:00:00.000Z', confirmDate: '2026-10-22', status: 'confirmed',
      createdAt: '2026-10-20T02:00:00.000Z',
    };
    localStorage.setItem('fund-trades', JSON.stringify({ transactions: [tx], dcaPlans: [] }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  out.buttons = await page.evaluate(() =>
    [...document.querySelectorAll('.portfolio-actions button')].map((b) => b.innerText.trim())
  );

  // 打开转换弹窗
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);
  out.modalOpen = await page.evaluate(() => {
    const el = document.querySelector('.convert-block');
    return !!el && el.getBoundingClientRect().width > 0;
  });
  out.available = await page.evaluate(() =>
    (document.querySelector('.convert-fund-meta')?.innerText || '').replace(/\s+/g, ' ')
  );

  // 选择转入基金
  out.options = await page.evaluate(() =>
    [...document.querySelectorAll('.convert-select option')].map((o) => `${o.value}|${o.textContent}`)
  );
  await page.select('.convert-select', '161725');
  await sleep(800);

  // 输入份额 500
  const sel = '.convert-shares-input';
  await page.click(sel);
  await page.type(sel, '500', { delay: 50 });
  await sleep(1200);

  out.preview = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.trade-preview .preview-row')];
    return rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim());
  });
  out.submitDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('确认转换'));
    return b?.disabled;
  });

  await page.screenshot({ path: `${OUT}\\19-convert-modal.png` });

  // 提交
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认转换'))?.click();
  });
  await sleep(2500);

  out.stored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('fund-trades') || '{}');
    return (raw.transactions || []).map((t) => ({
      type: t.type,
      from: `${t.fundCode}`,
      to: t.toFundCode || null,
      shares: t.shares,
      toShares: t.toShares,
      fee: t.fee,
      netAmount: t.netAmount,
      confirmDate: t.confirmDate,
    }));
  });
  out.pending = await page.evaluate(() =>
    [...document.querySelectorAll('.pending-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );

  // 展开历史
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('历史交易明细'))?.click();
  });
  await sleep(1200);
  out.history = await page.evaluate(() =>
    [...document.querySelectorAll('.tx-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  await page.screenshot({ path: `${OUT}\\20-convert-result.png` });

  // 切到转入基金，看是否也有待确认记录
  await page.evaluate(() => {
    const items = document.querySelectorAll('.fund-list .fund-item');
    if (items.length >= 2) items[1].click();
  });
  await sleep(4000);
  out.toFundPanel = await page.evaluate(() => ({
    header: (document.querySelector('.detail-header')?.innerText || '').replace(/\s+/g, ' '),
    pending: [...document.querySelectorAll('.pending-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
  }));
  await page.screenshot({ path: `${OUT}\\21-convert-target-fund.png` });

  out.tradeLogs = logs.filter((l) => l.includes('[Trade]'));
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log('===RESULT===');
  console.log(JSON.stringify(out, null, 2));
}

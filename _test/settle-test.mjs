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

const readRows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.trade-preview .preview-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );

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
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '转换')?.click();
  });
  await sleep(1200);
  await page.select('.convert-select', '161725');
  await page.click('.convert-shares-input');
  await page.type('.convert-shares-input', '1000', { delay: 40 });
  await sleep(1500);

  out.cashHint = await page.evaluate(() => {
    const hints = [...document.querySelectorAll('.convert-date-hint')];
    return hints[hints.length - 1]?.innerText.trim();
  });
  out.tabs = await page.evaluate(() =>
    [...document.querySelectorAll('.convert-round-btn')].map((b) => ({
      text: b.innerText.trim(),
      active: b.classList.contains('active'),
      disabled: b.disabled,
    }))
  );
  out.floorRows = await readRows();
  await page.screenshot({ path: `${OUT}\\24-convert-floor.png` });

  // 切到金额补扣
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.convert-round-btn')].find((b) => b.innerText.includes('金额补扣'));
    if (btn && !btn.disabled) btn.click();
  });
  await sleep(1000);
  out.cashRows = await readRows();

  // 切到份额补扣
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.convert-round-btn')].find((b) => b.innerText.includes('份额补扣'));
    if (btn && !btn.disabled) btn.click();
  });
  await sleep(1000);
  out.shareRows = await readRows();
  await page.screenshot({ path: `${OUT}\\25-convert-share-adjust.png` });

  // 提交（当前为份额补扣）
  out.submitDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('确认转换'));
    return b?.disabled;
  });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认转换'))?.click();
  });
  await sleep(2500);

  out.stored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('fund-trades') || '{}');
    const c = (raw.transactions || []).find((t) => t.type === 'convert');
    return {
      cashBalance: raw.cashBalance,
      tx: c
        ? {
            shares: c.shares,
            sharesOut: c.sharesOut,
            toShares: c.toShares,
            investAmount: c.investAmount,
            netAmount: c.netAmount,
            remainderCash: c.remainderCash,
            cashAdjust: c.cashAdjust,
            shareAdjust: c.shareAdjust,
            extraCash: c.extraCash,
            settleMode: c.settleMode,
          }
        : null,
    };
  });
  out.panelInfo = await page.evaluate(() =>
    [...document.querySelectorAll('.info-row')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

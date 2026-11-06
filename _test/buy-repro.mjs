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
const logs = [];
const errors = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 150)}`));
page.on('pageerror', (e) => errors.push(e.message));

const out = { steps: [] };
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });

  // 清空交易数据后重载，模拟全新用户
  await page.evaluate(() => localStorage.removeItem('fund-trades'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4000);

  out.beforeTrades = await page.evaluate(() => localStorage.getItem('fund-trades'));
  out.emptyPanel = await page.evaluate(() =>
    (document.querySelector('.portfolio-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120)
  );

  // 打开买入弹窗
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(1500);
  out.modalOpen = await page.evaluate(() => {
    const el = document.querySelector('.trade-modal');
    return !!el && el.getBoundingClientRect().width > 0;
  });

  // 未输入金额时按钮状态
  out.submitBeforeInput = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { disabled: btn.disabled, visible: r.width > 0, text: btn.innerText.trim(), cls: btn.className };
  });

  // 输入 1000
  const sel = 'input[placeholder="输入买入金额"]';
  await page.click(sel);
  await page.type(sel, '1000', { delay: 40 });
  await sleep(1200);
  out.submitAfterInput = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'));
    return { disabled: btn?.disabled, text: btn?.innerText.trim() };
  });
  out.preview = await page.evaluate(() => document.querySelector('.trade-preview')?.innerText.replace(/\s+/g, ' ') || null);

  // 点击确认
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'))?.click();
  });
  await sleep(2500);

  out.afterTrades = await page.evaluate(() => localStorage.getItem('fund-trades'));
  out.modalClosed = await page.evaluate(() => !document.querySelector('.trade-modal'));
  out.panelAfter = await page.evaluate(() =>
    (document.querySelector('.portfolio-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 240)
  );
  out.hasHistoryToggle = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('历史交易明细'))
  );
  out.tradeLogs = logs.filter((l) => l.includes('[Trade]'));

  await page.screenshot({ path: `${OUT}\\15-after-buy-empty.png` });
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

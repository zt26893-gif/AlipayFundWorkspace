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
  await page.evaluate(() => localStorage.removeItem('fund-trades'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4000);

  // 打开买入弹窗，先测试金额 < 10 的提示
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(1200);
  const sel = 'input[placeholder="输入买入金额"]';
  await page.click(sel);
  await page.type(sel, '5', { delay: 40 });
  await sleep(800);
  out.lowAmountHint = await page.evaluate(() => document.querySelector('.trade-input-hint')?.innerText || null);
  out.lowAmountBtnDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('确认买入'));
    return b?.disabled;
  });

  // 改成合法金额并提交
  await page.evaluate(() => { document.querySelector('input[placeholder="输入买入金额"]').value = ''; });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, '1000', { delay: 40 });
  await sleep(1000);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'))?.click();
  });
  await sleep(2500);

  out.afterBuy = await page.evaluate(() => ({
    panelText: (document.querySelector('.portfolio-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 320),
    pendingCards: document.querySelectorAll('.pending-orders').length,
    pendingItems: [...document.querySelectorAll('.pending-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    hasHistoryToggle: [...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('历史交易明细')),
    tradeStored: JSON.parse(localStorage.getItem('fund-trades') || '{}').transactions?.length || 0,
  }));

  // 展开历史明细
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('历史交易明细'))?.click();
  });
  await sleep(1200);
  out.historyText = await page.evaluate(() =>
    (document.querySelector('.tx-history')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)
  );

  await page.screenshot({ path: `${OUT}\\16-pending-after-buy.png` });

  // 刷新后仍应看到待确认
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4000);
  out.afterReload = await page.evaluate(() => ({
    pendingCards: document.querySelectorAll('.pending-orders').length,
    panelText: (document.querySelector('.portfolio-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  }));
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

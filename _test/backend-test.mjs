import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787/';
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
const failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('requestfailed', (r) => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));

const readState = () => page.evaluate(async () => {
  const res = await fetch('/api/state', { cache: 'no-store' });
  return res.json();
});

const out = {};
try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 30000 });
  await sleep(6000);

  out.hasFundList = await page.evaluate(() => document.querySelectorAll('.fund-list .fund-item').length);
  out.stateAfterInit = await readState();

  // 打开买入，买 500
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(1200);
  const sel = 'input[placeholder="输入买入金额"]';
  await page.click(sel);
  await page.type(sel, '500', { delay: 40 });
  await sleep(900);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'))?.click();
  });
  await sleep(2500);

  out.stateAfterBuy = await readState();
  out.pending = await page.evaluate(() =>
    [...document.querySelectorAll('.pending-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );

  // 打开数据弹窗看看状态
  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '数据')?.click();
  });
  await sleep(1500);
  out.dataStatus = await page.evaluate(() => document.querySelector('.data-status')?.innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: `${OUT}\\33-data-modal.png` });
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors.slice(0, 8);
  out.failed = failed.slice(0, 8);
  console.log(JSON.stringify(out, null, 2));
}

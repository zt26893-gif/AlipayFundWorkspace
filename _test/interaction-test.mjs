import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const OUT = 'J:\\AlipayFundWorkspace\\test';

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});

const page = await browser.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

const r = {};
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 40000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(3000);

  const headline = () =>
    page.evaluate(() => {
      const name = document.querySelector('.fund-detail-name, [class*="detail-name"], [class*="fund-name"]');
      const code = document.querySelector('[class*="fund-code"]');
      return `${name ? name.innerText.trim() : '?'} / ${code ? code.innerText.trim() : '?'}`;
    });

  r.fundBefore = await headline();

  // 切到第 2 只基金
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.fund-item')].filter((el) => !el.querySelector('.fund-item-header'));
    const list = document.querySelectorAll('.fund-list .fund-item');
    if (list.length >= 2) list[1].click();
  });
  await sleep(4000);
  r.fundAfter = await headline();
  r.switchWorked = r.fundBefore !== r.fundAfter;

  // 图表区间切换：对比 canvas 像素是否变化
  const shotA = await page.evaluate(() => document.querySelector('canvas')?.toDataURL().slice(-80) || '');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '近1年')?.click();
  });
  await sleep(3000);
  const shotB = await page.evaluate(() => document.querySelector('canvas')?.toDataURL().slice(-80) || '');
  r.chartChanged = shotA !== shotB && shotA !== '';

  // 买入弹窗 → 关闭按钮
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(1800);
  r.modalOpened = await page.evaluate(() => {
    const el = document.querySelector('.modal-overlay');
    return !!el && el.offsetParent !== null;
  });
  await page.screenshot({ path: `${OUT}\\03-trade-modal.png` });

  // 填金额看预估
  await page.evaluate(() => {
    const input = document.querySelector('.trade-input');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(1200);
  r.previewText = await page.evaluate(() => document.querySelector('.trade-preview')?.innerText.replace(/\s+/g, ' ').slice(0, 200) || '');

  r.closeBtnExists = await page.evaluate(() => !!document.querySelector('.modal-close-btn'));
  await page.evaluate(() => document.querySelector('.modal-close-btn')?.click());
  await sleep(1200);
  r.modalClosed = await page.evaluate(() => {
    const el = document.querySelector('.modal-overlay');
    return !el || el.offsetParent === null;
  });

  // 定投弹窗
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('定投'));
    btn?.click();
  });
  await sleep(1500);
  r.dcaOpened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.modal-overlay')].find((e) => e.offsetParent !== null);
    return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 160) : null;
  });
  await page.evaluate(() => document.querySelector('.modal-close-btn')?.click());
  await sleep(800);

  await page.screenshot({ path: `${OUT}\\04-fullpage.png`, fullPage: true });
} catch (e) {
  r.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  r.pageErrors = pageErrors;
  r.consoleErrors = consoleErrors;
  r.failedRequests = failedRequests;
  console.log('===RESULT_JSON===');
  console.log(JSON.stringify(r, null, 2));
  console.log('===END_JSON===');
}

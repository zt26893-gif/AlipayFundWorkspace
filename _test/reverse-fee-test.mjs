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

const setRev = async (index, val) => {
  await page.evaluate((i, v) => {
    const el = document.querySelectorAll('.rev-input')[i];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, index, val);
};

const readResult = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.rev-result-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  );

const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem('fund-fees'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4500);

  await page.evaluate(() => {
    [...document.querySelectorAll('.portfolio-actions button')].find((b) => b.innerText.trim() === '费率')?.click();
  });
  await sleep(1200);
  out.hasSection = await page.evaluate(() =>
    [...document.querySelectorAll('.fee-section-title')].some((e) => e.innerText.includes('反算'))
  );

  // 转换模式：50 份 @0.982 → 83.31 份 @0.5843
  await page.evaluate(() => {
    const selects = document.querySelectorAll('.rev-section .convert-select');
    selects[0].value = '000001';
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  await page.evaluate(() => {
    const selects = document.querySelectorAll('.rev-section .convert-select');
    selects[1].value = '161725';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);

  await setRev(0, 50);
  await setRev(1, 0.982);
  await setRev(2, 83.31);
  await setRev(3, 0.5843);
  await sleep(1000);
  out.convertResult = await readResult();

  await page.evaluate(() => {
    document.querySelector('.rev-apply-btn')?.click();
  });
  await sleep(800);
  out.applied = await page.evaluate(() => document.querySelector('.rev-applied')?.innerText || null);
  out.storedAfterConvert = await page.evaluate(() => localStorage.getItem('fund-fees'));

  await page.screenshot({ path: `${OUT}\\32-reverse-fee.png` });

  // 买入模式：1000 元 / 净值 0.982 / 份额 1016.80
  await page.evaluate(() => {
    [...document.querySelectorAll('.rev-section .convert-round-btn')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(700);
  await setRev(0, 1000);
  await setRev(1, 0.982);
  await setRev(2, 1016.8);
  await sleep(900);
  out.buyResult = await readResult();
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
}

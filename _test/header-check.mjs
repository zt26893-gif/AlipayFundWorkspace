import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(4000);

  out.headerBefore = await page.evaluate(() => (document.querySelector('.detail-header')?.innerText || '').replace(/\s+/g, ' '));

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(1200);
  const sel = 'input[placeholder="输入买入金额"]';
  await page.click(sel);
  await page.type(sel, '1000', { delay: 40 });
  await sleep(1000);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'))?.click();
  });
  await sleep(2500);

  out.headerAfter = await page.evaluate(() => (document.querySelector('.detail-header')?.innerText || '').replace(/\s+/g, ' '));
  out.pending = await page.evaluate(() =>
    [...document.querySelectorAll('.pending-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\17-header-consistent.png' });
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

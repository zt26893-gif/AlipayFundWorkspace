import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const r = {};

try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 40000 });
  await page.evaluate(() => localStorage.removeItem('fund-trades'));
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(3000);

  // 买入 1000
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '买入')?.click());
  await sleep(1200);
  const sel = 'input[placeholder="输入买入金额"]';
  await page.click(sel);
  await page.type(sel, '1000', { delay: 50 });
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'))?.click());
  await sleep(2500);

  r.localStorage = await page.evaluate(() => localStorage.getItem('fund-trades'));

  // 展开历史明细
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('历史交易明细'));
    el?.click();
  });
  await sleep(1500);
  r.historyText = (await page.evaluate(() => document.querySelector('.portfolio-panel')?.innerText || ''))
    .replace(/\s+/g, ' ').slice(0, 600);

  r.portfolioEmptyState = await page.evaluate(() =>
    (document.querySelector('.portfolio-panel')?.innerText || '').includes('暂无持仓记录')
  );

  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\07-after-buy-history.png', fullPage: true });
} catch (e) {
  r.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  console.log('===RESULT_JSON===');
  console.log(JSON.stringify(r, null, 2));
  console.log('===END_JSON===');
}

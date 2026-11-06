import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 40000 });
  await page.evaluate(() => localStorage.removeItem('fund-trades'));
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(4000);
  out.errors = errs;
  out.hasCanvas = await page.evaluate(() => document.querySelectorAll('canvas').length);
  out.strategy = (await page.evaluate(() => {
    const el = document.querySelector('[class*="strategy"]');
    return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 300) : null;
  }));
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\08-final-home.png' });
  await page.screenshot({ path: 'J:\\AlipayFundWorkspace\\test\\09-final-full.png', fullPage: true });
} catch (e) { out.fatal = String(e?.stack || e); }
finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:5188/';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();

const logs = [];
const deepseekCalls = [];
let navigations = 0;
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) navigations += 1;
});
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('/api/deepseek')) deepseekCalls.push(`${res.status()} @${Date.now() % 100000}`);
});
page.on('requestfailed', (r) => {
  if (r.url().includes('/api/deepseek')) deepseekCalls.push(`FAILED ${r.failure()?.errorText} ${r.url()}`);
});

const out = {};
try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll('.view-btn')].find((b) => b.innerText.includes('趋势总览'))?.click();
  });
  await page.waitForSelector('.ov-stats', { timeout: 45000 });
  await page.waitForFunction(() => !!document.querySelector('.ov-verdict-text'), { timeout: 45000 }).catch(() => {});
  await sleep(1500);

  out.source = await page.evaluate(() => document.querySelector('.ov-source')?.innerText || null);
  out.verdict = await page.evaluate(() => document.querySelector('.ov-verdict-text')?.innerText || null);
  out.allocCount = await page.evaluate(() => document.querySelectorAll('.ov-alloc-item').length);
  out.deepseekCalls = deepseekCalls;
  out.navigations = navigations;
  out.errors = logs.filter((l) => l.startsWith('error') || l.startsWith('PAGEERROR')).slice(0, 12);
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

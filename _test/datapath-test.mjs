import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8803/';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 950 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1200));
await page.click('.sidebar-settings-btn');
await page.waitForSelector('.settings-modal', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));
const dbPath = await page.$eval('.settings-datapath code', (el) => el.textContent).catch(() => null);
await page.screenshot({ path: process.env.TEMP + '/fundrec/settings-datapath.png' });
console.log(JSON.stringify({ dbPath }));
await browser.close();

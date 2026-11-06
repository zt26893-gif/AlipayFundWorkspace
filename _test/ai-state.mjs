import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 25000 });
  await page.evaluate(() => {
    [...document.querySelectorAll('.view-btn')].find((b) => b.innerText.includes('趋势总览'))?.click();
  });
  for (let i = 0; i < 40; i += 1) {
    if (await page.evaluate(() => !!document.querySelector('.ov-stats'))) break;
    await sleep(1000);
  }
  for (const t of [2000, 5000, 10000]) {
    await sleep(t === 2000 ? 2000 : t === 5000 ? 3000 : 5000);
    const snap = await page.evaluate(() => {
      const card = document.querySelector('.ov-ai-card');
      return {
        t: Date.now() % 100000,
        source: card?.querySelector('.ov-source')?.innerText || null,
        full: (card?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
      };
    });
    console.log(JSON.stringify(snap));
  }
  console.log('LOGS:', JSON.stringify(logs.filter((l) => l.includes('aiService') || l.startsWith('error')).slice(0, 8), null, 1));
} finally {
  await browser.close();
}

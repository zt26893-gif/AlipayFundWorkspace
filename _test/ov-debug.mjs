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

const ovLogs = [];
const calls = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[ov]')) ovLogs.push(t);
});
page.on('response', (r) => {
  if (r.url().includes('/api/deepseek')) calls.push(`@${Date.now() % 1000000} ${r.status()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 25000 });
  await sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll('.view-btn')].find((b) => b.innerText.includes('趋势总览'))?.click();
  });

  // 轮询等待最多 60s
  for (let i = 0; i < 60; i += 1) {
    const state = await page.evaluate(() => ({
      stats: !!document.querySelector('.ov-stats'),
      body: document.body.innerText.slice(0, 120).replace(/\s+/g, ' '),
    }));
    if (state.stats) break;
    await sleep(1000);
  }
  await sleep(6000);

  console.log(JSON.stringify({
    ovLogs,
    calls,
    hasStats: await page.evaluate(() => !!document.querySelector('.ov-stats')),
    verdict: await page.evaluate(() => document.querySelector('.ov-verdict-text')?.innerText || null),
  }, null, 2));
} finally {
  await browser.close();
}

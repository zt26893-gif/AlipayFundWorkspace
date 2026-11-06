/**
 * 真实 DeepSeek 视觉识别验证（不填任何设置，走内置回退 deepseek-flash）
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8802/';
const image = process.argv[3] || path.join(process.env.TEMP, 'fundrec', 'trade-shot.png');
const outDir = process.env.TEMP + '/fundrec';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 950 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1200));

await page.click('.btn-buy-small');
await page.waitForSelector('.trade-ocr-btn', { timeout: 10000 });
const input = await page.$('input[type="file"]');
await input.uploadFile(image);

let amount = '';
for (let i = 0; i < 60; i += 1) {
  await new Promise((r) => setTimeout(r, 2000));
  amount = await page.$eval('input[placeholder="输入买入金额"]', (el) => el.value).catch(() => '');
  const msg = await page.evaluate(() => document.querySelector('.trade-ocr-msg')?.textContent || '');
  if (amount || (msg && !msg.includes('识别中'))) break;
}

const result = {
  amount,
  orderTime: await page.$eval('.trade-input[type="datetime-local"]', (el) => el.value).catch(() => null),
  msg: await page.evaluate(() => document.querySelector('.trade-ocr-msg')?.textContent?.trim() || null),
  logs: logs.filter((l) => l.includes('vision') || l.includes('识别') || l.includes('llm')).slice(0, 5),
};
await page.screenshot({ path: path.join(outDir, 'ocr-deepseek.png') });
console.log(JSON.stringify(result, null, 1));
await browser.close();

/**
 * 合并保护验证：浏览器里有、服务端没有的交易，启动时不应被覆盖
 */
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8796/';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

const before = await page.evaluate(() => JSON.parse(localStorage.getItem('fund-trades') || '{}').transactions?.length || 0);

await page.evaluate(() => {
  const v = JSON.parse(localStorage.getItem('fund-trades') || '{"transactions":[],"dcaPlans":[]}');
  v.transactions.push({
    id: 'local-only-merge-test',
    fundCode: '006331',
    fundName: '中银国有企业债C',
    type: 'buy',
    method: 'manual',
    amount: 1,
    shares: 0.8,
    nav: 1.25,
    fee: 0,
    netAmount: 1,
    orderTime: new Date().toISOString(),
    confirmDate: '2026-11-06',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem('fund-trades', JSON.stringify(v));
});

await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));

const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fund-trades') || '{}').transactions?.length || 0);
const server = await page.evaluate(async () => {
  const res = await fetch('/api/state', { cache: 'no-store' });
  const data = await res.json();
  return data.state?.trades?.transactions?.length ?? 0;
});

console.log(JSON.stringify({ before, after, server, merged: after > before && server >= after }));
await browser.close();

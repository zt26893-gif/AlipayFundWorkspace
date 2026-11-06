/**
 * 验证：左侧基金池点击跳转详情；趋势总览出现「推荐持有」卡片
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8805/';
const out = process.env.TEMP + '/fundrec';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 1000 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

const result = {};

// 切到趋势总览
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view-btn')].find((b) => b.textContent.includes('趋势总览'));
  if (btn) btn.click();
});
await page.waitForSelector('.ov-alloc-card', { timeout: 90000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));

result.allocCardExists = (await page.$('.ov-alloc-card')) !== null;
result.allocCount = await page.$$eval('.ov-alloc-tile', (els) => els.length).catch(() => 0);
result.allocFirst = await page
  .$eval('.ov-alloc-tile', (el) => el.innerText.replace(/\s+/g, ' ').trim())
  .catch(() => null);
await page.screenshot({ path: path.join(out, 'overview-alloc.png') });

// 点左侧基金池里的另一只基金：应跳回单只基金
const clickedFund = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.fund-item')];
  const target = items.find((el) => el.textContent.includes('中银国有企业债'));
  if (target) { target.click(); return target.textContent.replace(/\s+/g, ' ').trim(); }
  return null;
});
await new Promise((r) => setTimeout(r, 1200));
result.afterSidebarClick = {
  clickedFund,
  activeTab: await page.$eval('.view-btn.active', (el) => el.textContent.trim()).catch(() => null),
  headerFund: await page.$eval('.fund-detail-name, .detail-fund-name, .fund-name-title', (el) => el.textContent.trim()).catch(() => null),
  hasDetailChart: (await page.$('.fund-chart, .chart-container')) !== null,
};
await page.screenshot({ path: path.join(out, 'sidebar-jump.png') });

// 回到总览，点推荐卡片第一项
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view-btn')].find((b) => b.textContent.includes('趋势总览'));
  if (btn) btn.click();
});
await page.waitForSelector('.ov-alloc-tile', { timeout: 60000 }).catch(() => {});
const tileCode = await page.$eval('.ov-alloc-tile .ov-alloc-code', (el) => el.textContent.trim()).catch(() => null);
await page.click('.ov-alloc-tile').catch(() => {});
await new Promise((r) => setTimeout(r, 1200));
result.afterTileClick = {
  tileCode,
  activeTab: await page.$eval('.view-btn.active', (el) => el.textContent.trim()).catch(() => null),
  headerCode: await page.$eval('.fund-code, .detail-fund-code', (el) => el.textContent.trim()).catch(() => null),
};

console.log(JSON.stringify(result, null, 1));
await browser.close();

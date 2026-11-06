/**
 * 验证：赎回费临界提醒 / 交易编辑+审计 / 每日定投
 */
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8813/';
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

// 选中 007343
await page.evaluate(() => {
  const item = [...document.querySelectorAll('.fund-item')].find((el) => el.textContent.includes('嘉实科技创新'));
  if (item) item.click();
});
await new Promise((r) => setTimeout(r, 1200));

// 卖出弹窗 → 输入份额 → 读赎回费临界提示
await page.click('.btn-sell-small');
await page.waitForSelector('input[placeholder="输入卖出份额"]', { timeout: 10000 });
await page.type('input[placeholder="输入卖出份额"]', '1', { delay: 30 });
await new Promise((r) => setTimeout(r, 600));
result.feeHint = await page.$eval('.fee-tier-hint', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
await page.screenshot({ path: out + '/fee-tier.png' });
await page.evaluate(() => document.querySelector('.modal-close-btn')?.click());
await new Promise((r) => setTimeout(r, 500));

// 历史交易 → 编辑 → 改金额 → 保存 → 审计
await page.evaluate(() => document.querySelector('.toggle-history-btn')?.click());
await page.waitForSelector('.tx-item', { timeout: 10000 });
await page.click('.tx-edit-btn');
await page.waitForSelector('.tx-edit-modal', { timeout: 8000 });
const amountInput = await page.$('.tx-edit-body input[type="number"]');
await amountInput.click();
await page.keyboard.down('Control');
await page.keyboard.press('KeyA');
await page.keyboard.up('Control');
await page.keyboard.type('200');
await page.evaluate(() => document.querySelector('.tx-edit-modal .trade-submit-btn')?.click());
await new Promise((r) => setTimeout(r, 800));

result.afterEdit = {
  amountText: await page.$eval('.tx-item .tx-amount', (el) => el.textContent.trim()).catch(() => null),
  auditBtn: await page.$eval('.tx-audit-btn', (el) => el.textContent.trim()).catch(() => null),
};
await page.evaluate(() => document.querySelector('.tx-audit-btn')?.click());
await page.waitForSelector('.tx-audit-modal', { timeout: 5000 });
result.auditText = await page.$eval('.tx-audit-item', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
await page.screenshot({ path: out + '/tx-audit.png' });
await page.evaluate(() => document.querySelector('.tx-audit-modal .modal-close-btn')?.click());
await new Promise((r) => setTimeout(r, 400));

// 定投弹窗 → 每日
await page.evaluate(() => document.querySelector('.dca-info-card')?.click());
await page.waitForSelector('.dca-modal', { timeout: 8000 });
result.dcaHasDaily = await page.evaluate(() =>
  [...document.querySelectorAll('.dca-freq-btn')].some((b) => b.textContent.trim() === '每日')
);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.dca-freq-btn')].find((b) => b.textContent.trim() === '每日');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 400));
result.dcaAnnual = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dca-preview .preview-row')];
  const row = rows.find((r) => r.textContent.includes('年化投入'));
  return row?.innerText.replace(/\s+/g, ' ').trim() || null;
});
result.dcaHint = await page.evaluate(() => {
  const hints = [...document.querySelectorAll('.dca-modal .trade-input-hint')];
  return hints.map((h) => h.textContent.trim()).find((t) => t.includes('交易日')) || null;
});
await page.screenshot({ path: out + '/dca-daily.png' });

console.log(JSON.stringify(result, null, 1));
await browser.close();

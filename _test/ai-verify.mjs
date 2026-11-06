/**
 * AI 策略端到端验证：打开总趋势看板，确认策略由 DeepSeek 生成而不是本地降级
 * 用法：node ai-verify.mjs http://127.0.0.1:8789/
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8789/';
const shot = process.env.SHOT || path.join(process.cwd(), 'ai-verify.png');
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
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

// 切到「趋势总览」
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('趋势总览'));
  if (btn) btn.click();
});

await page.waitForFunction(() => !!document.querySelector('.ov-verdict-text'), { timeout: 90000 }).catch(() => {});

const info = await page.evaluate(() => ({
  source: document.querySelector('.ov-source')?.textContent?.trim() || null,
  verdict: document.querySelector('.ov-verdict-text')?.textContent?.trim() || null,
  confidence: document.querySelector('.ov-verdict-conf')?.textContent?.trim() || null,
  summary: document.querySelector('.ov-ai-summary')?.textContent?.trim() || null,
  market: document.querySelector('.ov-ai-market')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) || null,
  cards: document.querySelectorAll('.ov-card').length,
}));

await page.screenshot({ path: shot });
console.log(JSON.stringify({ info, ovLogs: logs.filter((l) => l.includes('[ov]') || l.includes('deepseek')).slice(0, 12) }, null, 1));
console.log('SHOT ' + shot);
await browser.close();

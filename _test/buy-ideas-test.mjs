/**
 * 验证：推荐买入（新基金）卡片 + 搜索按钮与输入框等高
 */
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8807/';
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

// 搜索按钮尺寸
const sizes = await page.evaluate(() => {
  const wrap = document.querySelector('.search-input-wrapper')?.getBoundingClientRect();
  const btn = document.querySelector('.search-btn')?.getBoundingClientRect();
  const input = document.querySelector('.search-input')?.getBoundingClientRect();
  return {
    wrapper: wrap && Math.round(wrap.height),
    button: btn && Math.round(btn.height),
    input: input && Math.round(input.height),
  };
});

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view-btn')].find((b) => b.textContent.includes('趋势总览'));
  if (btn) btn.click();
});

await page.waitForSelector('.ov-buy-tile', { timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));

const buy = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.ov-buy-tile')];
  return {
    count: tiles.length,
    items: tiles.map((t) => t.innerText.replace(/\s+/g, ' ').trim().slice(0, 90)),
    poolCountBefore: document.querySelectorAll('.fund-item').length,
  };
});

// 点第一个「加入基金池」
await page.click('.ov-buy-tile .ov-buy-add').catch(() => {});
await new Promise((r) => setTimeout(r, 3000));

const after = await page.evaluate(() => ({
  poolCountAfter: document.querySelectorAll('.fund-item').length,
  buttonText: document.querySelector('.ov-buy-tile .ov-buy-add')?.textContent?.trim() || null,
}));

await page.screenshot({ path: out + '/buy-ideas.png' });
console.log(JSON.stringify({ sizes, buy, after }, null, 1));
await browser.close();

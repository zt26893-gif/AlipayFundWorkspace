/**
 * T+1 确认口径验证：确认日=今天的交易应计入持仓，不再显示“待确认”
 * 用法：node confirm-test.mjs http://127.0.0.1:8794/
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8794/';
const shot = process.env.SHOT || path.join(process.cwd(), 'confirm-test.png');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 1000 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForSelector('.portfolio-panel, .portfolio-hero-card, .portfolio', { timeout: 45000 }).catch(() => {});

async function clickFund(name) {
  const ok = await page.evaluate((name) => {
    const nodes = [...document.querySelectorAll('aside *, .sidebar *, [class*="fund-item"], [class*="fund-list"] *')];
    const target = nodes.find((n) => n.children.length <= 2 && n.textContent.includes(name));
    if (!target) return false;
    target.click();
    return true;
  }, name);
  await new Promise((r) => setTimeout(r, 1200));
  return ok;
}

async function readState() {
  return page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ');
    const pendingCount = document.querySelectorAll('.pending-item').length;
    const shares = [...document.querySelectorAll('.hero-stat-value, .portfolio-hero-card *')]
      .map((n) => n.textContent.trim())
      .find((t) => /^\d+\.\d{2}$/.test(t)) || null;
    const hero = document.querySelector('.portfolio-hero-card')?.innerText.replace(/\s+/g, ' ') || null;
    return { pendingCount, hero, textHas549: text.includes('5.49'), shares };
  });
}

const first = await clickFund('嘉实科技创新混合');
const jiaShi = await readState();

const second = await clickFund('中银国有企业债C');
const zhongYin = await readState();

await page.screenshot({ path: shot });

console.log(
  JSON.stringify(
    {
      clicked: { first, second },
      jiaShi,
      zhongYin,
      checks: {
        // 5 号下单、6 号确认：应已计入持仓，且不在待确认里
        jiaShiConfirmed: jiaShi.pendingCount === 0 && jiaShi.textHas549,
        // 6 号下单、10 号确认：仍是待确认
        zhongYinPending: zhongYin.pendingCount >= 1,
      },
    },
    null,
    1
  )
);
console.log('SHOT ' + shot);
await browser.close();

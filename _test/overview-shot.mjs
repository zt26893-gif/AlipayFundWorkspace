import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'J:\\AlipayFundWorkspace\\test';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const out = {};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll('.view-btn')].find((b) => b.innerText.includes('趋势总览'))?.click();
  });
  await page.waitForSelector('.ov-stats', { timeout: 45000 });
  await page.waitForFunction(() => !!document.querySelector('.ov-verdict-text'), { timeout: 40000 }).catch(() => {});
  await sleep(1500);

  // 滚动主容器，让 AI 卡片完整可见
  await page.evaluate(() => {
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = main.scrollHeight;
  });
  await sleep(900);
  await page.screenshot({ path: `${OUT}\\12-overview-ai.png` });

  // 单独截趋势图与 AI 卡片
  const chart = await page.$('.ov-trend-card');
  if (chart) await chart.screenshot({ path: `${OUT}\\13-chart-only.png` });
  const ai = await page.$('.ov-ai-card');
  if (ai) await ai.screenshot({ path: `${OUT}\\14-ai-only.png` });

  // 近20日切换
  await page.evaluate(() => {
    [...document.querySelectorAll('.period-tab')].find((b) => b.innerText.trim() === '近20日')?.click();
  });
  await sleep(2500);
  out.after20d = await page.evaluate(() => ({
    stats: [...document.querySelectorAll('.ov-stat')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    ranks: [...document.querySelectorAll('.ov-rank-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
  }));
  out.errors = errors;
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

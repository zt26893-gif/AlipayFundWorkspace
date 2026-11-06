import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const OUT = 'J:\\AlipayFundWorkspace\\test';
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();

const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

const r = {};
try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(2500);

  // 切到趋势总览
  r.switched = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.view-btn')].find((b) => b.innerText.includes('趋势总览'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  // 等总览主体（数据加载）
  await page.waitForSelector('.ov-stats', { timeout: 45000 }).catch(() => {});
  await sleep(2000);

  // 等 AI 卡片真正拿到结论（策略有 2.5s 防抖，DeepSeek 模式更久）
  await page
    .waitForFunction(() => !!document.querySelector('.ov-verdict-text'), { timeout: 45000 })
    .catch(() => {});

  r.stats = await page.evaluate(() =>
    [...document.querySelectorAll('.ov-stat')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  r.canvasCount = await page.evaluate(() => document.querySelectorAll('.ov-chart canvas').length);
  r.chartSize = await page.evaluate(() => {
    const c = document.querySelector('.ov-chart canvas');
    return c ? `${c.width}x${c.height}` : null;
  });
  r.ranks = await page.evaluate(() =>
    [...document.querySelectorAll('.ov-rank-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  r.sectors = await page.evaluate(() =>
    [...document.querySelectorAll('.ov-sector-item')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  );
  r.heatLabel = await page.evaluate(() => document.querySelector('.ov-heat-tag')?.innerText || null);
  r.ai = await page.evaluate(() => {
    const card = document.querySelector('.ov-ai-card');
    if (!card) return null;
    return {
      source: card.querySelector('.ov-source')?.innerText || '',
      verdict: card.querySelector('.ov-verdict-text')?.innerText || '',
      confidence: card.querySelector('.ov-verdict-conf')?.innerText || '',
      summary: card.querySelector('.ov-ai-summary')?.innerText || '',
      market: card.querySelector('.ov-ai-market')?.innerText || '',
      allocations: [...card.querySelectorAll('.ov-alloc-item')].map((el) =>
        el.innerText.replace(/\s+/g, ' ').trim()
      ),
      risks: [...card.querySelectorAll('.ov-risk-item')].map((el) => el.innerText.trim()),
    };
  });

  await page.screenshot({ path: `${OUT}\\10-overview.png` });
  await page.screenshot({ path: `${OUT}\\11-overview-full.png`, fullPage: true });

  // 切回单只基金，确认不串味
  await page.evaluate(() => {
    [...document.querySelectorAll('.view-btn')].find((b) => b.innerText.includes('单只基金'))?.click();
  });
  await sleep(1500);
  r.backToDetail = await page.evaluate(() => !!document.querySelector('.chart-container'));
} catch (e) {
  r.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  r.pageErrors = pageErrors;
  r.consoleErrors = consoleErrors.slice(0, 15);
  r.failedRequests = failedRequests.slice(0, 15);
  console.log('===RESULT_JSON===');
  console.log(JSON.stringify(r, null, 2));
  console.log('===END_JSON===');
}

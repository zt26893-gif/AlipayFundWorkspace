import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const OUT = 'J:\\AlipayFundWorkspace\\test';

const pageErrors = [];
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));

const visible = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const st = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, sel);

const r = {};
try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 40000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 20000 });
  await sleep(3000);

  r.panelBefore = (await page.evaluate(() => document.querySelector('.portfolio-panel')?.innerText || ''))
    .replace(/\s+/g, ' ').slice(0, 180);

  // 打开买入弹窗
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '买入')?.click();
  });
  await sleep(1500);
  r.modalVisible = await visible('.modal-overlay');

  // 输入 1000 元（真实键盘输入，确保触发 React onChange）
  const amountSel = 'input[placeholder="输入买入金额"]';
  await page.waitForSelector(amountSel, { timeout: 10000 });
  await page.click(amountSel);
  await page.type(amountSel, '1000', { delay: 60 });
  await sleep(1800);
  r.typedValue = await page.$eval(amountSel, (el) => el.value);
  r.preview = (await page.evaluate(() => document.querySelector('.trade-preview')?.innerText || '')).replace(/\s+/g, ' ').slice(0, 220);

  // 确认买入
  const confirmText = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('确认买入'));
    if (!btn) return { found: false };
    const info = { found: true, disabled: btn.disabled, text: btn.innerText.trim() };
    btn.click();
    return info;
  });
  r.confirmBtn = confirmText;
  await sleep(3000);

  r.modalClosedAfterBuy = !(await visible('.modal-overlay'));
  r.panelAfter = (await page.evaluate(() => document.querySelector('.portfolio-panel')?.innerText || ''))
    .replace(/\s+/g, ' ').slice(0, 400);

  r.detailHeader = (await page.evaluate(() => {
    const hdr = document.querySelector('.fund-detail-header, header');
    return hdr ? hdr.innerText.replace(/\s+/g, ' ').slice(0, 200) : '';
  }));

  // 检查定投入口
  r.dcaButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => t.includes('定投') || t.includes('配置'))
  );

  await page.screenshot({ path: `${OUT}\\05-after-buy.png` });
  await page.screenshot({ path: `${OUT}\\06-after-buy-full.png`, fullPage: true });

  // persistence: reload and check position survives
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3500);
  r.panelAfterReload = (await page.evaluate(() => document.querySelector('.portfolio-panel')?.innerText || ''))
    .replace(/\s+/g, ' ').slice(0, 300);
} catch (e) {
  r.fatal = String(e?.stack || e);
} finally {
  await browser.close();
  r.pageErrors = pageErrors;
  console.log('===RESULT_JSON===');
  console.log(JSON.stringify(r, null, 2));
  console.log('===END_JSON===');
}

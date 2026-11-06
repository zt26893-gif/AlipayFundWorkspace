/**
 * 转换弹窗「赎回费金额手动修改」验证
 * 用法：node convert-fee-test.mjs http://127.0.0.1:8790/
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8790/';
const shot = process.env.SHOT || path.join(process.cwd(), 'convert-fee.png');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 1000 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForSelector('.btn-convert-small', { timeout: 45000 });
await page.click('.btn-convert-small');
await page.waitForSelector('.modal-container.trade-modal', { timeout: 20000 });
await page.waitForSelector('.convert-select', { timeout: 20000 });

// 选一只转入基金（第一个非空 option）
await page.evaluate(() => {
  const sel = document.querySelector('.convert-select');
  const opt = [...sel.options].find((o) => o.value);
  if (opt) {
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.waitForSelector('.convert-shares-input', { timeout: 10000 });

// 输入 10 份
await page.click('.convert-shares-input');
await page.type('.convert-shares-input', '10', { delay: 40 });
await new Promise((r) => setTimeout(r, 800));

const read = () =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('.trade-preview .preview-row')];
    const row = rows.find((r) => r.textContent.includes('赎回费'));
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return {
      gross: clean(rows.find((r) => r.textContent.includes('转出金额'))?.querySelector('.preview-value')?.textContent),
      rate: clean(row?.querySelector('.inline-rate-num')?.textContent),
      fee: clean(row?.querySelector('.inline-fee-num')?.textContent),
      net: clean(rows.find((r) => r.textContent.includes('净转入金额'))?.querySelector('.preview-value')?.textContent),
      toShares: clean(rows.find((r) => r.textContent.includes('预估转入份额'))?.querySelector('.preview-value')?.textContent),
    };
  });

const before = await read();

// 点开赎回费金额 → 改成 5.00 → 回车
await page.click('.trade-preview .inline-fee');
await page.waitForSelector('.inline-fee-input', { timeout: 5000 });
await page.focus('.inline-fee-input');
await page.keyboard.down('Control');
await page.keyboard.press('KeyA');
await page.keyboard.up('Control');
await page.type('.inline-fee-input', '5.00', { delay: 30 });
const typedValue = await page.$eval('.inline-fee-input', (el) => el.value);
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 900));

const after = await read();
await page.screenshot({ path: shot });

const pct = (s) => parseFloat(String(s).replace('%', ''));
const grossNum = parseFloat(String(before.gross).replace(/[^\d.]/g, ''));
const rateNum = pct(after.rate);
const expectedRate = (5 / grossNum) * 100;

console.log(
  JSON.stringify(
    {
      before,
      after,
      typedValue,
      checks: {
        feeIsExactly5: String(after.fee).includes('5.00'),
        rateFollows: Math.abs(rateNum - expectedRate) < 0.02,
        expectedRatePct: expectedRate.toFixed(4),
        netChanged: before.net !== after.net,
      },
      logs: logs.filter((l) => l.includes('error') || l.includes('Error')).slice(0, 5),
    },
    null,
    1
  )
);
console.log('SHOT ' + shot);
await browser.close();

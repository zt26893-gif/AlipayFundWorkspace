/**
 * 转换弹窗「结果金额可直接修改」验证：补差费 / 费用合计 / 净转入金额 / 剩余资金
 * 用法：node convert-fields-test.mjs http://127.0.0.1:8791/
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8791/';
const shot = process.env.SHOT || path.join(process.cwd(), 'convert-fields.png');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 1000 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForSelector('.btn-convert-small', { timeout: 45000 });
await page.click('.btn-convert-small');
await page.waitForSelector('.convert-select', { timeout: 20000 });

await page.evaluate(() => {
  const sel = document.querySelector('.convert-select');
  const opt = [...sel.options].find((o) => o.value);
  if (opt) {
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.click('.convert-shares-input');
await page.type('.convert-shares-input', '10', { delay: 30 });
await new Promise((r) => setTimeout(r, 900));

const num = (s) => parseFloat(String(s || '').replace(/[^\d.-]/g, '')) || 0;

async function read() {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.trade-preview .preview-row')];
    const get = (label) => {
      const row = rows.find((r) => r.textContent.includes(label));
      return row ? row.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    const feeIn = (label) => {
      const row = rows.find((r) => r.textContent.includes(label));
      return row?.querySelector('.inline-fee-num')?.textContent?.replace(/\s+/g, ' ').trim() || null;
    };
    return {
      gross: rows.find((r) => r.textContent.includes('转出金额'))?.querySelector('.preview-value')?.textContent?.trim() || null,
      redeem: feeIn('赎回费'),
      spread: feeIn('申购补差费'),
      total: feeIn('费用合计'),
      net: feeIn('净转入金额'),
      remainder: feeIn('剩余资金'),
      spreadRate: document.querySelector('.convert-spread-rate')?.textContent?.trim() || null,
      toShares: get('预估转入份额'),
      raw: { spread: get('申购补差费'), total: get('费用合计') },
    };
  });
}

async function editRow(label, value) {
  const ok = await page.evaluate((label) => {
    const rows = [...document.querySelectorAll('.trade-preview .preview-row')];
    const row = rows.find((r) => r.textContent.includes(label));
    const btn = row?.querySelector('.inline-fee');
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  if (!ok) throw new Error('找不到可编辑金额：' + label);
  await page.waitForSelector('.inline-fee-input', { timeout: 5000 });
  await page.focus('.inline-fee-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type('.inline-fee-input', String(value), { delay: 20 });
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 700));
}

const before = await read();

await editRow('申购补差费', '2.00');
const afterSpread = await read();

await editRow('费用合计', '6.00');
const afterTotal = await read();

await editRow('净转入金额', '15.00');
const afterNet = await read();

await editRow('剩余资金', '0.02');
const afterRemainder = await read();

await page.screenshot({ path: shot });

const gross = num(before.gross);
const expectedSpreadRate = gross > 0 ? (2 / (gross - 2)) * 100 : 0;

console.log(
  JSON.stringify(
    {
      before,
      afterSpread,
      afterTotal,
      afterNet,
      afterRemainder,
      checks: {
        spreadFeeIs2: Math.abs(num(afterSpread.spread) - 2) < 0.005,
        spreadRateFollows: Math.abs(num(afterSpread.spreadRate) - expectedSpreadRate) < 0.02,
        expectedSpreadRatePct: expectedSpreadRate.toFixed(2),
        totalIs6: Math.abs(num(afterTotal.total) - 6) < 0.005,
        netIs15: Math.abs(num(afterNet.net) - 15) < 0.005,
        remainderIs002: Math.abs(num(afterRemainder.remainder) - 0.02) < 0.006,
        totalConsistent: Math.abs(num(afterTotal.total) - (num(afterTotal.redeem) + num(afterTotal.spread))) < 0.02,
        netConsistent: Math.abs(num(afterTotal.net) - (gross - num(afterTotal.total))) < 0.05,
      },
    },
    null,
    1
  )
);
console.log('SHOT ' + shot);
await browser.close();

/**
 * 设置 / 主题 / 语言 / 截图识别 综合验证
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8798/';
const outDir = process.env.SHOT_DIR || path.join(process.env.TEMP, 'fundrec');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1500, height: 950 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

const result = {};

result.gearExists = await page.$('.sidebar-settings-btn') !== null;
await page.screenshot({ path: path.join(outDir, 'settings-dark-main.png') });

// 打开设置
await page.click('.sidebar-settings-btn');
await page.waitForSelector('.settings-modal', { timeout: 10000 });
result.settingsVisible = true;
await page.screenshot({ path: path.join(outDir, 'settings-dark.png') });

// 切亮色
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.settings-option')].find((b) => b.textContent.includes('亮色'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 600));
result.themeAttr = await page.evaluate(() => document.documentElement.dataset.theme);
result.bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.screenshot({ path: path.join(outDir, 'settings-light.png') });

// 切英文
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.settings-option')].find((b) => b.textContent.includes('English'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 500));
result.enSidebarTitle = await page.evaluate(() => document.querySelector('.sidebar-title')?.textContent.trim() || null);
result.enThemeLabel = await page.evaluate(() => document.querySelector('.settings-section-title')?.textContent.trim() || null);

// 填 AI 配置（mock 服务）
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('.settings-input')];
  const set = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set(inputs[0], 'http://127.0.0.1:8797');
  set(inputs[1], 'test-key');
  set(inputs[3], 'mock-vl');
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.querySelector('.settings-done')?.click());
await new Promise((r) => setTimeout(r, 500));

// 打开买入弹窗并上传截图
await page.click('.btn-buy-small');
await page.waitForSelector('.trade-ocr-btn', { timeout: 10000 });
const input = await page.$('input[type="file"]');
await input.uploadFile(path.join(outDir, 'upload-test.png'));
await new Promise((r) => setTimeout(r, 2500));

result.amount = await page.$eval('input[placeholder="输入买入金额"]', (el) => el.value).catch(() => null);
result.orderTime = await page.$eval('.trade-input[type="datetime-local"]', (el) => el.value).catch(() => null);
result.ocrMsg = await page.evaluate(() => document.querySelector('.trade-ocr-msg')?.textContent?.trim() || null);
await page.screenshot({ path: path.join(outDir, 'ocr-result.png') });

console.log(JSON.stringify(result, null, 1));
await browser.close();

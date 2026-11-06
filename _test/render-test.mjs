import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const SHOT = process.argv[3] || 'J:\\AlipayFundWorkspace\\test\\02-rendered.png';

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const httpErrors = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleErrors.push(`[${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  let mounted = true;
  try {
    await page.waitForFunction(() => {
      const r = document.querySelector('#root');
      return r && r.children.length > 0;
    }, { timeout: 20000 });
  } catch {
    mounted = false;
  }

  // give charts / async data a chance
  await new Promise((r) => setTimeout(r, 4000));

  const info = await page.evaluate(() => {
    const root = document.querySelector('#root');
    const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    const canvases = [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`);
    const svgs = document.querySelectorAll('svg').length;
    const buttons = [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 40);
    const bg = getComputedStyle(document.body).backgroundColor;
    return {
      title: document.title,
      rootChildren: root ? root.children.length : -1,
      rootHtmlLength: root ? root.innerHTML.length : 0,
      bodyTextLength: text.length,
      bodyTextHead: text.slice(0, 600),
      canvases,
      svgCount: svgs,
      bodyBackground: bg,
      buttons,
      scriptCount: document.scripts.length,
    };
  });

  await page.screenshot({ path: SHOT, fullPage: false });

  console.log('===RESULT_JSON===');
  console.log(JSON.stringify({
    url: URL,
    mounted,
    screenshot: SHOT,
    pageErrors,
    consoleErrors: consoleErrors.slice(0, 25),
    failedRequests: failedRequests.slice(0, 25),
    httpErrors: httpErrors.slice(0, 25),
    info,
  }, null, 2));
  console.log('===END_JSON===');
} finally {
  await browser.close();
}

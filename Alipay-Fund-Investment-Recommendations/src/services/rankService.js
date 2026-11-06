/**
 * rankService — 抓取天天基金（东方财富）开放式基金排行
 *
 * 用途：趋势总览里的「推荐买入」，给用户推荐基金池之外、近期动量靠前的基金。
 * 请求经本地服务端 /api/fundrank 代理，避免跨域。
 */

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {{limit?:number}} opts
 * @returns {Promise<Array<{code:string,name:string,oneMonth:number,threeMonth:number,oneYear:number,nav:number,navDate:string}>>}
 */
export async function fetchTopFunds({ limit = 40 } = {}) {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);

  const url =
    '/api/fundrank/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=3yzf&st=desc' +
    `&sd=${ymd(start)}&ed=${ymd(end)}&qdii=&tabSubtype=,,,,,&pi=1&pn=${limit}&dx=1`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`排行接口 HTTP ${res.status}`);
  const text = await res.text();

  const match = text.match(/datas\s*:\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  const rows = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const funds = [];

  for (const row of rows) {
    const f = row.split(',');
    if (f.length < 12) continue;
    const code = f[0];
    const name = f[1];
    if (!/^\d{6}$/.test(code)) continue;
    funds.push({
      code,
      name,
      navDate: f[3],
      nav: Number(f[4]),
      oneMonth: Number(f[8]),
      threeMonth: Number(f[9]),
      oneYear: Number(f[11]),
      inception: /^\d{4}-\d{2}-\d{2}$/.test(f[15] || '') ? f[15] : '',
    });
  }

  return funds.filter(
    (f) => Number.isFinite(f.oneMonth) && Number.isFinite(f.threeMonth)
  );
}

/** 简单动量打分：近 1 月权重更高，近 3 月做确认 */
export function scoreCandidate(fund) {
  return fund.oneMonth * 0.6 + fund.threeMonth * 0.4;
}

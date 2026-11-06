/**
 * overviewService — 总览看板数据层
 *
 * 提供两类数据：
 *   1. 大盘指数历史 K 线（走 /api/indexkline → push2his.eastmoney.com）
 *   2. 板块热度（走 /api/push2 → push2.eastmoney.com 的板块涨幅榜）
 *
 * 基金近 10 日净值复用 fundService.fetchFundHistory。
 */

const INDEX_KLINE_API = '/api/indexkline/api/qt/stock/kline/get';
const SECTOR_LIST_API = '/api/push2/api/qt/clist/get';

/** 可用的指数，secid 前缀 1=沪市 0=深市 */
export const INDEX_POOL = [
  { secid: '1.000300', name: '沪深300' },
  { secid: '1.000001', name: '上证指数' },
  { secid: '0.399001', name: '深证成指' },
  { secid: '0.399006', name: '创业板指' },
];

/** 默认基准指数（用于和基金走势对比） */
export const BENCHMARK_SECID = '1.000300';

/**
 * 获取指数历史日 K 线
 * @param {string} secid - 如 '1.000300'
 * @param {number} days - 需要的交易日数量
 * @returns {Promise<{name:string, code:string, points:Array<{date:string, close:number, change:number}>}|null>}
 */
export async function fetchIndexTrend(secid = BENCHMARK_SECID, days = 30) {
  try {
    const url =
      `${INDEX_KLINE_API}?secid=${secid}&klt=101&fqt=1&lmt=${days}` +
      `&end=20500101&fields1=f1,f2,f3,f4&fields2=f51,f52,f53`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[overviewService] 指数K线请求失败 ${secid}: HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const klines = json?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) {
      console.warn(`[overviewService] 指数K线无数据 ${secid}`);
      return null;
    }

    let prevClose = null;
    const points = klines
      .map((line) => {
        const parts = String(line).split(',');
        const date = parts[0];
        const close = parseFloat(parts[2]);
        if (!date || !Number.isFinite(close)) return null;
        const change = prevClose ? ((close - prevClose) / prevClose) * 100 : 0;
        prevClose = close;
        return { date, close, change: Number(change.toFixed(2)) };
      })
      .filter(Boolean);

    if (points.length === 0) return null;

    return {
      name: json.data.name || INDEX_POOL.find((i) => i.secid === secid)?.name || secid,
      code: json.data.code || secid,
      secid,
      points,
    };
  } catch (err) {
    console.warn(`[overviewService] 指数K线异常 ${secid}:`, err.message);
    return null;
  }
}

/**
 * 获取板块热度榜（行业板块 + 概念板块）
 * 东财 fid=f3 表示按涨跌幅排序，po=1 为降序
 *
 * @param {number} limit - 返回条数
 * @returns {Promise<Array<{code:string,name:string,change:number,mainInflow:number}>>}
 */
export async function fetchSectorHeat(limit = 12) {
  try {
    const params = [
      'pn=1',
      `pz=${Math.max(limit, 20)}`,
      'po=1',
      'np=1',
      'fltt=2',
      'invt=2',
      'fid=f3',
      // 行业板块：m:90+t:2；概念板块为 m:90+t:3
      `fs=${encodeURIComponent('m:90+t:2')}`,
      'fields=f2,f3,f12,f14,f62',
    ].join('&');

    const res = await fetch(`${SECTOR_LIST_API}?${params}`);
    if (!res.ok) {
      console.warn(`[overviewService] 板块数据请求失败: HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const diff = json?.data?.diff;
    if (!Array.isArray(diff)) {
      console.warn('[overviewService] 板块数据为空');
      return [];
    }

    return diff
      .map((d) => ({
        code: d.f12,
        name: d.f14,
        index: Number.isFinite(d.f2) ? d.f2 : null,
        change: Number.isFinite(d.f3) ? d.f3 : 0,
        mainInflow: Number.isFinite(d.f62) ? d.f62 : 0,
      }))
      .filter((s) => s.name && s.code)
      .slice(0, limit);
  } catch (err) {
    console.warn('[overviewService] 板块数据异常:', err.message);
    return [];
  }
}

/**
 * 一次性拉取总览所需的外部数据
 * @param {number} days - 指数需要的历史交易日
 * @returns {Promise<{indexTrend:Object|null, sectors:Array}>}
 */
export async function fetchOverviewMarket(days = 30) {
  const [indexTrend, sectors] = await Promise.all([
    fetchIndexTrend(BENCHMARK_SECID, days),
    fetchSectorHeat(12),
  ]);
  return { indexTrend, sectors };
}

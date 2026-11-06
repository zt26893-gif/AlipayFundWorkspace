/**
 * overviewEngine — 总览看板的纯计算层
 *
 * 输入：多只基金的历史净值 + 基准指数历史 K 线 + 板块热度
 * 输出：归一化走势、组合聚合曲线、风险收益指标、相关性、信号评分，
 *       以及一套不依赖大模型的本地策略（用于无 API Key / 请求失败时降级）。
 */

const TRADING_DAYS_PER_YEAR = 252;

/* ===== 基础数学 ===== */

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 2) => Number(v.toFixed(d));

/** 皮尔逊相关系数，样本不足 3 个时返回 0 */
export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const u = x[i] - mx;
    const v = y[i] - my;
    num += u * v;
    dx += u * u;
    dy += v * v;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

/**
 * 把稀疏的日期→数值映射对齐到统一日期轴。
 * 缺失值先向后回填（首日缺失用第一个有效值补齐），再向前填充，避免断点。
 */
function alignSeries(map, dates) {
  const raw = dates.map((d) => (map.has(d) ? map.get(d) : null));
  const firstIdx = raw.findIndex((v) => v != null);
  if (firstIdx === -1) return dates.map(() => null);

  for (let i = 0; i < firstIdx; i += 1) raw[i] = raw[firstIdx];
  for (let i = firstIdx + 1; i < raw.length; i += 1) {
    if (raw[i] == null) raw[i] = raw[i - 1];
  }
  return raw;
}

/** 以首个点为 100 归一化，便于不同净值量级的基金同图比较 */
function normalize(values) {
  const base = values.find((v) => v != null);
  if (!base) return values.map(() => null);
  return values.map((v) => (v == null ? null : round((v / base) * 100, 3)));
}

/** 由归一化序列推导日收益率（%） */
function dailyReturns(normalized) {
  const out = [];
  for (let i = 1; i < normalized.length; i += 1) {
    const prev = normalized[i - 1];
    const cur = normalized[i];
    if (prev && cur != null && prev !== 0) out.push(((cur - prev) / prev) * 100);
  }
  return out;
}

/** 最大回撤（%，正数表示回撤幅度） */
function maxDrawdown(normalized) {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of normalized) {
    if (v == null) continue;
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.max(mdd, ((peak - v) / peak) * 100);
  }
  return round(mdd, 2);
}

/** 由归一化序列得出期间收益率（%） */
function periodReturn(normalized) {
  const valid = normalized.filter((v) => v != null);
  if (valid.length < 2) return 0;
  return round(valid[valid.length - 1] - 100, 2);
}

/* ===== 指标与评分 ===== */

/**
 * 综合评分：动量 + 相对大盘超额 + 分散价值 - 回撤惩罚
 * 结果 0~100，用于给每只基金一个可排序的强弱刻度。
 */
function scoreFund({ periodRet, excess, corr, mdd }) {
  let score = 50;
  score += clamp(periodRet * 2.5, -25, 25);
  score += clamp(excess * 3, -15, 15);
  score += clamp((1 - Math.abs(corr)) * 10, 0, 10);
  score -= clamp(mdd * 1.5, 0, 20);
  return Math.round(clamp(score, 0, 100));
}

function actionFromScore(score) {
  if (score >= 68) return '加仓';
  if (score >= 52) return '持有';
  if (score >= 38) return '观望';
  return '减仓';
}

/* ===== 主入口 ===== */

/**
 * 构建总览视图所需的全部派生数据
 *
 * @param {Object} params
 * @param {Array<{code:string,name:string,history:Array<{date:string,nav:number}>}>} params.fundHistories
 * @param {{points:Array<{date:string,close:number}>}|null} params.indexTrend
 * @param {Array<{name:string,change:number,mainInflow:number}>} params.sectorHeat
 * @param {number} params.days - 观察窗口（交易日）
 */
export function buildOverview({ fundHistories = [], indexTrend = null, sectorHeat = [], days = 10 }) {
  // 1. 统一日期轴：取所有基金出现过的日期，保留最后 N 个交易日
  const dateSet = new Set();
  fundHistories.forEach((f) => {
    (f.history || []).forEach((p) => {
      if (p.date) dateSet.add(p.date);
    });
  });
  const dates = [...dateSet].sort().slice(-days);

  // 2. 基准指数（沪深300）对齐 + 归一化
  let benchmark = null;
  if (indexTrend && Array.isArray(indexTrend.points) && indexTrend.points.length > 0 && dates.length > 0) {
    const closeMap = new Map(indexTrend.points.map((p) => [p.date, p.close]));
    const aligned = alignSeries(closeMap, dates);
    if (aligned.some((v) => v != null)) {
      const normalized = normalize(aligned);
      benchmark = {
        name: indexTrend.name || '沪深300',
        series: normalized,
        periodReturn: periodReturn(normalized),
        volatility: round(std(dailyReturns(normalized)) * Math.sqrt(TRADING_DAYS_PER_YEAR), 2),
        maxDrawdown: maxDrawdown(normalized),
      };
    }
  }

  const benchmarkReturns = benchmark ? dailyReturns(benchmark.series) : [];

  // 3. 逐只基金：对齐、归一化、指标、评分
  const funds = fundHistories
    .map((f) => {
      const navMap = new Map((f.history || []).filter((p) => p.date).map((p) => [p.date, p.nav]));
      const aligned = alignSeries(navMap, dates);
      if (!aligned.some((v) => v != null)) return null;

      const normalized = normalize(aligned);
      const ret = periodReturn(normalized);
      const returns = dailyReturns(normalized);
      const corr = benchmarkReturns.length >= 3 ? round(pearson(returns, benchmarkReturns), 2) : 0;
      const mdd = maxDrawdown(normalized);
      const excess = benchmark ? round(ret - benchmark.periodReturn, 2) : 0;

      return {
        code: f.code,
        name: f.name,
        series: normalized,
        periodReturn: ret,
        volatility: round(std(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR), 2),
        maxDrawdown: mdd,
        corr,
        excess,
        score: scoreFund({ periodRet: ret, excess, corr, mdd }),
        latestNav: aligned.filter((v) => v != null).slice(-1)[0] || null,
      };
    })
    .filter(Boolean)
    .map((f) => ({ ...f, action: actionFromScore(f.score) }));

  // 4. 组合曲线：等权平均归一化净值
  let portfolio = null;
  if (funds.length > 0) {
    const series = dates.map((_, i) => {
      const vals = funds.map((f) => f.series[i]).filter((v) => v != null);
      return vals.length ? round(mean(vals), 3) : null;
    });
    const ret = periodReturn(series);
    const returns = dailyReturns(series);
    const corr = benchmarkReturns.length >= 3 ? round(pearson(returns, benchmarkReturns), 2) : 0;
    const mdd = maxDrawdown(series);
    portfolio = {
      series,
      periodReturn: ret,
      volatility: round(std(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR), 2),
      maxDrawdown: mdd,
      corr,
      excess: benchmark ? round(ret - benchmark.periodReturn, 2) : 0,
    };
  }

  // 5. 板块热度汇总
  const validSectors = (sectorHeat || []).filter((s) => Number.isFinite(s.change));
  const sectorAvg = round(mean(validSectors.slice(0, 20).map((s) => s.change)), 2);
  const netInflow = validSectors.reduce((sum, s) => sum + (s.mainInflow || 0), 0);
  const heatLabel =
    sectorAvg >= 2 ? '火热' : sectorAvg >= 0.5 ? '偏热' : sectorAvg >= -0.5 ? '分化' : sectorAvg >= -1.5 ? '偏冷' : '冷清';

  return {
    dates,
    funds,
    benchmark,
    portfolio,
    sector: {
      list: validSectors,
      top: validSectors.slice(0, 6),
      avgChange: sectorAvg,
      netInflow,
      label: heatLabel,
    },
    hasData: funds.length > 0 && dates.length >= 2,
    generatedAt: new Date().toLocaleString('zh-CN'),
  };
}

/* ===== 本地降级策略 ===== */

const fmtPct = (v) => `${v >= 0 ? '+' : ''}${round(v, 2)}%`;
const fmtYi = (v) => `${v >= 0 ? '+' : ''}${round(v / 1e8, 2)}亿`;

/**
 * 不依赖大模型的策略生成（无 API Key 或调用失败时使用）
 * 结构与 DeepSeek 返回保持一致，UI 无需区分。
 */
export function buildLocalOverviewStrategy(overview) {
  if (!overview || !overview.hasData || !overview.portfolio) {
    return {
      verdict: '数据不足',
      verdictIcon: '⏳',
      verdictColor: 'neutral',
      confidence: 0,
      summary: '基金池数据不足，暂时无法生成组合策略。请先添加基金并等待净值数据加载。',
      marketView: '暂无足够数据判断大盘环境。',
      allocations: [],
      risks: ['数据不足，结论不具备参考性'],
      isAI: false,
      updatedAt: new Date().toLocaleString('zh-CN'),
    };
  }

  const { portfolio, benchmark, funds, sector } = overview;
  const topSector = sector.top[0];

  // 仓位结论：组合动量为主，大盘与板块做修正
  let verdict;
  let icon;
  let color;
  if (portfolio.periodReturn > 2 && (benchmark?.periodReturn ?? 0) > 0) {
    verdict = '趋势持有，逢跌加仓';
    icon = '🚀';
    color = 'rise';
  } else if (portfolio.periodReturn > 0) {
    verdict = '持有观察';
    icon = '📈';
    color = 'rise';
  } else if (portfolio.periodReturn > -3) {
    verdict = '轻仓等待';
    icon = '➡️';
    color = 'neutral';
  } else {
    verdict = '降低仓位，控制回撤';
    icon = '📉';
    color = 'fall';
  }

  const confidence = Math.round(
    clamp(58 + Math.abs(portfolio.periodReturn) * 3 + (benchmark ? 4 : 0), 55, 88)
  );

  const marketView =
    `近 ${overview.dates.length} 个交易日，${benchmark ? `${benchmark.name} ${fmtPct(benchmark.periodReturn)}` : '大盘数据缺失'}，` +
    `组合 ${fmtPct(portfolio.periodReturn)}` +
    (benchmark ? `（${portfolio.excess >= 0 ? '跑赢' : '跑输'}基准 ${Math.abs(portfolio.excess).toFixed(2)} 个百分点）` : '') +
    `。板块整体${sector.label}（均值 ${fmtPct(sector.avgChange)}）` +
    (topSector ? `，领涨方向为 ${topSector.name} ${fmtPct(topSector.change)}。` : '。');

  const summary =
    `组合最近 ${overview.dates.length} 日${portfolio.periodReturn >= 0 ? '录得正收益' : '出现回撤'}` +
    `${fmtPct(portfolio.periodReturn)}，年化波动 ${portfolio.volatility.toFixed(2)}%，` +
    `最大回撤 ${portfolio.maxDrawdown.toFixed(2)}%，与大盘相关性 ${portfolio.corr.toFixed(2)}。` +
    `整体${portfolio.periodReturn >= 0 ? '处于可持有状态' : '需警惕趋势走弱'}，` +
    `建议${verdict.includes('降低') ? '优先降低高波动品种仓位' : '以持有为主，单笔加仓控制在计划仓位内'}。`;

  const allocations = [...funds]
    .sort((a, b) => b.score - a.score)
    .map((f) => ({
      code: f.code,
      name: f.name,
      action: f.action,
      weight: f.action === '加仓' ? '可上调 5%~10%' : f.action === '减仓' ? '下调 5%~10%' : '维持现有仓位',
      reason:
        `近${overview.dates.length}日 ${fmtPct(f.periodReturn)}，` +
        `相对基准${f.excess >= 0 ? '超额' : '落后'} ${Math.abs(f.excess).toFixed(2)} 个百分点，` +
        `与大盘相关性 ${f.corr.toFixed(2)}，最大回撤 ${f.maxDrawdown.toFixed(2)}%，综合评分 ${f.score}。`,
    }));

  const risks = [];
  if (portfolio.maxDrawdown > 5) risks.push(`组合近 ${overview.dates.length} 日最大回撤已达 ${portfolio.maxDrawdown.toFixed(2)}%，注意止损纪律`);
  if (portfolio.corr > 0.85) risks.push(`与大盘相关性 ${portfolio.corr.toFixed(2)}，分散效果有限，系统性风险敞口较高`);
  if (sector.netInflow < 0) risks.push(`板块整体主力净流出 ${fmtYi(sector.netInflow)}，增量资金不足`);
  if (funds.some((f) => f.volatility > 30)) risks.push('存在年化波动率超过 30% 的高波动品种，仓位不宜过重');
  if (risks.length === 0) risks.push('当前指标未见明显异常，仍需关注大盘量能与政策面变化');

  return {
    verdict,
    verdictIcon: icon,
    verdictColor: color,
    confidence,
    summary,
    marketView,
    allocations,
    risks: risks.slice(0, 3),
    isAI: false,
    updatedAt: new Date().toLocaleString('zh-CN'),
  };
}

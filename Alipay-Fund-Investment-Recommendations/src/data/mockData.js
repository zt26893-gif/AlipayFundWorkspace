/**
 * Mock Data - 基金模拟数据
 * 包含基金基本信息、历史净值、大盘指数和 AI 策略分析数据
 */

// 生成近 N 天的日期数组
function generateDates(days) {
  const dates = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // 跳过周末
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// 生成模拟净值走势（带趋势和随机波动）
function generateNavHistory(baseNav, days, trend = 'up', volatility = 0.015) {
  const dates = generateDates(days);
  const data = [];
  let nav = baseNav;
  const trendFactor = trend === 'up' ? 0.001 : trend === 'down' ? -0.001 : 0.0002;

  dates.forEach((date) => {
    const change = (Math.random() - 0.48) * volatility + trendFactor;
    nav = Math.max(0.5, nav * (1 + change));
    data.push({
      date,
      nav: parseFloat(nav.toFixed(4)),
      accNav: parseFloat((nav * 1.05).toFixed(4)),
    });
  });
  return data;
}

// ======== 基金信息库 ========
export const FUND_DATABASE = {
  '000001': {
    code: '000001',
    name: '华夏成长混合',
    type: '混合型',
    company: '华夏基金',
    nav: 1.2345,
    accNav: 3.5670,
    dailyChange: 1.25,
    history: generateNavHistory(1.15, 365, 'up', 0.012),
  },
  '110011': {
    code: '110011',
    name: '易方达中小盘混合',
    type: '混合型',
    company: '易方达基金',
    nav: 5.6789,
    accNav: 6.1234,
    dailyChange: -0.85,
    history: generateNavHistory(5.5, 365, 'sideways', 0.01),
  },
  '161725': {
    code: '161725',
    name: '招商中证白酒指数',
    type: '指数型',
    company: '招商基金',
    nav: 1.4567,
    accNav: 1.8901,
    dailyChange: 2.35,
    history: generateNavHistory(1.3, 365, 'up', 0.018),
  },
  '003834': {
    code: '003834',
    name: '华夏能源革新股票',
    type: '股票型',
    company: '华夏基金',
    nav: 2.8901,
    accNav: 2.8901,
    dailyChange: -1.67,
    history: generateNavHistory(3.1, 365, 'down', 0.02),
  },
  '005827': {
    code: '005827',
    name: '易方达蓝筹精选混合',
    type: '混合型',
    company: '易方达基金',
    nav: 1.9876,
    accNav: 2.3456,
    dailyChange: 0.45,
    history: generateNavHistory(1.9, 365, 'up', 0.008),
  },
  '320007': {
    code: '320007',
    name: '诺安成长混合',
    type: '混合型',
    company: '诺安基金',
    nav: 1.5432,
    accNav: 2.1098,
    dailyChange: 3.12,
    history: generateNavHistory(1.4, 365, 'up', 0.025),
  },
  '012414': {
    code: '012414',
    name: '天弘中证光伏产业指数',
    type: '指数型',
    company: '天弘基金',
    nav: 0.7654,
    accNav: 0.7654,
    dailyChange: -2.18,
    history: generateNavHistory(0.9, 365, 'down', 0.022),
  },
  '001938': {
    code: '001938',
    name: '中欧时代先锋股票',
    type: '股票型',
    company: '中欧基金',
    nav: 1.8765,
    accNav: 2.5432,
    dailyChange: 0.78,
    history: generateNavHistory(1.8, 365, 'sideways', 0.013),
  },
};

// ======== 大盘指数 ========
export const MARKET_INDICES = [
  {
    name: '上证指数',
    code: 'SH000001',
    value: 3256.78,
    change: 15.32,
    changePercent: 0.47,
  },
  {
    name: '深证成指',
    code: 'SZ399001',
    value: 10876.54,
    change: -32.67,
    changePercent: -0.30,
  },
  {
    name: '沪深300',
    code: 'SH000300',
    value: 3912.45,
    change: 23.11,
    changePercent: 0.59,
  },
  {
    name: '创业板指',
    code: 'SZ399006',
    value: 2145.67,
    change: -18.90,
    changePercent: -0.87,
  },
];

// ======== AI 策略分析模板 ========
export const AI_STRATEGIES = {
  up: {
    trend: '上升通道',
    trendIcon: '📈',
    trendColor: 'rise',
    diagnosis:
      '该基金所属板块近期资金持续流入，均线系统呈多头排列，MACD 金叉信号明显。整体处于上升趋势中，市场情绪偏乐观。',
    suggestion: '持有等待',
    suggestionDetail:
      '当前趋势良好，建议继续持有。可关注5日均线支撑情况，若不跌破可继续持有。若已盈利超过10%，可考虑分批止盈。',
    confidence: 78,
  },
  down: {
    trend: '下跌趋势',
    trendIcon: '📉',
    trendColor: 'fall',
    diagnosis:
      '该基金近期净值持续下行，均线系统呈空头排列。行业板块整体承压，成交量萎缩，短期内缺乏反弹动力。',
    suggestion: '减仓止损',
    suggestionDetail:
      '建议适当降低仓位以控制风险。如果亏损已超过止损线（-5%），建议果断止损离场。等待市场企稳后再考虑入场。',
    confidence: 72,
  },
  sideways: {
    trend: '横盘震荡',
    trendIcon: '➡️',
    trendColor: 'neutral',
    diagnosis:
      '该基金净值在窄幅区间波动，成交量无明显变化。板块处于筑底阶段，多空博弈激烈，方向尚不明朗。',
    suggestion: '观望等待',
    suggestionDetail:
      '当前市场方向不明确，建议保持现有仓位不变，耐心等待突破信号。可设置关键价位提醒，突破后再做决策。',
    confidence: 55,
  },
  strongUp: {
    trend: '强势上涨',
    trendIcon: '🚀',
    trendColor: 'rise',
    diagnosis:
      '该基金近期涨幅显著，成交量持续放大，主力资金大幅流入。行业利好政策频出，市场热度高涨。',
    suggestion: '减仓止盈',
    suggestionDetail:
      '当前盈利丰厚，建议分批止盈锁定利润。可先卖出50%仓位，剩余仓位设置移动止盈线。警惕高位回调风险。',
    confidence: 85,
  },
  buy: {
    trend: '底部反弹',
    trendIcon: '🔄',
    trendColor: 'rise',
    diagnosis:
      '该基金经过较长时间调整后出现企稳迹象，底部成交量温和放大，MACD底背离信号出现，反弹概率较大。',
    suggestion: '加仓买入',
    suggestionDetail:
      '当前估值处于历史低位，性价比较高。建议分3次建仓：先投入计划总金额的30%，后续根据走势逐步加仓。',
    confidence: 68,
  },
};

// 根据基金走势决定策略类型
export function getStrategyForFund(fund, costPrice) {
  if (!fund) return AI_STRATEGIES.sideways;

  const currentNav = fund.nav;
  const dailyChange = fund.dailyChange;
  const profitRate = costPrice > 0 ? ((currentNav - costPrice) / costPrice) * 100 : 0;

  // 基于涨跌幅和收益率综合判断
  if (dailyChange > 2 && profitRate > 10) return AI_STRATEGIES.strongUp;
  if (dailyChange > 1 || profitRate > 5) return AI_STRATEGIES.up;
  if (dailyChange < -1.5 || profitRate < -5) return AI_STRATEGIES.down;
  if (dailyChange < -0.5 && profitRate < -2) return AI_STRATEGIES.down;
  if (profitRate < -3 && dailyChange > 0.5) return AI_STRATEGIES.buy;
  return AI_STRATEGIES.sideways;
}

// ======== 预设止盈止损阈值 ========
export const ALERT_THRESHOLDS = {
  takeProfit: 10, // +10% 止盈
  stopLoss: -5,   // -5% 止损
};

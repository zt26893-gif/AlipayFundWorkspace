/**
 * tradeEngine.js — 基金交易计算引擎
 * 严格遵循支付宝基金交易规则
 *
 * 规则要点：
 * - T+1 确认（交易日 15:00 前按当日净值，15:00 后按下一交易日净值）
 * - 申购费外扣法 0.15%（默认打折后）
 * - 赎回费按持有天数阶梯计算
 * - 成本价 = 总投入 / 总份额（加权平均）
 */

// ===== 费率配置 =====

/** 申购费率（默认支付宝打折后） */
export const BUY_FEE_RATE = 0.0015; // 0.15%

/** 赎回费率阶梯（按持有天数） */
export const SELL_FEE_TIERS = [
  { minDays: 0, maxDays: 7, rate: 0.015 },     // < 7天: 1.5%
  { minDays: 7, maxDays: 365, rate: 0.005 },    // 7天~1年: 0.5%
  { minDays: 365, maxDays: 730, rate: 0.0025 },  // 1年~2年: 0.25%
  { minDays: 730, maxDays: Infinity, rate: 0 },   // ≥ 2年: 0%
];

// ===== 费率计算 =====

/**
 * 计算申购手续费（外扣法）
 * 外扣法: 手续费 = 申购金额 / (1 + 费率) × 费率
 * @param {number} amount - 申购金额（元）
 * @param {number} feeRate - 申购费率，默认 0.15%
 * @returns {{ fee: number, netAmount: number }}
 */
export function calcBuyFee(amount, feeRate = BUY_FEE_RATE) {
  const fee = parseFloat(((amount / (1 + feeRate)) * feeRate).toFixed(2));
  const netAmount = parseFloat((amount - fee).toFixed(2));
  return { fee, netAmount };
}

/**
 * 根据持有天数获取赎回费率
 * @param {number} holdingDays - 持有天数
 * @param {Array} [tiers] - 赎回费率阶梯，默认用内置常量
 * @returns {number} 赎回费率
 */
export function getSellFeeRate(holdingDays, tiers = SELL_FEE_TIERS) {
  for (const tier of tiers) {
    if (holdingDays >= tier.minDays && holdingDays < tier.maxDays) {
      return tier.rate;
    }
  }
  return 0;
}

/**
 * 计算赎回手续费
 * 赎回手续费 = 赎回份额 × 赎回日净值 × 赎回费率
 * @param {number} shares - 赎回份额
 * @param {number} nav - 赎回确认日净值
 * @param {number} holdingDays - 持有天数
 * @param {Array} [tiers] - 赎回费率阶梯
 * @returns {{ fee: number, grossAmount: number, netAmount: number, feeRate: number }}
 */
export function calcSellFee(shares, nav, holdingDays, tiers = SELL_FEE_TIERS) {
  const feeRate = getSellFeeRate(holdingDays, tiers);
  const grossAmount = parseFloat((shares * nav).toFixed(2));
  const fee = parseFloat((grossAmount * feeRate).toFixed(2));
  const netAmount = parseFloat((grossAmount - fee).toFixed(2));
  return { fee, grossAmount, netAmount, feeRate };
}

// ===== T+1 确认日计算 =====

/**
 * 判断给定日期是否为交易日（简化版：仅排除周末）
 * 注：真实交易日还需排除法定节假日，此处简化处理
 * @param {Date} date
 * @returns {boolean}
 */
export function isTradingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 非周日非周六
}

/**
 * 获取下一个交易日
 * @param {Date} date
 * @returns {Date}
 */
export function getNextTradingDay(date) {
  const next = new Date(date);
  do {
    next.setDate(next.getDate() + 1);
  } while (!isTradingDay(next));
  return next;
}

/**
 * 根据下单时间计算所属交易日 (T日)
 * - 交易日 15:00 前 → 当日
 * - 15:00 后或非交易日 → 下一个交易日
 * @param {Date|string} orderTime - 下单时间
 * @returns {string} 交易日期 YYYY-MM-DD
 */
export function calcNavDate(orderTime) {
  const dt = new Date(orderTime);
  const hour = dt.getHours();

  let navDate;
  if (isTradingDay(dt) && hour < 15) {
    // 交易日 15:00 前 → 当日
    navDate = dt;
  } else {
    // 15:00 后或非交易日 → 下一个交易日
    navDate = getNextTradingDay(dt);
  }

  return formatDate(navDate);
}

/**
 * 根据下单时间计算份额确认日 (T+1日)
 * 份额确认日必定是 T日 的下一个交易日
 * @param {Date|string} orderTime - 下单时间
 * @returns {string} 确认日期 YYYY-MM-DD
 */
export function calcConfirmDate(orderTime) {
  const navDateStr = calcNavDate(orderTime);
  const navDate = new Date(navDateStr);
  const confirmDate = getNextTradingDay(navDate);
  return formatDate(confirmDate);
}

/**
 * 本地日期字符串 YYYY-MM-DD（不要用 toISOString，那是 UTC，会差一天）
 * @param {Date} [date]
 */
export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 交易是否已确认份额。
 * 只看「确认日是否已到」——不能拿基金的净值日期(navDate)来卡：
 * 净值通常晚上才更新，白天 navDate 还停在前一天，会把当天该确认的份额误判成在途。
 * @param {{status?:string, confirmDate?:string}} tx
 * @param {string} [asOf] 截止日期，默认今天
 */
export function isTxConfirmed(tx, asOf = todayStr()) {
  if (!tx || tx.status !== 'confirmed') return false;
  if (!tx.confirmDate) return true;
  return tx.confirmDate <= asOf;
}

// ===== 份额与金额计算 =====

/**
 * 计算买入确认份额
 * 份额 = 净申购金额 / 确认日净值
 * @param {number} amount - 申购金额
 * @param {number} nav - 确认日净值
 * @returns {{ shares: number, fee: number, netAmount: number }}
 */
export function calcBuyShares(amount, nav, feeRate = BUY_FEE_RATE) {
  const { fee, netAmount } = calcBuyFee(amount, feeRate);
  const shares = parseFloat((netAmount / nav).toFixed(2));
  return { shares, fee, netAmount, feeRate };
}

/**
 * 计算卖出到账金额
 * @param {number} shares - 卖出份额
 * @param {number} nav - 确认日净值
 * @param {number} holdingDays - 平均持有天数
 * @param {Array} [tiers] - 赎回费率阶梯
 * @returns {{ netAmount: number, fee: number, grossAmount: number, feeRate: number }}
 */
export function calcSellAmount(shares, nav, holdingDays, tiers = SELL_FEE_TIERS) {
  return calcSellFee(shares, nav, holdingDays, tiers);
}

// ===== 基金转换 =====

/** 转换零头处理方式 */
export const CONVERT_ROUNDING = {
  /** 份额向下取整，零头留在剩余资金（默认，最贴近真实业务） */
  FLOOR: 'floor',
  /** 份额向上取整，差额从剩余资金补扣（金额补扣） */
  CASH: 'cash',
  /** 份额向上取整，差额从转出基金多扣份额补足（份额补扣） */
  SHARE: 'share',
};

const round2 = (v) => parseFloat(Number(v).toFixed(2));
const round4 = (v) => parseFloat(Number(v).toFixed(4));
const ceil2 = (v) => Math.ceil(Number(v) * 100) / 100;
const floor2 = (v) => Math.floor(Number(v) * 100) / 100;

/**
 * 计算基金转换的费用、份额与零头结算
 *
 * 规则（对齐公募基金转换业务）：
 *   转出金额   = 转出份额 × 转出基金净值
 *   赎回费     = 转出金额 × 赎回费率（按持有天数阶梯）
 *   申购补差   = 仅当转入基金申购费率高于转出基金时收取差额
 *   净转入金额 = 转出金额 − 赎回费 − 申购补差
 *   转入份额   = 净转入金额 ÷ 转入基金净值（保留 2 位小数）
 *
 * 份额只保留 2 位小数，因此必然存在零头，按 rounding 处理：
 *   floor  份额向下取整，差额留作「剩余资金」退回账户
 *   cash   份额向上取整，差额从剩余资金「金额补扣」（余额不足则退回 floor）
 *   share  份额向上取整，差额从转出基金多扣份额「份额补扣」
 *
 * @param {Object} p
 * @param {number} p.shares - 转出份额
 * @param {number} p.fromNav - 转出基金确认净值
 * @param {number} p.toNav - 转入基金确认净值
 * @param {number} p.holdingDays - 加权平均持有天数
 * @param {number} [p.fromBuyFeeRate] - 转出基金申购费率
 * @param {number} [p.toBuyFeeRate] - 转入基金申购费率
 * @param {'floor'|'cash'|'share'} [p.rounding] - 零头处理方式
 * @param {number} [p.cashBalance] - 可用剩余资金余额（金额补扣用）
 */
export function calcConvert({
  shares,
  fromNav,
  toNav,
  holdingDays,
  fromBuyFeeRate = BUY_FEE_RATE,
  toBuyFeeRate = BUY_FEE_RATE,
  sellTiers = SELL_FEE_TIERS,
  rounding = CONVERT_ROUNDING.FLOOR,
  cashBalance = 0,
  // 手动指定申购补差费金额（费用明细里直接改金额时用），传了就覆盖按费率算出的值
  spreadFeeOverride = null,
}) {
  const grossAmount = round2(shares * fromNav);
  const redeemRate = getSellFeeRate(holdingDays, sellTiers);
  const redeemFee = round2(grossAmount * redeemRate);

  const spreadRate = Math.max(0, toBuyFeeRate - fromBuyFeeRate);
  const spreadFee =
    spreadFeeOverride != null && Number.isFinite(Number(spreadFeeOverride))
      ? round2(Math.max(0, Number(spreadFeeOverride)))
      : spreadRate > 0
        ? round2((grossAmount / (1 + spreadRate)) * spreadRate)
        : 0;
  // 手动覆盖时，展示用的补差费率由金额反推：fee = gross / (1 + r) * r  =>  r = fee / (gross - fee)
  const effectiveSpreadRate =
    spreadFeeOverride != null && grossAmount > spreadFee && grossAmount > 0
      ? spreadFee / (grossAmount - spreadFee)
      : spreadRate;

  const totalFee = round2(redeemFee + spreadFee);
  const netAmount = round2(grossAmount - totalFee);

  // 净额按转入净值折算，份额只保留 2 位小数
  const rawShares = toNav > 0 ? netAmount / toNav : 0;
  const floorShares = floor2(rawShares);
  const ceilShares = ceil2(rawShares);
  // 关键：零头必须保留原始精度，否则四舍五入到分之后永远是 0，补扣逻辑会失效
  const remainderRaw = round4(netAmount - floorShares * toNav); // 向下取整后的零头
  const shortfallRaw = round4(ceilShares * toNav - netAmount); // 凑整还差多少
  const shortfall = round2(shortfallRaw);

  let toShares = floorShares;
  let remainderCash = remainderRaw; // 退回账户的剩余资金（原始精度）
  let cashAdjust = 0; // 金额补扣（从余额扣）
  let shareAdjust = 0; // 份额补扣（从转出基金多扣）
  let extraCash = 0; // 份额补扣多扣出来的现金
  let mode = CONVERT_ROUNDING.FLOOR;
  let fallback = false; // 所选方式不可行，已退回 floor

  if (shortfallRaw > 1e-9 && rounding === CONVERT_ROUNDING.CASH) {
    if (cashBalance + 1e-9 >= shortfall) {
      toShares = ceilShares;
      cashAdjust = shortfall;
      remainderCash = 0;
      mode = CONVERT_ROUNDING.CASH;
    } else {
      fallback = true;
    }
  } else if (shortfallRaw > 1e-9 && rounding === CONVERT_ROUNDING.SHARE) {
    // 多扣的份额按转出净值折现金，向上取到 0.01 份，确保够补
    const extra = fromNav > 0 ? ceil2(shortfallRaw / fromNav) : 0;
    if (extra > 0) {
      toShares = ceilShares;
      shareAdjust = extra;
      extraCash = round2(extra * fromNav);
      // 多扣出的一点点零头再退回剩余资金
      remainderCash = round4(extraCash - shortfallRaw);
      mode = CONVERT_ROUNDING.SHARE;
    }
  }

  // 实际投出去的钱与转出方实际扣减的份额
  const investAmount = round2(toShares * toNav);
  const sharesOut = round2(shares + shareAdjust);

  return {
    grossAmount,
    redeemRate,
    redeemFee,
    spreadRate,
    effectiveSpreadRate,
    spreadFee,
    totalFee,
    netAmount,
    rawToShares: round2(rawShares),
    toShares,
    sharesOut,
    investAmount,
    remainderCash,
    cashAdjust,
    shareAdjust,
    extraCash,
    shortfall,
    shortfallRaw,
    remainderRaw,
    mode,
    fallback,
  };
}

/**
 * 把一条交易记录换算成「站在某只基金视角」的标准 buy/sell 记录。
 *
 * 转换流水同时影响两只基金：
 *   - 对转出基金：等价于一笔卖出（实际扣减 sharesOut 份，释放的净值 = netAmount + extraCash）
 *   - 对转入基金：等价于一笔买入（用 investAmount 买入 toShares 份）
 * 这样持仓汇总、可用份额、持有天数都能直接复用既有逻辑。
 *
 * @param {Object} tx - 原始交易记录
 * @param {string} fundCode - 目标基金代码
 * @returns {Object|null} 视角化后的记录，与目标基金无关时返回 null
 */
export function toFundPerspective(tx, fundCode) {
  if (!tx || !fundCode) return null;

  if (tx.type !== 'convert') {
    return tx.fundCode === fundCode ? tx : null;
  }

  // 转出方：视作卖出
  // 份额补扣时实际扣减份额更多，赎回得到的资金也包含多扣出来的那部分
  if (tx.fundCode === fundCode) {
    const releasedAmount =
      tx.netAmount != null ? round2(tx.netAmount + (tx.extraCash || 0)) : tx.netAmount;
    return {
      ...tx,
      type: 'sell',
      shares: tx.sharesOut != null ? tx.sharesOut : tx.shares,
      netAmount: releasedAmount,
      fee: tx.totalFee != null ? tx.totalFee : tx.fee,
    };
  }

  // 转入方：视作买入（用实际投出的金额与份额，避免把费用重复计入成本）
  if (tx.toFundCode === fundCode) {
    return {
      ...tx,
      fundCode,
      type: 'buy',
      amount: tx.investAmount != null ? tx.investAmount : tx.netAmount,
      shares: tx.toShares,
      nav: tx.toNav,
      fee: 0,
    };
  }

  return null;
}

// ===== 持仓汇总计算 =====

/**
 * 从交易记录汇总计算持仓指标
 * @param {Array} transactions - 已确认的交易记录
 * @param {number} currentNav - 最新净值
 * @param {number} yesterdayNav - 昨日净值（用于计算今日收益）
 * @returns {Object} 持仓汇总
 */
export function calcPosition(transactions, currentNav, yesterdayNav = 0) {
  if (!transactions || transactions.length === 0) {
    return {
      totalShares: 0,
      totalInvested: 0,
      costPrice: 0,
      currentValue: 0,
      holdingProfit: 0,
      holdingProfitRate: 0,
      todayProfit: 0,
      totalProfit: 0,
      realizedProfit: 0,
    };
  }

  let totalShares = 0;
  let totalInvested = 0; // 总投入（净申购金额之和）
  let realizedProfit = 0; // 已实现收益

  // 遍历确认的交易记录
  for (const tx of transactions) {
    if (tx.status !== 'confirmed') continue;

    if (tx.type === 'buy') {
      totalShares += tx.shares;
      // 支付宝规则：总投入即为用户支付的钱（含手续费）
      totalInvested += tx.amount;
    } else if (tx.type === 'sell') {
      // 卖出时：按比例减少总投入本金
      const costBasis = totalShares > 0
        ? (totalInvested / totalShares) * tx.shares
        : 0;
      // 卖出得到的钱
      const sellProceeds = tx.netAmount || (tx.shares * tx.nav - tx.fee);
      // 已实现收益 = 卖出得到的钱 - 卖出部分的成本
      realizedProfit += (sellProceeds - costBasis);

      totalShares -= tx.shares;
      if (totalShares > 0) {
        totalInvested = totalInvested - costBasis;
      } else {
        totalInvested = 0;
      }
    }
  }

  // 确保不出现负数份额
  totalShares = Math.max(0, parseFloat(totalShares.toFixed(2)));
  totalInvested = Math.max(0, parseFloat(totalInvested.toFixed(2)));

  const costPrice = totalShares > 0
    ? parseFloat((totalInvested / totalShares).toFixed(4))
    : 0;

  const currentValue = parseFloat((totalShares * currentNav).toFixed(2));
  const holdingProfit = parseFloat((currentValue - totalInvested).toFixed(2));
  const holdingProfitRate = totalInvested > 0
    ? parseFloat(((holdingProfit / totalInvested) * 100).toFixed(2))
    : 0;

  // 今日收益 = 持有份额 × (今日净值 - 昨日净值)
  const todayProfit = yesterdayNav > 0
    ? parseFloat((totalShares * (currentNav - yesterdayNav)).toFixed(2))
    : 0;

  const totalProfit = parseFloat((holdingProfit + realizedProfit).toFixed(2));

  return {
    totalShares,
    totalInvested,
    costPrice,
    currentValue,
    holdingProfit,
    holdingProfitRate,
    todayProfit,
    totalProfit,
    realizedProfit: parseFloat(realizedProfit.toFixed(2)),
  };
}

// ===== 持有天数计算 =====

/**
 * 计算加权平均持有天数（基于所有买入记录）
 * @param {Array} buyTransactions - 买入交易记录
 * @param {Date|string} sellDate - 卖出日期
 * @returns {number} 加权平均持有天数
 */
export function calcAvgHoldingDays(buyTransactions, sellDate = new Date()) {
  const sell = new Date(sellDate);
  if (buyTransactions.length === 0) return 0;

  let totalWeightedDays = 0;
  let totalShares = 0;

  for (const tx of buyTransactions) {
    if (tx.status !== 'confirmed' || tx.type !== 'buy') continue;
    const buyDate = new Date(tx.confirmDate);
    const days = Math.floor((sell - buyDate) / (1000 * 60 * 60 * 24));
    totalWeightedDays += days * tx.shares;
    totalShares += tx.shares;
  }

  return totalShares > 0 ? Math.floor(totalWeightedDays / totalShares) : 0;
}

// ===== 工具函数 =====

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 生成简易 UUID
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

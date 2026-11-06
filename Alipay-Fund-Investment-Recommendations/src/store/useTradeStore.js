/**
 * useTradeStore — 交易记录与定投计划状态管理
 * 管理买入 / 卖出 / 基金转换 记录和定投计划
 * 使用 localStorage 持久化
 */

import { create } from 'zustand';
import {
  calcBuyShares,
  calcSellAmount,
  calcConfirmDate,
  calcPosition,
  calcAvgHoldingDays,
  toFundPerspective,
  generateId,
  formatDate,
  isTxConfirmed,
} from '../utils/tradeEngine';

// ===== 持久化 =====

function loadTrades() {
  try {
    const data = localStorage.getItem('fund-trades');
    if (!data) return { transactions: [], dcaPlans: [], cashBalance: 0 };
    const parsed = JSON.parse(data);
    return {
      transactions: parsed.transactions || [],
      dcaPlans: parsed.dcaPlans || [],
      // 转换零头留下的剩余资金，旧数据没有这个字段时按 0 处理
      cashBalance: Number(parsed.cashBalance) || 0,
    };
  } catch {
    return { transactions: [], dcaPlans: [], cashBalance: 0 };
  }
}

function saveTrades(state) {
  try {
    localStorage.setItem(
      'fund-trades',
      JSON.stringify({
        transactions: state.transactions,
        dcaPlans: state.dcaPlans,
        cashBalance: state.cashBalance,
      })
    );
  } catch (e) {
    console.warn('[useTradeStore] 保存失败:', e);
  }
}

// ===== Store =====

const useTradeStore = create((set, get) => {
  const initial = loadTrades();

  return {
    // ===== State =====
    transactions: initial.transactions,
    dcaPlans: initial.dcaPlans,
    cashBalance: initial.cashBalance,

    // ===== 买入 =====

    /**
     * 执行买入操作
     * @param {Object} params
     * @param {string} params.fundCode - 基金代码
     * @param {string} params.fundName - 基金名称
     * @param {number} params.amount - 买入金额
     * @param {number} params.nav - 确认净值
     * @param {'manual'|'dca'} params.method - 买入方式
     * @param {string} [params.orderTime] - 下单时间（默认当前时间）
     * @param {number} [params.feeRate] - 申购费率（生效费率，缺省用内置默认）
     */
    executeBuy: ({ fundCode, fundName, amount, nav, method = 'manual', orderTime, feeRate }) => {
      const now = orderTime || new Date().toISOString();
      const confirmDate = calcConfirmDate(now);
      const { shares, fee, netAmount } = calcBuyShares(amount, nav, feeRate);

      const tx = {
        id: generateId(),
        fundCode,
        fundName,
        type: 'buy',
        method,
        amount,
        shares,
        nav,
        fee,
        netAmount,
        feeRate: feeRate != null ? feeRate : undefined,
        orderTime: now,
        confirmDate,
        status: 'confirmed', // 简化：直接确认
        createdAt: new Date().toISOString(),
      };

      set((s) => {
        const newState = {
          transactions: [...s.transactions, tx],
          dcaPlans: s.dcaPlans,
        };
        saveTrades(newState);
        return newState;
      });

      console.log(`[Trade] ✅ 买入 ${fundName}(${fundCode}): ¥${amount} → ${shares}份 @${nav} 手续费¥${fee}`);
      return tx;
    },

    // ===== 卖出 =====

    /**
     * 执行卖出操作
     * @param {Object} params
     * @param {string} params.fundCode - 基金代码
     * @param {string} params.fundName - 基金名称
     * @param {number} params.shares - 卖出份额
     * @param {number} params.nav - 确认净值
     * @param {string} [params.orderTime] - 下单时间
     * @param {Array} [params.sellTiers] - 赎回费率阶梯（生效配置，缺省用内置默认）
     */
    executeSell: ({ fundCode, fundName, shares, nav, orderTime, sellTiers }) => {
      const state = get();
      const now = orderTime || new Date().toISOString();
      const confirmDate = calcConfirmDate(now);

      // 获取该基金的买入记录用于计算持有天数
      const buyTxs = state.transactions.filter(
        (tx) => tx.fundCode === fundCode && tx.type === 'buy' && isTxConfirmed(tx)
      );
      const holdingDays = calcAvgHoldingDays(buyTxs, now);
      const { fee, grossAmount, netAmount, feeRate } = calcSellAmount(
        shares,
        nav,
        holdingDays,
        sellTiers
      );

      const tx = {
        id: generateId(),
        fundCode,
        fundName,
        type: 'sell',
        method: 'manual',
        amount: grossAmount,
        shares,
        nav,
        fee,
        netAmount,
        feeRate,
        holdingDays,
        orderTime: now,
        confirmDate,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      };

      set((s) => {
        const newState = {
          transactions: [...s.transactions, tx],
          dcaPlans: s.dcaPlans,
        };
        saveTrades(newState);
        return newState;
      });

      console.log(`[Trade] ✅ 卖出 ${fundName}(${fundCode}): ${shares}份 @${nav} 到账¥${netAmount} 手续费¥${fee}`);
      return tx;
    },

    // ===== 基金转换 =====

    /**
     * 执行基金转换：把转出基金的份额换成转入基金的份额
     * 费用与份额由 calcConvert() 预先算好，这里只负责落库
     *
     * @param {Object} p
     * @param {string} p.fromFundCode
     * @param {string} p.fromFundName
     * @param {string} p.toFundCode
     * @param {string} p.toFundName
     * @param {number} p.shares - 转出份额
     * @param {number} p.fromNav - 转出确认净值
     * @param {number} p.toNav - 转入确认净值
     * @param {number} p.grossAmount - 转出金额
     * @param {number} p.redeemFee - 赎回费
     * @param {number} p.spreadFee - 申购补差
     * @param {number} p.totalFee - 费用合计
     * @param {number} p.netAmount - 净转入金额
     * @param {number} p.toShares - 转入份额
     * @param {number} p.sharesOut - 转出方实际扣减份额（含份额补扣）
     * @param {number} p.investAmount - 实际投出金额（= toShares × toNav）
     * @param {number} p.remainderCash - 本次产生的剩余资金
     * @param {number} p.cashAdjust - 金额补扣（从剩余资金扣）
     * @param {number} p.shareAdjust - 份额补扣（多扣的份额）
     * @param {number} p.extraCash - 份额补扣多扣出的现金
     * @param {'floor'|'cash'|'share'} p.settleMode - 零头处理方式
     * @param {number} p.holdingDays - 加权平均持有天数
     * @param {string} [p.orderTime]
     */
    executeConvert: ({
      fromFundCode,
      fromFundName,
      toFundCode,
      toFundName,
      shares,
      fromNav,
      toNav,
      grossAmount,
      redeemFee,
      spreadFee,
      totalFee,
      netAmount,
      toShares,
      sharesOut,
      investAmount,
      remainderCash = 0,
      cashAdjust = 0,
      shareAdjust = 0,
      extraCash = 0,
      settleMode = 'floor',
      holdingDays,
      orderTime,
    }) => {
      const now = orderTime || new Date().toISOString();
      const confirmDate = calcConfirmDate(now);

      const tx = {
        id: generateId(),
        type: 'convert',
        fundCode: fromFundCode,
        fundName: fromFundName,
        toFundCode,
        toFundName,
        shares,
        nav: fromNav,
        toNav,
        toShares,
        // 补扣后的实际口径
        sharesOut: sharesOut != null ? sharesOut : shares,
        investAmount: investAmount != null ? investAmount : netAmount,
        remainderCash,
        cashAdjust,
        shareAdjust,
        extraCash,
        settleMode,
        amount: grossAmount,
        fee: totalFee,
        redeemFee,
        spreadFee,
        netAmount,
        holdingDays,
        orderTime: now,
        confirmDate,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      };

      set((s) => {
        // 剩余资金净变动：本次退回的零头 − 金额补扣
        const cashDelta = parseFloat(((remainderCash || 0) - (cashAdjust || 0)).toFixed(2));
        const newState = {
          transactions: [...s.transactions, tx],
          dcaPlans: s.dcaPlans,
          cashBalance: Math.max(0, parseFloat(((s.cashBalance || 0) + cashDelta).toFixed(2))),
        };
        saveTrades(newState);
        return newState;
      });

      const adjustText =
        settleMode === 'cash'
          ? `，金额补扣¥${cashAdjust}`
          : settleMode === 'share'
            ? `，份额补扣${shareAdjust}份`
            : remainderCash > 0
              ? `，剩余资金¥${remainderCash}`
              : '';

      console.log(
        `[Trade] ✅ 转换 ${fromFundName}(${fromFundCode}) → ${toFundName}(${toFundCode}): ` +
          `${shares}份 @${fromNav} → ${toShares}份 @${toNav}，费用¥${totalFee}${adjustText}`
      );
      return tx;
    },

    // ===== 查询 =====

    /**
     * 获取某基金相关的所有交易记录（含作为转入方的转换记录）
     */
    getTransactionsForFund: (fundCode) => {
      return get().transactions
        .filter((tx) => tx.fundCode === fundCode || tx.toFundCode === fundCode)
        .sort((a, b) => new Date(b.orderTime) - new Date(a.orderTime));
    },

    /**
     * 获取某基金的持仓汇总
     * @param {string} fundCode
     * @param {number} currentNav - 最新净值
     * @param {number} yesterdayNav - 昨日净值（用于今日收益）
     */
    getPosition: (fundCode, currentNav, yesterdayNav = 0) => {
      const txs = get()
        .transactions.map((tx) => toFundPerspective(tx, fundCode))
        .filter(Boolean)
        .filter((tx) => isTxConfirmed(tx));
      return calcPosition(txs, currentNav, yesterdayNav);
    },

    /**
     * 获取某基金的可用份额
     * @param {string} fundCode
     */
    getAvailableShares: (fundCode) => {
      const txs = get()
        .transactions.map((tx) => toFundPerspective(tx, fundCode))
        .filter(Boolean)
        .filter((tx) => isTxConfirmed(tx));

      let shares = 0;
      for (const tx of txs) {
        if (tx.type === 'buy') shares += tx.shares;
        else if (tx.type === 'sell') shares -= tx.shares;
      }
      return Math.max(0, parseFloat(shares.toFixed(2)));
    },

    // ===== 定投计划 =====

    /**
     * 创建或更新定投计划
     */
    saveDCAPlan: (plan) => {
      set((s) => {
        const existing = s.dcaPlans.findIndex(
          (p) => p.fundCode === plan.fundCode
        );
        let newPlans;
        if (existing >= 0) {
          newPlans = s.dcaPlans.map((p, i) =>
            i === existing ? { ...p, ...plan } : p
          );
        } else {
          newPlans = [...s.dcaPlans, { id: generateId(), ...plan }];
        }
        const newState = { transactions: s.transactions, dcaPlans: newPlans };
        saveTrades(newState);
        return newState;
      });
    },

    /**
     * 获取某基金的定投计划
     */
    getDCAPlan: (fundCode) => {
      return get().dcaPlans.find((p) => p.fundCode === fundCode) || null;
    },

    /**
     * 删除定投计划
     */
    removeDCAPlan: (fundCode) => {
      set((s) => {
        const newState = {
          transactions: s.transactions,
          dcaPlans: s.dcaPlans.filter((p) => p.fundCode !== fundCode),
        };
        saveTrades(newState);
        return newState;
      });
    },

    /**
     * 检查待执行的定投
     * @returns {Array} 需要执行的定投列表
     */
    checkPendingDCA: () => {
      const state = get();
      const today = formatDate(new Date());
      const pending = [];

      for (const plan of state.dcaPlans) {
        if (!plan.isActive) continue;

        // 检查今天是否已经执行过
        const alreadyDone = state.transactions.some(
          (tx) =>
            tx.fundCode === plan.fundCode &&
            tx.method === 'dca' &&
            tx.confirmDate === today
        );

        if (!alreadyDone) {
          // 检查是否该执行（简化：不检查具体日期，仅标记为待定投）
          pending.push(plan);
        }
      }

      return pending;
    },

    /**
     * 删除单条交易记录
     */
    removeTransaction: (txId) => {
      set((s) => {
        const newState = {
          transactions: s.transactions.filter((tx) => tx.id !== txId),
          dcaPlans: s.dcaPlans,
        };
        saveTrades(newState);
        return newState;
      });
    },

    /**
     * 清空某基金的全部交易记录
     */
    clearTransactions: (fundCode) => {
      set((s) => {
        const newState = {
          transactions: s.transactions.filter((tx) => tx.fundCode !== fundCode),
          dcaPlans: s.dcaPlans,
        };
        saveTrades(newState);
        return newState;
      });
    },
  };
});

export default useTradeStore;

/**
 * useFeeStore — 费率配置
 *
 * 项目内置的费率只是默认值（并非实时抓取），实际申购/赎回/转换费率会因
 * 平台折扣、基金公司优惠、持有期限等变化，因此这里支持：
 *   1. 修改全局默认费率（申购费率 + 赎回费阶梯）
 *   2. 针对单只基金覆盖（该基金单独一套费率）
 * 配置持久化在 localStorage，交易与转换都会读取生效费率。
 */

import { create } from 'zustand';
import { BUY_FEE_RATE, SELL_FEE_TIERS } from '../utils/tradeEngine';

const STORAGE_KEY = 'fund-fees';

/** Infinity 无法 JSON 序列化，存成 null，读回来再还原 */
const serializeTiers = (tiers) =>
  tiers.map((t) => ({ ...t, maxDays: t.maxDays === Infinity ? null : t.maxDays }));

const reviveTiers = (tiers) =>
  tiers.map((t) => ({ ...t, maxDays: t.maxDays == null ? Infinity : t.maxDays }));

const defaultState = () => ({
  buyRate: BUY_FEE_RATE,
  sellTiers: SELL_FEE_TIERS,
  fundOverrides: {},
});

function loadFees() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      buyRate: Number.isFinite(parsed.buyRate) ? parsed.buyRate : BUY_FEE_RATE,
      sellTiers:
        Array.isArray(parsed.sellTiers) && parsed.sellTiers.length
          ? reviveTiers(parsed.sellTiers)
          : SELL_FEE_TIERS,
      fundOverrides: parsed.fundOverrides || {},
    };
  } catch {
    return defaultState();
  }
}

function saveFees(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        buyRate: state.buyRate,
        sellTiers: serializeTiers(state.sellTiers),
        fundOverrides: state.fundOverrides,
      })
    );
  } catch (e) {
    console.warn('[useFeeStore] 保存失败:', e);
  }
}

const useFeeStore = create((set, get) => {
  const initial = loadFees();

  /** 统一提交入口：set 之后立即持久化 */
  const commit = (updater) => {
    set((s) => {
      const next = updater(s);
      saveFees(next);
      return next;
    });
  };

  return {
    ...initial,

    /**
     * 取某只基金生效的费率（单基金覆盖优先于全局默认）
     * @param {string} [fundCode]
     * @returns {{ buyRate:number, sellTiers:Array, overridden:boolean }}
     */
    getFeeConfig: (fundCode) => {
      const s = get();
      const override = fundCode ? s.fundOverrides[fundCode] : null;
      return {
        buyRate: override && Number.isFinite(override.buyRate) ? override.buyRate : s.buyRate,
        sellTiers: override && Array.isArray(override.sellTiers) ? override.sellTiers : s.sellTiers,
        overridden: !!override,
      };
    },

    // ===== 全局费率 =====

    setBuyRate: (rate) =>
      commit((s) => ({ ...s, buyRate: Math.max(0, Number(rate) || 0) })),

    setSellTierRate: (index, rate) =>
      commit((s) => ({
        ...s,
        sellTiers: s.sellTiers.map((t, i) =>
          i === index ? { ...t, rate: Math.max(0, Number(rate) || 0) } : t
        ),
      })),

    // ===== 单基金覆盖 =====

    setFundBuyRate: (fundCode, rate) =>
      commit((s) => {
        const prev = s.fundOverrides[fundCode] || {};
        const next = { ...prev };
        if (rate === null || rate === '' || !Number.isFinite(Number(rate))) {
          delete next.buyRate;
        } else {
          next.buyRate = Math.max(0, Number(rate));
        }
        const overrides = { ...s.fundOverrides };
        if (Object.keys(next).length === 0) delete overrides[fundCode];
        else overrides[fundCode] = next;
        return { ...s, fundOverrides: overrides };
      }),

    setFundSellTierRate: (fundCode, index, rate) =>
      commit((s) => {
        const prev = s.fundOverrides[fundCode] || {};
        // 首次覆盖任意一档时，先把当前全局阶梯复制一份，避免出现"只改了一档、其它档丢失"
        const baseTiers =
          Array.isArray(prev.sellTiers) && prev.sellTiers.length
            ? prev.sellTiers
            : s.sellTiers.map((t) => ({ ...t }));

        const tiers = baseTiers.map((t, i) =>
          i === index
            ? {
                ...t,
                rate:
                  rate === null || rate === '' || !Number.isFinite(Number(rate))
                    ? t.rate
                    : Math.max(0, Number(rate)),
              }
            : t
        );

        const overrides = { ...s.fundOverrides, [fundCode]: { ...prev, sellTiers: tiers } };
        return { ...s, fundOverrides: overrides };
      }),

    clearFundOverride: (fundCode) =>
      commit((s) => {
        const overrides = { ...s.fundOverrides };
        delete overrides[fundCode];
        return { ...s, fundOverrides: overrides };
      }),

    resetAll: () => commit(() => defaultState()),
  };
});

export default useFeeStore;

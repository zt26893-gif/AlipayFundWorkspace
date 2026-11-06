/**
 * Zustand 基金池状态管理
 * 管理用户的基金池增删改查、选中状态、持仓成本等
 * 使用 localStorage 持久化
 */

import { create } from 'zustand';

// 从 localStorage 读取持久化数据
function loadFromStorage() {
  try {
    const data = localStorage.getItem('fund-pool');
    return data ? JSON.parse(data) : { funds: [], selectedFundCode: null };
  } catch {
    return { funds: [], selectedFundCode: null };
  }
}

// 保存到 localStorage
function saveToStorage(state) {
  try {
    localStorage.setItem(
      'fund-pool',
      JSON.stringify({
        funds: state.funds,
        selectedFundCode: state.selectedFundCode,
      })
    );
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

const useFundStore = create((set, get) => {
  const initial = loadFromStorage();

  return {
    // ===== State =====
    funds: initial.funds, // [{code, name, type, company, nav, dailyChange, costPrice}]
    selectedFundCode: initial.selectedFundCode,

    // ===== Actions =====

    /**
     * 添加基金到基金池
     * @param {Object} fund - 基金信息对象
     */
    addFund: (fund) => {
      const state = get();
      // 防止重复添加
      if (state.funds.some((f) => f.code === fund.code)) return;

      const newFund = {
        code: fund.code,
        name: fund.name,
        type: fund.type || '',
        company: fund.company || '',
        nav: fund.nav || 0,
        gsz: fund.gsz || 0,
        accNav: fund.accNav || 0,
        dailyChange: fund.dailyChange || 0,
        navDate: fund.navDate || '',
        gzTime: fund.gzTime || '',
      };

      set((s) => {
        const newState = {
          funds: [...s.funds, newFund],
          selectedFundCode: s.selectedFundCode || fund.code,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    /**
     * 从基金池移除基金
     * @param {string} code - 基金代码
     */
    removeFund: (code) => {
      set((s) => {
        const newFunds = s.funds.filter((f) => f.code !== code);
        const newSelected =
          s.selectedFundCode === code
            ? newFunds.length > 0
              ? newFunds[0].code
              : null
            : s.selectedFundCode;
        const newState = { funds: newFunds, selectedFundCode: newSelected };
        saveToStorage(newState);
        return newState;
      });
    },

    /**
     * 更新基金实时数据（净值、涨跌幅）
     * @param {string} code - 基金代码
     * @param {Object} data - 更新的数据
     */
    updateFundData: (code, data) => {
      set((s) => {
        const newState = {
          funds: s.funds.map((f) =>
            f.code === code ? { ...f, ...data } : f
          ),
        };
        saveToStorage({ ...s, ...newState });
        return newState;
      });
    },

    /**
     * 选中基金
     * @param {string} code - 基金代码
     */
    selectFund: (code) => {
      set((s) => {
        const newState = { ...s, selectedFundCode: code };
        saveToStorage(newState);
        return { selectedFundCode: code };
      });
    },

    /**
     * 获取当前选中的基金对象
     */
    getSelectedFund: () => {
      const state = get();
      return state.funds.find((f) => f.code === state.selectedFundCode) || null;
    },
  };
});

export default useFundStore;

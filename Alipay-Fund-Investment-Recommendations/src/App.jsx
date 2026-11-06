/**
 * App.jsx - 主应用组件
 * 组装 Dashboard 布局：Header + Sidebar + Main Content
 * Main Content 包含：基金详情 + 图表 + 持仓面板 + AI 策略
 */

import { useEffect, useMemo, useState } from 'react';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import SettingsModal from './components/settings/SettingsModal';
import FundDetailHeader from './components/detail/FundDetailHeader';
import FundChart from './components/chart/FundChart';
import PortfolioPanel from './components/portfolio/PortfolioPanel';
import StrategyPanel from './components/strategy/StrategyPanel';
import OverviewPanel from './components/overview/OverviewPanel';
import useFundStore from './store/useFundStore';
import useTradeStore from './store/useTradeStore';
import useSettingsStore from './store/useSettingsStore';
import { translate } from './i18n';
import { fetchFundInfo } from './services/fundService';

// 预置默认基金列表（首次使用）
const DEFAULT_FUNDS = ['000001', '161725', '005827'];

export default function App() {
  const { funds, selectedFundCode, addFund, selectFund } = useFundStore();
  const transactions = useTradeStore((s) => s.transactions);
  const language = useSettingsStore((s) => s.language);
  const t = useMemo(() => (key, vars) => translate(language, key, vars), [language]);
  // 视图切换：detail = 单只基金详情，overview = 组合趋势总览
  const [view, setView] = useState('detail');
  const [showSettings, setShowSettings] = useState(false);

  // 左栏点基金 → 直接跳到单只基金详情；总览里的推荐项也走这里
  const openFundDetail = (code) => {
    if (code) selectFund(code);
    setView('detail');
  };

  // 临时：强制清理用户的错误脏数据（5.5246 成本价），避免用户误会算法错误
  useEffect(() => {
    const hasBadData = transactions.some(tx => tx.nav > 5.524 && tx.nav < 5.525 && new Date(tx.orderTime) < new Date('2026-07-01'));
    if (hasBadData) {
      console.warn("Detected corrupted historical transactions, clearing data to force recreation.");
      localStorage.removeItem('fund-trades');
      window.location.reload();
    }
  }, [transactions]);

  // 每次启动时，更新所有已添加基金的实时净值和历史同步日期
  useEffect(() => {
    const refreshFunds = async () => {
      const { updateFundData } = useFundStore.getState();
      
      // 如果没有基金，加载默认基金
      if (funds.length === 0) {
        for (const code of DEFAULT_FUNDS) {
          const fund = await fetchFundInfo(code);
          if (fund) addFund(fund);
        }
      } else {
        // 刷新现有基金
        for (const f of funds) {
          const freshFund = await fetchFundInfo(f.code);
          if (freshFund) updateFundData(f.code, freshFund);
        }
      }
    };
    
    refreshFunds();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedFund = funds.find((f) => f.code === selectedFundCode) || null;

  // 从交易记录计算持仓成本（传给 StrategyPanel 和 FundChart）
  const position = selectedFund
    ? useTradeStore.getState().getPosition(selectedFund.code, selectedFund.nav, 0, selectedFund.navDate)
    : null;
  const costPrice = position?.costPrice || 0;

  return (
    <div className="app-container">
      <Header />
      <div className="app-body">
        <Sidebar onOpenSettings={() => setShowSettings(true)} onFundSelected={() => setView('detail')} />
        <main className="main-content">
          <div className="view-switcher">
            <button
              className={`view-btn ${view === 'detail' ? 'active' : ''}`}
              onClick={() => setView('detail')}
            >
              {t('tabs.single')}
            </button>
            <button
              className={`view-btn ${view === 'overview' ? 'active' : ''}`}
              onClick={() => setView('overview')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 13V9M6 13V5M10 13V7M14 13V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t('tabs.overview')}
            </button>
          </div>

          {view === 'overview' ? (
            <OverviewPanel onOpenFund={openFundDetail} />
          ) : (
            <>
              {/* 上半部分：基金详情 + 图表 */}
              <div className="main-upper">
                <FundDetailHeader fund={selectedFund} />
                <FundChart
                  fundCode={selectedFundCode}
                  costPrice={costPrice}
                  navDate={selectedFund?.navDate}
                />
              </div>

              {/* 下半部分：持仓面板 + AI 策略 */}
              <div className="main-lower">
                <PortfolioPanel fund={selectedFund} />
                <StrategyPanel
                  fund={selectedFund}
                  position={position}
                  transactions={transactions}
                />
              </div>
            </>
          )}
        </main>
      </div>
      {showSettings ? <SettingsModal onClose={() => setShowSettings(false)} /> : null}
    </div>
  );
}

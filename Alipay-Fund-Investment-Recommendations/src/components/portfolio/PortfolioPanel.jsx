/**
 * PortfolioPanel - 持仓概览面板
 * 经过精美重置的 UI 设计，突出资产卡片感，支持隐私模式、P&L 收益块和组件化定投展示。
 */

import { useState, useEffect, useMemo } from 'react';
import useTradeStore from '../../store/useTradeStore';
import TradeModal from './TradeModal';
import ConvertModal from './ConvertModal';
import FeeSettingsModal from './FeeSettingsModal';
import DataModal from './DataModal';
import DCAConfigModal from './DCAConfigModal';
import TransactionHistory from './TransactionHistory';
import { calcAvgHoldingDays, isTxConfirmed } from '../../utils/tradeEngine';
import useSettingsStore from '../../store/useSettingsStore';
import { translate } from '../../i18n';
import './portfolio-extra.css';

/**
 * 待确认交易列表
 * T+1 规则下，今日买入要到下一交易日份额才登记，这段时间既不算持仓也不该"消失"。
 */
function PendingOrders({ txs, fundCode }) {
  if (!txs || txs.length === 0) return null;
  return (
    <div className="pending-orders">
      <div className="pending-head">
        <span className="pending-title">待确认交易</span>
        <span className="pending-count">{txs.length} 笔</span>
      </div>
      <div className="pending-list">
        {txs.map((tx) => {
          const isBuy = tx.type === 'buy';
          const isConvert = tx.type === 'convert';
          // 转换记录挂在转出基金上，转入方需要反向判断
          const isConvertOut = isConvert && tx.fundCode === fundCode;
          const badge = isConvert ? (isConvertOut ? '转出' : '转入') : isBuy ? '买入' : '卖出';

          let amountText;
          let detailText;
          if (isConvert) {
            const outShares = tx.sharesOut != null ? tx.sharesOut : tx.shares;
            amountText = isConvertOut ? `${outShares.toFixed(2)} 份` : `${tx.toShares.toFixed(2)} 份`;
            detailText = isConvertOut
              ? `→ ${tx.toFundName} ${tx.toShares.toFixed(2)} 份`
              : `← ${tx.fundName} ${outShares.toFixed(2)} 份`;
          } else if (isBuy) {
            amountText = `¥${tx.amount.toFixed(2)}`;
            detailText = `${tx.shares.toFixed(2)} 份 @ ¥${tx.nav.toFixed(4)}`;
          } else {
            amountText = `${tx.shares.toFixed(2)} 份`;
            detailText = `¥${tx.netAmount.toFixed(2)} @ ¥${tx.nav.toFixed(4)}`;
          }

          return (
            <div className="pending-item" key={tx.id}>
              <span className={`pending-badge ${isConvert ? 'is-convert' : isBuy ? 'is-buy' : 'is-sell'}`}>
                {badge}
              </span>
              <span className="pending-amount">{amountText}</span>
              <span className="pending-detail">{detailText}</span>
              <span className="pending-date">{tx.confirmDate} 确认</span>
            </div>
          );
        })}
      </div>
      <p className="pending-tip">份额尚未登记，确认日起自动计入持仓与收益计算</p>
    </div>
  );
}

export default function PortfolioPanel({ fund }) {
  const language = useSettingsStore((s) => s.language);
  const t = useMemo(() => (key, vars) => translate(language, key, vars), [language]);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showDCAModal, setShowDCAModal] = useState(false);
  const [tradeTab, setTradeTab] = useState('buy');
  const [yesterdayNav, setYesterdayNav] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('portfolio-privacy') === 'true');

  const { getPosition, getDCAPlan, transactions, cashBalance } = useTradeStore();

  // 获取昨日净值用于今日收益计算
  // 改为通过最新净值和单日涨幅直接反推昨日净值，确保 100% 精准且同步
  useEffect(() => {
    if (fund?.nav && typeof fund.dailyChange === 'number') {
      const yesterday = fund.nav / (1 + fund.dailyChange / 100);
      setYesterdayNav(yesterday);
    }
  }, [fund?.nav, fund?.dailyChange]);

  useEffect(() => {
    localStorage.setItem('portfolio-privacy', privacyMode);
  }, [privacyMode]);

  // 计算平均持有天数
  // 注意：所有 hooks 必须位于提前 return 之前，否则 fund 由 null 变为有值时
  // hook 数量变化会触发 "Rendered more hooks than during the previous render" 并导致整页白屏。
  const fundCode = fund?.code;
  const buyTxs = useMemo(() => {
    if (!fundCode) return [];
    return transactions.filter(
      (tx) => tx.fundCode === fundCode && tx.type === 'buy' && isTxConfirmed(tx)
    );
  }, [transactions, fundCode]);

  const avgHoldingDays = useMemo(() => {
    return calcAvgHoldingDays(buyTxs);
  }, [buyTxs]);

  if (!fund) return null;

  const position = getPosition(fund.code, fund.nav, yesterdayNav);
  const dcaPlan = getDCAPlan(fund.code);
  const hasPosition = position.totalShares > 0;

  // 尚未到确认日（按今天判断）的交易：getPosition 会把它们排除在外，
  // 这里单独列出来，避免用户刚买完却看到"什么都没有"。
  // 注意转换记录只挂在转出基金上，转入方要靠 toFundCode 才能认出来。
  const pendingTxs = transactions.filter((tx) => {
    const relatesToFund =
      tx.fundCode === fund.code || (tx.type === 'convert' && tx.toFundCode === fund.code);
    return (
      relatesToFund &&
      !isTxConfirmed(tx)
    );
  });

  const openBuy = () => {
    setTradeTab('buy');
    setShowTradeModal(true);
  };

  const openSell = () => {
    setTradeTab('sell');
    setShowTradeModal(true);
  };

  // 格式化输出函数，支持隐藏隐私数据
  const formatValue = (val, prefix = '', suffix = '', isPnl = false, digits = 2) => {
    if (privacyMode) return '****';
    const formatted = typeof val === 'number' 
      ? val.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) 
      : val;
    const sign = isPnl && val > 0 ? '+' : '';
    return `${sign}${prefix}${formatted}${suffix}`;
  };

  return (
    <div className="portfolio-panel">
      {/* 面板标题 */}
      <div className="portfolio-header">
        <h3 className="portfolio-title">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="10" width="4" height="8" rx="1.5" fill="var(--text-accent)" opacity="0.6" />
            <rect x="8" y="5" width="4" height="13" rx="1.5" fill="var(--text-accent)" opacity="0.8" />
            <rect x="14" y="2" width="4" height="16" rx="1.5" fill="var(--text-accent)" />
          </svg>
          持仓与交易记录
        </h3>
        <div className="portfolio-actions">
          <button className="portfolio-action-btn btn-buy-small" onClick={openBuy}>
            {t('actions.buy')}
          </button>
          {hasPosition && (
            <button className="portfolio-action-btn btn-sell-small" onClick={openSell}>
              {t('actions.sell')}
            </button>
          )}
          {hasPosition && (
            <button
              className="portfolio-action-btn btn-convert-small"
              onClick={() => setShowConvertModal(true)}
            >
              {t('actions.convert')}
            </button>
          )}
          <button
            className="portfolio-action-btn btn-fee-small"
            onClick={() => setShowFeeModal(true)}
            title="费率设置：可手动校准申购费、赎回费"
          >
            {t('actions.fee')}
          </button>
          <button
            className="portfolio-action-btn btn-fee-small"
            onClick={() => setShowDataModal(true)}
            title="数据备份：导出 / 导入本地数据库"
          >
            {t('actions.data')}
          </button>
        </div>
      </div>

      {hasPosition ? (
        <>
          {/* 1. 资产金卡（Hero Card） */}
          <div className="portfolio-hero-card">
            <div className="hero-card-glow"></div>
            <div className="hero-card-header">
              <div className="hero-card-title-group">
                <span className="hero-card-label">当前持仓市值</span>
                <button 
                  className="privacy-toggle-btn" 
                  onClick={() => setPrivacyMode(!privacyMode)} 
                  title={privacyMode ? "显示金额" : "隐藏金额"}
                >
                  {privacyMode ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <span className="hero-card-brand">ALIPAY SIMULATION</span>
            </div>
            
            <div className="hero-card-balance">
              {formatValue(position.currentValue, '¥')}
            </div>

            <div className="hero-card-grid">
              <div className="hero-grid-item">
                <span className="grid-item-label">持有份额</span>
                <span className="grid-item-value">{formatValue(position.totalShares, '', ' 份')}</span>
              </div>
              <div className="hero-grid-item">
                <span className="grid-item-label">持有成本价</span>
                <span className="grid-item-value">{formatValue(position.costPrice, '¥', '', false, 4)}</span>
              </div>
              <div className="hero-grid-item">
                <span className="grid-item-label">最新净值</span>
                <span className="grid-item-value">{fund.nav.toFixed(4)}</span>
              </div>
            </div>
          </div>

          {/* 2. P&L 核心指标区 (今日/持有/累计) */}
          <div className="portfolio-stats-grid">
            {/* 今日收益 */}
            <div className={`pnl-stat-card ${position.todayProfit >= 0 ? 'rise' : 'fall'}`}>
              <div className="pnl-stat-header">
                <span className="pnl-stat-label">
                  收益 ({fund.navDate ? fund.navDate.substring(5) : '今日'})
                </span>
                <span className="pnl-stat-icon">
                  {position.todayProfit >= 0 ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                      <polyline points="17 18 23 18 23 12" />
                    </svg>
                  )}
                </span>
              </div>
              <span className="pnl-stat-value">
                {formatValue(position.todayProfit, '¥', '', true)}
              </span>
            </div>

            {/* 持有收益 */}
            <div className={`pnl-stat-card ${position.holdingProfit >= 0 ? 'rise' : 'fall'}`}>
              <div className="pnl-stat-header">
                <span className="pnl-stat-label">持有收益</span>
                <span className={`pnl-stat-badge ${position.holdingProfit >= 0 ? 'rise' : 'fall'}`}>
                  {formatValue(position.holdingProfitRate, '', '%', true)}
                </span>
              </div>
              <span className="pnl-stat-value">
                {formatValue(position.holdingProfit, '¥', '', true)}
              </span>
            </div>

            {/* 累计收益 */}
            <div className={`pnl-stat-card ${position.totalProfit >= 0 ? 'rise' : 'fall'}`}>
              <div className="pnl-stat-header">
                <span className="pnl-stat-label">累计收益(含已卖出)</span>
                <span className="pnl-stat-icon">💰</span>
              </div>
              <span className="pnl-stat-value">
                {formatValue(position.totalProfit, '¥', '', true)}
              </span>
            </div>
          </div>

          {/* 3. 详细账务 & 定投计划 */}
          <div className="portfolio-info-section">
            <div className="info-card info-financial">
              <h4 className="info-card-title">资金账务</h4>
              <div className="info-grid">
                <div className="info-row">
                  <span className="info-label">总申购本金</span>
                  <span className="info-value">{formatValue(position.totalInvested, '¥')}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">已实现收益</span>
                  <span className={`info-value ${position.realizedProfit >= 0 ? 'text-rise' : 'text-fall'}`}>
                    {formatValue(position.realizedProfit, '¥', '', true)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">平均持有时间</span>
                  <span className="info-value">{privacyMode ? '****' : `${avgHoldingDays} 天`}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">剩余资金</span>
                  <span className="info-value">{formatValue(cashBalance || 0, '¥')}</span>
                </div>
              </div>
            </div>

            <div className={`info-card dca-info-card ${dcaPlan?.isActive ? 'active' : ''}`} onClick={() => setShowDCAModal(true)}>
              <div className="dca-card-header">
                <h4 className="info-card-title">定投计划</h4>
                <span className={`dca-badge ${dcaPlan?.isActive ? 'active' : ''}`}>
                  {dcaPlan?.isActive ? '定投中' : '未开启'}
                </span>
              </div>
              {dcaPlan?.isActive ? (
                <div className="dca-details">
                  <div className="dca-detail-row">
                    <span className="dca-label">定投金额</span>
                    <span className="dca-value">¥{dcaPlan.amount}</span>
                  </div>
                  <div className="dca-detail-row">
                    <span className="dca-label">定投周期</span>
                    <span className="dca-value">
                      {dcaPlan.frequency === 'daily'
                        ? '每日'
                        : dcaPlan.frequency === 'weekly'
                          ? '每周'
                          : dcaPlan.frequency === 'biweekly'
                            ? '每两周'
                            : '每月'}
                      {dcaPlan.frequency === 'daily'
                        ? ''
                        : dcaPlan.frequency === 'weekly' || dcaPlan.frequency === 'biweekly'
                          ? `（周${['日','一','二','三','四','五','六'][dcaPlan.dayOfWeek]}）`
                          : `（${dcaPlan.dayOfMonth}号）`}
                    </span>
                  </div>
                  <div className="dca-action-tip">
                    点击修改定投设置 <span className="arrow">→</span>
                  </div>
                </div>
              ) : (
                <div className="dca-empty-card">
                  <p className="dca-empty-desc">设置定投计划，分批买入降低持有成本</p>
                  <button className="dca-setup-btn">立即配置</button>
                </div>
              )}
            </div>
          </div>

          {/* 4. 待确认交易（T+1 未登记份额） */}
          <PendingOrders txs={pendingTxs} fundCode={fundCode} />
        </>
      ) : pendingTxs.length > 0 ? (
        /* 无持仓但有在途交易：直接把待确认订单顶上来，避免"买完像没买" */
        <div className="position-empty position-empty-pending">
          <PendingOrders txs={pendingTxs} fundCode={fundCode} />
          <button
            className="trade-submit-btn btn-buy"
            onClick={openBuy}
            style={{ marginTop: '16px', maxWidth: '200px' }}
          >
            再买一笔
          </button>
        </div>
      ) : (
        /* 无持仓状态 */
        <div className="position-empty">
          <div className="empty-glow"></div>
          <div className="empty-icon-wrapper">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <p className="empty-text">暂无持仓记录</p>
          <p className="empty-sub">支付宝交易系统模拟，点击“立即买入”快速建仓</p>
          <button className="trade-submit-btn btn-buy" onClick={openBuy} style={{ marginTop: '16px', maxWidth: '200px' }}>
            立即买入
          </button>
        </div>
      )}

      {/* 交易历史：不再依赖是否有持仓，任何状态下都能展开查看 */}
      <div className="history-foldout-wrapper">
        <button className="toggle-history-btn" onClick={() => setShowHistory(!showHistory)}>
          <span>{showHistory ? '收起' : '展开'} 历史交易明细</span>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showHistory && <TransactionHistory fundCode={fund.code} />}
      </div>

      {/* 弹窗组件 */}
      {showTradeModal && (
        <TradeModal
          fund={fund}
          onClose={() => setShowTradeModal(false)}
          initialTab={tradeTab}
        />
      )}
      {showConvertModal && (
        <ConvertModal
          fund={fund}
          onClose={() => setShowConvertModal(false)}
        />
      )}
      {showFeeModal && (
        <FeeSettingsModal onClose={() => setShowFeeModal(false)} />
      )}
      {showDataModal && (
        <DataModal onClose={() => setShowDataModal(false)} />
      )}
      {showDCAModal && (
        <DCAConfigModal
          fund={fund}
          onClose={() => setShowDCAModal(false)}
        />
      )}
    </div>
  );
}

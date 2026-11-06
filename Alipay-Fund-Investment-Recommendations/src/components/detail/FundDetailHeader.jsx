/**
 * FundDetailHeader - 选中基金的核心数据展示
 * 名称、代码、最新净值、涨跌、持仓成本（从交易记录自动计算）、收益率
 */

import useTradeStore from '../../store/useTradeStore';

export default function FundDetailHeader({ fund }) {
  const getPosition = useTradeStore((s) => s.getPosition);
  // 订阅 transactions 变化以触发重渲染
  const transactions = useTradeStore((s) => s.transactions);

  if (!fund) {
    return (
      <div className="detail-header detail-header-empty">
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" opacity="0.2">
            <rect x="8" y="12" width="48" height="40" rx="8" stroke="currentColor" strokeWidth="2" />
            <path d="M16 36L24 28L32 32L40 20L48 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="empty-title">请从左侧选择一只基金</p>
          <p className="empty-desc">选择后将展示详细行情与 AI 策略分析</p>
        </div>
      </div>
    );
  }

  // 从交易记录获取持仓数据（是否确认由 isTxConfirmed 按「今天」判断，不再看净值日期）
  const position = getPosition(fund.code, fund.nav, 0);
  const costPrice = position.costPrice;
  const profitRate = position.holdingProfitRate;
  const hasPosition = position.totalShares > 0;

  return (
    <div className="detail-header">
      {/* 基金标识 */}
      <div className="detail-header-left">
        <div className="detail-fund-badge">
          <span className="detail-fund-type">{fund.type || '混合型'}</span>
        </div>
        <div>
          <h2 className="detail-fund-name">{fund.name}</h2>
          <span className="detail-fund-code">{fund.code}</span>
        </div>
      </div>

      {/* 核心数据 */}
      <div className="detail-header-metrics">
        {/* 最新净值 */}
        <div className="metric-card">
          <span className="metric-label">最新净值</span>
          <span className={`metric-value ${fund.dailyChange >= 0 ? 'text-rise' : 'text-fall'}`}>
            {fund.nav.toFixed(4)}
          </span>
        </div>

        {/* 今日涨跌 */}
        <div className="metric-card">
          <span className="metric-label">今日涨跌</span>
          <span className={`metric-value metric-change ${fund.dailyChange >= 0 ? 'text-rise' : 'text-fall'}`}>
            {fund.dailyChange >= 0 ? '+' : ''}
            {fund.dailyChange.toFixed(2)}%
            <span className="change-arrow">
              {fund.dailyChange >= 0 ? '▲' : '▼'}
            </span>
          </span>
        </div>

        {/* 持仓成本 - 自动从交易记录计算 */}
        <div className="metric-card">
          <span className="metric-label">持仓成本</span>
          <span className="metric-value text-accent">
            {hasPosition ? costPrice.toFixed(4) : '--'}
          </span>
        </div>

        {/* 收益率 */}
        <div className="metric-card">
          <span className="metric-label">持仓收益率</span>
          {hasPosition ? (
            <span className={`metric-value metric-profit ${profitRate >= 0 ? 'text-rise' : 'text-fall'}`}>
              {profitRate >= 0 ? '+' : ''}
              {profitRate.toFixed(2)}%
            </span>
          ) : (
            <span className="metric-value text-muted">--</span>
          )}
        </div>
      </div>
    </div>
  );
}

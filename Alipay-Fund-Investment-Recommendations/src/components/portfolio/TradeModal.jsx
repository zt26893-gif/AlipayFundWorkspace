/**
 * TradeModal - 买入/卖出交易弹窗
 * 支持买入（手动/定投）和卖出两个 Tab
 * 实时计算手续费、预估份额/到账金额
 */

import { useState, useMemo, useEffect } from 'react';
import useTradeStore from '../../store/useTradeStore';
import useFeeStore from '../../store/useFeeStore';
import {
  calcBuyFee,
  calcAvgHoldingDays,
  getSellFeeRate,
  calcNavDate,
  isTxConfirmed,
} from '../../utils/tradeEngine';
import { fetchFundHistory } from '../../services/fundService';

export default function TradeModal({ fund, onClose, initialTab = 'buy' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [buyAmount, setBuyAmount] = useState('');
  const [sellSharesInput, setSellSharesInput] = useState('');
  const [orderTime, setOrderTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [historyData, setHistoryData] = useState([]);
  
  const { executeBuy, executeSell, getAvailableShares, getTransactionsForFund } = useTradeStore();

  // 生效费率：单基金覆盖优先，其次全局默认（可在费率设置里改）
  const globalBuyRate = useFeeStore((s) => s.buyRate);
  const globalSellTiers = useFeeStore((s) => s.sellTiers);
  const fundOverrides = useFeeStore((s) => s.fundOverrides);
  const feeConfig = useMemo(() => {
    const ov = fundOverrides[fund?.code];
    return {
      buyRate: ov && Number.isFinite(ov.buyRate) ? ov.buyRate : globalBuyRate,
      sellTiers: ov && Array.isArray(ov.sellTiers) ? ov.sellTiers : globalSellTiers,
      overridden: !!ov,
    };
  }, [fundOverrides, fund?.code, globalBuyRate, globalSellTiers]);

  // 获取基金1年内的历史净值数据以支持历史交易补录
  useEffect(() => {
    if (!fund?.code) return;
    fetchFundHistory(fund.code, '1y').then((data) => {
      if (data) setHistoryData(data);
    });
  }, [fund?.code]);

  const availableShares = fund ? getAvailableShares(fund.code) : 0;

  // 解析并确定所选交易时间的实际确认净值 (T日净值)
  const resolvedNav = useMemo(() => {
    if (!fund?.nav) return 0;
    if (!orderTime) return fund.nav;

    const navDateStr = calcNavDate(new Date(orderTime).toISOString());
    const todayStr = new Date().toISOString().split('T')[0];

    // 如果 T 日是今天或未来，直接使用最新的实时净值
    if (navDateStr >= todayStr) {
      return fund.nav;
    }

    if (historyData.length === 0) return fund.nav;

    // 查找精确的交易日历史净值
    const match = historyData.find((item) => item.date === navDateStr);
    if (match) return match.nav;

    // 如果未找到（理论上 calcNavDate 会跳过周末），顺延匹配
    const nextMatch = historyData.find((item) => item.date >= navDateStr);
    if (nextMatch) return nextMatch.nav;

    return fund.nav;
  }, [orderTime, historyData, fund?.nav]);

  // === 买入计算 ===
  const buyPreview = useMemo(() => {
    const amount = parseFloat(buyAmount);
    if (!amount || amount <= 0 || !resolvedNav) return null;
    const { fee, netAmount } = calcBuyFee(amount, feeConfig.buyRate);
    const shares = parseFloat((netAmount / resolvedNav).toFixed(2));
    return { amount, fee, netAmount, shares };
  }, [buyAmount, resolvedNav, feeConfig.buyRate]);

  // === 卖出计算 ===
  const sellPreview = useMemo(() => {
    const shares = parseFloat(sellSharesInput);
    if (!shares || shares <= 0 || shares > availableShares || !resolvedNav || !fund?.code) return null;

    const buyTxs = getTransactionsForFund(fund.code).filter(
      (tx) => tx.type === 'buy' && isTxConfirmed(tx)
    );
    const holdingDays = calcAvgHoldingDays(buyTxs, new Date(orderTime));
    const feeRate = getSellFeeRate(holdingDays, feeConfig.sellTiers);
    const grossAmount = parseFloat((shares * resolvedNav).toFixed(2));
    const fee = parseFloat((grossAmount * feeRate).toFixed(2));
    const netAmount = parseFloat((grossAmount - fee).toFixed(2));

    return { shares, grossAmount, fee, netAmount, feeRate, holdingDays };
  }, [sellSharesInput, availableShares, resolvedNav, fund?.code, getTransactionsForFund, orderTime, feeConfig.sellTiers]);

  // 所有 hooks 必须在提前 return 之前
  if (!fund) return null;

  const handleBuy = () => {
    if (!buyPreview || !resolvedNav) return;
    executeBuy({
      fundCode: fund.code,
      fundName: fund.name,
      amount: buyPreview.amount,
      nav: resolvedNav,
      method: 'manual',
      orderTime: new Date(orderTime).toISOString(),
      feeRate: feeConfig.buyRate,
    });
    setBuyAmount('');
    onClose();
  };

  const handleSell = () => {
    if (!sellPreview || !resolvedNav) return;
    executeSell({
      fundCode: fund.code,
      fundName: fund.name,
      shares: sellPreview.shares,
      nav: resolvedNav,
      orderTime: new Date(orderTime).toISOString(),
      sellTiers: feeConfig.sellTiers,
    });
    setSellSharesInput('');
    onClose();
  };

  const handleSellAll = () => {
    setSellSharesInput(availableShares.toString());
  };

  // 快捷金额按钮
  const quickAmounts = [100, 500, 1000, 5000, 10000];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container trade-modal" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">{fund.name}</span>
            <span className="modal-fund-code">{fund.code}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5L13 13M13 5L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="trade-tabs">
          <button
            className={`trade-tab ${activeTab === 'buy' ? 'active tab-buy' : ''}`}
            onClick={() => setActiveTab('buy')}
          >
            买入
          </button>
          <button
            className={`trade-tab ${activeTab === 'sell' ? 'active tab-sell' : ''}`}
            onClick={() => setActiveTab('sell')}
          >
            卖出
          </button>
        </div>

        {/* 当前净值 / 历史确认日净值 */}
        <div className="trade-nav-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <span className="nav-label">最新净值</span>
            <span className={`nav-value ${fund.dailyChange >= 0 ? 'text-rise' : 'text-fall'}`}>
              {fund.nav.toFixed(4)}
            </span>
            <span className={`nav-change ${fund.dailyChange >= 0 ? 'text-rise' : 'text-fall'}`}>
              {fund.dailyChange >= 0 ? '+' : ''}{fund.dailyChange.toFixed(2)}%
            </span>
          </div>
          {resolvedNav !== fund.nav && (
            <div className="historical-nav-badge" style={{
              fontSize: '0.78rem',
              color: 'var(--text-accent)',
              background: 'var(--color-accent-bg)',
              border: '1px solid rgba(167, 139, 250, 0.2)',
              padding: '4px 10px',
              borderRadius: '6px',
              marginTop: '4px',
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>📅 T日(成本日)净值</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>¥{resolvedNav.toFixed(4)}</strong>
            </div>
          )}
        </div>

        {/* === 买入面板 === */}
        {activeTab === 'buy' && (
          <div className="trade-panel">
            <div className="trade-input-group">
              <label className="trade-label">交易时间</label>
              <div className="trade-input-wrapper">
                <input
                  type="datetime-local"
                  className="trade-input"
                  style={{ paddingLeft: '14px' }}
                  value={orderTime}
                  onChange={(e) => setOrderTime(e.target.value)}
                />
              </div>
            </div>

            <div className="trade-input-group">
              <label className="trade-label">买入金额（元）</label>
              <div className="trade-input-wrapper">
                <span className="trade-currency">¥</span>
                <input
                  type="number"
                  className="trade-input"
                  placeholder="输入买入金额"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  min="10"
                  step="0.01"
                  autoFocus
                />
              </div>
              {/* 金额不足时明确说明按钮为什么不可用 */}
              {buyAmount !== '' && buyPreview && buyPreview.amount < 10 ? (
                <p className="trade-input-hint">单笔买入金额不能低于 ¥10</p>
              ) : null}
            </div>

            {/* 快捷金额 */}
            <div className="quick-amounts">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  className={`quick-amount-btn ${buyAmount === String(amt) ? 'active' : ''}`}
                  onClick={() => setBuyAmount(String(amt))}
                >
                  ¥{amt >= 10000 ? `${amt / 10000}万` : amt}
                </button>
              ))}
            </div>

            {/* 买入预览 */}
            {buyPreview && (
              <div className="trade-preview">
                <div className="preview-row">
                  <span className="preview-label">申购费率</span>
                  <span className="preview-value">
                    {(feeConfig.buyRate * 100).toFixed(2)}%
                    {feeConfig.overridden ? <span className="fee-override-tag">自定义</span> : null}
                  </span>
                </div>
                <div className="preview-row">
                  <span className="preview-label">手续费</span>
                  <span className="preview-value text-warning">¥{buyPreview.fee.toFixed(2)}</span>
                </div>
                <div className="preview-row">
                  <span className="preview-label">净申购金额</span>
                  <span className="preview-value">¥{buyPreview.netAmount.toFixed(2)}</span>
                </div>
                <div className="preview-row preview-row-highlight">
                  <span className="preview-label">预估确认份额</span>
                  <span className="preview-value text-accent">{buyPreview.shares.toFixed(2)} 份</span>
                </div>
              </div>
            )}

            {/* 提示 */}
            <p className="trade-tip">
              💡 交易日 15:00 前提交按当日净值确认，15:00 后按下一交易日净值确认
            </p>

            <button
              className="trade-submit-btn btn-buy"
              disabled={!buyPreview || buyPreview.amount < 10}
              onClick={handleBuy}
            >
              确认买入
            </button>
          </div>
        )}

        {/* === 卖出面板 === */}
        {activeTab === 'sell' && (
          <div className="trade-panel">
            <div className="trade-available">
              <span>可用份额</span>
              <span className="available-shares">{availableShares.toFixed(2)} 份</span>
            </div>

            {availableShares <= 0 ? (
              <div className="trade-empty">
                <span>暂无持仓，请先买入</span>
              </div>
            ) : (
              <>
                <div className="trade-input-group">
                  <label className="trade-label">交易时间</label>
                  <div className="trade-input-wrapper">
                    <input
                      type="datetime-local"
                      className="trade-input"
                      style={{ paddingLeft: '14px' }}
                      value={orderTime}
                      onChange={(e) => setOrderTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="trade-input-group">
                  <label className="trade-label">卖出份额</label>
                  <div className="trade-input-wrapper">
                    <input
                      type="number"
                      className="trade-input"
                      placeholder="输入卖出份额"
                      value={sellSharesInput}
                      onChange={(e) => setSellSharesInput(e.target.value)}
                      max={availableShares}
                      min="0.01"
                      step="0.01"
                      autoFocus
                    />
                    <button className="sell-all-btn" onClick={handleSellAll}>
                      全部卖出
                    </button>
                  </div>
                </div>

                {/* 卖出预览 */}
                {sellPreview && (
                  <div className="trade-preview">
                    <div className="preview-row">
                      <span className="preview-label">持有天数</span>
                      <span className="preview-value">{sellPreview.holdingDays} 天</span>
                    </div>
                    <div className="preview-row">
                      <span className="preview-label">赎回费率</span>
                      <span className="preview-value">
                        {(sellPreview.feeRate * 100).toFixed(2)}%
                        {sellPreview.holdingDays < 7 && (
                          <span className="fee-warning">⚠️ 惩罚费率</span>
                        )}
                      </span>
                    </div>
                    <div className="preview-row">
                      <span className="preview-label">赎回手续费</span>
                      <span className="preview-value text-warning">¥{sellPreview.fee.toFixed(2)}</span>
                    </div>
                    <div className="preview-row preview-row-highlight">
                      <span className="preview-label">预估到账金额</span>
                      <span className="preview-value text-accent">¥{sellPreview.netAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {sellPreview && sellPreview.holdingDays < 7 && (
                  <p className="trade-tip trade-tip-warning">
                    ⚠️ 持有不满 7 天，赎回费率为 1.50%（惩罚性费率），建议持有超过 7 天再卖出
                  </p>
                )}

                <button
                  className="trade-submit-btn btn-sell"
                  disabled={!sellPreview}
                  onClick={handleSell}
                >
                  确认卖出
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * StrategyPanel - AI 策略分析中心
 * 三个独立卡片，各自拥有独立的加载状态：
 *   1. 综合诊断 — 调用 fetchMarketDiagnosis（LLM）
 *   2. 操作建议 — 调用 fetchOperationAdvice（LLM，含持仓+交易记录）
 *   3. 止盈止损提醒 — calcStopAlert（本地计算）
 * LLM 调用采用串行方式（先诊断，再建议）
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchMarketDiagnosis,
  fetchOperationAdvice,
  calcStopAlert,
  fetchMarketOverview,
  isLLMConfigured,
} from '../../services/aiService';
import { fetchFundHistory } from '../../services/fundService';
import AlertBadge from '../ui/AlertBadge';

export default function StrategyPanel({ fund, position, transactions }) {
  // 综合诊断状态
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);

  // 操作建议状态
  const [advice, setAdvice] = useState(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  // 止盈止损（本地即时计算，无需 loading）
  const [alert, setAlert] = useState(null);

  // 是否正在刷新
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fundCode = fund?.code;

  /**
   * 执行完整的 AI 分析流程（串行调用）
   */
  const runAnalysis = useCallback(async () => {
    if (!fund) return;

    setIsRefreshing(true);

    // 预加载公共数据
    const [marketIndices, recentHistory] = await Promise.all([
      fetchMarketOverview(),
      fetchFundHistory(fund.code, '1m').then(h => h || []).catch(() => []),
    ]);

    // 1. 综合诊断（LLM）
    setDiagnosisLoading(true);
    try {
      const diagResult = await fetchMarketDiagnosis(fund, marketIndices, recentHistory);
      setDiagnosis(diagResult);
    } catch (err) {
      console.error('[StrategyPanel] 综合诊断失败:', err);
    }
    setDiagnosisLoading(false);

    // 2. 操作建议（LLM，串行：诊断完成后才开始）
    setAdviceLoading(true);
    try {
      const advResult = await fetchOperationAdvice(
        fund, position, transactions || [], marketIndices, recentHistory
      );
      setAdvice(advResult);
    } catch (err) {
      console.error('[StrategyPanel] 操作建议失败:', err);
    }
    setAdviceLoading(false);

    setIsRefreshing(false);
  }, [fund, position, transactions]);

  // 基金切换时重新分析
  useEffect(() => {
    if (!fundCode) {
      setDiagnosis(null);
      setAdvice(null);
      setAlert(null);
      return;
    }

    runAnalysis();
  }, [fundCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 止盈止损实时计算（position 变化时立刻刷新）
  useEffect(() => {
    if (!fund) {
      setAlert(null);
      return;
    }
    const costPrice = position?.costPrice || 0;
    const profitRate = costPrice > 0
      ? ((fund.nav - costPrice) / costPrice) * 100
      : 0;
    setAlert(calcStopAlert(profitRate, costPrice, fund.nav));
  }, [fund?.nav, position?.costPrice, position?.totalShares]);

  if (!fundCode) return null;

  // 操作建议颜色映射
  const suggestionColors = {
    '加仓买入': 'suggestion-buy',
    '持有等待': 'suggestion-hold',
    '观望等待': 'suggestion-wait',
    '减仓止盈': 'suggestion-sell',
    '减仓止损': 'suggestion-stop',
  };

  // 风险等级颜色映射
  const riskColors = {
    '低': 'risk-low',
    '中': 'risk-medium',
    '高': 'risk-high',
  };

  const llmConfigured = isLLMConfigured();

  return (
    <div className="strategy-panel">
      {/* 面板标题 */}
      <div className="strategy-header">
        <h3 className="strategy-title">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(99,102,241,0.2)" />
          </svg>
          AI 策略分析中心
        </h3>
        <div className="strategy-header-actions">
          <button
            className={`strategy-refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
            onClick={runAnalysis}
            disabled={isRefreshing}
            title="刷新分析"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isRefreshing ? '分析中...' : '刷新分析'}
          </button>
        </div>
      </div>

      <div className="strategy-cards">
        {/* ===== 1. 综合诊断卡片 ===== */}
        <div className="strategy-card card-diagnosis">
          <div className="card-header">
            <span className="card-icon">🔍</span>
            <h4 className="card-title">综合诊断</h4>
            {diagnosis && (
              <span className={`llm-source-badge ${diagnosis.isAI ? 'source-ai' : 'source-local'}`}>
                {diagnosis.isAI ? '🤖 DeepSeek' : '📊 本地分析'}
              </span>
            )}
          </div>
          <div className="card-body">
            {diagnosisLoading ? (
              <div className="card-skeleton">
                <div className="skeleton-line skeleton-w60"></div>
                <div className="skeleton-line skeleton-w100"></div>
                <div className="skeleton-line skeleton-w80"></div>
                <div className="skeleton-line skeleton-w90"></div>
              </div>
            ) : diagnosis ? (
              <>
                <div className="trend-indicator">
                  <span className="trend-icon">{diagnosis.trendIcon}</span>
                  <span className={`trend-label trend-${diagnosis.trendColor}`}>
                    {diagnosis.trend}
                  </span>
                  <div className="confidence-bar">
                    <span className="confidence-label">置信度</span>
                    <div className="confidence-track">
                      <div
                        className="confidence-fill"
                        style={{ width: `${diagnosis.confidence}%` }}
                      ></div>
                    </div>
                    <span className="confidence-value">{diagnosis.confidence}%</span>
                  </div>
                </div>
                <p className="diagnosis-text">{diagnosis.diagnosis}</p>
                {diagnosis.updatedAt && (
                  <span className="card-update-time">更新于 {diagnosis.updatedAt}</span>
                )}
              </>
            ) : (
              <div className="card-empty">暂无诊断数据</div>
            )}
          </div>
        </div>

        {/* ===== 2. 操作建议卡片 ===== */}
        <div className="strategy-card card-suggestion">
          <div className="card-header">
            <span className="card-icon">📋</span>
            <h4 className="card-title">操作建议</h4>
            {advice && (
              <span className={`llm-source-badge ${advice.isAI ? 'source-ai' : 'source-local'}`}>
                {advice.isAI ? '🤖 DeepSeek' : '📊 本地分析'}
              </span>
            )}
          </div>
          <div className="card-body">
            {adviceLoading ? (
              <div className="card-skeleton">
                <div className="skeleton-line skeleton-w40"></div>
                <div className="skeleton-line skeleton-w100"></div>
                <div className="skeleton-line skeleton-w90"></div>
                <div className="skeleton-line skeleton-w70"></div>
              </div>
            ) : advice ? (
              <>
                <div className="suggestion-header-row">
                  <div className={`suggestion-badge ${suggestionColors[advice.suggestion] || 'suggestion-hold'}`}>
                    {advice.suggestion}
                  </div>
                  {advice.riskLevel && (
                    <div className={`risk-badge ${riskColors[advice.riskLevel] || 'risk-medium'}`}>
                      风险: {advice.riskLevel}
                    </div>
                  )}
                </div>
                <p className="suggestion-detail">{advice.suggestionDetail}</p>
                {advice.updatedAt && (
                  <span className="card-update-time">更新于 {advice.updatedAt}</span>
                )}
              </>
            ) : (
              <div className="card-empty">暂无操作建议</div>
            )}
          </div>
        </div>

        {/* ===== 3. 止盈止损提醒卡片 ===== */}
        <div className={`strategy-card card-alert ${alert && alert.level !== 'normal' && alert.level !== 'no-position' ? 'card-alert-active' : ''}`}>
          <div className="card-header">
            <span className="card-icon">🔔</span>
            <h4 className="card-title">止盈止损提醒</h4>
            <span className="llm-source-badge source-local">⚡ 实时计算</span>
          </div>
          <div className="card-body">
            {alert ? (
              <>
                <div className="alert-thresholds">
                  <div className="threshold-item threshold-profit">
                    <span className="threshold-label">止盈线</span>
                    <span className="threshold-value">+{alert.thresholds.takeProfit}%</span>
                  </div>
                  <div className="threshold-divider">
                    <div className="threshold-current">
                      <span>当前</span>
                      <span className={`threshold-current-value ${alert.profitRate >= 0 ? 'text-rise' : 'text-fall'}`}>
                        {alert.profitRate >= 0 ? '+' : ''}{alert.profitRate}%
                      </span>
                    </div>
                  </div>
                  <div className="threshold-item threshold-loss">
                    <span className="threshold-label">止损线</span>
                    <span className="threshold-value">{alert.thresholds.stopLoss}%</span>
                  </div>
                </div>

                {/* 收益进度条可视化 */}
                {alert.level !== 'no-position' && (
                  <div className="alert-progress-bar">
                    <div className="alert-progress-track">
                      <div
                        className={`alert-progress-fill ${alert.profitRate >= 0 ? 'fill-rise' : 'fill-fall'}`}
                        style={{ width: `${alert.progressPercent}%` }}
                      ></div>
                      <div
                        className="alert-progress-marker"
                        style={{ left: `${alert.progressPercent}%` }}
                      ></div>
                    </div>
                    <div className="alert-progress-labels">
                      <span className="text-fall">{alert.thresholds.stopLoss}%</span>
                      <span className="text-muted">0%</span>
                      <span className="text-rise">+{alert.thresholds.takeProfit}%</span>
                    </div>
                  </div>
                )}

                <div className="alert-message-wrapper">
                  <AlertBadge level={alert.level}>
                    {alert.message}
                  </AlertBadge>
                </div>
              </>
            ) : (
              <div className="card-empty">请先选择基金</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * FeeSettingsModal — 费率设置
 *
 * 项目内置费率只是默认值（并非实时抓取），实际申购/赎回/转换费率会因
 * 平台折扣、基金公司优惠、持有期限变化，因此这里允许手动修改：
 *   - 全局默认：申购费率 + 赎回费阶梯
 *   - 单只基金覆盖：该基金单独的申购费率与赎回阶梯
 * 修改即时生效并持久化，买入/卖出/转换都会用生效费率重算。
 */

import { useState } from 'react';
import useFeeStore from '../../store/useFeeStore';
import useFundStore from '../../store/useFundStore';
import ReverseFeeTool from './ReverseFeeTool';
import './portfolio-extra.css';

/** 百分比输入：内部按 % 显示，对外用小数费率 */
function RateInput({ value, onCommit, placeholder = '继承默认', disabled = false }) {
  return (
    <div className="fee-input-wrap">
      <input
        type="number"
        className="fee-input"
        step="0.01"
        min="0"
        defaultValue={value != null ? (value * 100).toFixed(2) : ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') {
            onCommit(null);
            return;
          }
          const num = Number(v);
          if (Number.isFinite(num)) onCommit(num / 100);
        }}
      />
      <span className="fee-input-unit">%</span>
    </div>
  );
}

const TIER_LABELS = ['不满 7 天', '7 天 ~ 1 年', '1 ~ 2 年', '2 年以上'];

export default function FeeSettingsModal({ onClose }) {
  const funds = useFundStore((s) => s.funds);
  const {
    buyRate,
    sellTiers,
    fundOverrides,
    setBuyRate,
    setSellTierRate,
    setFundBuyRate,
    setFundSellTierRate,
    clearFundOverride,
    resetAll,
  } = useFeeStore();

  const [target, setTarget] = useState('');
  const override = target ? fundOverrides[target] : null;
  const hasOverride = !!override;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container trade-modal fee-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">费率设置</span>
            <span className="modal-fund-code">手动校准</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="trade-panel">
          <p className="fee-note">
            内置费率是默认值，不保证与你账户的折扣一致。按实际成交校准后，买入、卖出、转换都会立刻用新费率计算。
          </p>

          {/* 全局默认 */}
          <div className="fee-section">
            <h4 className="fee-section-title">全局默认</h4>
            <div className="fee-row">
              <span className="fee-label">申购费率</span>
              <RateInput value={buyRate} onCommit={(v) => setBuyRate(v ?? 0)} placeholder="0.15" />
            </div>
            {sellTiers.map((tier, i) => (
              <div className="fee-row" key={`${tier.minDays}-${tier.maxDays}`}>
                <span className="fee-label">赎回费 · {TIER_LABELS[i] || `第 ${i + 1} 档`}</span>
                <RateInput value={tier.rate} onCommit={(v) => setSellTierRate(i, v ?? 0)} placeholder="0" />
              </div>
            ))}
          </div>

          {/* 单只基金覆盖 */}
          <div className="fee-section">
            <h4 className="fee-section-title">
              单只基金覆盖
              {hasOverride ? <span className="fee-badge">已覆盖</span> : null}
            </h4>
            <select
              className="convert-select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">选择基金（不选则只改全局）</option>
              {funds.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name}（{f.code}）
                </option>
              ))}
            </select>

            {target ? (
              <>
                <div className="fee-row">
                  <span className="fee-label">申购费率</span>
                  <RateInput
                    key={`${target}-buy`}
                    value={override && Number.isFinite(override.buyRate) ? override.buyRate : null}
                    onCommit={(v) => setFundBuyRate(target, v)}
                  />
                </div>
                {sellTiers.map((tier, i) => {
                  const ovTier =
                    override && Array.isArray(override.sellTiers) ? override.sellTiers[i] : null;
                  return (
                    <div className="fee-row" key={`${target}-tier-${i}`}>
                      <span className="fee-label">赎回费 · {TIER_LABELS[i] || `第 ${i + 1} 档`}</span>
                      <RateInput
                        key={`${target}-${i}`}
                        value={ovTier ? ovTier.rate : null}
                        onCommit={(v) => {
                          if (v === null) return;
                          setFundSellTierRate(target, i, v);
                        }}
                      />
                    </div>
                  );
                })}
                <button
                  className="fee-clear-btn"
                  onClick={() => clearFundOverride(target)}
                  disabled={!hasOverride}
                >
                  清除该基金的覆盖，恢复使用全局费率
                </button>
              </>
            ) : (
              <p className="fee-hint">留空表示该基金沿用全局默认。</p>
            )}
          </div>

          <ReverseFeeTool />

          <div className="fee-actions">
            <button className="fee-reset-btn" onClick={() => { resetAll(); setTarget(''); }}>
              恢复内置默认
            </button>
            <button className="trade-submit-btn btn-buy fee-done-btn" onClick={onClose}>
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

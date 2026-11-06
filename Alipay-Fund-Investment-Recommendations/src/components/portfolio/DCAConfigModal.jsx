/**
 * DCAConfigModal - 定投配置弹窗
 * 设置定投金额、周期、执行日，支持启用/暂停
 */

import { useState, useEffect } from 'react';
import useTradeStore from '../../store/useTradeStore';

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: '每周' },
  { value: 'biweekly', label: '每两周' },
  { value: 'monthly', label: '每月' },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
];

export default function DCAConfigModal({ fund, onClose }) {
  const { getDCAPlan, saveDCAPlan, removeDCAPlan } = useTradeStore();

  const existingPlan = getDCAPlan(fund?.code);

  const [amount, setAmount] = useState(existingPlan?.amount?.toString() || '500');
  const [frequency, setFrequency] = useState(existingPlan?.frequency || 'monthly');
  const [dayOfWeek, setDayOfWeek] = useState(existingPlan?.dayOfWeek || 3);
  const [dayOfMonth, setDayOfMonth] = useState(existingPlan?.dayOfMonth || 15);
  const [isActive, setIsActive] = useState(existingPlan?.isActive ?? true);

  if (!fund) return null;

  const handleSave = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < 10) return;

    saveDCAPlan({
      fundCode: fund.code,
      fundName: fund.name,
      amount: numAmount,
      frequency,
      dayOfWeek,
      dayOfMonth,
      isActive,
      startDate: existingPlan?.startDate || new Date().toISOString(),
    });
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('确定取消该基金的定投计划？')) {
      removeDCAPlan(fund.code);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container dca-modal" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">定投设置</span>
            <span className="modal-fund-code">{fund.name} ({fund.code})</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5L13 13M13 5L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="dca-form">
          {/* 定投金额 */}
          <div className="dca-field">
            <label className="dca-label">每期定投金额</label>
            <div className="trade-input-wrapper">
              <span className="trade-currency">¥</span>
              <input
                type="number"
                className="trade-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="10"
                step="100"
                placeholder="最低 10 元"
              />
            </div>
          </div>

          {/* 定投周期 */}
          <div className="dca-field">
            <label className="dca-label">定投周期</label>
            <div className="dca-frequency-btns">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`dca-freq-btn ${frequency === opt.value ? 'active' : ''}`}
                  onClick={() => setFrequency(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 执行日选择 */}
          <div className="dca-field">
            <label className="dca-label">
              {frequency === 'monthly' ? '每月扣款日' : '每周扣款日'}
            </label>
            {frequency === 'monthly' ? (
              <div className="trade-input-wrapper">
                <input
                  type="number"
                  className="trade-input"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                  min="1"
                  max="28"
                />
                <span className="input-suffix">号</span>
              </div>
            ) : (
              <div className="dca-frequency-btns">
                {WEEKDAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`dca-freq-btn ${dayOfWeek === opt.value ? 'active' : ''}`}
                    onClick={() => setDayOfWeek(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 启用开关 */}
          <div className="dca-field dca-toggle-field">
            <label className="dca-label">启用定投</label>
            <button
              className={`dca-toggle ${isActive ? 'active' : ''}`}
              onClick={() => setIsActive(!isActive)}
            >
              <div className="dca-toggle-thumb" />
            </button>
          </div>

          {/* 定投预估 */}
          <div className="dca-preview">
            <div className="preview-row">
              <span className="preview-label">预估每期手续费</span>
              <span className="preview-value">
                ¥{(parseFloat(amount || 0) / (1 + 0.0015) * 0.0015).toFixed(2)}
              </span>
            </div>
            <div className="preview-row">
              <span className="preview-label">年化投入</span>
              <span className="preview-value text-accent">
                ¥{(parseFloat(amount || 0) * (frequency === 'weekly' ? 52 : frequency === 'biweekly' ? 26 : 12)).toLocaleString()}
              </span>
            </div>
          </div>

          <p className="trade-tip">
            💡 定投日若为非交易日，将顺延至下一个交易日执行。每次打开页面时会自动检测并提醒。
          </p>

          {/* 操作按钮 */}
          <div className="dca-actions">
            <button className="trade-submit-btn btn-buy" onClick={handleSave}>
              {existingPlan ? '更新定投计划' : '创建定投计划'}
            </button>
            {existingPlan && (
              <button className="trade-submit-btn btn-delete" onClick={handleDelete}>
                取消定投
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

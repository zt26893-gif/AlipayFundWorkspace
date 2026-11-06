/**
 * ConvertModal — 基金转换
 *
 * 把当前基金的持有份额转换为基金池里另一只基金的份额。
 * 费用规则见 tradeEngine.calcConvert：转出赎回费 + 申购费补差，
 * 净转入金额按转入基金净值折算份额，同样遵守 T+1 确认。
 */

import { useState, useEffect, useMemo } from 'react';
import useFundStore from '../../store/useFundStore';
import useTradeStore from '../../store/useTradeStore';
import useFeeStore from '../../store/useFeeStore';
import {
  calcConvert,
  calcAvgHoldingDays,
  toFundPerspective,
  calcNavDate,
  calcConfirmDate,
  isTxConfirmed,
  CONVERT_ROUNDING,
} from '../../utils/tradeEngine';
import { fetchFundHistory } from '../../services/fundService';
import './portfolio-extra.css';

const fmtMoney = (v) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 不足 1 分的零头用 4 位小数展示，否则会被四舍五入成 0.00 看不出差异 */
const fmtResidual = (v) => {
  const n = Number(v) || 0;
  if (n > 0 && n < 0.01) return `¥${n.toFixed(4)}`;
  return fmtMoney(n);
};

/**
 * 行内可编辑费率：点一下变成输入框，回车/失焦提交，Esc 取消。
 * 用于费用明细里直接改赎回费率 / 申购费率。
 */
function InlineRate({ value, onCommit, disabled = false, title = '点击修改费率' }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const commit = () => {
    const num = Number(text);
    if (text !== '' && Number.isFinite(num) && num >= 0) {
      onCommit(num / 100);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="inline-rate-input"
        type="number"
        step="0.01"
        min="0"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="inline-rate"
      disabled={disabled}
      title={disabled ? '该档费率不可编辑' : title}
      onClick={() => {
        setText((Number(value) * 100).toFixed(2));
        setEditing(true);
      }}
    >
      <span className="inline-rate-num">{(Number(value) * 100).toFixed(2)}%</span>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * 行内可编辑费用金额：点一下变成输入框，回车/失焦提交，Esc 取消。
 * 用于在费用结果里直接改「赎回费」金额，提交后由调用方反推费率。
 */
function InlineFee({ value, onCommit, disabled = false, title = '点击修改金额', prefix = '−', format = fmtMoney }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const commit = () => {
    const num = Number(text);
    if (text !== '' && Number.isFinite(num) && num >= 0) {
      onCommit(num);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="inline-fee-input"
        type="number"
        step="0.01"
        min="0"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="inline-fee"
      disabled={disabled}
      title={disabled ? '当前持有天数没有命中赎回档位，无法反推费率' : title}
      onClick={() => {
        setText(Number(value).toFixed(2));
        setEditing(true);
      }}
    >
      <span className="inline-fee-num">
        {prefix}
        {format(value)}
      </span>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function ConvertModal({ fund, onClose }) {
  const funds = useFundStore((s) => s.funds);
  const transactions = useTradeStore((s) => s.transactions);
  const cashBalance = useTradeStore((s) => s.cashBalance);
  const executeConvert = useTradeStore((s) => s.executeConvert);

  const [toCode, setToCode] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  // 零头处理：默认留存剩余资金
  const [rounding, setRounding] = useState(CONVERT_ROUNDING.FLOOR);
  // 手动覆盖的申购补差费（null = 按费率算）；改费用合计 / 净转入金额 / 剩余资金都会换算到它
  const [spreadFeeManual, setSpreadFeeManual] = useState(null);
  const [orderTime, setOrderTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  // 历史净值缓存：回填历史交易时间时用当日净值折算，而不是最新净值
  const [fromHistory, setFromHistory] = useState([]);
  const [toHistory, setToHistory] = useState([]);

  // 可转入的基金（排除当前基金）
  const candidates = useMemo(
    () => funds.filter((f) => f.code !== fund?.code),
    [funds, fund?.code]
  );

  // 当前基金的可用份额与加权持有天数（已确认份额按「今天」判断，不看净值日期）
  const { availableShares, holdingDays } = useMemo(() => {
    if (!fund) return { availableShares: 0, holdingDays: 0 };
    const visible = transactions
      .map((tx) => toFundPerspective(tx, fund.code))
      .filter(Boolean)
      .filter((tx) => isTxConfirmed(tx));

    const buyTxs = visible.filter((tx) => tx.type === 'buy');
    const sellTxs = visible.filter((tx) => tx.type === 'sell');

    const bought = buyTxs.reduce((s, tx) => s + tx.shares, 0);
    const sold = sellTxs.reduce((s, tx) => s + tx.shares, 0);

    return {
      availableShares: Math.max(0, parseFloat((bought - sold).toFixed(2))),
      holdingDays: calcAvgHoldingDays(buyTxs, new Date(orderTime)),
    };
  }, [transactions, fund, orderTime]);

  const toFund = candidates.find((f) => f.code === toCode) || null;
  const shares = parseFloat(sharesInput);

  // 拉取两只基金近一年净值，用于回填历史日期时定位当日净值
  useEffect(() => {
    if (!fund?.code) return undefined;
    let alive = true;
    fetchFundHistory(fund.code, '1y').then((data) => {
      if (alive && data) setFromHistory(data);
    });
    return () => {
      alive = false;
    };
  }, [fund?.code]);

  useEffect(() => {
    if (!toCode) {
      setToHistory([]);
      return undefined;
    }
    let alive = true;
    fetchFundHistory(toCode, '1y').then((data) => {
      if (alive && data) setToHistory(data);
    });
    return () => {
      alive = false;
    };
  }, [toCode]);

  // 份额 / 转入基金 / 交易时间一变，之前手动改过的补差费就失效，重置回按费率计算
  useEffect(() => {
    setSpreadFeeManual(null);
  }, [sharesInput, toCode, orderTime]);

  // T 日（成交日）与确认日
  const navDateStr = calcNavDate(new Date(orderTime).toISOString());
  const confirmDateStr = calcConfirmDate(new Date(orderTime).toISOString());
  const todayStr = new Date().toISOString().split('T')[0];

  /**
   * 取 T 日净值：当天/未来用最新净值；历史日期从净值序列里找，找不到就顺延取下一个交易日
   */
  const resolveNav = (history, fallbackNav) => {
    if (!fallbackNav) return 0;
    if (navDateStr >= todayStr || history.length === 0) return fallbackNav;
    const exact = history.find((item) => item.date === navDateStr);
    if (exact) return exact.nav;
    const next = history.find((item) => item.date >= navDateStr);
    return next ? next.nav : fallbackNav;
  };

  const fromNav = resolveNav(fromHistory, fund?.nav);
  const toNav = resolveNav(toHistory, toFund?.nav);
  const usingHistorical = navDateStr < todayStr;

  const baseShares = Math.min(shares || 0, availableShares);

  // 生效费率：转出/转入各自的申购费率 + 转出基金的赎回阶梯（单基金覆盖优先）
  const globalBuyRate = useFeeStore((s) => s.buyRate);
  const globalSellTiers = useFeeStore((s) => s.sellTiers);
  const fundOverrides = useFeeStore((s) => s.fundOverrides);
  const setFundBuyRate = useFeeStore((s) => s.setFundBuyRate);
  const setFundSellTierRate = useFeeStore((s) => s.setFundSellTierRate);

  const fromCfg = useMemo(() => {
    const ov = fundOverrides[fund?.code];
    return {
      buyRate: ov && Number.isFinite(ov.buyRate) ? ov.buyRate : globalBuyRate,
      sellTiers: ov && Array.isArray(ov.sellTiers) ? ov.sellTiers : globalSellTiers,
    };
  }, [fundOverrides, fund?.code, globalBuyRate, globalSellTiers]);
  const toCfg = useMemo(() => {
    const ov = fundOverrides[toCode];
    return {
      buyRate: ov && Number.isFinite(ov.buyRate) ? ov.buyRate : globalBuyRate,
      sellTiers: ov && Array.isArray(ov.sellTiers) ? ov.sellTiers : globalSellTiers,
    };
  }, [fundOverrides, toCode, globalBuyRate, globalSellTiers]);

  // 当前持有天数命中哪一档赎回费，行内改费率时就直接改这一档
  const redeemTierIndex = fromCfg.sellTiers.findIndex(
    (t) => holdingDays >= t.minDays && holdingDays < t.maxDays
  );

  // 三种零头处理方式各自算一遍：既能展示差异，也能判断哪种可行
  const variants = useMemo(() => {
    if (!fund || !toFund || !shares || shares <= 0 || !fromNav || !toNav) return null;
    const args = {
      shares: baseShares,
      fromNav,
      toNav,
      holdingDays,
      fromBuyFeeRate: fromCfg.buyRate,
      toBuyFeeRate: toCfg.buyRate,
      sellTiers: fromCfg.sellTiers,
      spreadFeeOverride: spreadFeeManual,
    };
    return {
      floor: calcConvert({ ...args, rounding: CONVERT_ROUNDING.FLOOR }),
      cash: calcConvert({ ...args, rounding: CONVERT_ROUNDING.CASH, cashBalance }),
      share: calcConvert({ ...args, rounding: CONVERT_ROUNDING.SHARE }),
    };
  }, [
    fund,
    toFund,
    shares,
    baseShares,
    fromNav,
    toNav,
    holdingDays,
    cashBalance,
    fromCfg.buyRate,
    fromCfg.sellTiers,
    toCfg.buyRate,
    spreadFeeManual,
  ]);

  const preview = variants ? variants[rounding] : null;

  // 剩余资金不够补扣 / 补扣份额超过可用份额时，对应方式不可用
  const cashFeasible = !!variants && variants.cash.mode === CONVERT_ROUNDING.CASH;
  const shareFeasible =
    !!variants && baseShares + variants.share.shareAdjust <= availableShares + 1e-6;

  // 所有 hooks 必须在提前 return 之前
  if (!fund) return null;

  const overLimit = shares > availableShares + 1e-6;
  const modeInfeasible =
    (rounding === CONVERT_ROUNDING.CASH && !cashFeasible) ||
    (rounding === CONVERT_ROUNDING.SHARE && !shareFeasible);
  const canSubmit = !!preview && !!toFund && shares > 0 && !overLimit && !modeInfeasible;

  const handleAll = () => setSharesInput(String(availableShares));

  /**
   * 直接改「赎回费」金额 → 反推费率并写进该基金的覆盖配置。
   * 费率一变，费用明细里前面的百分比、净转入金额、转入份额都会同步重算。
   */
  const applyRedeemFee = (amount) => {
    if (!preview || redeemTierIndex < 0 || !(preview.grossAmount > 0)) return;
    const r2 = (v) => parseFloat(Number(v).toFixed(2));
    const target = Math.min(Math.max(0, Number(amount) || 0), preview.grossAmount);
    let rate = target / preview.grossAmount;
    // 金额按分四舍五入，反推后重算可能差 1 分，微调费率保证金额精确对上输入值
    for (let i = 0; i < 200 && r2(preview.grossAmount * rate) !== r2(target); i += 1) {
      rate += r2(preview.grossAmount * rate) < r2(target) ? 1e-8 : -1e-8;
      if (rate < 0) {
        rate = 0;
        break;
      }
    }
    setFundSellTierRate(fund.code, redeemTierIndex, rate);
  };

  /** 手动改「申购补差费」金额（会限制在 0 ~ 转出金额−赎回费 之间） */
  const applySpreadFee = (amount) => {
    if (!preview) return;
    const max = Math.max(0, preview.grossAmount - preview.redeemFee - 0.01);
    setSpreadFeeManual(Math.max(0, Math.min(Number(amount) || 0, max)));
  };

  /** 改「费用合计」：赎回费不动，差额全部落到申购补差费 */
  const applyTotalFee = (amount) => {
    if (!preview) return;
    applySpreadFee(Number(amount) - preview.redeemFee);
  };

  /** 改「净转入金额」：转出金额 − 赎回费 − 净额 = 补差费 */
  const applyNetAmount = (amount) => {
    if (!preview) return;
    applySpreadFee(preview.grossAmount - preview.redeemFee - Number(amount));
  };

  /**
   * 改「剩余资金」：份额只保留 2 位小数，所以退回金额最大只有「1 分份额对应的钱」。
   * 这里固定当前份额档位，把净额调整到 k×净值 + 目标零头，再让补差费吸收差额。
   */
  const applyRemainder = (amount) => {
    if (!preview || !(toNav > 0)) return;
    const maxRemainder = Math.max(0, toNav * 0.01 - 0.0001);
    const target = Math.max(0, Math.min(Number(amount) || 0, maxRemainder));
    const floorShares = Math.floor((preview.netAmount / toNav) * 100) / 100;
    const targetNet = parseFloat((floorShares * toNav + target).toFixed(2));
    applySpreadFee(preview.grossAmount - preview.redeemFee - targetNet);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    executeConvert({
      fromFundCode: fund.code,
      fromFundName: fund.name,
      toFundCode: toFund.code,
      toFundName: toFund.name,
      shares: Math.min(shares, availableShares),
      fromNav,
      toNav,
      grossAmount: preview.grossAmount,
      redeemFee: preview.redeemFee,
      spreadFee: preview.spreadFee,
      totalFee: preview.totalFee,
      netAmount: preview.netAmount,
      toShares: preview.toShares,
      sharesOut: preview.sharesOut,
      investAmount: preview.investAmount,
      remainderCash: preview.remainderCash,
      cashAdjust: preview.cashAdjust,
      shareAdjust: preview.shareAdjust,
      extraCash: preview.extraCash,
      settleMode: preview.mode,
      holdingDays,
      orderTime: new Date(orderTime).toISOString(),
    });
    setSharesInput('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container trade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">基金转换</span>
            <span className="modal-fund-code">{fund.code}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="trade-panel">
          {/* 转出 */}
          <div className="convert-block">
            <div className="convert-block-label">转出</div>
            <div className="convert-fund">
              <span className="convert-fund-name">{fund.name}</span>
              <span className="convert-fund-code">{fund.code}</span>
            </div>
            <div className="convert-fund-meta">
              可用份额 <b>{availableShares.toFixed(2)}</b> 份 · 折算净值{' '}
              <b>{fromNav ? fromNav.toFixed(4) : '--'}</b>
              　申购费率 <b>{(fromCfg.buyRate * 100).toFixed(2)}%</b>
              {usingHistorical && fromNav !== fund.nav ? (
                <span className="convert-nav-tag">历史净值</span>
              ) : null}
            </div>
          </div>

          {/* 转入 */}
          <div className="convert-block">
            <div className="convert-block-label">转入</div>
            {candidates.length === 0 ? (
              <p className="convert-empty">基金池里没有其他基金，请先在左侧搜索并添加。</p>
            ) : (
              <select
                className="convert-select"
                value={toCode}
                onChange={(e) => setToCode(e.target.value)}
              >
                <option value="">请选择转入基金</option>
                {candidates.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name}（{f.code}）最新净值 {f.nav ? f.nav.toFixed(4) : '--'}
                  </option>
                ))}
              </select>
            )}
            {toFund ? (
              <div className="convert-fund-meta">
                折算净值 <b>{toNav ? toNav.toFixed(4) : '--'}</b>
                　申购费率 <b>{(toCfg.buyRate * 100).toFixed(2)}%</b>
                {usingHistorical && toNav !== toFund.nav ? (
                  <span className="convert-nav-tag">历史净值</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 交易时间 */}
          <div className="trade-input-group">
            <label className="trade-label">交易时间</label>
            <div className="trade-input-wrapper">
              <input
                type="datetime-local"
                className="trade-input trade-date-input"
                value={orderTime}
                onChange={(e) => setOrderTime(e.target.value)}
              />
            </div>
            <p className="trade-input-hint convert-date-hint">
              T日 {navDateStr} · 份额 {confirmDateStr} 确认
              {usingHistorical ? '（按当日历史净值折算）' : ''}
            </p>
          </div>

          {/* 份额 */}
          <div className="trade-input-group">
            <label className="trade-label">转换份额（份）</label>
            <div className="trade-input-wrapper">
              <input
                type="number"
                className="trade-input convert-shares-input"
                placeholder="输入转出份额"
                value={sharesInput}
                onChange={(e) => setSharesInput(e.target.value)}
                min="0"
                step="0.01"
                disabled={availableShares <= 0}
              />
              <button className="convert-all-btn" onClick={handleAll} disabled={availableShares <= 0}>
                全部
              </button>
            </div>
            {overLimit ? (
              <p className="trade-input-hint">超出可用份额，最多可转 {availableShares.toFixed(2)} 份</p>
            ) : null}
            {availableShares <= 0 ? (
              <p className="trade-input-hint">当前没有已确认的持仓份额，无法转换</p>
            ) : null}
          </div>

          {/* 零头处理 */}
          <div className="trade-input-group">
            <label className="trade-label">零头处理</label>
            <div className="convert-round-tabs">
              <button
                className={`convert-round-btn ${rounding === CONVERT_ROUNDING.FLOOR ? 'active' : ''}`}
                onClick={() => setRounding(CONVERT_ROUNDING.FLOOR)}
              >
                留存剩余资金
              </button>
              <button
                className={`convert-round-btn ${rounding === CONVERT_ROUNDING.CASH ? 'active' : ''}`}
                onClick={() => setRounding(CONVERT_ROUNDING.CASH)}
                disabled={!cashFeasible}
                title={cashFeasible ? '' : '剩余资金不足以补扣差额'}
              >
                金额补扣
              </button>
              <button
                className={`convert-round-btn ${rounding === CONVERT_ROUNDING.SHARE ? 'active' : ''}`}
                onClick={() => setRounding(CONVERT_ROUNDING.SHARE)}
                disabled={!shareFeasible}
                title={shareFeasible ? '' : '可用份额不足以补扣'}
              >
                份额补扣
              </button>
            </div>
            <p className="trade-input-hint convert-date-hint">
              当前剩余资金 {fmtMoney(cashBalance)} · 份额只保留 2 位小数，零头不足 1 分时入账按 0.00 计
            </p>
          </div>

          {/* 预览 */}
          {preview && toFund ? (
            <div className="trade-preview">
              <div className="preview-row">
                <span className="preview-label">转出金额</span>
                <span className="preview-value">{fmtMoney(preview.grossAmount)}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">
                  赎回费（持有 {holdingDays} 天 ·{' '}
                  <InlineRate
                    value={preview.redeemRate}
                    disabled={redeemTierIndex < 0}
                    onCommit={(v) => setFundSellTierRate(fund.code, redeemTierIndex, v)}
                  />{'）'}
                </span>
                <span className="preview-value">
                  <InlineFee
                    value={preview.redeemFee}
                    disabled={redeemTierIndex < 0 || !(preview.grossAmount > 0)}
                    onCommit={applyRedeemFee}
                  />
                </span>
              </div>
              <div className="preview-row preview-row-spread">
                <span className="preview-label">
                  申购补差费（转出{' '}
                  <InlineRate
                    value={fromCfg.buyRate}
                    onCommit={(v) => {
                      setSpreadFeeManual(null);
                      setFundBuyRate(fund.code, v);
                    }}
                  />{' '}
                  → 转入{' '}
                  <InlineRate
                    value={toCfg.buyRate}
                    onCommit={(v) => {
                      setSpreadFeeManual(null);
                      setFundBuyRate(toFund.code, v);
                    }}
                  />
                  ）
                  <span className="convert-spread-meta">
                    补差率 <b className="convert-spread-rate">{(preview.effectiveSpreadRate * 100).toFixed(2)}%</b>
                    {spreadFeeManual != null ? (
                      <button
                        type="button"
                        className="convert-reset-link"
                        onClick={() => setSpreadFeeManual(null)}
                        title="清除手动补差费，恢复按费率计算"
                      >
                        恢复按费率
                      </button>
                    ) : null}
                  </span>
                </span>
                <span className="preview-value">
                  <InlineFee
                    value={preview.spreadFee}
                    disabled={!(preview.grossAmount > preview.redeemFee)}
                    onCommit={applySpreadFee}
                  />
                </span>
              </div>
              <div className="preview-row">
                <span className="preview-label">费用合计</span>
                <span className="preview-value">
                  <InlineFee value={preview.totalFee} onCommit={applyTotalFee} />
                </span>
              </div>
              <div className="preview-row">
                <span className="preview-label">净转入金额</span>
                <span className="preview-value">
                  <InlineFee value={preview.netAmount} onCommit={applyNetAmount} prefix="" />
                </span>
              </div>
              {preview.shareAdjust > 0 ? (
                <div className="preview-row">
                  <span className="preview-label">份额补扣</span>
                  <span className="preview-value text-warning">
                    −{preview.shareAdjust.toFixed(2)} 份（{fmtMoney(preview.extraCash)}）
                  </span>
                </div>
              ) : null}
              {preview.cashAdjust > 0 || (preview.mode === CONVERT_ROUNDING.CASH && preview.shortfallRaw > 0) ? (
                <div className="preview-row">
                  <span className="preview-label">金额补扣</span>
                  <span className="preview-value text-warning">−{fmtResidual(preview.shortfallRaw)}</span>
                </div>
              ) : null}
              <div className="preview-row preview-row-highlight">
                <span className="preview-label">预估转入份额</span>
                <span className="preview-value text-accent">{preview.toShares.toFixed(2)} 份</span>
              </div>
              {rounding === CONVERT_ROUNDING.FLOOR || preview.remainderCash > 0 ? (
                <div className="preview-row">
                  <span className="preview-label">剩余资金（退回账户）</span>
                  <span className="preview-value">
                    <InlineFee
                      value={preview.remainderCash}
                      onCommit={applyRemainder}
                      prefix="+"
                      format={fmtResidual}
                      disabled={rounding !== CONVERT_ROUNDING.FLOOR}
                      title={`修改剩余资金会调整净转入金额；份额保留 2 位小数，最多约 ¥${(toNav * 0.01).toFixed(3)}`}
                    />
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {modeInfeasible ? (
            <p className="trade-input-hint">
              {rounding === CONVERT_ROUNDING.CASH
                ? '剩余资金不足以补扣差额，请先留存一些剩余资金或改用其它方式'
                : '可用份额不足以完成份额补扣，请减少转出份额'}
            </p>
          ) : null}

          <p className="trade-input-hint convert-date-hint">
            费用明细里的金额都能直接点开修改：赎回费改金额会保存为该基金的覆盖费率；补差费、费用合计、净转入金额、剩余资金只影响本次转换。
          </p>

          <p className="trade-tip">
            💡 按 T 日净值折算，份额 {confirmDateStr} 确认。确认前原基金份额仍计入持仓。
          </p>

          <button className="trade-submit-btn btn-buy" disabled={!canSubmit} onClick={handleSubmit}>
            确认转换
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ReverseFeeTool — 按实际成交反算费率
 *
 * 场景：平台折扣、基金公司优惠、持有期限都会让实际费率偏离配置值。
 * 这里用一次真实成交的结果反推出当次费率，直接写进覆盖配置。
 *
 * 口径：
 *   买入：外扣法，实际份额 × 确认净值 = 净申购金额，申购费率 = 金额 ÷ 净额 − 1
 *   卖出：赎回费率 = (份额 × 净值 − 实际到账) ÷ (份额 × 净值)
 *   转换：综合费率 = (转出金额 − 实际转入金额 − 剩余资金) ÷ 转出金额，
 *         其中申购补差按当前配置计算，余下即赎回费率
 */

import { useState, useMemo } from 'react';
import useFundStore from '../../store/useFundStore';
import useFeeStore from '../../store/useFeeStore';
import './portfolio-extra.css';

const TIER_LABELS = ['不满 7 天', '7 天 ~ 1 年', '1 ~ 2 年', '2 年以上'];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtPct = (v) => `${(v * 100).toFixed(4)}%`;

/** 一行「标签 + 输入」 */
function Field({ label, value, onChange, placeholder, suffix }) {
  return (
    <label className="rev-field">
      <span className="rev-label">{label}</span>
      <span className="rev-input-wrap">
        <input
          type="number"
          className="rev-input"
          value={value}
          placeholder={placeholder}
          step="0.0001"
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix ? <span className="rev-suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

export default function ReverseFeeTool() {
  const funds = useFundStore((s) => s.funds);
  const buyRate = useFeeStore((s) => s.buyRate);
  const sellTiers = useFeeStore((s) => s.sellTiers);
  const fundOverrides = useFeeStore((s) => s.fundOverrides);
  const setFundBuyRate = useFeeStore((s) => s.setFundBuyRate);
  const setFundSellTierRate = useFeeStore((s) => s.setFundSellTierRate);

  const [mode, setMode] = useState('convert');
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [tierIndex, setTierIndex] = useState(1);

  // 输入项
  const [buyAmount, setBuyAmount] = useState('');
  const [buyNav, setBuyNav] = useState('');
  const [buyShares, setBuyShares] = useState('');

  const [sellShares, setSellShares] = useState('');
  const [sellNav, setSellNav] = useState('');
  const [sellNet, setSellNet] = useState('');

  const [convShares, setConvShares] = useState('');
  const [convFromNav, setConvFromNav] = useState('');
  const [convToShares, setConvToShares] = useState('');
  const [convToNav, setConvToNav] = useState('');
  const [convRemainder, setConvRemainder] = useState('');

  const [applied, setApplied] = useState('');

  // 反算结果
  const result = useMemo(() => {
    if (mode === 'buy') {
      const net = num(buyShares) * num(buyNav);
      const amount = num(buyAmount);
      if (!(net > 0) || !(amount > 0)) return null;
      const rate = amount / net - 1;
      if (rate < -0.5 || rate > 0.5) return { invalid: '金额与份额不匹配，请核对输入' };
      return { rate, fee: amount - net, kind: 'buy' };
    }

    if (mode === 'sell') {
      const gross = num(sellShares) * num(sellNav);
      const net = num(sellNet);
      if (!(gross > 0) || !(net >= 0)) return null;
      const rate = (gross - net) / gross;
      if (rate < -0.5 || rate > 0.5) return { invalid: '到账金额与份额不匹配，请核对输入' };
      return { rate, fee: gross - net, kind: 'sell', gross };
    }

    // 转换
    const gross = num(convShares) * num(convFromNav);
    const invested = num(convToShares) * num(convToNav);
    const remainder = num(convRemainder);
    if (!(gross > 0) || !(invested > 0)) return null;

    const totalFee = gross - invested - remainder;
    if (totalFee < -0.5 || totalFee > gross * 0.5) {
      return { invalid: '转出金额与转入金额差异过大，请核对输入' };
    }
    const totalRate = totalFee / gross;

    // 补差按两只基金当前生效的申购费率计算（覆盖优先于全局）
    const fromOv = fromCode ? fundOverrides[fromCode] : null;
    const toOv = toCode ? fundOverrides[toCode] : null;
    const fromBuy = fromOv && Number.isFinite(fromOv.buyRate) ? fromOv.buyRate : buyRate;
    const toBuy = toOv && Number.isFinite(toOv.buyRate) ? toOv.buyRate : buyRate;
    const spreadRate = Math.max(0, toBuy - fromBuy);
    const redeemRate = Math.max(0, totalRate - spreadRate);

    return { totalRate, spreadRate, redeemRate, kind: 'convert', gross, totalFee };
  }, [
    mode,
    buyAmount,
    buyNav,
    buyShares,
    sellShares,
    sellNav,
    sellNet,
    convShares,
    convFromNav,
    convToShares,
    convToNav,
    convRemainder,
    fromCode,
    toCode,
    fundOverrides,
    buyRate,
  ]);

  const canApply =
    result && !result.invalid &&
    ((mode === 'buy' && !!fromCode) ||
      ((mode === 'sell' || mode === 'convert') && !!fromCode));

  const handleApply = () => {
    if (!canApply) return;
    // 保留 6 位小数（0.0001% 精度），避免把浮点尾巴写进配置
    const round6 = (v) => Number(v.toFixed(6));
    if (mode === 'buy') {
      setFundBuyRate(fromCode, round6(result.rate));
      setApplied(`已把申购费率 ${fmtPct(result.rate)} 写入 ${fromCode}`);
    } else {
      const rate = round6(mode === 'sell' ? result.rate : result.redeemRate);
      setFundSellTierRate(fromCode, tierIndex, rate);
      setApplied(`已把「${TIER_LABELS[tierIndex]}」档赎回费率 ${fmtPct(rate)} 写入 ${fromCode}`);
    }
  };

  return (
    <div className="fee-section rev-section">
      <h4 className="fee-section-title">
        按实际成交反算费率
        <span className="fee-badge">一次校准</span>
      </h4>
      <p className="fee-hint">
        填一条真实成交记录，自动倒推出当次费率，可直接写入覆盖配置。
      </p>

      <div className="convert-round-tabs">
        {[
          { key: 'convert', label: '转换' },
          { key: 'buy', label: '买入' },
          { key: 'sell', label: '卖出' },
        ].map((m) => (
          <button
            key={m.key}
            className={`convert-round-btn ${mode === m.key ? 'active' : ''}`}
            onClick={() => {
              setMode(m.key);
              setApplied('');
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 目标基金 */}
      <div className="rev-row-2">
        <label className="rev-field">
          <span className="rev-label">{mode === 'convert' ? '转出基金' : '基金'}</span>
          <select className="convert-select" value={fromCode} onChange={(e) => setFromCode(e.target.value)}>
            <option value="">请选择</option>
            {funds.map((f) => (
              <option key={f.code} value={f.code}>
                {f.name}（{f.code}）
              </option>
            ))}
          </select>
        </label>
        {mode === 'convert' ? (
          <label className="rev-field">
            <span className="rev-label">转入基金</span>
            <select className="convert-select" value={toCode} onChange={(e) => setToCode(e.target.value)}>
              <option value="">请选择</option>
              {funds
                .filter((f) => f.code !== fromCode)
                .map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name}（{f.code}）
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* 输入项 */}
      {mode === 'buy' ? (
        <>
          <Field label="买入金额" value={buyAmount} onChange={setBuyAmount} suffix="元" />
          <Field label="确认净值" value={buyNav} onChange={setBuyNav} suffix="元" />
          <Field label="实际确认份额" value={buyShares} onChange={setBuyShares} suffix="份" />
        </>
      ) : null}

      {mode === 'sell' ? (
        <>
          <Field label="卖出份额" value={sellShares} onChange={setSellShares} suffix="份" />
          <Field label="确认净值" value={sellNav} onChange={setSellNav} suffix="元" />
          <Field label="实际到账金额" value={sellNet} onChange={setSellNet} suffix="元" />
        </>
      ) : null}

      {mode === 'convert' ? (
        <>
          <div className="rev-row-2">
            <Field label="转出份额" value={convShares} onChange={setConvShares} suffix="份" />
            <Field label="转出净值" value={convFromNav} onChange={setConvFromNav} suffix="元" />
          </div>
          <div className="rev-row-2">
            <Field label="转入份额" value={convToShares} onChange={setConvToShares} suffix="份" />
            <Field label="转入净值" value={convToNav} onChange={setConvToNav} suffix="元" />
          </div>
          <Field
            label="剩余资金（没有就留空）"
            value={convRemainder}
            onChange={setConvRemainder}
            suffix="元"
          />
        </>
      ) : null}

      {/* 写入哪一档赎回费 */}
      {mode !== 'buy' ? (
        <label className="rev-field">
          <span className="rev-label">写入赎回费档位</span>
          <select
            className="convert-select"
            value={tierIndex}
            onChange={(e) => setTierIndex(Number(e.target.value))}
          >
            {sellTiers.map((t, i) => (
              <option key={`${t.minDays}-${i}`} value={i}>
                {TIER_LABELS[i] || `第 ${i + 1} 档`}（当前 ${(t.rate * 100).toFixed(2)}%）
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* 结果 */}
      {result?.invalid ? (
        <p className="trade-input-hint">{result.invalid}</p>
      ) : result ? (
        <div className="rev-result">
          {result.kind === 'convert' ? (
            <>
              <div className="rev-result-row">
                <span>综合费率（含补差）</span>
                <b>{fmtPct(result.totalRate)}</b>
              </div>
              <div className="rev-result-row">
                <span>其中申购补差（当前配置）</span>
                <b>{fmtPct(result.spreadRate)}</b>
              </div>
              <div className="rev-result-row rev-result-main">
                <span>反算赎回费率</span>
                <b>{fmtPct(result.redeemRate)}</b>
              </div>
              <div className="rev-result-row">
                <span>反算费用合计</span>
                <b>¥{result.totalFee.toFixed(2)}</b>
              </div>
            </>
          ) : (
            <div className="rev-result-row rev-result-main">
              <span>{result.kind === 'buy' ? '反算申购费率' : '反算赎回费率'}</span>
              <b>{fmtPct(result.rate)}</b>
            </div>
          )}
          <p className="rev-tip">
            {mode === 'convert'
              ? '补差按转出/转入基金当前配置的申购费率计算，用综合费率减掉补差即为赎回费率。'
              : '费率按未取整的原始金额反推，可能与页面显示的 2 位小数略有出入。'}
          </p>
        </div>
      ) : (
        <p className="fee-hint">填完上面的数字后这里会显示反算结果。</p>
      )}

      <button className="rev-apply-btn" disabled={!canApply} onClick={handleApply}>
        写入覆盖配置
      </button>
      {applied ? <p className="rev-applied">✅ {applied}</p> : null}
    </div>
  );
}

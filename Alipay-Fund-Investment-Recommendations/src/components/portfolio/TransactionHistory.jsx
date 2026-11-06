/**
 * TransactionHistory - 交易历史时间线
 * 展示所有买入/卖出/转换记录；支持编辑（带审计）与删除（带审计）
 */

import { useState } from 'react';
import useTradeStore from '../../store/useTradeStore';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EditTransactionModal({ tx, onClose }) {
  const updateTransaction = useTradeStore((s) => s.updateTransaction);
  const [form, setForm] = useState(() => ({
    orderTime: toLocalInput(tx.orderTime),
    confirmDate: tx.confirmDate || '',
    amount: tx.amount ?? '',
    shares: tx.shares ?? '',
    nav: tx.nav ?? '',
    fee: tx.fee ?? '',
    toNav: tx.toNav ?? '',
    toShares: tx.toShares ?? '',
  }));

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = () => {
    const num = (v) => (v === '' || v == null ? undefined : Number(v));
    const patch = {};

    // 只提交真正改动过的字段，避免把秒级截断也记进审计
    const nextOrder = form.orderTime ? new Date(form.orderTime).toISOString() : tx.orderTime;
    const sameMinute =
      Math.floor(new Date(nextOrder).getTime() / 60000) === Math.floor(new Date(tx.orderTime).getTime() / 60000);
    if (!sameMinute) patch.orderTime = nextOrder;
    if ((form.confirmDate || '') !== (tx.confirmDate || '')) {
      patch.confirmDate = form.confirmDate || '';
    }

    const fields =
      tx.type === 'buy'
        ? ['amount', 'shares', 'nav', 'fee']
        : tx.type === 'sell'
          ? ['shares', 'nav', 'fee']
          : ['shares', 'nav', 'toNav', 'toShares', 'fee'];

    for (const key of fields) {
      const value = num(form[key]);
      if (value !== undefined && value !== tx[key]) patch[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    updateTransaction(tx.id, patch);
    onClose();
  };

  const isConvert = tx.type === 'convert';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container trade-modal tx-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">编辑交易</span>
            <span className="modal-fund-code">
              {tx.fundName} · {tx.fundCode} · {tx.type === 'buy' ? '买入' : tx.type === 'sell' ? '卖出' : '转换'}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5L13 13M13 5L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="trade-panel tx-edit-body">
          <label className="tx-edit-field">
            <span>交易时间</span>
            <input type="datetime-local" className="trade-input" value={form.orderTime} onChange={set('orderTime')} />
          </label>
          <label className="tx-edit-field">
            <span>确认日期</span>
            <input type="date" className="trade-input" value={form.confirmDate} onChange={set('confirmDate')} />
          </label>

          {tx.type === 'buy' ? (
            <label className="tx-edit-field">
              <span>买入金额（元）</span>
              <input type="number" step="0.01" className="trade-input" value={form.amount} onChange={set('amount')} />
            </label>
          ) : null}

          {!isConvert ? (
            <>
              <label className="tx-edit-field">
                <span>份额</span>
                <input type="number" step="0.01" className="trade-input" value={form.shares} onChange={set('shares')} />
              </label>
              <label className="tx-edit-field">
                <span>净值</span>
                <input type="number" step="0.0001" className="trade-input" value={form.nav} onChange={set('nav')} />
              </label>
            </>
          ) : (
            <>
              <label className="tx-edit-field">
                <span>转出份额</span>
                <input type="number" step="0.01" className="trade-input" value={form.shares} onChange={set('shares')} />
              </label>
              <label className="tx-edit-field">
                <span>转出净值</span>
                <input type="number" step="0.0001" className="trade-input" value={form.nav} onChange={set('nav')} />
              </label>
              <label className="tx-edit-field">
                <span>转入净值</span>
                <input type="number" step="0.0001" className="trade-input" value={form.toNav} onChange={set('toNav')} />
              </label>
              <label className="tx-edit-field">
                <span>转入份额</span>
                <input type="number" step="0.01" className="trade-input" value={form.toShares} onChange={set('toShares')} />
              </label>
            </>
          )}

          <label className="tx-edit-field">
            <span>手续费（元）</span>
            <input type="number" step="0.01" className="trade-input" value={form.fee} onChange={set('fee')} />
          </label>

          <p className="trade-input-hint">保存后会写入修改记录，可在「修改记录」里查看前后差异。</p>
          <button className="trade-submit-btn btn-buy" onClick={handleSave}>
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditModal({ audit, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container trade-modal tx-audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">修改记录</span>
            <span className="modal-fund-code">最近 {audit.length} 条</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5L13 13M13 5L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="tx-audit-list">
          {audit.length === 0 ? (
            <p className="trade-input-hint">还没有修改记录</p>
          ) : (
            [...audit]
              .reverse()
              .slice(0, 80)
              .map((entry) => (
                <div className="tx-audit-item" key={entry.id}>
                  <div className="tx-audit-head">
                    <span className={`tx-audit-action ${entry.action === 'delete' ? 'is-delete' : ''}`}>
                      {entry.action === 'delete' ? '删除' : '修改'}
                    </span>
                    <span className="tx-audit-name">
                      {entry.fundName} {entry.fundCode}
                    </span>
                    <span className="tx-audit-time">{fmtTime(entry.at)}</span>
                  </div>
                  {entry.action === 'delete' ? (
                    <p className="tx-audit-detail">
                      删除{entry.type === 'buy' ? '买入' : entry.type === 'sell' ? '卖出' : '转换'}记录
                      {entry.snapshot?.amount != null ? `（¥${Number(entry.snapshot.amount).toFixed(2)}）` : ''}
                    </p>
                  ) : (
                    <p className="tx-audit-detail">
                      {Object.entries(entry.changes || {}).map(([key, val]) => (
                        <span key={key} className="tx-audit-change">
                          {key}: {String(val.from)} → {String(val.to)}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function TransactionHistory({ fundCode }) {
  const { getTransactionsForFund, removeTransaction } = useTradeStore();
  const audit = useTradeStore((s) => s.audit) || [];
  const transactions = getTransactionsForFund(fundCode);
  const [editingTx, setEditingTx] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  if (!fundCode || transactions.length === 0) {
    return (
      <div className="tx-history">
        <div className="tx-history-empty">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.25">
            <rect x="5" y="8" width="30" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16H28M12 22H22M12 28H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>暂无交易记录</span>
        </div>
      </div>
    );
  }

  const handleDelete = (e, txId) => {
    e.stopPropagation();
    if (window.confirm('确定删除这条交易记录？删除后将影响持仓计算，且会写入修改记录。')) {
      removeTransaction(txId);
    }
  };

  return (
    <div className="tx-history">
      <div className="tx-history-toolbar">
        <span className="tx-history-count">{transactions.length} 笔记录</span>
        <button className="tx-audit-btn" onClick={() => setShowAudit(true)}>
          修改记录{audit.length ? `（${audit.length}）` : ''}
        </button>
      </div>

      <div className="tx-history-list">
        {transactions.map((tx) => {
          const isConvert = tx.type === 'convert';
          const isConvertOut = isConvert && tx.fundCode === fundCode;
          const isBuy = tx.type === 'buy';
          const dateStr = fmtTime(tx.orderTime);

          const badgeText = isConvert ? (isConvertOut ? '转出' : '转入') : isBuy ? '买入' : '卖出';
          const badgeClass = isConvert ? 'badge-convert' : isBuy ? 'badge-buy' : 'badge-sell';
          const mainText = isConvert
            ? isConvertOut
              ? `¥${tx.amount.toFixed(2)}`
              : `${tx.toShares.toFixed(2)} 份`
            : isBuy
              ? `¥${tx.amount.toFixed(2)}`
              : `${tx.shares.toFixed(2)} 份`;

          return (
            <div key={tx.id} className={`tx-item ${isConvert ? 'tx-convert' : isBuy ? 'tx-buy' : 'tx-sell'}`}>
              <div className="tx-item-left">
                <div className={`tx-type-badge ${badgeClass}`}>{badgeText}</div>
                <div className="tx-item-info">
                  <div className="tx-item-main">
                    <span className="tx-amount">{mainText}</span>
                    {tx.method === 'dca' && <span className="tx-method-tag">定投</span>}
                  </div>
                  {isConvert ? (
                    <div className="tx-item-detail">
                      {isConvertOut ? (
                        <>
                          <span>{(tx.sharesOut != null ? tx.sharesOut : tx.shares).toFixed(2)}份 → {tx.toFundName}</span>
                          <span className="tx-dot">·</span>
                          <span>转入 {tx.toShares.toFixed(2)}份</span>
                          <span className="tx-dot">·</span>
                          <span className="tx-fee">费用 ¥{tx.fee.toFixed(2)}</span>
                          {(tx.remainderCash || 0) > 0 ? (
                            <>
                              <span className="tx-dot">·</span>
                              <span className="tx-remainder">剩余 ¥{tx.remainderCash.toFixed(2)}</span>
                            </>
                          ) : null}
                          {(tx.cashAdjust || 0) > 0 ? (
                            <>
                              <span className="tx-dot">·</span>
                              <span className="tx-adjust">金额补扣 ¥{tx.cashAdjust.toFixed(2)}</span>
                            </>
                          ) : null}
                          {(tx.shareAdjust || 0) > 0 ? (
                            <>
                              <span className="tx-dot">·</span>
                              <span className="tx-adjust">份额补扣 {tx.shareAdjust.toFixed(2)}份</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <span>来自 {tx.fundName}</span>
                          <span className="tx-dot">·</span>
                          <span>转入净值 {tx.toNav.toFixed(4)}</span>
                          <span className="tx-dot">·</span>
                          <span className="tx-fee">费用 ¥{tx.fee.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="tx-item-detail">
                      <span>净值 {tx.nav.toFixed(4)}</span>
                      <span className="tx-dot">·</span>
                      <span>{isBuy ? `${tx.shares.toFixed(2)}份` : `¥${tx.netAmount.toFixed(2)}`}</span>
                      <span className="tx-dot">·</span>
                      <span className="tx-fee">费用 ¥{tx.fee.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="tx-item-right">
                <span className="tx-date">{dateStr}</span>
                <div className="tx-actions">
                  <button className="tx-edit-btn" onClick={(e) => { e.stopPropagation(); setEditingTx(tx); }} title="编辑记录">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button className="tx-delete-btn" onClick={(e) => handleDelete(e, tx.id)} title="删除记录">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingTx ? <EditTransactionModal tx={editingTx} onClose={() => setEditingTx(null)} /> : null}
      {showAudit ? <AuditModal audit={audit} onClose={() => setShowAudit(false)} /> : null}
    </div>
  );
}

/**
 * TransactionHistory - 交易历史时间线
 * 展示所有买入/卖出记录，含手续费、净值、方式标签
 */

import useTradeStore from '../../store/useTradeStore';

export default function TransactionHistory({ fundCode }) {
  const { getTransactionsForFund, removeTransaction } = useTradeStore();
  const transactions = getTransactionsForFund(fundCode);

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
    if (window.confirm('确定删除这条交易记录？删除后将影响持仓计算。')) {
      removeTransaction(txId);
    }
  };

  return (
    <div className="tx-history">
      <div className="tx-history-list">
        {transactions.map((tx) => {
          const isConvert = tx.type === 'convert';
          const isConvertOut = isConvert && tx.fundCode === fundCode;
          const isBuy = tx.type === 'buy';
          const dateStr = new Date(tx.orderTime).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          const badgeText = isConvert ? (isConvertOut ? '转出' : '转入') : isBuy ? '买入' : '卖出';
          const badgeClass = isConvert
            ? 'badge-convert'
            : isBuy
              ? 'badge-buy'
              : 'badge-sell';
          const mainText = isConvert
            ? isConvertOut
              ? `¥${tx.amount.toFixed(2)}`
              : `${tx.toShares.toFixed(2)} 份`
            : isBuy
              ? `¥${tx.amount.toFixed(2)}`
              : `${tx.shares.toFixed(2)} 份`;

          return (
            <div
              key={tx.id}
              className={`tx-item ${isConvert ? 'tx-convert' : isBuy ? 'tx-buy' : 'tx-sell'}`}
            >
              <div className="tx-item-left">
                <div className={`tx-type-badge ${badgeClass}`}>{badgeText}</div>
                <div className="tx-item-info">
                  <div className="tx-item-main">
                    <span className="tx-amount">{mainText}</span>
                    {tx.method === 'dca' && (
                      <span className="tx-method-tag">定投</span>
                    )}
                  </div>
                  {isConvert ? (
                    <div className="tx-item-detail">
                      {isConvertOut ? (
                        <>
                          <span>
                            {(tx.sharesOut != null ? tx.sharesOut : tx.shares).toFixed(2)}份 → {tx.toFundName}
                          </span>
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
                <button
                  className="tx-delete-btn"
                  onClick={(e) => handleDelete(e, tx.id)}
                  title="删除记录"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

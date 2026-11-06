/**
 * FundChart - 基金走势图表
 * 使用 ECharts 渲染折线图，支持时间切换和持仓成本基准线
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchFundHistory } from '../../services/fundService';
import useTradeStore from '../../store/useTradeStore';
import { calcPosition } from '../../utils/tradeEngine';

const PERIODS = [
  { key: '1w', label: '近1周' },
  { key: '1m', label: '近1月' },
  { key: '3m', label: '近3月' },
  { key: '1y', label: '近1年' },
];

export default function FundChart({ fundCode, costPrice, navDate }) {
  const [period, setPeriod] = useState('3m');
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const transactions = useTradeStore((s) => s.transactions);

  useEffect(() => {
    if (!fundCode) return;
    setLoading(true);
    fetchFundHistory(fundCode, period).then((data) => {
      setHistoryData(data);
      setLoading(false);
    });
  }, [fundCode, period]);

  const chartOption = useMemo(() => {
    let validData = historyData;
    if (navDate) {
      validData = historyData.filter((d) => d.date <= navDate);
    }
    if (validData.length === 0) return {};

    const dates = validData.map((d) => d.date);
    const navValues = validData.map((d) => d.nav);
    const minNav = Math.min(...navValues);
    const maxNav = Math.max(...navValues);
    const padding = (maxNav - minNav) * 0.1 || 0.05;

    // 判断整体走势颜色
    const firstNav = navValues[0];
    const lastNav = navValues[navValues.length - 1];
    const isUp = lastNav >= firstNav;
    const lineColor = isUp ? '#ef4444' : '#22c55e';
    const areaColorStart = isUp ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)';
    const areaColorEnd = isUp ? 'rgba(239, 68, 68, 0.02)' : 'rgba(34, 197, 94, 0.02)';

    // 持仓成本线
    const markLineData = [];
    if (costPrice > 0) {
      markLineData.push({
        yAxis: costPrice,
        name: '持仓成本',
        label: {
          formatter: `成本: ${costPrice.toFixed(4)}`,
          position: 'end',
          color: '#a78bfa',
          fontSize: 11,
        },
        lineStyle: {
          color: '#a78bfa',
          type: 'dashed',
          width: 2,
        },
      });
    }

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '4%',
        bottom: '12%',
        top: '8%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 17, 23, 0.95)',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        textStyle: {
          color: '#e2e8f0',
          fontSize: 13,
        },
        formatter: (params) => {
          const p = params[0];
          const nav = p.value;
          const date = p.axisValue;

          // 计算指定日期的实际持仓收益值
          // 仅在有买入记录且确认日在该日期或之前时计算
          const txsBeforeDate = transactions.filter(
            (tx) => tx.fundCode === fundCode && tx.status === 'confirmed' && tx.confirmDate <= date
          );

          let profitHtml = '';
          if (txsBeforeDate.length > 0) {
            const pos = calcPosition(txsBeforeDate, nav, 0);
            if (pos.totalShares > 0) {
              const profitVal = pos.holdingProfit;
              const profitColor = profitVal >= 0 ? '#ef4444' : '#22c55e';
              const sign = profitVal >= 0 ? '+' : '';
              profitHtml = `<br/>收益值: <span style="color:${profitColor};font-weight:bold">${sign}¥${profitVal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
            }
          }

          return `<div style="font-size:12px;opacity:0.7">${date}</div>
                  净值: <span style="color:${lineColor};font-weight:bold">${nav.toFixed(4)}</span>
                  ${profitHtml}`;
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)' } },
        axisLabel: {
          color: 'rgba(148, 163, 184, 0.6)',
          fontSize: 11,
          formatter: (value) => {
            const parts = value.split('-');
            return `${parts[1]}/${parts[2]}`;
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: (minNav - padding).toFixed(4),
        max: (maxNav + padding).toFixed(4),
        axisLine: { show: false },
        axisLabel: {
          color: 'rgba(148, 163, 184, 0.6)',
          fontSize: 11,
          formatter: (val) => val.toFixed(2),
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(148, 163, 184, 0.06)',
          },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          name: '单位净值',
          type: 'line',
          data: navValues,
          smooth: true,
          symbol: 'none',
          lineStyle: {
            width: 2.5,
            color: lineColor,
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: areaColorStart },
                { offset: 1, color: areaColorEnd },
              ],
            },
          },
          markLine: markLineData.length > 0 ? {
            symbol: 'none',
            data: markLineData,
            animation: true,
          } : undefined,
        },
      ],
    };
  }, [historyData, costPrice, transactions, fundCode, navDate]);

  if (!fundCode) {
    return null;
  }

  return (
    <div className="chart-container">
      {/* 时间切换 */}
      <div className="chart-toolbar">
        <span className="chart-title">净值走势</span>
        <div className="period-tabs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`period-tab ${period === p.key ? 'active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 图表 */}
      <div className="chart-wrapper">
        {loading ? (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        ) : historyData.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
          />
        ) : (
          <div className="chart-empty">暂无数据</div>
        )}
      </div>
    </div>
  );
}

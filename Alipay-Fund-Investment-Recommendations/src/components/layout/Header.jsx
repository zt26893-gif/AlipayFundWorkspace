/**
 * Header - 顶部导航栏
 * 展示 Logo、项目名称、大盘指数概览和当前时间
 */

import { useState, useEffect } from 'react';
import { fetchMarketOverview } from '../../services/aiService';

export default function Header() {
  const [indices, setIndices] = useState([]);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    // 获取大盘指数
    fetchMarketOverview().then(setIndices);

    // 每 30 秒刷新一次
    const interval = setInterval(() => {
      fetchMarketOverview().then(setIndices);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 更新时间
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header-bar">
      {/* Logo & 名称 */}
      <div className="header-brand">
        <div className="header-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <rect width="28" height="28" rx="6" fill="url(#logoGrad)" />
            <path
              d="M7 18 L11 10 L15 15 L19 8 L22 12"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="22" cy="12" r="2" fill="#22c55e" />
          </svg>
        </div>
        <div>
          <h1 className="header-title">AI Fund Tracker</h1>
          <p className="header-subtitle">智能基金投资分析看板</p>
        </div>
      </div>

      {/* 大盘指数 */}
      <div className="header-indices">
        {indices.map((idx) => (
          <div key={idx.code || idx.name} className="index-item">
            <span className="index-name">{idx.name}</span>
            <span className={`index-value ${idx.change >= 0 ? 'text-rise' : 'text-fall'}`}>
              {idx.value.toFixed(2)}
            </span>
            <span className={`index-change ${idx.change >= 0 ? 'text-rise' : 'text-fall'}`}>
              {idx.change >= 0 ? '+' : ''}
              {idx.change.toFixed(2)} ({idx.changePercent >= 0 ? '+' : ''}
              {idx.changePercent.toFixed(2)}%)
            </span>
          </div>
        ))}
      </div>

      {/* 时间 */}
      <div className="header-time">
        <div className="time-dot"></div>
        <span>{currentTime}</span>
      </div>
    </header>
  );
}

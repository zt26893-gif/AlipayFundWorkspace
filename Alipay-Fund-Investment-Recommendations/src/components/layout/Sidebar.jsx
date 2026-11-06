/**
 * Sidebar - 左侧边栏
 * 基金搜索、基金池列表管理
 */

import { useState, useCallback } from 'react';
import useFundStore from '../../store/useFundStore';
import { searchFund, fetchFundInfo } from '../../services/fundService';

export default function Sidebar() {
  const { funds, selectedFundCode, addFund, removeFund, selectFund } = useFundStore();
  const [searchCode, setSearchCode] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchCode.trim()) return;
    setIsSearching(true);
    setShowResults(true);
    try {
      const results = await searchFund(searchCode.trim());
      setSearchResults(results);
    } catch (err) {
      console.error('搜索失败:', err);
      setSearchResults([]);
    }
    setIsSearching(false);
  }, [searchCode]);

  const handleAdd = useCallback(
    async (code) => {
      const fund = await fetchFundInfo(code);
      if (fund) {
        addFund(fund);
        setSearchCode('');
        setShowResults(false);
        setSearchResults([]);
      }
    },
    [addFund]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleRemove = (e, code) => {
    e.stopPropagation();
    removeFund(code);
  };

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(false)}
          title="展开侧边栏"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="sidebar-collapsed-funds">
          {funds.map((f) => (
            <div
              key={f.code}
              className={`collapsed-fund-dot ${f.code === selectedFundCode ? 'active' : ''} ${f.dailyChange >= 0 ? 'rise' : 'fall'}`}
              onClick={() => selectFund(f.code)}
              title={`${f.name} (${f.code})`}
            />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {/* 侧边栏头部 */}
      <div className="sidebar-header">
        <h2 className="sidebar-title">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="11" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="1" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          我的基金池
        </h2>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(true)}
          title="折叠侧边栏"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 搜索框 */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="输入基金代码/名称，如 022364"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={30}
          />
          <button className="search-btn" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? '...' : '搜索'}
          </button>
        </div>

        {/* 搜索结果 */}
        {showResults && (
          <div className="search-results">
            {searchResults.length === 0 && !isSearching ? (
              <div className="search-empty">未找到相关基金</div>
            ) : (
              searchResults.map((result) => {
                const isAdded = funds.some((f) => f.code === result.code);
                return (
                  <div key={result.code} className="search-result-item">
                    <div className="result-info">
                      <span className="result-name">{result.name}</span>
                      <span className="result-code">{result.code}</span>
                    </div>
                    <button
                      className={`result-add-btn ${isAdded ? 'added' : ''}`}
                      onClick={() => !isAdded && handleAdd(result.code)}
                      disabled={isAdded}
                    >
                      {isAdded ? '已添加' : '+ 添加'}
                    </button>
                  </div>
                );
              })
            )}
            <button
              className="search-close-btn"
              onClick={() => setShowResults(false)}
            >
              收起
            </button>
          </div>
        )}
      </div>

      {/* 基金列表 */}
      <div className="fund-list">
        {funds.length === 0 ? (
          <div className="fund-list-empty">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.3">
              <rect x="8" y="8" width="32" height="32" rx="8" stroke="currentColor" strokeWidth="2" />
              <path d="M20 24H28M24 20V28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p>暂无基金</p>
            <p className="text-xs opacity-50">搜索并添加基金到你的关注池</p>
          </div>
        ) : (
          funds.map((fund) => (
            <div
              key={fund.code}
              className={`fund-item ${fund.code === selectedFundCode ? 'active' : ''}`}
              onClick={() => selectFund(fund.code)}
            >
              <div className="fund-item-header">
                <span className="fund-item-name">{fund.name}</span>
                <button
                  className="fund-remove-btn"
                  onClick={(e) => handleRemove(e, fund.code)}
                  title="移除基金"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="fund-item-footer">
                <span className="fund-item-code">{fund.code}</span>
                <span
                  className={`fund-item-change ${fund.dailyChange >= 0 ? 'rise' : 'fall'}`}
                >
                  {fund.dailyChange >= 0 ? '▲' : '▼'}{' '}
                  {fund.dailyChange >= 0 ? '+' : ''}
                  {fund.dailyChange.toFixed(2)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部统计 */}
      {funds.length > 0 && (
        <div className="sidebar-footer">
          <span>共 {funds.length} 只基金</span>
          <span className="text-xs opacity-60">
            {funds.filter((f) => f.dailyChange >= 0).length} 涨 /{' '}
            {funds.filter((f) => f.dailyChange < 0).length} 跌
          </span>
        </div>
      )}
    </aside>
  );
}

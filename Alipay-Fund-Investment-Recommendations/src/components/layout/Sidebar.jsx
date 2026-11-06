/**
 * Sidebar - 左侧边栏
 * 基金搜索、基金池列表管理
 */

import { useState, useCallback, useMemo } from 'react';
import useFundStore from '../../store/useFundStore';
import useSettingsStore from '../../store/useSettingsStore';
import { translate } from '../../i18n';
import { searchFund, fetchFundInfo } from '../../services/fundService';

export default function Sidebar({ onOpenSettings, onFundSelected }) {
  const { funds, selectedFundCode, addFund, removeFund, selectFund } = useFundStore();
  const language = useSettingsStore((s) => s.language);
  const t = useMemo(() => (key, vars) => translate(language, key, vars), [language]);
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
          title={t('sidebar.expand')}
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
              onClick={() => { selectFund(f.code); if (onFundSelected) onFundSelected(f.code); }}
              title={`${f.name} (${f.code})`}
            />
          ))}
        </div>
        <button
          className="sidebar-settings-btn is-collapsed"
          onClick={onOpenSettings}
          title={t('actions.settings')}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
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
          {t('sidebar.title')}
        </h2>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(true)}
          title={t('sidebar.collapseTitle')}
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
            placeholder={t('sidebar.searchPlaceholder')}
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={30}
          />
          <button className="search-btn" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? '...' : t('sidebar.search')}
          </button>
        </div>

        {/* 搜索结果 */}
        {showResults && (
          <div className="search-results">
            {searchResults.length === 0 && !isSearching ? (
              <div className="search-empty">{t('sidebar.noResult')}</div>
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
                      {isAdded ? t('sidebar.added') : t('sidebar.add')}
                    </button>
                  </div>
                );
              })
            )}
            <button
              className="search-close-btn"
              onClick={() => setShowResults(false)}
            >
              {t('sidebar.collapse')}
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
            <p>{t('sidebar.empty')}</p>
            <p className="text-xs opacity-50">{t('sidebar.emptyHint')}</p>
          </div>
        ) : (
          funds.map((fund) => (
            <div
              key={fund.code}
              className={`fund-item ${fund.code === selectedFundCode ? 'active' : ''}`}
              onClick={() => { selectFund(fund.code); if (onFundSelected) onFundSelected(fund.code); }}
            >
              <div className="fund-item-header">
                <span className="fund-item-name">{fund.name}</span>
                <button
                  className="fund-remove-btn"
                  onClick={(e) => handleRemove(e, fund.code)}
                  title={t('sidebar.remove')}
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
          <span>{t('sidebar.total', { n: funds.length })}</span>
          <span className="text-xs opacity-60">
            {t('sidebar.riseFall', {
              u: funds.filter((f) => f.dailyChange >= 0).length,
              d: funds.filter((f) => f.dailyChange < 0).length,
            })}
          </span>
        </div>
      )}

      {/* 设置入口 */}
      <div className="sidebar-bottom">
        <button className="sidebar-settings-btn" onClick={onOpenSettings}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{t('actions.settings')}</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * DataModal — 数据备份与恢复
 *
 * 数据实际存在项目目录的 data/app.db（SQLite），浏览器里的 localStorage 只是运行时镜像。
 * 这里提供整库导出 / 导入，方便换电脑或做备份。
 */

import { useEffect, useRef, useState } from 'react';
import { downloadBackup, importBackup, checkHealth, isBackendReady } from '../../services/stateService';
import './portfolio-extra.css';

export default function DataModal({ onClose }) {
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backup, setBackup] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    checkHealth().then(setHealth);
    // 同步前的浏览器数据备份（stateService 在覆盖 localStorage 之前会写一份）
    try {
      const raw = localStorage.getItem('pre-sync-backup');
      if (raw) setBackup(JSON.parse(raw));
    } catch {
      setBackup(null);
    }
  }, []);

  const handleExport = () => {
    setError('');
    setMessage('');
    try {
      downloadBackup();
      setMessage('已开始下载备份文件（JSON）');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await importBackup(file);
      setMessage('导入成功，正在刷新页面…');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const online = isBackendReady() && health?.ok;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container trade-modal data-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-fund-info">
            <span className="modal-fund-name">数据备份</span>
            <span className="modal-fund-code">本地数据库</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="trade-panel">
          <div className={`data-status ${online ? 'online' : 'offline'}`}>
            <span className="data-status-dot" />
            <div className="data-status-text">
              <b>{online ? '本地数据库已连接' : '未连接本地数据库'}</b>
              <span>
                {online
                  ? `数据保存在项目目录的 data/app.db（已存 ${health.keys?.length || 0} 组数据）`
                  : '当前是纯浏览器模式（npm run dev 直连或后端未启动），数据只在本机浏览器里'}
              </span>
            </div>
          </div>

          <div className="data-block">
            <h4 className="data-block-title">导出备份</h4>
            <p className="data-hint">
              把基金池、交易记录、剩余资金、费率配置打成一份 JSON，建议随 U 盘一起保存。
            </p>
            <button className="rev-apply-btn" onClick={handleExport} disabled={!online}>
              下载备份文件
            </button>
          </div>

          <div className="data-block">
            <h4 className="data-block-title">导入备份</h4>
            <p className="data-hint">
              导入会<strong>覆盖</strong>当前全部数据，完成后页面自动刷新。
            </p>
            <label className={`data-file-btn ${!online || busy ? 'disabled' : ''}`}>
              {busy ? '导入中…' : '选择备份文件'}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImport}
                disabled={!online || busy}
              />
            </label>
          </div>

          {message ? <p className="data-message ok">{message}</p> : null}
          {error ? <p className="data-message err">{error}</p> : null}

          {backup ? (
            <div className="data-block data-backup">
              <h4 className="data-block-title">发现同步前备份</h4>
              <p className="data-hint">
                时间：{new Date(backup.at).toLocaleString('zh-CN')}
                <br />
                这是最近一次用数据库覆盖浏览器数据之前，自动留下的本地快照。
              </p>
              <button
                className="fee-reset-btn"
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const snapshot = {};
                    const map = {
                      'fund-pool': 'fundPool',
                      'fund-trades': 'trades',
                      'fund-fees': 'fees',
                    };
                    for (const [localKey, stateKey] of Object.entries(map)) {
                      const raw = backup.snap?.[localKey];
                      if (raw) snapshot[stateKey] = JSON.parse(raw);
                    }
                    if (backup.snap?.['portfolio-privacy'] != null) {
                      snapshot.privacy = backup.snap['portfolio-privacy'] === 'true';
                    }
                    const res = await fetch('/api/import', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ state: snapshot }),
                    });
                    if (!res.ok) throw new Error('恢复失败');
                    setMessage('已从备份恢复，正在刷新…');
                    setTimeout(() => window.location.reload(), 800);
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                用这份备份覆盖数据库
              </button>
            </div>
          ) : null}

          <p className="data-foot">
            换电脑时：把整个项目文件夹（含 data 目录）拷走即可；只有备份文件时，先启动项目再导入。
          </p>
        </div>
      </div>
    </div>
  );
}

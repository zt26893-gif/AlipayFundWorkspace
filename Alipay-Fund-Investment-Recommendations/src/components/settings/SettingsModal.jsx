/**
 * SettingsModal — 设置：主题 / 语言 / AI 模型接口
 * 所有改动即时生效并自动保存。
 */

import { useMemo } from 'react';
import useSettingsStore from '../../store/useSettingsStore';
import { translate } from '../../i18n';
import './settings.css';

const THEMES = [
  {
    key: 'dark',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
        <path d="M16 11.5A6.5 6.5 0 0 1 8.5 4 6.5 6.5 0 1 0 16 11.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'light',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
        <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2.5V4M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M15.3 4.7l-1 1M5.7 14.3l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'system',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
        <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 16.5h6M10 13.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const LANGS = [
  { key: 'zh', label: '简体中文' },
  { key: 'en', label: 'English' },
];

export default function SettingsModal({ onClose }) {
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const ai = useSettingsStore((s) => s.ai);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setAI = useSettingsStore((s) => s.setAI);

  const t = useMemo(() => (key, vars) => translate(language, key, vars), [language]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h2 className="settings-title">{t('settings.title')}</h2>
            <p className="settings-subtitle">{t('settings.subtitle')}</p>
          </div>
          <button className="settings-close" onClick={onClose} aria-label={t('settings.close')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {/* 主题 */}
          <section className="settings-section">
            <h3 className="settings-section-title">{t('settings.theme')}</h3>
            <div className="settings-options">
              {THEMES.map((item) => (
                <button
                  key={item.key}
                  className={`settings-option ${theme === item.key ? 'active' : ''}`}
                  onClick={() => setTheme(item.key)}
                >
                  <span className="settings-option-icon">{item.icon}</span>
                  <span>{t(`settings.theme.${item.key}`)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 语言 */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.language')}
              <span className="settings-beta">{t('settings.language.beta')}</span>
            </h3>
            <div className="settings-options">
              {LANGS.map((item) => (
                <button
                  key={item.key}
                  className={`settings-option ${language === item.key ? 'active' : ''}`}
                  onClick={() => setLanguage(item.key)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* AI 接口 */}
          <section className="settings-section">
            <h3 className="settings-section-title">{t('settings.ai')}</h3>
            <p className="settings-hint">{t('settings.ai.hint')}</p>
            <div className="settings-grid">
              <label className="settings-field settings-field-wide">
                <span>{t('settings.ai.baseUrl')}</span>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="https://api.deepseek.com"
                  value={ai.baseUrl}
                  onChange={(e) => setAI({ baseUrl: e.target.value.trim() })}
                  spellCheck={false}
                />
              </label>
              <label className="settings-field settings-field-wide">
                <span>{t('settings.ai.apiKey')}</span>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="sk-..."
                  value={ai.apiKey}
                  onChange={(e) => setAI({ apiKey: e.target.value.trim() })}
                  spellCheck={false}
                />
              </label>
              <label className="settings-field">
                <span>{t('settings.ai.chatModel')}</span>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="deepseek-chat"
                  value={ai.chatModel}
                  onChange={(e) => setAI({ chatModel: e.target.value.trim() })}
                  spellCheck={false}
                />
              </label>
              <label className="settings-field">
                <span>{t('settings.ai.visionModel')}</span>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="qwen-vl-max"
                  value={ai.visionModel}
                  onChange={(e) => setAI({ visionModel: e.target.value.trim() })}
                  spellCheck={false}
                />
              </label>
            </div>
            <p className="settings-hint">{t('settings.ai.visionHint')}</p>
          </section>
        </div>

        <div className="settings-footer">
          <span className="settings-saved">{t('settings.saved')} · {t('settings.storageHint')}</span>
          <button className="settings-done" onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

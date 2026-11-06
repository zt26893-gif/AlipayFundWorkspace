/**
 * useSettingsStore — 界面设置（主题 / 语言 / AI 接口）
 *
 * 全部存 localStorage，不跟交易数据混在一起，重装/清库也不影响。
 */

import { create } from 'zustand';

const STORAGE_KEY = 'app-settings';

const DEFAULTS = {
  theme: 'system', // dark | light | system
  language: 'zh', // zh | en
  ai: {
    baseUrl: '',
    apiKey: '',
    chatModel: '',
    visionModel: '',
  },
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, ai: { ...DEFAULTS.ai } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      ai: { ...DEFAULTS.ai, ...(parsed.ai || {}) },
    };
  } catch {
    return { ...DEFAULTS, ai: { ...DEFAULTS.ai } };
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveTheme(theme) {
  if (theme === 'system') return media && media.matches ? 'dark' : 'light';
  return theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(theme);
  document.documentElement.dataset.themeMode = theme;
}

function save(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: state.theme, language: state.language, ai: state.ai })
    );
  } catch (e) {
    console.warn('[settings] 保存失败:', e);
  }
}

const initial = load();

const useSettingsStore = create((set, get) => ({
  ...initial,

  setTheme: (theme) => {
    applyTheme(theme);
    set((s) => {
      const next = { ...s, theme };
      save(next);
      return { theme };
    });
  },

  setLanguage: (language) =>
    set((s) => {
      const next = { ...s, language };
      save(next);
      return { language };
    }),

  setAI: (patch) =>
    set((s) => {
      const ai = { ...s.ai, ...patch };
      save({ ...s, ai });
      return { ai };
    }),

  resetAI: () =>
    set((s) => {
      const ai = { ...DEFAULTS.ai };
      save({ ...s, ai });
      return { ai };
    }),
}));

// 初始化时立刻应用主题，并跟随系统切换
applyTheme(initial.theme);
if (media) {
  const onChange = () => {
    if (useSettingsStore.getState().theme === 'system') applyTheme('system');
  };
  if (media.addEventListener) media.addEventListener('change', onChange);
  else if (media.addListener) media.addListener(onChange);
}

export default useSettingsStore;

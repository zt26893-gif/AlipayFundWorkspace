import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { hydrateFromServer, attachAutoSave } from './services/stateService';

async function boot() {
  // 先把服务端 SQLite 的快照写进 localStorage
  await hydrateFromServer();

  // 再动态加载 App 与 store，保证 store 初始化时读到的是最新数据
  const [{ default: App }, fundMod, tradeMod, feeMod] = await Promise.all([
    import('./App.jsx'),
    import('./store/useFundStore'),
    import('./store/useTradeStore'),
    import('./store/useFeeStore'),
  ]);

  attachAutoSave({
    useFundStore: fundMod.default,
    useTradeStore: tradeMod.default,
    useFeeStore: feeMod.default,
  });

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();

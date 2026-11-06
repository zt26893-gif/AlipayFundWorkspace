/**
 * stateService — 与服务端 SQLite 同步
 *
 * 启动顺序很重要：必须先把服务端数据写进 localStorage，再加载 store，
 * 否则 store 会先用旧的（甚至空的）localStorage 初始化。
 * 因此 main.jsx 里用动态 import 在 hydrate 之后才引入 App 与各个 store。
 */

const STATE_URL = '/api/state';
const KEY_MAP = {
  fundPool: 'fund-pool',
  trades: 'fund-trades',
  fees: 'fund-fees',
};

let backendReady = false;
let saveTimer = null;

export const isBackendReady = () => backendReady;

/* ===== 本地读写 ===== */

function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 把服务端快照写进 localStorage（store 初始化时会读这里） */
function applySnapshotToLocal(state) {
  if (!state) return;
  // 覆盖前先把现有浏览器数据整体备份一份，避免任何情况下的静默丢失
  try {
    const backupKeys = ['fund-pool', 'fund-trades', 'fund-fees', 'portfolio-privacy'];
    const snap = {};
    let hasData = false;
    for (const k of backupKeys) {
      const v = localStorage.getItem(k);
      if (v != null) {
        snap[k] = v;
        hasData = true;
      }
    }
    if (hasData) {
      localStorage.setItem(
        'pre-sync-backup',
        JSON.stringify({ at: new Date().toISOString(), snap })
      );
    }
  } catch (err) {
    console.warn('[state] 备份本地数据失败:', err.message);
  }

  for (const [k, localKey] of Object.entries(KEY_MAP)) {
    if (state[k] != null) localStorage.setItem(localKey, JSON.stringify(state[k]));
  }
  if (state.privacy != null) localStorage.setItem('portfolio-privacy', String(state.privacy));
}

/** 读取浏览器里已有的旧数据（没有后端时产生的） */
function readLocalSnapshot() {
  return {
    fundPool: readLocalJson('fund-pool'),
    trades: readLocalJson('fund-trades'),
    fees: readLocalJson('fund-fees'),
    privacy: localStorage.getItem('portfolio-privacy') === 'true',
  };
}

const hasAny = (snap) =>
  !!snap && (snap.fundPool != null || snap.trades != null || snap.fees != null);

/** 交易按 id 合并去重；本地新增但没来得及入库的记录不会因为“服务端优先”被抹掉 */
function mergeTransactions(serverTxs = [], localTxs = []) {
  const map = new Map();
  for (const tx of serverTxs) if (tx && tx.id) map.set(tx.id, tx);
  for (const tx of localTxs) if (tx && tx.id && !map.has(tx.id)) map.set(tx.id, tx);
  return [...map.values()].sort(
    (a, b) => new Date(a.orderTime || 0) - new Date(b.orderTime || 0)
  );
}

function mergeTrades(serverTrades, localTrades) {
  const serverTxs = serverTrades?.transactions || [];
  const localTxs = localTrades?.transactions || [];
  if (localTxs.length === 0) return null;
  const merged = mergeTransactions(serverTxs, localTxs);
  if (merged.length <= serverTxs.length) return null;
  return {
    ...serverTrades,
    transactions: merged,
    dcaPlans: serverTrades?.dcaPlans?.length ? serverTrades.dcaPlans : localTrades?.dcaPlans || [],
  };
}

/* ===== 与服务端交互 ===== */

async function pushSnapshot(snapshot) {
  const res = await fetch(STATE_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: snapshot }),
  });
  if (!res.ok) throw new Error(`保存失败 HTTP ${res.status}`);
  return res.json();
}

/**
 * 启动时同步：服务端有数据 → 覆盖本地；服务端为空 → 把本地旧数据迁过去。
 * 服务端不可用（例如纯 vite 开发、没有起后端）时降级为纯本地模式。
 */
export async function hydrateFromServer() {
  try {
    const res = await fetch(STATE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    backendReady = true;

    if (data.empty) {
      const legacy = readLocalSnapshot();
      if (hasAny(legacy)) {
        await pushSnapshot(legacy);
        console.log('[state] 已把浏览器本地数据迁移到服务端数据库');
        return { mode: 'migrated' };
      }
      return { mode: 'fresh' };
    }

    // 合并而不是直接覆盖：浏览器里有、服务端没有的交易（例如上次保存失败）先并进去
    const localSnapshot = readLocalSnapshot();
    const mergedTrades = mergeTrades(data.state?.trades, localSnapshot.trades);
    if (mergedTrades) {
      const mergedState = { ...data.state, trades: mergedTrades };
      await pushSnapshot({
        fundPool: mergedState.fundPool,
        trades: mergedState.trades,
        fees: mergedState.fees,
        privacy: mergedState.privacy,
      });
      applySnapshotToLocal(mergedState);
      console.log('[state] 已合并本地新增交易并回写服务端（%d 笔）', mergedTrades.transactions.length);
      return { mode: 'merged' };
    }

    applySnapshotToLocal(data.state);
    console.log(`[state] 已从服务端数据库加载（${data.keys.join(', ')}）`);
    return { mode: 'loaded' };
  } catch (err) {
    backendReady = false;
    console.warn('[state] 未连接本地服务端，仅使用浏览器存储:', err.message);
    return { mode: 'local' };
  }
}

/* ===== 自动保存 ===== */

/**
 * 订阅三个 store，任何变化都在 800ms 后合并写入服务端。
 * @param {{useFundStore:any, useTradeStore:any, useFeeStore:any}} stores
 */
export function attachAutoSave({ useFundStore, useTradeStore, useFeeStore }) {
  if (!backendReady) return () => {};

  const buildSnapshot = () => {
    const fund = useFundStore.getState();
    const trade = useTradeStore.getState();
    const fee = useFeeStore.getState();
    return {
      fundPool: { funds: fund.funds, selectedFundCode: fund.selectedFundCode },
      trades: {
        transactions: trade.transactions,
        dcaPlans: trade.dcaPlans,
        cashBalance: trade.cashBalance,
      },
      fees: {
        buyRate: fee.buyRate,
        sellTiers: fee.sellTiers,
        fundOverrides: fee.fundOverrides,
      },
      privacy: localStorage.getItem('portfolio-privacy') === 'true',
    };
  };

  const flush = () => {
    pushSnapshot(buildSnapshot()).catch((err) => console.warn('[state] 自动保存失败:', err.message));
  };

  const schedule = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  };

  const unsubs = [
    useFundStore.subscribe(schedule),
    useTradeStore.subscribe(schedule),
    useFeeStore.subscribe(schedule),
  ];

  const onUnload = () => {
    clearTimeout(saveTimer);
    // 卸载前尽量落盘（同步 XHR 已被弃用，这里只能尽力）
    navigator.sendBeacon?.(
      STATE_URL,
      new Blob([JSON.stringify({ state: buildSnapshot() }, null, 0)], { type: 'application/json' })
    );
  };
  window.addEventListener('beforeunload', onUnload);

  return () => {
    unsubs.forEach((u) => u());
    window.removeEventListener('beforeunload', onUnload);
  };
}

/* ===== 导出 / 导入 ===== */

/** 触发浏览器下载备份文件 */
export function downloadBackup() {
  if (!backendReady) throw new Error('未连接本地服务端，无法导出数据库备份');
  window.location.href = '/api/export';
}

/** 导入备份文件，成功后需要刷新页面 */
export async function importBackup(file) {
  if (!backendReady) throw new Error('未连接本地服务端，无法导入');
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  const snapshot = parsed.state || parsed;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('备份文件格式不正确');

  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: snapshot }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `导入失败 HTTP ${res.status}`);
  }
  return res.json();
}

/** 查询后端状态，用于界面展示 */
export async function checkHealth() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

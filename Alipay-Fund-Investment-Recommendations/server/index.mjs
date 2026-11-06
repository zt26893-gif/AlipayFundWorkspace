/**
 * 本地服务端 —— 为基金看板提供数据持久化与静态托管
 *
 * 设计要点（针对 U 盘便携场景）：
 *   - 数据库用 Node 24 内置的 node:sqlite，无需任何原生模块，换电脑不用重装依赖
 *   - 同时托管 dist 静态文件，浏览器访问 http://127.0.0.1:8787 即可，不依赖 vite
 *   - 顺手接管原本由 vite.config.js 处理的外部接口代理，保证行情/DeepSeek 仍可用
 *   - 所有用户数据写在 data/app.db，随 U 盘走
 */

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST_DIR = path.join(ROOT, 'dist');
// 桌面版（Electron）会把数据目录指到 exe 旁边；纯 Web 运行时保持项目内 data/
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
// 测试时可以指定独立数据库，避免污染真实数据
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(DATA_DIR, 'app.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PORT = Number(process.env.PORT) || 8787;

const STATE_KEYS = ['fundPool', 'trades', 'fees', 'privacy'];

/* ===== 数据库 ===== */

await mkdir(DATA_DIR, { recursive: true });
await mkdir(BACKUP_DIR, { recursive: true });

/** 启动时备份当前数据库，保留最近 10 份（防止误操作/测试数据覆盖） */
async function backupDatabase() {
  try {
    const info = await stat(DB_PATH).catch(() => null);
    if (!info || info.size === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const target = path.join(BACKUP_DIR, `app-${stamp}.db`);
    await copyFile(DB_PATH, target);

    const files = (await readdir(BACKUP_DIR))
      .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - 10))) {
      await unlink(path.join(BACKUP_DIR, old)).catch(() => {});
    }
    console.log(`  已备份数据库：${path.basename(target)}`);
  } catch (err) {
    console.warn('[backup] 备份失败:', err.message);
  }
}

await backupDatabase();

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

/** 读取全部状态（缺失的键返回 null） */
function readState() {
  const rows = db.prepare('SELECT key, value, updated_at FROM app_state').all();
  const state = {};
  let updatedAt = null;
  for (const row of rows) {
    try {
      state[row.key] = JSON.parse(row.value);
    } catch {
      state[row.key] = null;
    }
    if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
  }
  return { state, updatedAt, keys: rows.map((r) => r.key) };
}

/** 写入单个键 */
function writeKey(key, value) {
  db.prepare(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

function replaceState(snapshot) {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM app_state');
    for (const key of STATE_KEYS) {
      if (snapshot[key] !== undefined && snapshot[key] !== null) writeKey(key, snapshot[key]);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ===== 外部接口代理（原 vite.config.js 的职责）===== */

const PROXIES = [
  { prefix: '/api/eastmoney', target: 'https://api.fund.eastmoney.com', headers: { Referer: 'https://fund.eastmoney.com/' } },
  { prefix: '/api/fundsuggest', target: 'https://fundsuggest.eastmoney.com', headers: { Referer: 'https://fund.eastmoney.com/' } },
  { prefix: '/api/fundgz', target: 'http://fundgz.1234567.com.cn', headers: {} },
  { prefix: '/api/push2', target: 'http://push2.eastmoney.com', headers: { Referer: 'https://quote.eastmoney.com/' } },
  { prefix: '/api/indexkline', target: 'https://push2his.eastmoney.com', headers: { Referer: 'https://quote.eastmoney.com/' } },
  { prefix: '/api/deepseek', target: 'https://api.deepseek.com', headers: {} },
];

async function handleProxy(req, res, rule) {
  const rest = req.url.slice(rule.prefix.length) || '/';
  const targetUrl = rule.target + rest;

  const headers = { ...rule.headers };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  try {
    const upstream = await fetch(targetUrl, { method: req.method, headers, body });
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.warn(`[proxy] ${rule.prefix} 失败:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream_unreachable', message: err.message }));
  }
}

/* ===== 工具 ===== */

const readBody = async (req, limit = 8 * 1024 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const filePath = path.join(DIST_DIR, rel);

  // 防目录穿越
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error('is dir');
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': rel === 'index.html' ? 'no-store' : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    // SPA 回退
    try {
      const html = await readFile(path.join(DIST_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('前端尚未构建：请先在项目目录执行 npm run build');
    }
  }
}

/* ===== 路由 ===== */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  // ---- 状态接口 ----
  if (pathname === '/api/health') {
    const { keys } = readState();
    return sendJson(res, 200, { ok: true, db: DB_PATH, port: PORT, keys });
  }

  if (pathname === '/api/state') {
    if (req.method === 'GET') {
      const { state, updatedAt, keys } = readState();
      return sendJson(res, 200, { state, updatedAt, keys, empty: keys.length === 0 });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const payload = JSON.parse(await readBody(req));
        const patch = payload.state || payload;
        for (const key of STATE_KEYS) {
          if (patch[key] !== undefined) writeKey(key, patch[key]);
        }
        const { state, updatedAt, keys } = readState();
        return sendJson(res, 200, { ok: true, state, updatedAt, keys });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }
    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  }

  if (pathname === '/api/export') {
    const { state, updatedAt } = readState();
    const body = JSON.stringify(
      { app: 'alipay-fund-tracker', version: 1, exportedAt: new Date().toISOString(), updatedAt, state },
      null,
      2
    );
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="fund-tracker-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    });
    return res.end(body);
  }

  if (pathname === '/api/import' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req));
      const snapshot = payload.state || payload;
      replaceState(snapshot);
      const { state, updatedAt, keys } = readState();
      return sendJson(res, 200, { ok: true, state, updatedAt, keys });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // ---- 外部接口代理 ----
  const proxy = PROXIES.find((p) => pathname.startsWith(`${p.prefix}/`) || pathname === p.prefix);
  if (proxy) return handleProxy(req, res, proxy);

  // ---- 静态资源 ----
  return serveStatic(res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  AI Fund Tracker 已启动');
  console.log(`  地址：http://127.0.0.1:${PORT}`);
  console.log(`  数据库：${DB_PATH}`);
  console.log('  关闭此窗口即停止服务');
  console.log('');
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

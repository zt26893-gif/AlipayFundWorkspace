/**
 * Electron 桌面壳 —— 把「本地服务端 + 已构建前端」包成一个双击即用的桌面程序
 *
 * 结构：
 *   Electron 主进程
 *     └─ 以「Electron 自带的 Node」启动 server/index.mjs（子进程）
 *          └─ 托管 dist/ 静态文件 + /api/* 接口 + SQLite（data/app.db）
 *     └─ BrowserWindow 打开 http://127.0.0.1:<port>/
 *
 * 数据目录优先级：
 *   1. 环境变量 ALIPAY_DATA_DIR（调试用）
 *   2. 便携版 exe 同级目录下的 data\（electron-builder portable 提供 PORTABLE_EXECUTABLE_DIR）
 *   3. 安装版：%APPDATA%\AI Fund Tracker\data
 *   4. 开发模式：项目根目录 data\
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// ESM 下 import 'electron' 拿到的是 npm 包路径而不是 Electron API，必须走内置 require
const { app, BrowserWindow, Menu, dialog } = require('electron');

// 本地服务只走 127.0.0.1，绝不能落到系统代理上
app.commandLine.appendSwitch('no-proxy-server');
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 打包后 asar 关闭，文件位于 resources/app；开发时位于项目根目录
const PROJECT_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
const SMOKE_TEST = process.argv.includes('--smoke-test');

app.setName('AI Fund Tracker');

// 便携模式：exe 旁边放一个 portable.txt，数据就跟着 exe 走（U 盘场景）。
// 没有这个标记时，数据统一放在固定目录，避免“点了另一份 exe 就看不到数据”。
function exeDir() {
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
}

function isPortableMode() {
  try {
    return fs.existsSync(path.join(exeDir(), 'portable.txt'));
  } catch {
    return false;
  }
}

if (isPortableMode()) {
  app.setPath('userData', path.join(exeDir(), 'runtime-data'));
}

let serverProcess = null;
let mainWindow = null;

function resolveDataDir() {
  if (process.env.ALIPAY_DATA_DIR) return path.resolve(process.env.ALIPAY_DATA_DIR);
  if (isPortableMode()) return path.join(exeDir(), 'data');
  if (app.isPackaged) return path.join(app.getPath('userData'), 'data');
  return path.join(PROJECT_ROOT, 'data');
}

/**
 * 首次运行时，如果固定目录还没有数据库、而 exe 旁边旧 data 目录有，
 * 就自动迁移过去（兼容之前“数据放在 exe 旁边”的版本）。
 */
function migrateLegacyData(targetDir) {
  try {
    const targetDb = path.join(targetDir, 'app.db');
    const legacyDb = path.join(exeDir(), 'data', 'app.db');
    if (!fs.existsSync(legacyDb)) return;

    const targetExists = fs.existsSync(targetDb);
    if (targetExists) {
      const targetSize = fs.statSync(targetDb).size;
      const legacySize = fs.statSync(legacyDb).size;
      // 目标库只有空表（12KB）而旧库更大时，说明目标还没数据，直接用旧库覆盖
      if (!(targetSize <= 12288 && legacySize > targetSize)) return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(legacyDb, targetDb);
    const legacyBackups = path.join(exeDir(), 'data', 'backups');
    if (fs.existsSync(legacyBackups)) {
      fs.cpSync(legacyBackups, path.join(targetDir, 'backups'), { recursive: true });
    }
    console.log(`[data] 已从旧目录迁移数据库：${legacyDb} -> ${targetDb}`);
  } catch (err) {
    console.warn('[data] 迁移旧数据失败:', err.message);
  }
}

function findFreePort(start = 8787, tries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (port, left) => {
      const srv = net.createServer();
      srv.unref();
      srv.once('error', () => {
        if (left <= 1) reject(new Error(`端口 ${start}-${port} 都被占用`));
        else attempt(port + 1, left - 1);
      });
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    attempt(start, tries);
  });
}

function waitForHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (Date.now() > deadline) return reject(new Error('本地服务启动超时'));
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) resolve(body);
          else setTimeout(poll, 400);
        });
      });
      req.on('error', () => setTimeout(poll, 400));
      req.on('timeout', () => { req.destroy(); setTimeout(poll, 400); });
    };
    poll();
  });
}

function startServer(port, dataDir) {
  const entry = path.join(PROJECT_ROOT, 'server', 'index.mjs');
  if (!fs.existsSync(entry)) throw new Error(`找不到服务端入口: ${entry}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const child = spawn(process.execPath, [entry], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // 用 Electron 自带的 Node 跑，不依赖系统 Node
      PORT: String(port),
      DATA_DIR: dataDir,
      DB_PATH: path.join(dataDir, 'app.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));
  child.on('exit', (code) => {
    if (code !== 0 && !app.isQuitting) console.error(`[server] 退出，code=${code}`);
  });
  return child;
}

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#0b0f1a',
    title: 'AI Fund Tracker',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  // F12 / Ctrl+Shift+I 开发者工具，Ctrl+R 刷新
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.control && input.key.toLowerCase() === 'r') {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
    console.warn(`[window] 加载失败 code=${code} desc=${desc} url=${failedUrl}`);
  });

  await mainWindow.loadURL(url);
  return mainWindow;
}

async function runSmokeTest(win) {
  await new Promise((r) => setTimeout(r, 9000));
  const image = await win.webContents.capturePage();
  const out = process.env.SMOKE_OUT || path.join(process.cwd(), 'smoke.png');
  fs.writeFileSync(out, image.toPNG());
  console.log(`SMOKE_OK ${out}`);
  setTimeout(() => app.quit(), 300);
}

app.isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      const dataDir = resolveDataDir();
      migrateLegacyData(dataDir);
      const port = await findFreePort(8787);
      serverProcess = startServer(port, dataDir);
      await waitForHealth(port);
      const win = await createWindow(`http://127.0.0.1:${port}/`);
      if (SMOKE_TEST) await runSmokeTest(win);
    } catch (err) {
      dialog.showErrorBox('AI Fund Tracker 启动失败', String(err && err.message ? err.message : err));
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    app.isQuitting = true;
    if (serverProcess && !serverProcess.killed) {
      try { serverProcess.kill(); } catch {}
    }
  });
}

# 📈 Alipay Fund Investment Recommendations (AI 基金智能投顾与交易策略系统)

<div align="center">

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.3-06B6D4?logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5.0-764ABC?logo=redux&logoColor=white)
![DeepSeek](https://img.shields.io/badge/AI-DeepSeek%20V3%2FV4-blue?logo=openai&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

**基于 React 19 + Vite + ECharts + DeepSeek 大模型打造的高颜值、实时智能化公募基金投资诊断与交易策略系统。**

[功能亮点](#-核心功能亮点) • [技术架构](#-技术架构) • [快速开始](#-快速开始) • [环境变量与大模型配置](#-环境变量与大模型配置) • [免责声明](#-免责声明)

</div>

---

## 🌟 核心功能亮点

### 1. 📊 实时行情与多源数据同步
- **大盘实时监测**：集成腾讯/东方财富接口，实时同步上证指数、深证成指、沪深300、创业板指行情及涨跌幅。
- **基金智能联想搜索**：支持输入基金代码、名称或拼音缩写实时联想搜索（例如 `000001` 华夏成长、`161725` 招商中证白酒等）。
- **净值估算与历史净值曲线**：自动拉取最新实时估值与历史净值数据。

### 2. 📉 高交互 ECharts 图表与持仓可视化
- **多时间跨度分析**：支持近 1 周、近 1 月、近 3 月、近 1 年等不同维度的净值走势图表。
- **持仓成本线（Cost Line）**：在折线图中动态渲染用户个人持仓成本线，一目了然看清盈亏损益点。
- **买卖执行点标记**：自动在净值曲线上绘制历史买入（买）和卖出（卖）的节点，精准回溯交易操作。

### 3. 💼 拟真基金持仓与交易引擎 (T+1 规则)
- **T+1 交易模拟**：严格遵循中国公募基金 15:00 截止时间与 T+1 确认规则。
- **自动持仓核算**：实时计算持仓份额、平均成本价、当前总市值、持收益率、累计已实现收益。
- **自动定投 (DCA) 策略配置**：支持设置周定投、双周定投、月定投策略及动态定投金额计算。
- **完整交易明细追踪**：包含买入/卖出历史明细，支持撤单与记录管理。

### 4. 🤖 DeepSeek 大模型驱动的 AI 诊股与策略建议
- **AI 综合市场诊断**：结合大盘指数走势、板块热度与基金近 10 日走势，使用 DeepSeek 生成高置信度走势诊断。
- **个性化操作建议**：结合用户当前真实持仓、亏损/盈利比例、历史交易风格及 15:00 临界时间，提供精准的加仓、减仓、止盈或观望建议。
- **智能止盈止损预警 (Alert Engine)**：多级可视化进度条预警（触及止盈线、止损线、预警区、安全区）。
- **无缝降级 (Fallback)**：若未配置 API Key 或网络离线，系统自动降级至内置本地策略分析引擎，保障极致流畅体验。

---

## 🏗️ 技术架构

```
alipay-fund-investment-recommendations/
├── public/                 # 静态资源
├── src/
│   ├── assets/             # 图片与图标
│   ├── components/         # UI 组件库
│   │   ├── chart/          # ECharts 基金折线图与买卖点渲染
│   │   ├── detail/         # 基金头部详情卡片
│   │   ├── layout/         # Header 顶栏、Sidebar 侧边栏与大盘数据
│   │   ├── portfolio/      # 持仓面板、交易 Modal、定投配置 Modal、交易历史
│   │   ├── strategy/       # AI 诊股策略面板、止盈止损可视化卡片
│   │   └── ui/             # 预警 Badge 等原子组件
│   ├── data/               # Mock 数据与预置数据库
│   ├── services/           # 外部 API 交互（天天基金/东方财富/DeepSeek）
│   ├── store/              # Zustand 状态管理（useFundStore, useTradeStore）
│   ├── utils/              # 交易计算引擎、JSONP 解析工具
│   ├── App.jsx             # 主界面 Dashboard 布局
│   └── index.css           # 现代化 Glassmorphic 高颜值 CSS 样式
├── .env.example            # 环境变量配置模版
├── vite.config.js          # Vite 配置（含后端 CORS 反向代理）
└── package.json
```

---

## 🚀 快速开始

###  Prerequisites (环境要求)
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0 或 **pnpm** / **yarn**

### 1. 克隆仓库
```bash
git clone https://github.com/ZenghaoZheng/Alipay-Fund-Investment-Recommendations.git
cd Alipay-Fund-Investment-Recommendations
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量 (可选，启用 AI 策略)
复制 `.env.example` 模版创建 `.env` 文件：
```bash
cp .env.example .env
```
编辑 `.env` 填入你的 DeepSeek API Key（详见下方[环境变量说明](#-环境变量与大模型配置)）。

### 4. 启动开发服务器
```bash
npm run dev
```
启动成功后，在浏览器访问 `http://localhost:5173` 即可体验！

### 5. 构建生产包
```bash
npm run build
```

---

## 🔑 环境变量与大模型配置

本项目支持通过 DeepSeek API 体验实时 AI 基金分析与操作建议。

在根目录下的 `.env` 文件中可配置以下参数：

```env
# 填入你的 DeepSeek API Key (获取地址: https://platform.deepseek.com/)
VITE_DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# DeepSeek 接口 Base URL (默认无需修改)
VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com

# DeepSeek 模型名称 (支持 deepseek-chat, deepseek-v4-flash 等)
VITE_DEEPSEEK_MODEL=deepseek-chat
```

> 🔒 **隐私提示**：`.env` 文件已被 `.gitignore` 包含，提交代码时**切勿**将包含真实 Key 的 `.env` 上传至公开仓库！

---

## 🛡️ 安全与网络说明

为了解决跨域（CORS）问题并保护 API Key，项目在 `vite.config.js` 中配置了本地开发代理：

- `/api/fundsuggest` ➡️ 东方财富基金搜索联想
- `/api/fundgz` ➡️ 天天基金实时估值
- `/api/eastmoney` ➡️ 东方财富历史净值接口
- `/api/push2` ➡️ 东方财富大盘指数
- `/api/deepseek` ➡️ DeepSeek API 代理

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 许可证开源。

---

## ⚠️ 免责声明

1. 本项目仅供学习、技术研究与个人投资模拟演示使用，不构成任何形式的投资建议或操作指引。
2. 市场有风险，投资需谨慎。投资者应根据个人风险承受能力独立作出决策。

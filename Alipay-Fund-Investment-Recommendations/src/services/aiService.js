/**
 * AI 策略分析服务层
 * 使用 DeepSeek API 生成基金交易策略分析
 * 拆分为四个独立功能：
 *   1. fetchMarketDiagnosis — 综合诊断（LLM）
 *   2. fetchOperationAdvice — 操作建议（LLM，含持仓+交易记录）
 *   3. calcStopAlert — 止盈止损提醒（本地计算）
 *   4. fetchOverviewStrategy — 组合总览策略（LLM，含大盘/板块/多基金）
 */

import {
  FUND_DATABASE,
  MARKET_INDICES,
  getStrategyForFund,
  ALERT_THRESHOLDS,
} from '../data/mockData';
import { buildLocalOverviewStrategy } from '../utils/overviewEngine';

// ===== DeepSeek 配置 =====
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat';

/**
 * 判断是否已配置 DeepSeek API Key
 */
export function isLLMConfigured() {
  return DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key-here';
}

/**
 * 调用 DeepSeek API
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @param {number} maxTokens - 最大返回 token 数
 * @returns {Promise<string|null>} LLM 返回的文本
 */
async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 800) {
  try {
    const response = await fetch('/api/deepseek/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[DeepSeek] HTTP ${response.status}:`, errText);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[DeepSeek] 请求失败:', err.message);
    return null;
  }
}

/**
 * 安全解析 LLM 返回的 JSON
 * @param {string} text - LLM 返回的文本
 * @returns {Object|null}
 */
function parseLLMJson(text) {
  if (!text) return null;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[parseLLMJson] 解析失败:', err.message, '\n原始内容:', text);
    return null;
  }
}

// ============================================================
// 1. 综合诊断 — fetchMarketDiagnosis
// ============================================================

const DIAGNOSIS_SYSTEM_PROMPT = `你是一位专业的中国公募基金投资分析师。你需要根据提供的基金数据和大盘指数信息，对该基金今日的走势做出综合诊断分析。

请严格按照以下 JSON 格式返回（不要包含任何其他文本，只返回纯 JSON）：
{
  "trend": "上升通道|下跌趋势|横盘震荡|强势上涨|底部反弹",
  "trendIcon": "📈|📉|➡️|🚀|🔄",
  "trendColor": "rise|fall|neutral",
  "diagnosis": "对当前基金走势的综合诊断分析，结合大盘走向和基金近期表现，200字以内",
  "confidence": 50到95之间的整数
}

分析要求：
- 结合大盘指数涨跌判断整体市场环境
- 分析基金近期净值走势的趋势特征
- 判断资金流向和板块热度
- 给出简洁但有深度的诊断`;

/**
 * 获取 AI 综合诊断
 * @param {Object} fund - 基金完整对象 { code, name, nav, dailyChange, ... }
 * @param {Array} marketIndices - 大盘指数数据
 * @param {Array} recentHistory - 基金近期历史净值 [{ date, nav, dailyChange }]
 * @returns {Promise<Object>} { trend, trendIcon, trendColor, diagnosis, confidence, isAI }
 */
export async function fetchMarketDiagnosis(fund, marketIndices = [], recentHistory = []) {
  if (!fund) return null;

  // 尝试 LLM 分析
  if (isLLMConfigured()) {
    console.log(`[aiService] 🤖 正在调用 DeepSeek 分析综合诊断: ${fund.name}...`);

    const indicesText = (marketIndices.length > 0 ? marketIndices : MARKET_INDICES)
      .map(idx => `${idx.name}: ${idx.value} (${idx.changePercent >= 0 ? '+' : ''}${idx.changePercent}%)`)
      .join('\n');

    const historyText = recentHistory.length > 0
      ? recentHistory.slice(-10).map(h => `${h.date}: 净值${h.nav} 涨跌${h.dailyChange >= 0 ? '+' : ''}${h.dailyChange}%`).join('\n')
      : '暂无历史数据';

    const userPrompt = `请对以下基金进行综合诊断分析：

【基金信息】
基金名称：${fund.name}
基金代码：${fund.code}
基金类型：${fund.type || '未知'}
最新净值：${fund.nav}
今日涨跌幅：${fund.dailyChange >= 0 ? '+' : ''}${fund.dailyChange}%
净值日期：${fund.navDate || '今日'}

【今日大盘指数】
${indicesText}

【近期历史净值（最近10个交易日）】
${historyText}

请结合大盘走势和该基金近期表现，给出综合诊断。`;

    const llmResponse = await callDeepSeek(DIAGNOSIS_SYSTEM_PROMPT, userPrompt);
    const parsed = parseLLMJson(llmResponse);

    if (parsed && parsed.trend && parsed.diagnosis) {
      console.log(`[aiService] ✅ 综合诊断完成: ${parsed.trend}`);
      return {
        trend: parsed.trend,
        trendIcon: parsed.trendIcon || '📊',
        trendColor: parsed.trendColor || 'neutral',
        diagnosis: parsed.diagnosis,
        confidence: Math.min(95, Math.max(50, parseInt(parsed.confidence) || 65)),
        isAI: true,
        updatedAt: new Date().toLocaleString('zh-CN'),
      };
    }

    console.warn('[aiService] ⚠️ 综合诊断 LLM 返回无效，回退到本地分析');
  }

  // 回退到 Mock
  const mockFund = FUND_DATABASE[fund.code] || fund;
  const mockStrategy = getStrategyForFund(mockFund, 0);
  return {
    trend: mockStrategy.trend,
    trendIcon: mockStrategy.trendIcon,
    trendColor: mockStrategy.trendColor,
    diagnosis: mockStrategy.diagnosis,
    confidence: mockStrategy.confidence,
    isAI: false,
    updatedAt: new Date().toLocaleString('zh-CN'),
  };
}

// ============================================================
// 2. 操作建议 — fetchOperationAdvice
// ============================================================

const ADVICE_SYSTEM_PROMPT = `你是一位专业的中国公募基金投资顾问。你需要根据基金走势数据以及用户的个人持仓和交易记录，给出具体的操作建议。

重要：中国基金交易规则是 T+1 确认，每日 15:00 前提交的申购/赎回单在下一个交易日确认。所以你的建议应聚焦于"今日15:00前是否应该操作"。

请严格按照以下 JSON 格式返回（不要包含任何其他文本，只返回纯 JSON）：
{
  "suggestion": "加仓买入|持有等待|观望等待|减仓止盈|减仓止损",
  "suggestionDetail": "具体的操作建议和详细理由，包含金额或比例建议，250字以内",
  "riskLevel": "低|中|高",
  "confidence": 50到95之间的整数
}

分析要求：
- 综合考虑当前基金走势和用户已有仓位
- 如果用户亏损较大，需谨慎建议是否止损
- 如果用户盈利丰厚，需提示止盈风险
- 建议要具体可执行，包含金额比例
- 结合交易频率判断用户风格（频繁交易 vs 长期持有）`;

/**
 * 获取 AI 操作建议
 * @param {Object} fund - 基金完整对象
 * @param {Object} position - 持仓数据 { totalShares, costPrice, currentValue, holdingProfit, holdingProfitRate, ... }
 * @param {Array} transactions - 该基金的交易记录（最近的）
 * @param {Array} marketIndices - 大盘指数
 * @param {Array} recentHistory - 近期历史净值
 * @returns {Promise<Object>} { suggestion, suggestionDetail, riskLevel, confidence, isAI }
 */
export async function fetchOperationAdvice(fund, position = null, transactions = [], marketIndices = [], recentHistory = []) {
  if (!fund) return null;

  const hasPosition = position && position.totalShares > 0;
  const costPrice = position?.costPrice || 0;
  const profitRate = costPrice > 0
    ? ((fund.nav - costPrice) / costPrice) * 100
    : 0;

  // 尝试 LLM 分析
  if (isLLMConfigured()) {
    console.log(`[aiService] 🤖 正在调用 DeepSeek 分析操作建议: ${fund.name}...`);

    const indicesText = (marketIndices.length > 0 ? marketIndices : MARKET_INDICES)
      .map(idx => `${idx.name}: ${idx.value} (${idx.changePercent >= 0 ? '+' : ''}${idx.changePercent}%)`)
      .join('\n');

    const historyText = recentHistory.length > 0
      ? recentHistory.slice(-10).map(h => `${h.date}: 净值${h.nav} 涨跌${h.dailyChange >= 0 ? '+' : ''}${h.dailyChange}%`).join('\n')
      : '暂无历史数据';

    // 持仓信息
    let positionText = '用户当前无持仓';
    if (hasPosition) {
      positionText = `持有份额：${position.totalShares.toFixed(2)} 份
持仓成本价：${costPrice.toFixed(4)}
当前市值：¥${position.currentValue.toFixed(2)}
持有收益：¥${position.holdingProfit.toFixed(2)} (${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%)
总投入本金：¥${position.totalInvested.toFixed(2)}
已实现收益：¥${(position.realizedProfit || 0).toFixed(2)}`;
    }

    // 最近交易记录（最多 5 条）
    const recentTxs = transactions
      .filter(tx => tx.fundCode === fund.code)
      .sort((a, b) => new Date(b.orderTime) - new Date(a.orderTime))
      .slice(0, 5);

    let tradeText = '暂无交易记录';
    if (recentTxs.length > 0) {
      tradeText = recentTxs.map(tx => {
        const date = new Date(tx.orderTime).toLocaleDateString('zh-CN');
        if (tx.type === 'buy') {
          return `${date} 买入 ¥${tx.amount} → ${tx.shares}份 @净值${tx.nav}`;
        } else {
          return `${date} 卖出 ${tx.shares}份 @净值${tx.nav} → 到账¥${tx.netAmount}`;
        }
      }).join('\n');
    }

    const now = new Date();
    const hour = now.getHours();
    const isTradingTime = hour < 15 && now.getDay() > 0 && now.getDay() < 6;

    const userPrompt = `请根据以下信息，给出今日操作建议：

【基金信息】
基金名称：${fund.name}
基金代码：${fund.code}
最新净值：${fund.nav}
今日涨跌幅：${fund.dailyChange >= 0 ? '+' : ''}${fund.dailyChange}%

【大盘指数】
${indicesText}

【近期净值走势】
${historyText}

【我的持仓情况】
${positionText}

【最近交易记录】
${tradeText}

【时间信息】
当前时间：${now.toLocaleString('zh-CN')}
${isTradingTime ? '⚠️ 当前处于交易时间内（15:00前），操作可今日提交' : '当前已过交易时间（15:00后），操作将于下一个交易日处理'}
止盈线：+${ALERT_THRESHOLDS.takeProfit}%
止损线：${ALERT_THRESHOLDS.stopLoss}%

请给出今日15:00前的具体操作建议。`;

    const llmResponse = await callDeepSeek(ADVICE_SYSTEM_PROMPT, userPrompt);
    const parsed = parseLLMJson(llmResponse);

    if (parsed && parsed.suggestion && parsed.suggestionDetail) {
      console.log(`[aiService] ✅ 操作建议完成: ${parsed.suggestion}`);
      return {
        suggestion: parsed.suggestion,
        suggestionDetail: parsed.suggestionDetail,
        riskLevel: parsed.riskLevel || '中',
        confidence: Math.min(95, Math.max(50, parseInt(parsed.confidence) || 60)),
        isAI: true,
        updatedAt: new Date().toLocaleString('zh-CN'),
      };
    }

    console.warn('[aiService] ⚠️ 操作建议 LLM 返回无效，回退到本地分析');
  }

  // 回退到 Mock
  const mockFund = FUND_DATABASE[fund.code] || fund;
  const mockStrategy = getStrategyForFund(mockFund, costPrice);
  return {
    suggestion: mockStrategy.suggestion,
    suggestionDetail: mockStrategy.suggestionDetail,
    riskLevel: '中',
    confidence: mockStrategy.confidence,
    isAI: false,
    updatedAt: new Date().toLocaleString('zh-CN'),
  };
}

// ============================================================
// 3. 止盈止损提醒 — calcStopAlert（纯本地计算）
// ============================================================

/**
 * 计算止盈止损预警（本地计算，不依赖 LLM）
 * @param {number} profitRate - 当前收益率（%）
 * @param {number} costPrice - 持仓成本
 * @param {number} currentNav - 当前净值
 * @returns {Object} { level, message, thresholds, profitRate, progressPercent }
 */
export function calcStopAlert(profitRate, costPrice = 0, currentNav = 0) {
  const thresholds = ALERT_THRESHOLDS;
  let level = 'normal';
  let message = '收益率在安全范围内，继续持有观察。';

  if (costPrice <= 0) {
    return {
      level: 'no-position',
      message: '暂无持仓，无需止盈止损监控。',
      thresholds,
      profitRate: 0,
      progressPercent: 50,
    };
  }

  // 分级预警判断
  if (profitRate >= thresholds.takeProfit * 1.5) {
    level = 'take-profit';
    message = `🚨 收益率已达 ${profitRate.toFixed(2)}%，大幅超过止盈线 +${thresholds.takeProfit}%！强烈建议分批止盈锁定利润，防止高位回撤。`;
  } else if (profitRate >= thresholds.takeProfit) {
    level = 'take-profit';
    message = `⚠️ 收益率已达 ${profitRate.toFixed(2)}%，触及止盈线 +${thresholds.takeProfit}%，建议考虑分批止盈，至少卖出一半仓位锁定利润。`;
  } else if (profitRate >= thresholds.takeProfit * 0.7) {
    level = 'warning';
    message = `📢 收益率 ${profitRate.toFixed(2)}% 正在接近止盈线 +${thresholds.takeProfit}%，建议密切关注走势，提前制定止盈计划。`;
  } else if (profitRate <= thresholds.stopLoss * 1.5) {
    level = 'stop-loss';
    message = `🚨 亏损已达 ${profitRate.toFixed(2)}%，大幅超过止损线 ${thresholds.stopLoss}%！建议果断止损离场，避免进一步扩大损失。`;
  } else if (profitRate <= thresholds.stopLoss) {
    level = 'stop-loss';
    message = `⚠️ 亏损已达 ${profitRate.toFixed(2)}%，触及止损线 ${thresholds.stopLoss}%，建议考虑减仓或止损，控制风险敞口。`;
  } else if (profitRate <= thresholds.stopLoss * 0.7) {
    level = 'warning';
    message = `📢 亏损 ${profitRate.toFixed(2)}% 正在接近止损线 ${thresholds.stopLoss}%，请密切关注行情变化，做好止损准备。`;
  } else if (profitRate >= 0) {
    message = `✅ 当前盈利 ${profitRate.toFixed(2)}%，收益率在安全范围内，继续持有观察。`;
  } else {
    message = `📊 当前亏损 ${profitRate.toFixed(2)}%，在可接受范围内，建议耐心持有等待反弹。`;
  }

  // 计算当前收益率在止损→止盈区间中的位置百分比（用于进度条可视化）
  const range = thresholds.takeProfit - thresholds.stopLoss; // e.g. 10 - (-5) = 15
  const progressPercent = Math.max(0, Math.min(100,
    ((profitRate - thresholds.stopLoss) / range) * 100
  ));

  return {
    level,
    message,
    thresholds,
    profitRate: parseFloat(profitRate.toFixed(2)),
    progressPercent: parseFloat(progressPercent.toFixed(1)),
  };
}

// ============================================================
// 大盘指数获取（保持不变）
// ============================================================

/**
 * 获取大盘指数概览
 * @returns {Promise<Array>} 大盘指数数据
 */
export async function fetchMarketOverview() {
  return new Promise(async (resolve) => {
    try {
      const url = 'https://qt.gtimg.cn/q=s_sh000001,s_sz399001,s_sz399300,s_sz399006';
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const lines = text.split(';').filter(line => line.includes('='));
        
        const names = ['上证指数', '深证成指', '沪深300', '创业板指'];
        const mappedIndices = lines.map((line, index) => {
          const match = line.match(/"(.*?)"/);
          if (match && match[1]) {
            const parts = match[1].split('~');
            if (parts.length >= 6) {
              return {
                code: parts[2] || `IDX${index}`,
                name: names[index] || parts[1],
                value: parseFloat(parts[3]) || 0,
                change: parseFloat(parts[4]) || 0,
                changePercent: parseFloat(parts[5]) || 0
              };
            }
          }
          return null;
        }).filter(Boolean);
        
        if (mappedIndices.length > 0) {
          resolve(mappedIndices);
          return;
        }
      }
    } catch (e) {
      console.warn('[aiService] 获取真实大盘指数失败，回退到 Mock 数据', e);
    }
    
    // 如果获取失败，回退到 Mock 数据
    setTimeout(() => {
      const indices = MARKET_INDICES.map((index) => {
        const fluctuation = (Math.random() - 0.5) * 0.002;
        const newValue = index.value * (1 + fluctuation);
        const newChange = newValue - (index.value - index.change);
        return {
          ...index,
          value: parseFloat(newValue.toFixed(2)),
          change: parseFloat(newChange.toFixed(2)),
          changePercent: parseFloat(
            ((newChange / (index.value - index.change)) * 100).toFixed(2)
          ),
        };
      });
      resolve(indices);
    }, 200);
  });
}

// ============================================================
// 4. 组合总览策略 — fetchOverviewStrategy
// ============================================================

const OVERVIEW_SYSTEM_PROMPT = `你是一位管理多只公募基金组合的资深投资顾问。用户给了你一份组合总览数据，包含大盘指数走势、板块热度、以及组合内每只基金近期的量化指标。

请基于这些数据给出可执行的组合策略建议。

严格按以下 JSON 格式返回（只返回纯 JSON，不要任何额外文字、不要 markdown 代码块）：
{
  "verdict": "一句话仓位结论，14字以内，例如：趋势持有，逢跌加仓",
  "verdictIcon": "单个 emoji",
  "verdictColor": "rise|fall|neutral",
  "confidence": 55到92之间的整数,
  "summary": "组合层面的总体策略，150-220字，需说明为什么这样配置",
  "marketView": "大盘与板块环境判断，80-120字",
  "allocations": [
    {"code": "基金代码", "name": "基金名称", "action": "加仓|持有|减仓|观望", "weight": "如 上调5%~10%", "reason": "50字以内，必须引用给出的数字"}
  ],
  "risks": ["风险点1", "风险点2", "风险点3"]
}

硬性要求：
1. allocations 必须覆盖用户提供的每一只基金，不得遗漏，顺序按综合评分从高到低。
2. reason 必须引用给出的具体数字（收益率、相关性、回撤、评分等），不要空泛表述。
3. verdictColor 中 rise 表示偏乐观、fall 表示偏谨慎、neutral 表示中性。
4. 不得给出保本、必涨等确定性承诺。
5. 不要输出免责声明，前端已有固定文案。`;

/**
 * 生成组合总览策略
 * 有 API Key 时走 DeepSeek，否则/失败时回退本地启发式策略
 *
 * @param {Object} overview - buildOverview() 的返回值
 * @returns {Promise<Object>} { verdict, verdictIcon, verdictColor, confidence, summary, marketView, allocations, risks, isAI, updatedAt }
 */
export async function fetchOverviewStrategy(overview) {
  if (!overview || !overview.hasData) {
    return buildLocalOverviewStrategy(overview);
  }

  if (!isLLMConfigured()) {
    console.log('[aiService] 未配置 DeepSeek Key，总览策略使用本地引擎');
    return buildLocalOverviewStrategy(overview);
  }

  console.log('[aiService] 🤖 正在调用 DeepSeek 生成组合总览策略...');

  const { portfolio, benchmark, funds, sector, dates } = overview;

  const benchmarkText = benchmark
    ? `${benchmark.name}：区间收益 ${benchmark.periodReturn >= 0 ? '+' : ''}${benchmark.periodReturn}%，最大回撤 ${benchmark.maxDrawdown}%，年化波动 ${benchmark.volatility}%`
    : '大盘指数数据缺失';

  const sectorText = sector.list.length
    ? sector.list
        .slice(0, 6)
        .map(
          (s) =>
            `${s.name}：${s.change >= 0 ? '+' : ''}${s.change}%，主力净流入 ${(s.mainInflow / 1e8).toFixed(2)}亿`
        )
        .join('\n')
    : '板块数据缺失';

  const fundText = funds
    .map(
      (f) =>
        `- ${f.name}（${f.code}）：近${dates.length}日 ${f.periodReturn >= 0 ? '+' : ''}${f.periodReturn}%，` +
        `相对基准超额 ${f.excess >= 0 ? '+' : ''}${f.excess} 个百分点，与大盘相关性 ${f.corr}，` +
        `最大回撤 ${f.maxDrawdown}%，年化波动 ${f.volatility}%，综合评分 ${f.score}/100`
    )
    .join('\n');

  const userPrompt = `请为以下基金组合生成策略建议。

【观察窗口】最近 ${dates.length} 个交易日（${dates[0]} 至 ${dates[dates.length - 1]}）

【大盘基准】
${benchmarkText}

【板块热度】整体${sector.label}，板块涨幅均值 ${sector.avgChange >= 0 ? '+' : ''}${sector.avgChange}%，主力净流入合计 ${(sector.netInflow / 1e8).toFixed(2)}亿
领涨板块：
${sectorText}

【组合整体】
区间收益 ${portfolio.periodReturn >= 0 ? '+' : ''}${portfolio.periodReturn}%，相对基准超额 ${portfolio.excess >= 0 ? '+' : ''}${portfolio.excess} 个百分点，与大盘相关性 ${portfolio.corr}，最大回撤 ${portfolio.maxDrawdown}%，年化波动 ${portfolio.volatility}%

【组合内各基金】
${fundText}

请结合大盘走势、板块热度与各基金近${dates.length}日表现，给出组合层面的配置建议。`;

  const llmResponse = await callDeepSeek(OVERVIEW_SYSTEM_PROMPT, userPrompt, 1600);
  const parsed = parseLLMJson(llmResponse);

  if (parsed && parsed.verdict && parsed.summary && Array.isArray(parsed.allocations) && parsed.allocations.length > 0) {
    const allocations = parsed.allocations
      .filter((a) => a && (a.code || a.name))
      .map((a) => {
        const matched = funds.find((f) => f.code === a.code || f.name === a.name);
        return {
          code: a.code || matched?.code || '',
          name: a.name || matched?.name || '',
          action: a.action || '持有',
          weight: a.weight || '维持现有仓位',
          reason: a.reason || '',
        };
      });

    // 兜底：LLM 漏掉的基金用本地结论补齐，保证每只基金都有建议
    const local = buildLocalOverviewStrategy(overview);
    const covered = new Set(allocations.map((a) => a.code).filter(Boolean));
    const merged = [
      ...allocations,
      ...local.allocations.filter((a) => !covered.has(a.code)),
    ];

    console.log(`[aiService] ✅ 总览策略生成完成：${parsed.verdict}`);

    return {
      verdict: String(parsed.verdict).slice(0, 40),
      verdictIcon: parsed.verdictIcon || '📊',
      verdictColor: ['rise', 'fall', 'neutral'].includes(parsed.verdictColor)
        ? parsed.verdictColor
        : 'neutral',
      confidence: Math.min(92, Math.max(50, parseInt(parsed.confidence, 10) || 68)),
      summary: String(parsed.summary).slice(0, 600),
      marketView: String(parsed.marketView || '').slice(0, 400),
      allocations: merged,
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3).map(String) : local.risks,
      isAI: true,
      updatedAt: new Date().toLocaleString('zh-CN'),
    };
  }

  console.warn('[aiService] ⚠️ 总览策略 LLM 返回无效，回退本地引擎');
  return buildLocalOverviewStrategy(overview);
}

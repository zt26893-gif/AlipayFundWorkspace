/**
 * visionService — 从交易截图识别买卖信息
 *
 * 走「设置 → AI 模型接口」里配置的任意 OpenAI 兼容视觉模型，
 * 请求经由本地服务端 /api/llm 转发（避免跨域，也顺便藏住 Key）。
 */

import useSettingsStore from '../store/useSettingsStore';

export function getVisionConfig() {
  const ai = useSettingsStore.getState().ai || {};
  if (!ai.baseUrl || !ai.apiKey || !ai.visionModel) return null;
  return ai;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const PROMPT = `你是基金交易截图识别助手。请从这张截图里找出「买入 / 卖出 / 转换」这笔交易，只输出一个 JSON，不要任何解释或 markdown。
字段要求：
{
  "type": "buy" | "sell" | "convert",
  "fundCode": "6 位基金代码",
  "fundName": "基金名称",
  "amount": 买入或卖出的金额（数字，卖出若只有份额则留 null）,
  "shares": 份额（数字，可 null）,
  "nav": 成交净值（数字，可 null）,
  "orderTime": "YYYY-MM-DD HH:mm（下单/交易时间）",
  "confirmDate": "YYYY-MM-DD 或 null",
  "confidence": 0 到 1 的数字
}
识别不出就把该字段设为 null，不要编造。`;

export async function recognizeTradeImage(file) {
  const ai = getVisionConfig();
  if (!ai) {
    const err = new Error('NO_VISION_CONFIG');
    err.code = 'NO_VISION_CONFIG';
    throw err;
  }

  const dataUrl = await fileToDataUrl(file);
  const baseUrl = ai.baseUrl.replace(/\/+$/, '');
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${baseUrl}/chat/completions`,
      headers: { Authorization: `Bearer ${ai.apiKey}` },
      body: {
        model: ai.visionModel,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`识别服务返回 HTTP ${res.status} ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((c) => c.text || '').join('\n')
    : String(content || '');
  const parsed = parseJsonLoose(text);
  if (!parsed) throw new Error('模型返回内容无法解析为 JSON');
  return parsed;
}

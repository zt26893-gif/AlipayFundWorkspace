/**
 * JSONP 数据解析工具
 * 天天基金的估值接口返回 JSONP 格式，如：
 *   jsonpgz({"fundcode":"000001","name":"华夏成长混合",...});
 * 本工具使用正则提取花括号内的 JSON 并解析
 */

/**
 * 从 JSONP 响应文本中提取并解析 JSON 数据
 * @param {string} jsonpText - JSONP 格式的原始文本
 * @returns {Object|null} 解析后的 JSON 对象，解析失败返回 null
 *
 * @example
 * const text = 'jsonpgz({"fundcode":"000001","name":"华夏成长"});';
 * const data = parseJsonp(text);
 * // => { fundcode: "000001", name: "华夏成长" }
 */
export function parseJsonp(jsonpText) {
  if (!jsonpText || typeof jsonpText !== 'string') return null;

  try {
    // 使用正则提取第一个 {...} 内容（包括嵌套）
    const match = jsonpText.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (err) {
    console.error('[parseJsonp] 解析失败:', err.message);
    console.error('[parseJsonp] 原始文本:', jsonpText.substring(0, 200));
    return null;
  }
}

/**
 * 通过 Vite 代理请求天天基金估值接口并解析
 * @param {string} fundCode - 6位基金代码
 * @returns {Promise<Object|null>} 解析后的基金实时数据
 *
 * 返回字段说明：
 *   fundcode  - 基金代码
 *   name      - 基金名称
 *   jzrq      - 净值日期（如 "2024-01-15"）
 *   dwjz      - 单位净值（上一交易日收盘）
 *   gsz       - 估算净值（实时估值）
 *   gszzl     - 估算涨跌幅（百分比，如 "1.25"）
 *   gztime    - 估值更新时间（如 "2024-01-16 15:00"）
 */
export async function fetchFundGz(fundCode) {
  try {
    // 通过 Vite proxy 转发，避免跨域
    const url = `/api/fundgz/js/${fundCode}.js?rt=${Date.now()}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[fetchFundGz] HTTP ${response.status} for fund ${fundCode}`);
      return null;
    }

    const text = await response.text();
    const data = parseJsonp(text);

    if (!data) {
      console.error(`[fetchFundGz] 无法解析基金 ${fundCode} 的数据`);
      return null;
    }

    return data;
  } catch (err) {
    console.error(`[fetchFundGz] 请求基金 ${fundCode} 失败:`, err.message);
    return null;
  }
}

/**
 * 基金数据服务层
 * 使用东方财富搜索接口 + 东方财富历史净值接口
 * 支持搜索并获取任意真实基金（如 022364、024239 等）
 */

import { FUND_DATABASE } from '../data/mockData';
import { fetchFundGz, parseJsonp } from '../utils/jsonpParser';

/**
 * 从东方财富搜索联想 API 获取在线基金数据
 * @param {string} keyword - 代码/名称/拼音
 * @returns {Promise<Array>} 匹配结果
 */
async function fetchOnlineSuggest(keyword) {
  try {
    const url = `/api/fundsuggest/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.Datas)) return [];

    return data.Datas
      .filter((item) => item.CODE && (item.CATEGORY === 700 || item.CATEGORYDESC === '基金' || item.FundBaseInfo))
      .map((item) => {
        const rawName = item.FundBaseInfo?.SHORTNAME || item.NAME || '';
        const cleanName = rawName.replace(/<[^>]+>/g, '');
        return {
          code: item.CODE,
          name: cleanName || `基金(${item.CODE})`,
          type: item.FundBaseInfo?.FTYPE || item.CATEGORYDESC || '未知',
          company: item.FundBaseInfo?.JJGS || '',
          nav: parseFloat(item.FundBaseInfo?.DWJZ) || 0,
          navDate: item.FundBaseInfo?.FSRQ || '',
          isLive: true,
        };
      });
  } catch (err) {
    console.warn('[fetchOnlineSuggest] 请求失败:', err.message);
    return [];
  }
}

/**
 * 根据基金代码获取基金信息
 * 优先从东方财富历史净值 API 获取最新净值，并补充基础属性
 * @param {string} code - 6位基金代码
 * @returns {Promise<Object|null>} 基金信息对象
 */
export async function fetchFundInfo(code) {
  // 1. 尝试从东方财富获取最新真实历史净值
  try {
    const historyLatest = await fetchRealHistory(code, 1);
    if (historyLatest && historyLatest.length > 0) {
      const latest = historyLatest[historyLatest.length - 1]; // 最新的净值记录

      // 获取基金名称、类型、公司信息
      let name = FUND_DATABASE[code]?.name;
      let type = FUND_DATABASE[code]?.type;
      let company = FUND_DATABASE[code]?.company;

      if (!name) {
        // 如果不在 Mock 库中，调用在线 suggest 接口查基金基础信息
        const suggests = await fetchOnlineSuggest(code);
        const hit = suggests.find((item) => item.code === code) || suggests[0];
        if (hit) {
          name = hit.name;
          type = hit.type || type;
          company = hit.company || company;
        }
      }

      const mapped = {
        code,
        name: name || `基金(${code})`,
        type: type || '未知',
        company: company || '',
        nav: latest.nav,
        gsz: latest.nav,
        accNav: latest.accNav,
        dailyChange: latest.dailyChange,
        navDate: latest.date,
        gzTime: latest.date,
        isLive: true,
      };

      console.log(`[fundService] ✅ 真实数据: ${mapped.name}(${mapped.code}) 净值:${mapped.nav} 涨跌:${mapped.dailyChange}% 日期:${mapped.navDate}`);
      return mapped;
    }
  } catch (e) {
    console.warn('[fundService] 真实数据获取失败:', e);
  }

  // 2. 备用：尝试天天基金估值接口
  const liveData = await fetchFundGz(code);
  if (liveData) {
    return {
      code: liveData.fundcode,
      name: liveData.name,
      type: FUND_DATABASE[code]?.type || '未知',
      company: FUND_DATABASE[code]?.company || '',
      nav: parseFloat(liveData.dwjz) || 0,
      gsz: parseFloat(liveData.gsz) || 0,
      accNav: parseFloat(liveData.dwjz) || 0,
      dailyChange: parseFloat(liveData.gszzl) || 0,
      navDate: liveData.jzrq || '',
      gzTime: liveData.gztime || '',
      isLive: true,
    };
  }

  // 3. 回退到 Mock 数据
  console.log(`[fundService] ⚠️ 真实接口无数据，使用 Mock 数据: ${code}`);
  const mockFund = FUND_DATABASE[code];
  return mockFund ? { ...mockFund, isLive: false } : null;
}

/**
 * 计算时间周期对应的数据条数
 * @param {'1w'|'1m'|'3m'|'1y'} period
 * @returns {number} 需要的交易日天数
 */
function periodToPageSize(period) {
  switch (period) {
    case '1w': return 7;
    case '1m': return 25;
    case '3m': return 70;
    case '1y': return 260;
    default: return 70;
  }
}

/**
 * 从东方财富获取真实历史净值数据（支持多页并行获取以绕过 20 条单页限制）
 * @param {string} code - 基金代码
 * @param {number} pageSize - 总共需要的数据条数
 * @returns {Promise<Array|null>} 历史净值数组或 null
 */
async function fetchRealHistory(code, pageSize) {
  try {
    const recordsPerPage = 20;
    const pagesNeeded = Math.ceil(pageSize / recordsPerPage);
    
    console.log(`[fundService] 📡 开始获取 ${code} 的历史净值，需要 ${pageSize} 条记录，共分 ${pagesNeeded} 页请求`);

    const promises = [];
    for (let page = 1; page <= pagesNeeded; page++) {
      const url = `/api/eastmoney/f10/lsjz?callback=jQuery&fundCode=${code}&pageIndex=${page}&pageSize=${recordsPerPage}&startDate=&endDate=`;
      promises.push(
        fetch(url)
          .then(async (res) => {
            if (!res.ok) {
              console.warn(`[fetchRealHistory] 基金 ${code} 页码 ${page} 请求失败, 状态: ${res.status}`);
              return [];
            }
            const text = await res.text();
            const parsed = parseJsonp(text);
            
            if (parsed && parsed.ErrCode !== 0) {
              console.warn(`[fetchRealHistory] 东方财富接口返回错误: ${parsed.ErrMsg} (代码: ${parsed.ErrCode})`);
            }
            
            return parsed?.Data?.LSJZList || [];
          })
          .catch((err) => {
            console.error(`[fetchRealHistory] 基金 ${code} 页码 ${page} 请求异常:`, err.message);
            return [];
          })
      );
    }

    const results = await Promise.all(promises);
    
    // 合并多页数据
    const allRecords = results.flat();
    
    if (allRecords.length === 0) {
      console.warn(`[fundService] ⚠️ 基金 ${code} 返回的历史记录为空`);
      return null;
    }

    // 转换为应用内部格式，并按日期正序排列
    const history = allRecords
      .map((item) => ({
        date: item.FSRQ,                          // 净值日期
        nav: parseFloat(item.DWJZ) || 0,          // 单位净值
        accNav: parseFloat(item.LJJZ) || 0,       // 累计净值
        dailyChange: parseFloat(item.JZZZL) || 0, // 日涨跌幅
      }))
      .filter((item) => item.date) // 确保日期有效
      .reverse(); // 从最新反转为最旧排序 -> 最旧到最新排序

    console.log(`[fundService] ✅ 历史数据: ${code} 成功获取 ${history.length} 条记录`);
    return history;
  } catch (err) {
    console.error(`[fetchRealHistory] 请求失败:`, err.message);
    return null;
  }
}

/**
 * 获取指定周期的历史净值数据
 * 优先从东方财富真实 API 获取，失败时回退到 Mock 数据
 * @param {string} code - 基金代码
 * @param {'1w'|'1m'|'3m'|'1y'} period - 时间周期
 * @returns {Promise<Array>} 历史净值数组 [{date, nav, accNav}]
 */
export async function fetchFundHistory(code, period = '3m') {
  const pageSize = periodToPageSize(period);

  // 优先尝试真实 API
  const realHistory = await fetchRealHistory(code, pageSize);
  if (realHistory && realHistory.length > 0) {
    return realHistory;
  }

  // 回退到 Mock 数据
  console.log(`[fundService] ⚠️ 历史接口失败，尝试回退使用 Mock 数据: ${code}`);
  const fund = FUND_DATABASE[code];
  if (!fund || !fund.history) return [];

  const history = fund.history;
  const now = new Date();
  let startDate;

  switch (period) {
    case '1w':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '1m':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3m':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '1y':
    default:
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  return history.filter((item) => new Date(item.date) >= startDate);
}

/**
 * 批量刷新基金池中所有基金的实时数据
 * @param {string[]} codes - 基金代码数组
 * @returns {Promise<Object>} { code: liveData } 的映射
 */
export async function batchRefreshFunds(codes) {
  const results = {};
  const promises = codes.map(async (code) => {
    const fundInfo = await fetchFundInfo(code);
    if (fundInfo) {
      results[code] = {
        nav: fundInfo.nav,
        gsz: fundInfo.gsz,
        dailyChange: fundInfo.dailyChange,
        navDate: fundInfo.navDate,
        gzTime: fundInfo.gzTime,
        isLive: fundInfo.isLive,
      };
    }
  });
  await Promise.all(promises);
  return results;
}

/**
 * 搜索基金（支持代码、名称、拼音联想）
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 匹配的基金列表
 */
export async function searchFund(keyword) {
  if (!keyword || !keyword.trim()) return [];
  const cleanKey = keyword.trim();

  // 1. 在线搜索联想（东方财富 API）
  const onlineResults = await fetchOnlineSuggest(cleanKey);

  // 2. 本地 Mock 数据匹配
  const mockResults = Object.values(FUND_DATABASE)
    .filter(
      (fund) =>
        fund.code.includes(cleanKey) ||
        fund.name.includes(cleanKey) ||
        fund.company.includes(cleanKey)
    )
    .map((f) => ({
      code: f.code,
      name: f.name,
      type: f.type,
      company: f.company,
      isLive: false,
    }));

  // 3. 去重合并（在线搜索结果优先）
  const resultMap = new Map();
  onlineResults.forEach((item) => resultMap.set(item.code, item));
  mockResults.forEach((item) => {
    if (!resultMap.has(item.code)) {
      resultMap.set(item.code, item);
    }
  });

  return Array.from(resultMap.values());
}

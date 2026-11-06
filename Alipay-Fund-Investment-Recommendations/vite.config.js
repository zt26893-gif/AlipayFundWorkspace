import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 本项目放在 USB 移动盘（J:）时，fs.watch 会偶发 EBUSY 并直接崩掉 dev server，
    // 改用轮询监听规避。若迁到内置硬盘可删掉 watch 整段。
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      // 本地后端（server/index.mjs）：开发时把状态接口转发过去，和生产共用同一个数据库
      '/api/state': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/api/export': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/api/import': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      // 东方财富基金排行（推荐买入用）
      '/api/fundrank': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/fundrank/, ''),
        headers: {
          Referer: 'https://fund.eastmoney.com/data/fundranking.html',
        },
      },
      // 东方财富基金搜索联想接口代理
      '/api/fundsuggest': {
        target: 'https://fundsuggest.eastmoney.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/fundsuggest/, ''),
        headers: {
          Referer: 'https://fund.eastmoney.com/',
        },
      },
      // 天天基金实时估值接口代理（解决跨域）
      '/api/fundgz': {
        target: 'http://fundgz.1234567.com.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fundgz/, ''),
      },
      // 天天基金历史净值接口代理（解决跨域）
      '/api/eastmoney': {
        target: 'https://api.fund.eastmoney.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/eastmoney/, ''),
        headers: {
          Referer: 'https://fund.eastmoney.com/',
        },
      },
      // 东方财富历史K线代理（指数走势，必须是 push2his 主机）
      // 路径不能写成 /api/push2his，否则会先命中上面的 /api/push2 前缀
      '/api/indexkline': {
        target: 'https://push2his.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/indexkline/, ''),
        headers: {
          Referer: 'https://quote.eastmoney.com/',
        },
      },
      // 东方财富大盘实时指数代理
      '/api/push2': {
        target: 'http://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/push2/, ''),
        headers: {
          Referer: 'http://quote.eastmoney.com/',
        },
      },
      // DeepSeek API 代理（隐藏 API Key，解决跨域）
      '/api/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
        secure: true,
      },
    },
  },
})

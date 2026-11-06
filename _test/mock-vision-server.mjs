/** 模拟视觉模型接口，用于本地验证截图识别链路 */
import http from 'node:http';

const reply = {
  type: 'buy',
  fundCode: '013566',
  fundName: '华夏军工安全混合C',
  amount: 250.5,
  shares: 118.16,
  nav: 2.12,
  orderTime: '2026-11-06 14:20',
  confirmDate: '2026-11-09',
  confidence: 0.93,
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'mock',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(reply) },
            finish_reason: 'stop',
          },
        ],
      })
    );
  });
});

server.listen(8797, '127.0.0.1', () => console.log('mock vision on 8797'));

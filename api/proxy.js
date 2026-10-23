// Vercel Serverless Function · DeepSeek 代理
// 共享核心见 ./proxy-core.js（Cloudflare 版本复用同一份逻辑）
// 环境变量：DEEPSEEK_API_KEY（可选，推荐）、UPSTREAM_BASE（可选）、PROXY_TOKEN（可选）、ALLOWED_ORIGINS（可选）
const { proxyRequest } = require('./proxy-core.js');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // 把 Node 原始请求转换成 Web Request
  const chunks = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = new Headers();
  Object.entries(req.headers).forEach(([k, v]) => {
    if (Array.isArray(v)) headers.set(k, v.join(', '));
    else if (v != null) headers.set(k, String(v));
  });

  const request = new Request('https://local' + url.pathname + url.search, {
    method: req.method,
    headers,
    body
  });

  const response = await proxyRequest(request, {
    env: process.env,
    pathname: url.pathname
  });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  // 流式响应逐块转发，保证浏览器端"逐字显示"
  if (response.body && /event-stream/i.test(response.headers.get('Content-Type') || '')) {
    res.setHeader('Cache-Control', 'no-store, no-transform');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
    return;
  }
  res.end(Buffer.from(await response.arrayBuffer()));
};

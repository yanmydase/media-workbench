// 共享代理核心：Vercel Serverless 与 Cloudflare Pages Functions 共用同一套逻辑
// - 只允许 POST /api/v1/chat/completions 与 GET /api/v1/models
// - 服务端可选注入 DEEPSEEK_API_KEY（env），否则透传浏览器的 Authorization
// - 可选 PROXY_TOKEN（对应请求头 X-Proxy-Token）
// - 流式（text/event-stream）原样透传

const ALLOWED = /^\/v1\/(chat\/completions|models)$/;
const MAX_BODY = 1024 * 1024;

export function resolveProxyPath(pathname) {
  // /api/v1/chat/completions 与 /api/chat/completions 都映射到上游 /v1/chat/completions
  const p = String(pathname || '').replace(/^\/api/, '');
  if (p.startsWith('/v1/')) return p;
  return '/v1' + (p.startsWith('/') ? p : '/' + p);
}

export function corsHeaders(origin) {
  // 同源部署时浏览器不会带 Origin；跨域调用只允许白名单（env ALLOWED_ORIGINS，逗号分隔）
  if (!origin) return {};
  const raw = typeof process !== 'undefined' && process.env ? process.env.ALLOWED_ORIGINS : '';
  const list = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return {};
}

/**
 * 通用代理实现
 * @param {Request} request Web 标准 Request
 * @param {{env?: object, pathname: string}} ctx
 */
export async function proxyRequest(request, ctx) {
  const env = (ctx && ctx.env) || {};
  const pathname = (ctx && ctx.pathname) || new URL(request.url).pathname;
  const cors = corsHeaders(request.headers.get('Origin') || '');

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Proxy-Token',
        'Access-Control-Max-Age': '600'
      }
    });
  }

  const upstreamPath = resolveProxyPath(pathname);
  if (!ALLOWED.test(upstreamPath)) {
    return json(404, { error: { message: `代理只允许 /api/v1/chat/completions 与 /api/v1/models（收到 ${upstreamPath}）` } }, cors);
  }
  if (env.PROXY_TOKEN && request.headers.get('X-Proxy-Token') !== env.PROXY_TOKEN) {
    return json(401, { error: { message: '代理访问口令错误（X-Proxy-Token）' } }, cors);
  }

  const bodyText = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
  if (bodyText && new Blob([bodyText]).size > MAX_BODY) {
    return json(413, { error: { message: '请求体过大（上限 1MB）' } }, cors);
  }

  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
  const incomingKey = request.headers.get('Authorization');
  if (env.DEEPSEEK_API_KEY) headers.Authorization = 'Bearer ' + env.DEEPSEEK_API_KEY;
  else if (incomingKey) headers.Authorization = incomingKey;

  const base = String(env.UPSTREAM_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
  let upstream;
  try {
    upstream = await fetch(base + upstreamPath, {
      method: request.method,
      headers,
      body: bodyText || undefined
    });
  } catch (err) {
    return json(502, { error: { message: '上游连接失败：' + err.message } }, cors);
  }

  const respHeaders = {
    ...cors,
    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    'Cache-Control': 'no-store'
  };
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

function json(status, payload, extra) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(extra || {}) }
  });
}

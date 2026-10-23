// Cloudflare Pages Function · DeepSeek 代理
// 与 Vercel 版共用 ../api/proxy-core.js
// 环境变量（Pages 项目设置 → Variables）：DEEPSEEK_API_KEY（可选）、UPSTREAM_BASE、PROXY_TOKEN、ALLOWED_ORIGINS
import { proxyRequest } from '../../api/proxy-core.js';

export async function onRequest(context) {
  const { request, env } = context;
  const pathname = new URL(request.url).pathname;
  return proxyRequest(request, { env: env || {}, pathname });
}

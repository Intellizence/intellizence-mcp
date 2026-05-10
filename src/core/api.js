import { getRequestContext } from './requestContext.js';

export async function postJson(path, body) {
  const ctx = getRequestContext();
  const apiKeyFromCtx = ctx && typeof ctx.apiKey === 'string' ? ctx.apiKey.trim() : '';
  const apiKeyFromEnv = String(process.env.INTELLIZENCE_API_KEY || '').trim();
  const apiKey = apiKeyFromCtx || apiKeyFromEnv;

  const baseUrl = String(process.env.INTELLIZENCE_API_BASE_URL || 'https://connect.intellizence.com')
    .trim()
    .replace(/\/$/, '');

  const userEmail = ctx && ctx.user && typeof ctx.user.email === 'string' ? ctx.user.email.trim() : '';
  const userSub = ctx && ctx.user && typeof ctx.user.sub === 'string' ? ctx.user.sub.trim() : '';

  if (!apiKey && !userEmail) {
    throw new Error('Missing INTELLIZENCE_API_KEY and x-user-email (no authentication available for downstream API call)');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-intellizence-mcp': '1',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...(userEmail ? { 'x-intellizence-user-email': userEmail } : {}),
      ...(userSub ? { 'x-intellizence-user-sub': userSub } : {}),
      ...(userEmail ? { 'x-user-email': userEmail } : {}),
      ...(userSub ? { 'x-user-sub': userSub } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Intellizence API request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
    );
  }

  return await response.json();
}

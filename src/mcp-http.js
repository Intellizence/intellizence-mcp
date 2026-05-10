import express from 'express';
import { randomUUID } from 'node:crypto';

import { buildMcpServer } from './core/app.js';
import config from './core/config.js';
import { runWithRequestContext } from './core/requestContext.js';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from 'jose';

function isInitializeRequest(body) {
  return Boolean(body && typeof body === 'object' && body.jsonrpc === '2.0' && body.method === 'initialize');
}

let _auth0Cache = {
  issuer: null,
  audience: null,
  jwks: null,
  jwksUrl: null,
};

function isMcpAuthDisabled() {
  return Boolean(config && config.mcpAuth && config.mcpAuth.disableAuth);
}

function jsonRpcAuthError(res, message) {
  return res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: message || 'Unauthorized'
    },
    id: null
  });
}

function jsonRpcForbiddenError(res, message) {
  return res.status(403).json({
    jsonrpc: '2.0',
    error: {
      code: -32003,
      message: message || 'Forbidden'
    },
    id: null
  });
}

function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAuth0Config() {
  const cfg = (config && config.auth0) ? config.auth0 : {};

  const domain = String(process.env.AUTH0_DOMAIN || cfg.domain || '').trim();
  const audience = String(process.env.AUTH0_AUDIENCE || cfg.audience || '').trim();

  const envRequired = process.env.MCP_REQUIRED_SCOPES;
  const requiredScopes = normalizeScopes(envRequired != null ? envRequired : cfg.requiredScopes);

  return {
    domain,
    audience,
    requiredScopes,
  };
}

function extractScopesFromClaims(payload) {
  const scopes = new Set();

  if (payload && typeof payload.scope === 'string') {
    for (const s of payload.scope.split(/\s+/).map((x) => x.trim()).filter(Boolean)) {
      scopes.add(s);
    }
  }

  const perms = payload && payload.permissions;
  if (Array.isArray(perms)) {
    for (const p of perms) {
      if (typeof p === 'string' && p.trim()) scopes.add(p.trim());
    }
  }

  return Array.from(scopes);
}

function isAuthDebugEnabled() {
  if (process.env.MCP_DEBUG_AUTH != null) {
    const v = String(process.env.MCP_DEBUG_AUTH || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  return Boolean(config && config.debugAuth);
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return '"[unserializable]"';
  }
}

function redactToken(token) {
  const t = String(token || '');
  if (t.length <= 16) return '[redacted]';
  return `${t.slice(0, 8)}...${t.slice(-8)}`;
}

function getUserEmailFromClaims(payload) {
  if (!payload || typeof payload !== 'object') return '';

  if (typeof payload.email === 'string' && payload.email.trim()) {
    return payload.email.trim();
  }

  const namespacedEmail = payload['https://mcp.intellizence.com/email'];
  if (typeof namespacedEmail === 'string' && namespacedEmail.trim()) {
    return namespacedEmail.trim();
  }

  return '';
}

function getBearerAuthHeader(req) {
  return String(
    req.headers.authorization ||
      req.headers['x-forwarded-authorization'] ||
      req.headers['x-authorization'] ||
      ''
  ).trim();
}

async function verifyAuth0Token(req) {
  const authHeader = getBearerAuthHeader(req);
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, message: 'Unauthorized: Missing Bearer token' };
  }

  const token = authHeader.slice('bearer '.length).trim();
  if (!token) {
    return { ok: false, message: 'Unauthorized: Missing Bearer token' };
  }

  if (isAuthDebugEnabled()) {
    process.stderr.write(`Auth debug: bearer=${redactToken(token)}\n`);
  }

  try {
    const hdr = decodeProtectedHeader(token);

    if (isAuthDebugEnabled()) {
      process.stderr.write(`Auth debug: jwt.header=${safeStringify(hdr)}\n`);
    }

    if (hdr && typeof hdr.enc === 'string' && hdr.enc.trim()) {
      return {
        ok: false,
        message:
          'Unauthorized: Encrypted (JWE) token not supported. Configure Auth0 to issue signed JWT (JWS/RS256) access tokens and send that Bearer token.',
      };
    }

    const parts = String(token).split('.');
    if (parts.length === 5) {
      return {
        ok: false,
        message:
          'Unauthorized: Encrypted (JWE) token not supported. Configure Auth0 to issue signed JWT (JWS/RS256) access tokens and send that Bearer token.',
      };
    }
  } catch (e) {
    if (isAuthDebugEnabled()) {
      process.stderr.write(`Auth debug: jwt.header_precheck_error=${e?.message ?? e}\n`);
    }
  }

  const { domain, audience, requiredScopes } = getAuth0Config();
  if (!domain || !audience) {
    return { ok: false, message: 'Server misconfigured: AUTH0_DOMAIN and AUTH0_AUDIENCE are required' };
  }

  const issuer = domain.startsWith('http') ? domain.replace(/\/$/, '') : `https://${domain.replace(/\/$/, '')}`;

  if (_auth0Cache.issuer !== issuer || _auth0Cache.audience !== audience || !_auth0Cache.jwks) {
    const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
    _auth0Cache = {
      issuer,
      audience,
      jwksUrl,
      jwks: createRemoteJWKSet(jwksUrl),
    };
  }

  const jwks = _auth0Cache.jwks;

  const debug = isAuthDebugEnabled();

  try {
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: _auth0Cache.issuer + '/',
      audience: _auth0Cache.audience,
    });

    const scopes = extractScopesFromClaims(payload);

    if (isAuthDebugEnabled()) {
      process.stderr.write(`Auth debug: scopes=${JSON.stringify(scopes)}\n`);
    }

    if (requiredScopes.length > 0) {
      const scopeSet = new Set(scopes);
      const missing = requiredScopes.filter((s) => !scopeSet.has(s));
      if (missing.length > 0) {
        return { ok: false, forbidden: true, message: `Forbidden: Missing required scopes: ${missing.join(', ')}` };
      }
    }

    return {
      ok: true,
      payload,
      scopes,
      protectedHeader,
    };
  } catch (err) {
    if (debug) {
      try {
        const hdr = decodeProtectedHeader(token);
        process.stderr.write(`Auth debug: jwt.header=${JSON.stringify(hdr)}\n`);
      } catch (e) {
        process.stderr.write(`Auth debug: jwt.header_decode_error=${e?.message ?? e}\n`);
      }

      try {
        const decoded = decodeJwt(token);
        const debugPayload = {
          iss: decoded && decoded.iss,
          aud: decoded && decoded.aud,
          scope: decoded && decoded.scope,
          permissions: decoded && decoded.permissions,
          exp: decoded && decoded.exp,
        };
        process.stderr.write(`Auth debug: jwt.payload=${JSON.stringify(debugPayload)}\n`);
      } catch (e) {
        process.stderr.write(`Auth debug: jwt.payload_decode_error=${e?.message ?? e}\n`);
      }

      process.stderr.write(`Auth debug: jwtVerify.error=${err?.message ?? err}\n`);
    }
    return { ok: false, message: 'Unauthorized: Invalid token' };
  }
}

async function startHttp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use((err, req, res, next) => {
    if (!err) return next();

    const isMcpPath = typeof req.path === 'string' && (req.path === '/mcp' || req.path.startsWith('/mcp/'));
    if (!isMcpPath) return next(err);

    if (!req.mcpRequestId) {
      req.mcpRequestId = randomUUID();
    }

    const contentType = String(req.headers['content-type'] || '').trim();
    const msg = String(err?.message || 'Bad Request').trim();
    const headerKeys = Object.keys(req.headers || {});

    if (isAuthDebugEnabled()) {
      process.stderr.write(
        `MCP debug: pid=${process.pid} body parse error id=${req.mcpRequestId || '-'} method=${req.method} url=${req.originalUrl || req.url || '-'} contentType=${contentType || '-'} headers=${JSON.stringify(headerKeys)} message=${msg}\n`
      );
    }

    if (res.headersSent) return;
    return res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: `Bad Request: ${msg}`,
      },
      id: null,
    });
  });

  const transports = new Map();

  app.get('/.well-known/openid-configuration', (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    const issuer = `https://${domain}/`;

    return res.status(200).json({
      issuer,
      authorization_endpoint: `https://${domain}/authorize`,
      token_endpoint: `https://${domain}/oauth/token`,
      userinfo_endpoint: `https://${domain}/userinfo`,
      jwks_uri: `https://${domain}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      claims_supported: ['sub', 'email', 'email_verified', 'name', 'nickname', 'picture', 'updated_at'],
    });
  });

  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    const issuer = `https://${domain}/`;
    return res.status(200).json({
      issuer,
      authorization_endpoint: `https://${domain}/authorize`,
      token_endpoint: `https://${domain}/oauth/token`,
      jwks_uri: `https://${domain}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      scopes_supported: ['openid', 'profile', 'email'],
    });
  });

  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    return res.status(200).json({
      resource: 'https://mcp.intellizence.com/mcp',
      authorization_servers: ['https://mcp.intellizence.com'],
    });
  });

  app.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
    return res.status(200).json({
      resource: 'https://mcp.intellizence.com/mcp',
      authorization_servers: ['https://mcp.intellizence.com'],
    });
  });

  app.get('/.well-known/jwks.json', async (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    try {
      const upstream = await fetch(`https://${domain}/.well-known/jwks.json`);
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch (err) {
      return res.status(502).json({ error: 'Upstream jwks fetch failed' });
    }
  });

  app.get('/authorize', (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    const qsIndex = req.originalUrl.indexOf('?');
    const qs = qsIndex >= 0 ? req.originalUrl.slice(qsIndex) : '';
    return res.redirect(302, `https://${domain}/authorize${qs}`);
  });

  app.post('/oauth/token', async (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    try {
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      let body;
      if (contentType.includes('application/json')) {
        body = JSON.stringify(req.body || {});
      } else {
        body = new URLSearchParams(req.body || {}).toString();
      }

      const upstream = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: {
          'content-type': contentType.includes('application/json')
            ? 'application/json'
            : 'application/x-www-form-urlencoded',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
        body,
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch (err) {
      return res.status(502).json({ error: 'Upstream token exchange failed' });
    }
  });

  app.post('/token', async (req, res) => {
    req.url = '/oauth/token';
    return app._router.handle(req, res, () => {});
  });

  app.get('/userinfo', async (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    try {
      const upstream = await fetch(`https://${domain}/userinfo`, {
        headers: {
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch (err) {
      return res.status(502).json({ error: 'Upstream userinfo request failed' });
    }
  });

  app.use('/mcp', (req, res, next) => {
    req.mcpRequestId = randomUUID();

    if (isAuthDebugEnabled()) {
      const sessionId = String(req.headers['mcp-session-id'] || '').trim();
      const authHeader = getBearerAuthHeader(req);
      const safeAuthHeader = authHeader.toLowerCase().startsWith('bearer ')
        ? `Bearer ${redactToken(authHeader.slice('bearer '.length).trim())}`
        : authHeader
          ? '[present]'
          : '';
      const bodyMethod = req.body && typeof req.body === 'object' ? req.body.method : undefined;
      const headerKeys = Object.keys(req.headers || {});
      process.stderr.write(
        `MCP debug: pid=${process.pid} request id=${req.mcpRequestId} method=${req.method} path=${req.path} session=${sessionId || '-'} jsonrpcMethod=${bodyMethod || '-'} auth=${safeAuthHeader || '-'} headers=${JSON.stringify(headerKeys)}\n`
      );
    }

    return next();
  });

  app.use('/mcp', (req, res, next) => {
    if (!isAuthDebugEnabled()) return next();

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      process.stderr.write(`MCP debug: pid=${process.pid} response status=${res.statusCode} body=${safeStringify(body)}\n`);
      return originalJson(body);
    };

    res.on('finish', () => {
      process.stderr.write(
        `MCP debug: pid=${process.pid} response finished id=${req.mcpRequestId || '-'} status=${res.statusCode} contentType=${String(res.getHeader('content-type') || '').trim() || '-'}\n`
      );
    });

    return next();
  });

  app.use('/mcp', async (req, res, next) => {
    if (isMcpAuthDisabled()) {
      req.mcpAuth = {
        ok: true,
        mode: 'disabled',
        payload: { sub: 'mcp-auth-disabled' },
        scopes: ['*'],
        protectedHeader: null,
      };
      return next();
    }

    const authResult = await verifyAuth0Token(req);
    if (!authResult.ok) {
      if (isAuthDebugEnabled()) {
        process.stderr.write(
          `MCP debug: pid=${process.pid} auth failed id=${req.mcpRequestId || '-'} forbidden=${Boolean(authResult.forbidden)} message=${authResult.message}\n`
        );
      }
      if (authResult.forbidden) {
        return jsonRpcForbiddenError(res, authResult.message);
      }
      return jsonRpcAuthError(res, authResult.message);
    }

    req.mcpAuth = authResult;

    const sub = authResult && authResult.payload ? authResult.payload.sub : undefined;
    const email = getUserEmailFromClaims(authResult && authResult.payload);
    req.mcpAuth.user = {
      sub: sub || null,
      email: email || null,
    };

    if (isAuthDebugEnabled()) {
      process.stderr.write(
        `MCP debug: pid=${process.pid} auth ok id=${req.mcpRequestId || '-'} mode=${authResult.mode || 'auth0'} sub=${sub || '-'} email=${email || '-'}\n`
      );
    }
    return next();
  });

  app.get('/mcp', async (req, res) => {
    try {
      const sessionId = String(req.headers['mcp-session-id'] || '').trim();
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        if (isAuthDebugEnabled()) {
          const bodyMethod = req.body && typeof req.body === 'object' ? req.body.method : undefined;
          const headerKeys = Object.keys(req.headers || {});
          process.stderr.write(
            `MCP debug: pid=${process.pid} bad request id=${req.mcpRequestId || '-'} reason=no_valid_session session=${sessionId || '-'} jsonrpcMethod=${bodyMethod || '-'} headers=${JSON.stringify(headerKeys)}\n`
          );
        }
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
      }

      await runWithRequestContext(
        {
          requestId: req.mcpRequestId || null,
          user: req.mcpAuth && req.mcpAuth.user ? req.mcpAuth.user : null,
        },
        async () => {
          await transport.handleRequest(req, res);
        }
      );
    } catch (err) {
      if (isAuthDebugEnabled()) {
        process.stderr.write(`MCP debug: handler error id=${req.mcpRequestId || '-'} err=${err?.stack ?? err}\n`);
      }
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = String(req.headers['mcp-session-id'] || '').trim();

      if (isAuthDebugEnabled()) {
        const has = Boolean(sessionId);
        const exists = has ? transports.has(sessionId) : false;
        process.stderr.write(
          `MCP debug: pid=${process.pid} session check id=${req.mcpRequestId || '-'} hasSession=${has} session=${sessionId || '-'} transportExists=${exists}\n`
        );
      }

      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId);
        await runWithRequestContext(
          {
            requestId: req.mcpRequestId || null,
            user: req.mcpAuth && req.mcpAuth.user ? req.mcpAuth.user : null,
          },
          async () => {
            await transport.handleRequest(req, res, req.body);
          }
        );
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const server = buildMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
            if (isAuthDebugEnabled()) {
              process.stderr.write(`MCP debug: pid=${process.pid} session initialized sid=${sid} transportsSize=${transports.size}\n`);
            }
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };

        await server.connect(transport);
        await runWithRequestContext(
          {
            requestId: req.mcpRequestId || null,
            user: req.mcpAuth && req.mcpAuth.user ? req.mcpAuth.user : null,
          },
          async () => {
            await transport.handleRequest(req, res, req.body);
          }
        );
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided'
        },
        id: null
      });
    } catch (err) {
      if (isAuthDebugEnabled()) {
        process.stderr.write(`MCP debug: handler error id=${req.mcpRequestId || '-'} err=${err?.stack ?? err}\n`);
      }
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  const port = Number(process.env.MCP_HTTP_PORT || 3001);
  const host = String(process.env.MCP_HTTP_HOST || '0.0.0.0');

  await new Promise((resolve) => {
    app.listen(port, host, () => resolve());
  });

  process.stderr.write(`MCP HTTP server listening on http://${host}:${port} (path: /mcp)\n`);
}

export { startHttp };

try {
  await startHttp();
} catch (err) {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
}

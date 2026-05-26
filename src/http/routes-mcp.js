import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { buildMcpServer, buildToolRegistry } from '../core/app.js';
import config from '../core/config.js';
import { runWithRequestContext } from '../core/requestContext.js';
import {
  getBearerAuthHeader,
  getUserEmailFromClaims,
  getUserEmailFromUserinfo,
  isAuthDebugEnabled,
  redactToken,
  safeStringify,
  verifyAuth0Token,
} from './auth0.js';

function isInitializeRequest(body) {
  return Boolean(body && typeof body === 'object' && body.jsonrpc === '2.0' && body.method === 'initialize');
}

function jsonRpcError(res, code, message, id) {
  return res.status(200).json({
    jsonrpc: '2.0',
    error: {
      code,
      message,
    },
    id: id ?? null,
  });
}

function normalizeJsonRpcBody(req) {
  if (!req) return;
  const b = req.body;
  if (!b) return;
  if (typeof b === 'object') return;

  if (typeof b === 'string') {
    const s = b.trim();
    if (!s) return;
    try {
      req.body = JSON.parse(s);
    } catch {
      return;
    }
    return;
  }

  if (Buffer.isBuffer(b)) {
    const s = b.toString('utf8').trim();
    if (!s) return;
    try {
      req.body = JSON.parse(s);
    } catch {
      return;
    }
  }
}

async function handleStatelessJsonRpc(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  const id = body && Object.prototype.hasOwnProperty.call(body, 'id') ? body.id : null;
  const method = body && typeof body.method === 'string' ? body.method : '';
  const params = body && body.params && typeof body.params === 'object' ? body.params : {};

  const registry = buildToolRegistry();

  try {
    if (method === 'initialize') {
      return res.status(200).json({
        jsonrpc: '2.0',
        result: {
          serverInfo: { name: 'intellizence-datasets', version: '0.1.0' },
          capabilities: { resources: {}, tools: {} },
        },
        id,
      });
    }

    if (method === 'tools/list') {
      const result = registry.listTools();
      return res.status(200).json({ jsonrpc: '2.0', result, id });
    }

    if (method === 'resources/list') {
      const result = registry.listResources();
      return res.status(200).json({ jsonrpc: '2.0', result, id });
    }

    if (method === 'resources/read') {
      const uri = params && typeof params.uri === 'string' ? params.uri : '';
      if (!uri) return jsonRpcError(res, -32602, 'Invalid params: uri is required', id);
      const result = await registry.readResource(uri);
      return res.status(200).json({ jsonrpc: '2.0', result, id });
    }

    if (method === 'tools/call') {
      const name = params && typeof params.name === 'string' ? params.name : '';
      const args = params && params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      if (!name) return jsonRpcError(res, -32602, 'Invalid params: name is required', id);
      const result = await registry.callTool(name, args);
      return res.status(200).json({ jsonrpc: '2.0', result, id });
    }

    return jsonRpcError(res, -32601, `Method not found: ${method || '[empty]'}`, id);
  } catch (err) {
    if (isAuthDebugEnabled()) {
      process.stderr.write(`MCP debug: stateless handler error id=${req.mcpRequestId || '-'} err=${err?.stack ?? err}\n`);
    }
    return jsonRpcError(res, -32603, 'Internal error', id);
  }
}

function isMcpAuthDisabled() {
  return Boolean(config && config.mcpAuth && config.mcpAuth.disableAuth);
}

function jsonRpcAuthError(res, message) {
  res.setHeader(
    'WWW-Authenticate',
    'Bearer realm="mcp", resource_metadata="https://mcp.intellizence.com/mcp/.well-known/oauth-protected-resource"'
  );
  return res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: message || 'Unauthorized',
    },
    id: null,
  });
}

function jsonRpcForbiddenError(res, message) {
  return res.status(403).json({
    jsonrpc: '2.0',
    error: {
      code: -32003,
      message: message || 'Forbidden',
    },
    id: null,
  });
}

function getSessionLookupKeys(req) {
  const keys = [];

  const headerSid = String(req.headers['mcp-session-id'] || '').trim();
  if (headerSid) keys.push(headerSid);

  const querySid = req.query && req.query['mcp-session-id'] != null ? String(req.query['mcp-session-id']).trim() : '';
  if (querySid) keys.push(querySid);

  const openAiSession = String(req.headers['x-openai-session'] || '').trim();
  if (openAiSession) keys.push(`openai-session:${openAiSession}`);

  const openAiSubject = String(req.headers['x-openai-subject'] || '').trim();
  if (openAiSubject) keys.push(`openai-subject:${openAiSubject}`);

  return keys;
}

function getOpenAiKeys(req) {
  const keys = [];
  const openAiSession = String(req.headers['x-openai-session'] || '').trim();
  if (openAiSession) keys.push(`openai-session:${openAiSession}`);

  const openAiSubject = String(req.headers['x-openai-subject'] || '').trim();
  if (openAiSubject) keys.push(`openai-subject:${openAiSubject}`);

  return keys;
}

function setSseHeadersIfNeeded(req, res) {
  const accept = String(req.headers.accept || '').toLowerCase();
  const wantsSse = accept.includes('text/event-stream');
  if (!wantsSse) return;

  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');
}

function wantsEventStream(req) {
  const accept = String(req?.headers?.accept || '').toLowerCase();
  return accept.includes('text/event-stream');
}

function registerMcpRoutes(app) {
  const transports = new Map();

  app.use('/mcp', (req, res, next) => {
    req.mcpRequestId = randomUUID();
    setSseHeadersIfNeeded(req, res);

    if (isAuthDebugEnabled()) {
      const sessionId = getSessionLookupKeys(req)[0] || '';
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
    let email = getUserEmailFromClaims(authResult && authResult.payload);
    if (!email) {
      email = await getUserEmailFromUserinfo(req);
    }
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
      normalizeJsonRpcBody(req);
      const keys = getSessionLookupKeys(req);
      const sessionId = keys[0] || '';
      const transport = keys.map((k) => transports.get(k)).find(Boolean);
      if (!transport) {
        if (wantsEventStream(req)) {
          res.status(200);
          res.setHeader('content-type', 'text/event-stream; charset=utf-8');
          res.write(`: mcp\n\n`);
          res.end();
          return;
        }

        if (isAuthDebugEnabled()) {
          const bodyMethod = req.body && typeof req.body === 'object' ? req.body.method : undefined;
          const headerKeys = Object.keys(req.headers || {});
          process.stderr.write(
            `MCP debug: pid=${process.pid} bad request id=${req.mcpRequestId || '-'} reason=no_valid_session session=${sessionId || '-'} jsonrpcMethod=${bodyMethod || '-'} headers=${JSON.stringify(headerKeys)}\n`
          );
        }
        return jsonRpcError(
          res,
          -32000,
          'No active session. Use POST /mcp with method initialize (or send mcp-session-id).',
          null
        );
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
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.post('/mcp', async (req, res) => {
    try {
      normalizeJsonRpcBody(req);
      const keys = getSessionLookupKeys(req);
      const sessionId = keys[0] || '';

      if (isAuthDebugEnabled()) {
        const has = Boolean(sessionId);
        const exists = has ? keys.some((k) => transports.has(k)) : false;
        process.stderr.write(
          `MCP debug: pid=${process.pid} session check id=${req.mcpRequestId || '-'} hasSession=${has} session=${sessionId || '-'} transportExists=${exists}\n`
        );
      }

      if (isInitializeRequest(req.body)) {
        for (const k of keys) transports.delete(k);
        const server = buildMcpServer();
        const openAiKeys = getOpenAiKeys(req);
        for (const k of openAiKeys) transports.delete(k);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
            for (const k of openAiKeys) transports.set(k, transport);
            if (isAuthDebugEnabled()) {
              process.stderr.write(
                `MCP debug: pid=${process.pid} session initialized sid=${sid} transportsSize=${transports.size} openAiKeys=${JSON.stringify(openAiKeys)}\n`
              );
            }
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
          for (const k of openAiKeys) transports.delete(k);
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

      const existingTransport = keys.map((k) => transports.get(k)).find(Boolean);
      if (existingTransport) {
        await runWithRequestContext(
          {
            requestId: req.mcpRequestId || null,
            user: req.mcpAuth && req.mcpAuth.user ? req.mcpAuth.user : null,
          },
          async () => {
            await existingTransport.handleRequest(req, res, req.body);
          }
        );
        return;
      }

      const isJsonRpc = Boolean(
        req.body && typeof req.body === 'object' && req.body.jsonrpc === '2.0' && typeof req.body.method === 'string'
      );
      if (isJsonRpc) {
        await runWithRequestContext(
          {
            requestId: req.mcpRequestId || null,
            user: req.mcpAuth && req.mcpAuth.user ? req.mcpAuth.user : null,
          },
          async () => {
            await handleStatelessJsonRpc(req, res);
          }
        );
        return;
      }

      if (isAuthDebugEnabled()) {
        const headerKeys = Object.keys(req.headers || {});
        const bodyType = req.body === null ? 'null' : Array.isArray(req.body) ? 'array' : typeof req.body;
        const contentType = String(req.headers['content-type'] || '').trim();
        process.stderr.write(
          `MCP debug: pid=${process.pid} unrecognized request id=${req.mcpRequestId || '-'} method=${req.method} url=${req.originalUrl || req.url || '-'} contentType=${contentType || '-'} bodyType=${bodyType} hasSession=${Boolean(sessionId)} headers=${JSON.stringify(headerKeys)}\n`
        );
      }

      return jsonRpcError(
        res,
        -32000,
        'No valid session ID provided. Ensure the client persists and sends the mcp-session-id header from the initialize response.',
        null
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
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });
}

export { registerMcpRoutes };

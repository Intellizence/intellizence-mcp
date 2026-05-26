import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { buildMcpServer } from '../core/app.js';
import { runWithRequestContext } from '../core/requestContext.js';
import { getUserFromAuthResult, getUserEmailFromAuthPayload } from './mcp-auth.js';
import { verifyAuth0Token } from './auth0.js';

function createMcpStreamableTransport({ transports, user }) {
  const server = buildMcpServer(user);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      console.log('Session created:', sessionId);
      console.log('Transport sessionId (after init):', transport.sessionId || '');
      transports.set(sessionId, transport);
    },
  });

  return { server, transport };
}

async function handleMcpTransportRequest({ req, res, body, transports }) {
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing JSON-RPC body' });
  }

  if (body.method === 'initialize') {
    const { server, transport } = createMcpStreamableTransport({ transports, user: null });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    await server.connect(transport);

    return await runWithRequestContext(
      {
        requestId: null,
        user: null,
      },
      async () => {
        return await transport.handleRequest(req, res, body);
      }
    );
  }

  const authResult = await verifyAuth0Token(req);
  console.log('AUTH RESULT:', authResult);

  if (!authResult.ok) {
    const authHeader = String(req.headers.authorization || req.headers['x-forwarded-authorization'] || '').trim();
    const authShape = authHeader
      ? authHeader.toLowerCase().startsWith('bearer ')
        ? `Bearer(${authHeader.length})`
        : `[present:${authHeader.slice(0, 16)}...]`
      : '[missing]';

    console.log('AUTH FAILED');
    console.log('Authorization header:', authShape);
    console.log('verifyAuth0Token message:', authResult.message);

    return res
      .status(401)
      .set(
        'WWW-Authenticate',
        'Bearer realm="mcp", error="invalid_token", resource_metadata="https://mcp.intellizence.com/mcp/.well-known/oauth-protected-resource"'
      )
      .json({
        jsonrpc: '2.0',
        id: body.id ?? null,
        error: {
          code: -32001,
          message: authResult.message || 'Unauthorized',
        },
      });
  }

  const user = getUserFromAuthResult(authResult);

  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing mcp-session-id' });
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return await runWithRequestContext(
    {
      requestId: null,
      user: user || null,
    },
    async () => {
      return await transport.handleRequest(req, res, body);
    }
  );
}

export { createMcpStreamableTransport, handleMcpTransportRequest, getUserFromAuthResult, getUserEmailFromAuthPayload };

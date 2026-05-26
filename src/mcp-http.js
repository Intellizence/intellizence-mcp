import express from 'express';
import { buildToolRegistry } from './core/app.js';
import { runWithRequestContext } from './core/requestContext.js';
import { registerWellKnownRoutes } from './http/routes-wellknown.js';
import { handleMcpTransportRequest } from './http/mcp-transport.js';
import { getUserFromAuthResult } from './http/mcp-auth.js';
import { createMcpHttpLoggingMiddleware } from './http/mcp-logging.js';

import {
    verifyAuth0Token,
} from './http/auth0.js';

function setSseHeadersIfNeeded(req, res) {
    const accept = String(req.headers.accept || '').toLowerCase();
    const wantsSse = accept.includes('text/event-stream');
    if (!wantsSse) return;

    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
}

function wantsEventStream(req) {
    const accept = String(req.headers.accept || '').toLowerCase();
    return accept.includes('text/event-stream');
}

const app = express();

app.set('trust proxy', true);

app.use(express.json());

/**
 * sessionId -> transport
 */

app.use(createMcpHttpLoggingMiddleware());


const transports = new Map();
registerWellKnownRoutes(app);

/**
 * ---------------------------------------------------
 * MCP ROUTE
 * ---------------------------------------------------
 */

app.get('/mcp', async (req, res) => {
    setSseHeadersIfNeeded(req, res);
    if (wantsEventStream(req)) {
        res.status(200);
        res.setHeader('content-type', 'text/event-stream; charset=utf-8');
        res.write(`: mcp\n\n`);
        res.end();
        return;
    }

    return res.status(200).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'No active session. Use POST /mcp with method initialize.',
        },
        id: null,
    });
});

app.post('/mcp', async (req, res) => {

    try {

        const body = req.body;
        const accept = String(req.headers.accept || '').toLowerCase();
        const wantsJson = accept.includes('application/json');
        const wantsSseOnly = accept.includes('text/event-stream') && !wantsJson;

        if (wantsJson && !wantsSseOnly) {

            if (body && body.method === 'initialize') {
                return res.status(200).json({
                    jsonrpc: '2.0',
                    id: body.id ?? null,
                    result: {
                        protocolVersion: body?.params?.protocolVersion || '2025-11-25',
                        capabilities: { resources: {}, tools: {} },
                        serverInfo: { name: 'intellizence-datasets', version: '0.1.0' },
                    },
                });
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
                        id: body?.id ?? null,
                        error: {
                            code: -32001,
                            message: authResult.message || 'Unauthorized',
                        },
                    });
            }

            req.user = getUserFromAuthResult(authResult);

            return await runWithRequestContext(
                {
                    requestId: null,
                    user: req.user,
                },
                async () => {
                    const registry = buildToolRegistry();
                    const method = String(body?.method || '');
                    const params = body && body.params && typeof body.params === 'object' ? body.params : {};
                    const id = body && Object.prototype.hasOwnProperty.call(body, 'id') ? body.id : null;

                    if (method === 'notifications/initialized') {
                        res.status(204).end();
                        return;
                    }

                    if (method === 'tools/list') {
                        const result = registry.listTools();
                        res.status(200).json({ jsonrpc: '2.0', result, id });
                        return;
                    }

                    if (method === 'resources/list') {
                        const result = registry.listResources();
                        res.status(200).json({ jsonrpc: '2.0', result, id });
                        return;
                    }

                    if (method === 'resources/read') {
                        const uri = params && typeof params.uri === 'string' ? params.uri : '';
                        if (!uri) {
                            res.status(200).json({
                                jsonrpc: '2.0',
                                error: { code: -32602, message: 'Invalid params: uri is required' },
                                id,
                            });
                            return;
                        }
                        const result = await registry.readResource(uri);
                        res.status(200).json({ jsonrpc: '2.0', result, id });
                        return;
                    }

                    if (method === 'tools/call') {
                        const name = params && typeof params.name === 'string' ? params.name : '';
                        const args = params && params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
                        if (!name) {
                            res.status(200).json({
                                jsonrpc: '2.0',
                                error: { code: -32602, message: 'Invalid params: name is required' },
                                id,
                            });
                            return;
                        }

                        res.locals.mcpUser = req.user || null;
                        res.locals.mcpToolCall = {
                            name,
                            args,
                            query: args && typeof args.query === 'string' ? args.query : null,
                        };

                        const result = await registry.callTool(name, args);
                        res.status(200).json({ jsonrpc: '2.0', result, id });
                        return;
                    }

                    res.status(200).json({
                        jsonrpc: '2.0',
                        error: { code: -32601, message: `Method not found: ${method || '[empty]'}` },
                        id,
                    });
                }
            );
        }

        return await handleMcpTransportRequest({
            req,
            res,
            body,
            transports,
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: err.message
            },
            id: null
        });
    }
});

app.listen(3001, () => {
    console.log('MCP server listening on port 3001');
});
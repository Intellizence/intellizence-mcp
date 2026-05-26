import express from 'express';
import { isAuthDebugEnabled } from './http/auth0.js';

import { createRemoteJWKSet, jwtVerify } from 'jose';

// import { registerMcpRoutes } from './http/routes-mcp.js';
// import { registerOauthProxyRoutes } from './http/routes-oauth-proxy.js';
import { registerWellKnownRoutes } from './http/routes-wellknown.js';

async function startHttp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use('/mcp', (req, res, next) => {
    const originalStatus = res.status.bind(res);
    res.status = (code) => {
      if (code === 401) {
        res.setHeader(
          'WWW-Authenticate',
          'Bearer realm="mcp", resource_metadata="https://mcp.intellizence.com/mcp/.well-known/oauth-protected-resource"'
        );
      }
      return originalStatus(code);
    };
    return next();
  });


  app.use((req, res, next) => {

    // ======================
    // REQUEST LOGGING
    // ======================

    console.log('\n======================');
    console.log('REQUEST');
    console.log('======================\n');

    console.log('METHOD:', req.method);
    console.log('URL:', req.url);

    console.log('\nHEADERS:\n');
    console.log(req.headers);

    if (req.body && Object.keys(req.body).length > 0) {
      console.log('\nBODY:\n');
      console.log(req.body);
    }

    // ======================
    // SAVE ORIGINAL METHODS
    // ======================

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // ======================
    // INTERCEPT res.json()
    // ======================

    res.json = (body) => {

      console.log('\n======================');
      console.log('RESPONSE JSON');
      console.log('======================\n');

      console.log('STATUS:', res.statusCode);

      console.log('\nRESPONSE HEADERS:\n');
      console.log(res.getHeaders());

      console.log('\nRESPONSE BODY:\n');
      console.log(body);

      return originalJson(body);
    };

    // ======================
    // INTERCEPT res.send()
    // ======================

    res.send = (body) => {

      console.log('\n======================');
      console.log('RESPONSE SEND');
      console.log('======================\n');

      console.log('STATUS:', res.statusCode);

      console.log('\nRESPONSE HEADERS:\n');
      console.log(res.getHeaders());

      console.log('\nRESPONSE BODY:\n');
      console.log(body);

      return originalSend(body);
    };

    next();
  });

  registerWellKnownRoutes(app);

  // app.use((req, res, next) => {
  //   console.log('======================');
  //   console.log('METHOD:', req.method);
  //   console.log('URL:', req.url);
  //   console.log('HEADERS:', req.headers);
  //   console.log('======================');

  //   next();
  // });

  app.all('/mcp', async (req, res) => {

    console.log('======================');
    console.log('MCP ROUTE HIT');
    console.log('BODY:', req.body);
    console.log('AUTH HEADER:', req.headers.authorization);
    console.log('======================');

    //
    // 1. INITIALIZE
    //
    if (req.body?.method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: {
            name: 'Intellizence MCP',
            version: '1.0.0'
          }
        }
      });
    }

    //
    // 2. NOTIFICATION
    //
    if (req.body?.method === 'notifications/initialized') {
      return res.status(204).end();
    }

    //
    // 3. LIST TOOLS
    //
    if (req.body?.method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          tools: [
            {
              name: 'whoami',
              description: 'Returns current logged in user',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false
              }
            }
          ]
        }
      });
    }

    //
    // 4. TOOL CALL
    //
    if (req.body?.method === 'tools/call') {

      console.log('TOOLS/CALL RECEIVED');

      const authHeader = req.headers.authorization;

      //
      // NO TOKEN YET
      // -> Trigger OAuth login
      //
      if (!authHeader) {

        console.log('NO AUTH HEADER -> RETURNING 401');

        return res
          .status(401)
          .set(
            'WWW-Authenticate',
            'Bearer realm="mcp", resource_metadata="https://mcp.intellizence.com/mcp/.well-known/oauth-protected-resource"'
          )
          .json({
            jsonrpc: '2.0',
            id: req.body.id,
            error: {
              code: -32001,
              message: 'Unauthorized'
            }
          });
      }

      //
      // TOKEN EXISTS
      //
      console.log('AUTH HEADER FOUND');
      console.log(authHeader);

      //
      // FOR NOW:
      // Just return success
      //
      return res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          content: [
            {
              type: 'text',
              text: 'Authenticated successfully'
            }
          ]
        }
      });
    }

    //
    // UNKNOWN METHOD
    //
    return res.status(404).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });

  });
  const AUTH0_DOMAIN = 'dev-f4posa2ghjbh55te.us.auth0.com';

  const ISSUER = `https://${AUTH0_DOMAIN}/`;

  const AUDIENCE = 'https://mcp.intellizence.com/mcp';

  // app.use((err, req, res, next) => {
  //   if (!err) return next();

  //   const isMcpPath = typeof req.path === 'string' && (req.path === '/mcp' || req.path.startsWith('/mcp/'));
  //   if (!isMcpPath) return next(err);

  //   if (!req.mcpRequestId) {
  //     req.mcpRequestId = randomUUID();
  //   }

  //   const contentType = String(req.headers['content-type'] || '').trim();
  //   const msg = String(err?.message || 'Bad Request').trim();
  //   const headerKeys = Object.keys(req.headers || {});

  //   if (isAuthDebugEnabled()) {
  //     process.stderr.write(
  //       `MCP debug: pid=${process.pid} body parse error id=${req.mcpRequestId || '-'} method=${req.method} url=${req.originalUrl || req.url || '-'} contentType=${contentType || '-'} headers=${JSON.stringify(headerKeys)} message=${msg}\n`
  //     );
  //   }

  //   if (res.headersSent) return;
  //   return res.status(200).json({
  //     jsonrpc: '2.0',
  //     error: {
  //       code: -32000,
  //       message: `Bad Request: ${msg}`,
  //     },
  //     id: null,
  //   });
  // });


  // registerOauthProxyRoutes(app);
  // registerMcpRoutes(app);

  const JWKS = createRemoteJWKSet(
    new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
  );

  app.post('/mcp', async (req, res) => {
    try {

      // =========================
      // 1. Read bearer token
      // =========================

      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          error: 'Missing Authorization header',
        });
      }

      const token = authHeader.replace('Bearer ', '');

      console.log('\n========================');
      console.log('ACCESS TOKEN');
      console.log('========================\n');

      console.log(token);


      // =========================
      // 2. Verify JWT
      // =========================

      const { payload, protectedHeader } =
        await jwtVerify(
          token,
          JWKS,
          {
            issuer: ISSUER,
            audience: AUDIENCE,
          }
        );


      // =========================
      // 3. Print decoded values
      // =========================

      console.log('\n========================');
      console.log('JWT HEADER');
      console.log('========================\n');

      console.log(protectedHeader);

      console.log('\n========================');
      console.log('JWT PAYLOAD');
      console.log('========================\n');

      console.log(payload);


      // =========================
      // 4. Example extracted fields
      // =========================

      console.log('\n========================');
      console.log('USER INFO');
      console.log('========================\n');

      console.log('EMAIL:', payload.email);
      console.log('SUB:', payload.sub);
      console.log('SCOPE:', payload.scope);


      // =========================
      // 5. Continue MCP response
      // =========================

      return res.json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        result: {
          ok: true,
        },
      });

    } catch (err) {

      console.error(err);

      return res.status(401).json({
        error: 'Invalid token',
        details: err.message,
      });
    }
  });



  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  const port = Number(process.env.MCP_HTTP_PORT || 3001);
  const host = String(process.env.MCP_HTTP_HOST || '0.0.0.0');

  const server = await new Promise((resolve) => {
    const s = app.listen(port, host, () => resolve(s));
  });

  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 80_000;
  server.requestTimeout = 0;

  process.stderr.write(`MCP HTTP server listening on http://${host}:${port} (path: /mcp)\n`);
}

export { startHttp };

try {
  await startHttp();
} catch (err) {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
}

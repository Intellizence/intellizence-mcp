#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './core/app.js';
import { runWithRequestContext } from './core/requestContext.js';

process.on('uncaughtException', (err) => {
  process.stderr.write(`uncaughtException: ${err?.stack ?? err}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  process.stderr.write(`unhandledRejection: ${err?.stack ?? err}\n`);
  process.exit(1);
});

async function runStdio() {
  process.stderr.write('Starting MCP stdio process...\n');
  const server = buildMcpServer();
  const transport = new StdioServerTransport();

  const apiKey = String(process.env.INTELLIZENCE_API_KEY || '').trim();

  const userEmail = String(process.env.MCP_USER_EMAIL || '').trim();
  const userSub = String(process.env.MCP_USER_SUB || '').trim();

  if (!apiKey && !userEmail) {
    throw new Error('Missing INTELLIZENCE_API_KEY and MCP_USER_EMAIL (no authentication available for stdio MCP)');
  }

  await runWithRequestContext(
    {
      requestId: null,
      apiKey: apiKey || null,
      user: userEmail || userSub ? { email: userEmail || null, sub: userSub || null } : null,
    },
    async () => {
      await server.connect(transport);
      process.stderr.write('MCP server connected (stdio).\n');

      await new Promise((resolve) => {
        const cleanupAndResolve = () => {
          process.off('SIGINT', cleanupAndResolve);
          process.off('SIGTERM', cleanupAndResolve);
          process.stdin.off('close', cleanupAndResolve);
          process.stdin.off('end', cleanupAndResolve);
          resolve();
        };

        process.on('SIGINT', cleanupAndResolve);
        process.on('SIGTERM', cleanupAndResolve);
        process.stdin.on('close', cleanupAndResolve);
        process.stdin.on('end', cleanupAndResolve);
      });
    }
  );
}

try {
  await runStdio();
} catch (err) {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
}

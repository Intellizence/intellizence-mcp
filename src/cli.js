#!/usr/bin/env node
import { buildToolRegistry } from './core/app.js';
import { runWithRequestContext } from './core/requestContext.js';

function printUsage() {
  process.stdout.write(
    [
      'intellizence-mcp-cli',
      '',
      'Usage:',
      '  intellizence-mcp-cli tools',
      '  intellizence-mcp-cli call <toolName> --args <json>',
      '  intellizence-mcp-cli resources',
      '  intellizence-mcp-cli read <uri>',
      '',
      'Environment:',
      '  INTELLIZENCE_API_KEY   Downstream Intellizence API key (sent as x-api-key)',
      '  MCP_USER_EMAIL        Optional user identity (sent as x-user-email)',
      '  INTELLIZENCE_API_BASE_URL Optional, defaults to https://connect.intellizence.com',
      '',
      'Examples:',
      '  intellizence-mcp-cli tools',
      '  intellizence-mcp-cli call search_news --args "{\"companies\":[\"openai.com\"],\"limit\":5}"',
    ].join('\n') + '\n'
  );
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !String(next).startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }

  return { positional, flags };
}

function parseJsonFlag(value) {
  if (value == null || value === '') return {};
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON must be an object');
    }
    return parsed;
  } catch (e) {
    throw new Error(`Invalid --args JSON: ${e?.message || e}`);
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];

  if (!cmd || flags.help || flags.h) {
    printUsage();
    process.exit(cmd ? 0 : 1);
  }

  const registry = buildToolRegistry();

  const apiKey = String(process.env.INTELLIZENCE_API_KEY || '').trim();
  const userEmail = String(process.env.MCP_USER_EMAIL || '').trim();

  const ctx = {
    requestId: null,
    apiKey: apiKey || null,
    user: userEmail ? { email: userEmail || null } : null,
  };

  if (cmd === 'tools') {
    const result = registry.listTools();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (cmd === 'resources') {
    const result = registry.listResources();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (cmd === 'read') {
    const uri = positional[1];
    if (!uri) {
      printUsage();
      process.exit(1);
    }

    const result = await runWithRequestContext(ctx, async () => {
      return await registry.readResource(uri);
    });

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (cmd === 'call') {
    const toolName = positional[1];
    if (!toolName) {
      printUsage();
      process.exit(1);
    }

    const argsObj = parseJsonFlag(flags.args);

    const result = await runWithRequestContext(ctx, async () => {
      return await registry.callTool(toolName, argsObj);
    });

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  process.stderr.write(`Unknown command: ${cmd}\n`);
  printUsage();
  process.exit(1);
}

process.on('unhandledRejection', (err) => {
  process.stderr.write(`unhandledRejection: ${err?.stack ?? err}\n`);
  process.exit(1);
});

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});

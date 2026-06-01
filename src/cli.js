#!/usr/bin/env node
import { buildToolRegistry } from './core/app.js';
import { runWithRequestContext } from './core/requestContext.js';

function printUsage() {
  process.stdout.write(
    [
      'intellizence',
      '',
      'Usage:',
      '  intellizence <toolName> --<param> <value> [--<param> <value> ...]',
      '  intellizence tools',
      '  intellizence resources',
      '  intellizence read <uri>',
      '',
      'Environment:',
      '  INTELLIZENCE_API_KEY   Downstream Intellizence API key (sent as x-api-key)',
      '  MCP_USER_EMAIL        Optional user identity (sent as x-user-email)',
      '  INTELLIZENCE_API_BASE_URL Optional, defaults to https://connect.intellizence.com',
      '',
      'Examples:',
      '  intellizence tools',
      '  intellizence search_news --companies openai.com --limit 5',
    ].join('\n') + '\n'
  );
}

function parseOptions(argv) {
  const positional = [];
  const options = new Map();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!String(a).startsWith('--')) {
      positional.push(a);
      continue;
    }

    const key = String(a).slice(2).trim();

    let value = true;
    let j = i + 1;
    if (j < argv.length && !String(argv[j]).startsWith('--')) {
      const parts = [];
      while (j < argv.length && !String(argv[j]).startsWith('--')) {
        parts.push(String(argv[j]));
        j++;
      }
      value = parts.join(' ');
      i = j - 1;
    }

    if (!key) continue;

    if (options.has(key)) {
      const existing = options.get(key);
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        options.set(key, [existing, value]);
      }
    } else {
      options.set(key, value);
    }
  }

  return { positional, options };
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

function coerceScalar(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return '';

  if (/^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  return trimmed;
}

function splitCommaList(str) {
  return String(str)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function coerceBySchema(raw, propSchema) {
  const schema = propSchema && typeof propSchema === 'object' ? propSchema : null;
  const type = schema && typeof schema.type === 'string' ? schema.type : '';

  if (type === 'array') {
    const itemsSchema = schema && typeof schema.items === 'object' ? schema.items : null;

    if (Array.isArray(raw)) {
      return raw.flatMap((x) => {
        const s = String(x);
        return s.includes(',') ? splitCommaList(s) : [s.trim()];
      }).filter(Boolean).map((x) => coerceBySchema(x, itemsSchema));
    }

    if (raw === true) return [];

    const s = String(raw);
    const parts = s.includes(',') ? splitCommaList(s) : [s.trim()];
    return parts.filter(Boolean).map((x) => coerceBySchema(x, itemsSchema));
  }

  if (type === 'integer') {
    const n = Number(String(raw).trim());
    return Number.isFinite(n) ? Math.trunc(n) : coerceScalar(String(raw));
  }

  if (type === 'number') {
    const n = Number(String(raw).trim());
    return Number.isFinite(n) ? n : coerceScalar(String(raw));
  }

  if (type === 'boolean') {
    if (raw === true) return true;
    const s = String(raw).trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    return Boolean(raw);
  }

  return coerceScalar(String(raw));
}

function optionsToArgs(options, inputSchema) {
  const reqBody = {};
  const props = inputSchema && typeof inputSchema === 'object' ? inputSchema.properties : null;

  for (const [k, v] of (options && typeof options.entries === 'function' ? options.entries() : [])) {
    if (k === 'help' || k === 'h') continue;

    const propSchema = props && typeof props === 'object' ? props[k] : null;
    reqBody[k] = coerceBySchema(v, propSchema);
  }

  return reqBody;
}

function listToolsMeta(registry) {
  const result = registry.listTools();
  const tools = result && typeof result === 'object' && Array.isArray(result.tools) ? result.tools : [];
  return tools
    .map((t) => ({
      name: t && typeof t.name === 'string' ? t.name.trim() : '',
      inputSchema: t && typeof t === 'object' ? t.inputSchema : null,
    }))
    .filter((t) => Boolean(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getToolMetaByName(toolsMeta, name) {
  const trimmed = String(name || '').trim();
  return toolsMeta.find((t) => t.name === trimmed) || null;
}

function validateArgsAgainstSchema(argsObj, schema) {
  const props = schema && typeof schema === 'object' ? schema.properties : null;
  if (!props || typeof props !== 'object') return { ok: true };

  const allowed = new Set(Object.keys(props));
  const unknown = Object.keys(argsObj || {}).filter((k) => !allowed.has(k));
  if (unknown.length === 0) return { ok: true };

  return {
    ok: false,
    unknown,
    allowed: [...allowed].sort(),
  };
}

function toRecordsFromTabular(resultObj) {
  const fields = resultObj && Array.isArray(resultObj.fields) ? resultObj.fields : null;
  const rows = resultObj && Array.isArray(resultObj.rows) ? resultObj.rows : null;
  if (!fields || !rows) return null;

  const keys = fields.map((f) => String(f));
  return rows.map((row) => {
    const rec = {};
    const arr = Array.isArray(row) ? row : [];
    for (let i = 0; i < keys.length; i++) {
      rec[keys[i]] = arr[i];
    }
    return rec;
  });
}

function normalizeCliOutput(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const { content: _content, ...withoutContent } = payload;

  const resultObj = withoutContent.result && typeof withoutContent.result === 'object' ? withoutContent.result : null;
  const records = resultObj ? toRecordsFromTabular(resultObj) : null;
  if (!records) return withoutContent;

  const {
    fields: _fields,
    rows: _rows,
    ...rest
  } = resultObj;

  return {
    ...withoutContent,
    result: {
      ...rest,
      records,
    },
  };
}

async function main() {
  const { positional, options } = parseOptions(process.argv.slice(2));
  const cmd = positional[0];

  if (!cmd || (options && options.has && (options.has('help') || options.has('h')))) {
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
      process.stderr.write('Missing required argument: uri\n');
      printUsage();
      process.exit(1);
    }

    const result = await runWithRequestContext(ctx, async () => {
      return await registry.readResource(uri);
    });

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const toolName = cmd;
  const toolsMeta = listToolsMeta(registry);
  const toolNames = toolsMeta.map((t) => t.name);
  if (!toolNames.includes(toolName)) {
    process.stderr.write(`Unknown tool: ${toolName}\n`);
    process.stderr.write('Available tools:\n');
    for (const name of toolNames) {
      process.stderr.write(`- ${name}\n`);
    }
    process.exit(1);
  }

  const toolMeta = getToolMetaByName(toolsMeta, toolName);

  const argsObj = optionsToArgs(options, toolMeta && toolMeta.inputSchema ? toolMeta.inputSchema : null);
  process.stderr.write(`Args: ${JSON.stringify(argsObj)}\n`);

  const validation = validateArgsAgainstSchema(argsObj, toolMeta && toolMeta.inputSchema ? toolMeta.inputSchema : null);
  if (!validation.ok) {
    process.stderr.write(`Unknown parameter(s) for ${toolName}: ${validation.unknown.join(', ')}\n`);
    process.stderr.write('Allowed parameters:\n');
    for (const k of validation.allowed) {
      process.stderr.write(`- ${k}\n`);
    }
    process.exit(1);
  }

  const result = await runWithRequestContext(ctx, async () => {
    return await registry.callTool(toolName, argsObj);
  });

  const out = normalizeCliOutput(result);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

process.on('unhandledRejection', (err) => {
  process.stderr.write(`unhandledRejection: ${err?.stack ?? err}\n`);
  process.exit(1);
});

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});

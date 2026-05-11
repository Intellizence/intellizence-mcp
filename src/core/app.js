import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { registerEnabledDatasets } from './datasets/index.js';
import { getRequestContext } from './requestContext.js';

function buildToolRegistry() {
  const resources = [];
  const resourceReaders = new Map();
  const tools = [];
  const toolHandlers = new Map();

  const server = {
    registerResource: (name, uri, options, readFn) => {
      resources.push({
        uri,
        name,
        description: name,
        mimeType: options?.mimeType,
      });
      resourceReaders.set(uri, readFn);
    },
    registerTool: (name, toolDef, handler) => {
      tools.push({
        name,
        description: toolDef?.description,
        inputSchema: toolDef?.inputSchema,
      });
      toolHandlers.set(name, handler);
    },
  };

  registerEnabledDatasets(server, {});

  return {
    listTools: () => ({ tools: [...tools] }),
    listResources: () => ({ resources: [...resources] }),
    readResource: async (uri, ctx) => {
      const readFn = resourceReaders.get(uri);
      if (!readFn) throw new Error(`Unknown resource: ${uri}`);
      return await readFn({ params: { uri } }, ctx);
    },
    callTool: async (name, args, ctx) => {
      const handler = toolHandlers.get(name);
      if (!handler) throw new Error(`Unknown tool: ${name}`);
      return await handler(args ?? {}, ctx);
    },
  };
}

function buildMcpServer() {
  const server = new Server(
    { name: 'intellizence-datasets', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {} } }
  );

  const resources = [];
  const resourceReaders = new Map();
  const tools = [];
  const toolHandlers = new Map();

  const api = {
    registerResource: (name, uri, options, readFn) => {
      resources.push({
        uri,
        name,
        description: name,
        mimeType: options?.mimeType,
      });
      resourceReaders.set(uri, readFn);
    },
    registerTool: (name, toolDef, handler) => {
      tools.push({
        name,
        description: toolDef?.description,
        inputSchema: toolDef?.inputSchema,
      });
      toolHandlers.set(name, handler);
    },
  };

  process.stderr.write('MCP app.js adapter enabled (registerResource/registerTool)\n');

  server.registerResource = api.registerResource;
  server.registerTool = api.registerTool;

  registerEnabledDatasets(server, {});

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    const readFn = resourceReaders.get(uri);
    if (!readFn) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    return await readFn(req, getRequestContext());
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const handler = toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await handler(args ?? {}, getRequestContext());
  });

  return server;
}

export { buildMcpServer, buildToolRegistry };

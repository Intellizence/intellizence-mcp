// MCP server configuration.
// Enable one or more datasets by adding their keys to enabledDatasets.
// Valid keys are defined in src/datasets/index.js (DATASET_REGISTRY).

export default {
  enabledDatasets: [
    'fundraising',
    'layoffs',
    'mna',
    'business-expansion',
    'data-breach',
    'executive-change',
    'news',
  ],
  debugAuth: true,
  mcpAuth: {
    disableAuth: true,
  },
  auth0: {
    domain: 'dev-f4posa2ghjbh55te.us.auth0.com',
    audience: 'https://mcp.intellizence.com/mcp',
    requiredScopes: [],
  },
};

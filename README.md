# Intellizence Datasets MCP

This MCP server exposes Intellizence datasets as MCP tools/resources.

## Entrypoints

This repository contains two entrypoints:

- `src/mcp-stdio.js` (local subprocess MCP, intended for end users)
- `src/mcp-http.js` (hosted Streamable HTTP MCP, intended for deployment)

The shared core logic lives under `src/core/`.

## Configuration

### Environment variables

- `INTELLIZENCE_API_KEY` (required for stdio; required for hosted only if your backend requires it)
- `INTELLIZENCE_API_BASE_URL` (optional, defaults to `https://connect.intellizence.com`)
- `MCP_USER_EMAIL` (optional; forwarded as `x-user-email`)

Users should obtain an API key from the Intellizence web app.

## Install (public npm)

```bash
npm install -g intellizence-mcp
```

## Run (stdio)

```bash
INTELLIZENCE_API_KEY=... intellizence-mcp
```

PowerShell:

```powershell
$env:INTELLIZENCE_API_KEY="..."; intellizence-mcp
```

CMD:

```cmd
set INTELLIZENCE_API_KEY=... && intellizence-mcp
```

## Run (CLI)

This package also ships a simple CLI wrapper around the same dataset tools.

```bash
INTELLIZENCE_API_KEY=... intellizence tools
INTELLIZENCE_API_KEY=... intellizence search_news --companies openai.com --limit 5
```

PowerShell:

```powershell
$env:INTELLIZENCE_API_KEY="..."; intellizence tools
```

CMD:

```cmd
set INTELLIZENCE_API_KEY=... && intellizence tools
```

Without global install:

```bash
INTELLIZENCE_API_KEY=... npx -y --package intellizence-mcp intellizence tools
```

## Claude Desktop configuration

In Claude Desktop, configure the MCP server to run the stdio entrypoint and pass the API key via env.

Example (using `npx` so users don't need a global install):

```json
{
  "mcpServers": {
    "intellizence": {
      "command": "npx",
      "args": ["-y", "intellizence-mcp"],
      "env": {
        "INTELLIZENCE_API_KEY": "<paste-your-api-key-here>",
        "MCP_USER_EMAIL": "user@company.com"
      }
    }
  }
}
```

# Schema for source/mcps/

Each MCP server definition is a single JSON file in canonical (tool-agnostic)
form. The adapter transforms it into each tool's native shape.

## File naming

`<server-name>.json`. The server name must match the filename (no
extensions), lowercase letters/digits/hyphens, regex
`^[a-z0-9]+(-[a-z0-9]+)*$`.

## Canonical shape

```json
{
  "name": "github",
  "description": "GitHub MCP for repo operations",
  "transport": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": {
    "Authorization": "Bearer ${GITHUB_PAT}"
  },
  "enabled": true,
  "timeout": 5000
}
```

For stdio:

```json
{
  "name": "airtable",
  "description": "Airtable MCP server",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "airtable-mcp-server"],
  "env": {
    "AIRTABLE_API_KEY": "${env:AIRTABLE_API_KEY}"
  },
  "enabled": true
}
```

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Must match filename |
| `description` | string | no | Human-readable |
| `transport` | string | yes | `stdio` \| `http` \| `sse` \| `ws` |
| `command` | string | stdio only | Executable to launch |
| `args` | string[] | stdio only | Args to command |
| `env` | object | no | Env vars, supports `${env:VAR}` and `${VAR}` |
| `url` | string | http/sse/ws | Endpoint URL |
| `headers` | object | no | HTTP headers, supports `${env:VAR}` and `${VAR}` |
| `enabled` | boolean | no | Default `true` |
| `timeout` | number | no | Milliseconds, default 5000 |

## Adapter transforms

### opencode adapter
- Wraps under `mcp` key in `opencode.json`
- `stdio` → `type: "local"`, `command: [command, ...args]`, `env` → `environment`
- `http`/`sse` → `type: "remote"`, `url`, `headers`
- `${env:VAR}` style preserved (opencode native)

### claude-code adapter
- Wraps under `mcpServers` key in `.mcp.json`
- `stdio` → `type: "stdio"`, `command`, `args`, `env`
- `http` → `type: "http"`, `url`, `headers`
- `sse` → `type: "sse"`, `url`, `headers`
- `ws` → `type: "ws"`, `url`, `headers`
- `${env:VAR}` → `${VAR}` (claude native)

## Variable expansion

Both `${VAR}` and `${env:VAR}` are accepted in source. The adapter normalizes
to the tool-native form on output.

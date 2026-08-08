# `@coreward/mcp`

Zero-build MCP entry for Coreward release gates. Foreign repos do **not** need the monorepo `src/` tree.

## Run

```bash
npx -y @coreward/mcp
```

Bin name: `coreward-mcp`. Speaks stdio MCP (Content-Length framing).

Target repo = `COREWARD_ROOT` if set, otherwise `cwd`.

## Host config

```json
{
  "mcpServers": {
    "coreward-release-gates": {
      "command": "npx",
      "args": ["-y", "@coreward/mcp"]
    }
  }
}
```

Monorepo dogfood may keep `npx tsx src/release-gate/mcp.ts`.

## Build / publish (from monorepo root)

```bash
node scripts/build-mcp-package.mjs
cd packages/mcp && npm publish --access public
```

See [docs/publish-mcp.md](../../docs/publish-mcp.md). Package is not claimed published until an npm tag exists.

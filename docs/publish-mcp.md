# Publish `@coreward/mcp`

Zero-build MCP entry for non-monorepo adopt (`npx -y @coreward/mcp`).

## Prerequisites

- Node ≥ 22
- npm auth with publish rights on the **`@coreward`** org (or change the package name)
- Clean monorepo install at repo root (`npm install`)

## Build

From repo root:

```bash
node scripts/build-mcp-package.mjs
```

Output: `packages/mcp/dist/cli.js` plus bundled JSON assets. `dist/` is gitignored.

## Smoke (stdio)

```bash
node scripts/build-mcp-package.mjs
# initialize handshake (Content-Length)
printf 'Content-Length: 122\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | node packages/mcp/bin/coreward-mcp.js
```

Or with a foreign cwd:

```bash
COREWARD_ROOT=/path/to/target node packages/mcp/bin/coreward-mcp.js
```

Focused automated smoke: `npx vitest run packages/mcp/smoke.test.ts`

## Manual publish

```bash
node scripts/build-mcp-package.mjs
cd packages/mcp
npm publish --access public
```

Tag optional: `git tag mcp-v0.1.0 && git push origin mcp-v0.1.0` (document the tag in the release notes).

## CI publish-on-tag (deferred)

House mandates forbid agent edits under `.github/workflows/`. When an operator adds a workflow, use:

- Trigger: `push` tags matching `mcp-v*`
- Steps: checkout → `npm ci` → `node scripts/build-mcp-package.mjs` → `cd packages/mcp && npm publish --access public`
- Secret: `NPM_TOKEN` with `@coreward` publish scope

Until that workflow lands, publish is **manual** as above.

## Blockers

- **`@coreward` npm org access** — first publish needs an owner to create the org/scope and grant the publishing token.
- Package is **not** on the registry until someone runs publish successfully; templates may still point at `npx -y @coreward/mcp` (npx will fetch once published).

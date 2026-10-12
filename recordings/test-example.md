# Workflow: test-example

Recorded from a fastmcp-browser session. Replay without AI:

```sh
node dist/src/cli.js replay E:\tools\fastmcp-browser\recordings\test-example.jsonl
```

Requires: MCP server running (`npm run dev` in `server/`), extension connected.
Steps flagged with a warning need a manual fix (usually: replace a snapshot ref with a selector) before replay is faithful.

## Steps

### 1. `browser_open`

```sh
npm run call -- browser_open '{"url":"https://example.com","newTab":true}'
```

### 2. `browser_click`

```sh
npm run call -- browser_click '{"selector":"a"}'
```

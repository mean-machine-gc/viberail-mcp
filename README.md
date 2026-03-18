# viberail-mcp

MCP server for the [viberail](https://github.com/mean-machine-gc/viberail) spec-first development framework. Exposes tools and skills that let AI agents design, validate, generate, and document domain layers using behavioral contracts as the single source of truth.

## Installation

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "viberail": {
      "command": "npx",
      "args": ["-y", "viberail-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add viberail -- npx -y viberail-mcp
```

### Manual / other MCP clients

```bash
npx viberail-mcp
```

The server communicates over **stdio** using the [Model Context Protocol](https://modelcontextprotocol.io).

## Tools

| Tool | Description |
|------|-------------|
| `init-project` | Initialize a project for viberail: install the library, add npm scripts, scaffold docs, copy skills |
| `list-specs` | Discover all specs in a project with metadata (steps, failure codes, success types) |
| `get-spec` | Read a specific spec's markdown representation (decision table / pipeline table) |
| `check` | Validate specs for completeness and correctness |
| `gen` | Regenerate `.spec.md` files and dependency graph from specs |
| `generate-test` | Generate a minimal `.test.ts` file from a `.spec.ts` file |
| `generate-docs` | Generate a documentation page template from a spec |
| `get-test-results` | Read viberail test report showing which examples passed/failed per spec |
| `get-dependency-graph` | Return spec dependency graph as a Mermaid flowchart |
| `launch-ui` | Start the viberail-ui dev server and open it in the browser |

## Skills

The server bundles six Claude skills that guide interactive workflows when copied into a project via `init-project`:

| Skill | Purpose |
|-------|---------|
| `viberail-prime` | Primers on spec-first philosophy and the viberail workflow |
| `viberail-discover` | Interactive domain discovery — aggregates, operations, event flows |
| `viberail-model` | TypeScript domain type design — discriminated unions, value objects, domain primitives |
| `viberail-spec` | Behavioral contract (Spec) design — failure codes, success types, steps |
| `viberail-implement` | Implementation guidance — canonical patterns, shell/core factories, strategy dispatch |
| `viberail-docs` | Fill business prose into generated doc pages |

## Development

```bash
npm install
npm run dev      # starts fastmcp dev server with inspector
npm run build    # compiles to dist/
```

## License

MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAccountTools } from "./tools/account-tools.js";
import { registerSearchTools } from "./tools/search-tools.js";

// ============================================================
// Multi-Gmail MCP Server
// Aggregates multiple Gmail accounts for inbox triage
// ============================================================

const server = new McpServer({
  name: "multi-gmail-mcp-server",
  version: "1.0.0"
});

// Register all tools
registerAccountTools(server);
registerSearchTools(server);

// Run via stdio (for Claude Desktop / Claude Code)
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[multi-gmail-mcp] Server started via stdio");
}

main().catch(err => {
  console.error("[multi-gmail-mcp] Fatal error:", err);
  process.exit(1);
});

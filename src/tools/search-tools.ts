import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAccounts } from "../services/token-store.js";
import { searchMessages, readMessage, readThread } from "../services/gmail-client.js";
import { MAX_RESULTS_DEFAULT, MAX_RESULTS_LIMIT } from "../constants.js";
import type { EmailMessage, FailedAccount, AggregatedSearchResult } from "../types.js";

// ============================================================
// Gmail Search & Read Tools
// ============================================================

export function registerSearchTools(server: McpServer): void {

  // ── Search across ALL accounts ───────────────────────────
  server.registerTool(
    "gmail_search_all",
    {
      title: "Search All Gmail Accounts",
      description: `Searches across ALL connected Gmail accounts simultaneously and returns aggregated results tagged by account.

This is the primary tool for multi-account inbox triage. Results include which account each email belongs to.

Args:
  - query (string): Gmail search syntax. Examples:
      "after:2026/03/12 -category:promotions"
      "is:unread from:boss@company.com"
      "subject:invoice after:2026/01/01"
  - max_per_account (number): Max messages per account (1–${MAX_RESULTS_LIMIT}, default: ${MAX_RESULTS_DEFAULT})

Returns:
  {
    accounts_searched: string[],     // emails successfully searched
    accounts_failed: [               // accounts that errored (token expired etc)
      { email: string, error: string }
    ],
    total_messages: number,
    messages: [
      {
        id: string,
        threadId: string,
        account: string,             // ← which Gmail this came from
        from: string,
        to: string,
        subject: string,
        date: string,
        snippet: string,
        body: string,
        labelIds: string[],
        isUnread: boolean,
        hasAttachment: boolean
      }
    ]
  }

Use this for gmail-summary across all accounts. Filter by account label if needed using gmail_list_accounts first.`,
      inputSchema: z.object({
        query: z.string()
          .min(1)
          .describe("Gmail search query, e.g. 'after:2026/03/12 -category:promotions'"),
        max_per_account: z.number()
          .int()
          .min(1)
          .max(MAX_RESULTS_LIMIT)
          .default(MAX_RESULTS_DEFAULT)
          .describe("Maximum messages to fetch per account")
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ query, max_per_account }) => {
      const accounts = await listAccounts();

      if (accounts.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No accounts connected. Run: npm run setup add <label>"
          }]
        };
      }

      const results = await Promise.allSettled(
        accounts.map(a => searchMessages(a.email, query, max_per_account))
      );

      const allMessages: EmailMessage[] = [];
      const accountsSearched: string[] = [];
      const accountsFailed: FailedAccount[] = [];

      results.forEach((result, i) => {
        const email = accounts[i].email;
        if (result.status === "fulfilled") {
          accountsSearched.push(email);
          allMessages.push(...result.value);
        } else {
          accountsFailed.push({
            email,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
        }
      });

      // Sort all messages by date descending
      allMessages.sort((a, b) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        return db - da;
      });

      const output: AggregatedSearchResult = {
        accounts_searched: accountsSearched,
        accounts_failed: accountsFailed,
        total_messages: allMessages.length,
        messages: allMessages
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(output, null, 2)
        }],
        structuredContent: output as unknown as { [key: string]: unknown }
      };
    }
  );

  // ── Search a single specific account ────────────────────
  server.registerTool(
    "gmail_search",
    {
      title: "Search Single Gmail Account",
      description: `Searches a specific Gmail account by email address.

Use this when you want to search one account specifically instead of all accounts.

Args:
  - email (string): The Gmail address to search (must be a connected account)
  - query (string): Gmail search syntax
  - max_results (number): Max messages to return (default: ${MAX_RESULTS_DEFAULT})

Returns: Array of email message objects tagged with the account.`,
      inputSchema: z.object({
        email: z.string().email().describe("The Gmail account to search"),
        query: z.string().min(1).describe("Gmail search query"),
        max_results: z.number()
          .int()
          .min(1)
          .max(MAX_RESULTS_LIMIT)
          .default(MAX_RESULTS_DEFAULT)
          .describe("Maximum messages to return")
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ email, query, max_results }) => {
      try {
        const messages = await searchMessages(email, query, max_results);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ account: email, count: messages.length, messages }, null, 2)
          }],
          structuredContent: { account: email, count: messages.length, messages } as { [key: string]: unknown }
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: "text",
            text: `Error searching ${email}: ${msg}`
          }]
        };
      }
    }
  );

  // ── Read full message ────────────────────────────────────
  server.registerTool(
    "gmail_read_message",
    {
      title: "Read Gmail Message",
      description: `Retrieves the full content of a specific Gmail message.

Args:
  - email (string): The Gmail account the message belongs to
  - message_id (string): The message ID (from gmail_search_all or gmail_search results)

Returns: Full email message with decoded body text.`,
      inputSchema: z.object({
        email: z.string().email().describe("Gmail account the message belongs to"),
        message_id: z.string().min(1).describe("Message ID from search results")
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ email, message_id }) => {
      try {
        const message = await readMessage(email, message_id);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(message, null, 2)
          }],
          structuredContent: message as unknown as { [key: string]: unknown }
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error reading message: ${msg}` }]
        };
      }
    }
  );

  // ── Read full thread ─────────────────────────────────────
  server.registerTool(
    "gmail_read_thread",
    {
      title: "Read Gmail Thread",
      description: `Retrieves a full email conversation thread with all messages in order.

Args:
  - email (string): The Gmail account the thread belongs to
  - thread_id (string): The thread ID (from search results)

Returns: Thread with all messages decoded and in chronological order.`,
      inputSchema: z.object({
        email: z.string().email().describe("Gmail account the thread belongs to"),
        thread_id: z.string().min(1).describe("Thread ID from search results")
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ email, thread_id }) => {
      try {
        const thread = await readThread(email, thread_id);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(thread, null, 2)
          }],
          structuredContent: thread as unknown as { [key: string]: unknown }
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error reading thread: ${msg}` }]
        };
      }
    }
  );
}

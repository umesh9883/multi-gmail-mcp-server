# multi-gmail-mcp-server

MCP server that connects **multiple Gmail accounts** and lets Claude search and summarize all of them in one shot. Built for the `gmail-summary` skill with multi-account support.

---

## What It Does

- Connects personal, work, kids, school Gmail accounts — as many as you need
- Stores OAuth tokens securely in your **OS keychain** (Windows Credential Store / macOS Keychain / Linux libsecret)
- Exposes 5 MCP tools to Claude:
  - `gmail_list_accounts` — see all connected accounts
  - `gmail_search_all` — search ALL accounts simultaneously
  - `gmail_search` — search a specific account
  - `gmail_read_message` — read a full message
  - `gmail_read_thread` — read a full thread

---

## Prerequisites

- Node.js >= 18
- A Google Cloud project with Gmail API enabled

---

## Step 1 — Google Cloud Setup

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "my-gmail-mcp")
3. Enable **Gmail API** (APIs & Services → Enable APIs → search "Gmail API")
4. Create OAuth 2.0 credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Desktop app**
   - Name: "multi-gmail-mcp"
5. Download the credentials and note your `Client ID` and `Client Secret`

---

## Step 2 — Install & Build

```bash
git clone <this-repo>
cd multi-gmail-mcp-server
npm install
npm run build
```

---

## Step 3 — Set Environment Variables

```bash
# Linux / macOS
export GMAIL_CLIENT_ID=your_client_id_here
export GMAIL_CLIENT_SECRET=your_client_secret_here

# Windows (PowerShell)
$env:GMAIL_CLIENT_ID = "your_client_id_here"
$env:GMAIL_CLIENT_SECRET = "your_client_secret_here"
```

> Tip: Put these in your shell profile (~/.bashrc, ~/.zshrc) so they persist.

---

## Step 4 — Add Gmail Accounts

Run the setup CLI to connect each account:

```bash
npm run setup add personal     # Opens browser → sign in with personal@gmail.com
npm run setup add work         # Opens browser → sign in with work@company.com
npm run setup add kids         # Opens browser → sign in with kids@gmail.com
npm run setup add school       # Opens browser → sign in with school@gmail.com
```

Each command opens a browser, asks you to sign in, and stores the refresh token in your OS keychain.

```bash
npm run setup list             # See all connected accounts
npm run setup remove john@gmail.com   # Disconnect an account
```

---

## Step 5 — Connect to Claude

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "multi-gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multi-gmail-mcp-server/dist/index.js"],
      "env": {
        "GMAIL_CLIENT_ID": "your_client_id",
        "GMAIL_CLIENT_SECRET": "your_client_secret"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Code (`.claude/settings.json`)

```json
{
  "mcpServers": {
    "multi-gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multi-gmail-mcp-server/dist/index.js"],
      "env": {
        "GMAIL_CLIENT_ID": "your_client_id",
        "GMAIL_CLIENT_SECRET": "your_client_secret"
      }
    }
  }
}
```

---

## Usage with gmail-summary Skill

Once connected, use the same `gmail-summary` command in Claude. It will automatically find all your connected accounts and search them all:

```
gmail-summary today
gmail-summary this week
gmail-summary last 3 days
```

Each email in the summary will show which account it came from.

---

## Troubleshooting

**"No refresh_token received"**
The account was previously authorized without offline access. Go to [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions), revoke the app, then run `npm run setup add` again.

**"Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET"**
Set the environment variables before running setup or starting the server.

**Token expired errors**
Tokens auto-refresh. If you see persistent auth errors, remove and re-add the account:
```bash
npm run setup remove problematic@gmail.com
npm run setup add personal
```

**Linux keychain issues**
Install `libsecret`:
```bash
sudo apt-get install libsecret-1-dev
```

---

## Security Notes

- Tokens are stored in your **OS keychain**, not in any file
- This server only requests **read-only** Gmail access (`gmail.readonly` scope)
- It never modifies, sends, or deletes emails
- The `GMAIL_CLIENT_SECRET` never leaves your machine

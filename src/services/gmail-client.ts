import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import type { EmailMessage, EmailThread, ThreadMessage, GmailProfile } from "../types.js";

// ============================================================
// Gmail Client — wraps Gmail API calls per account
// ============================================================

function extractHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(part: {
  body?: { data?: string | null } | null;
  parts?: unknown[] | null;
  mimeType?: string | null;
}): string {
  if (part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }
  if (part.parts && Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const text = decodeBody(p as typeof part);
      if (text) return text;
    }
  }
  return "";
}

export async function getProfile(email: string): Promise<GmailProfile> {
  const auth = await getAuthenticatedClient(email);
  const gmail = google.gmail({ version: "v1", auth });
  const { data } = await gmail.users.getProfile({ userId: "me" });
  return {
    email: data.emailAddress ?? email,
    messagesTotal: data.messagesTotal ?? 0,
    threadsTotal: data.threadsTotal ?? 0,
    historyId: data.historyId ?? ""
  };
}

export async function searchMessages(
  email: string,
  query: string,
  maxResults: number = 20
): Promise<EmailMessage[]> {
  const auth = await getAuthenticatedClient(email);
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults
  });

  const messageRefs = listRes.data.messages ?? [];
  if (messageRefs.length === 0) return [];

  // Fetch full message details in parallel (batched to avoid rate limits)
  const BATCH = 10;
  const messages: EmailMessage[] = [];

  for (let i = 0; i < messageRefs.length; i += BATCH) {
    const batch = messageRefs.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(ref =>
        gmail.users.messages.get({
          userId: "me",
          id: ref.id!,
          format: "full"
        })
      )
    );

    for (const res of fetched) {
      const msg = res.data;
      const headers = msg.payload?.headers ?? [];
      const hasAttachment = (msg.payload?.parts ?? []).some(
        p => p.filename && p.filename.length > 0
      );

      messages.push({
        id: msg.id ?? "",
        threadId: msg.threadId ?? "",
        account: email,
        from: extractHeader(headers, "from"),
        to: extractHeader(headers, "to"),
        subject: extractHeader(headers, "subject"),
        date: extractHeader(headers, "date"),
        snippet: msg.snippet ?? "",
        body: decodeBody(msg.payload as Parameters<typeof decodeBody>[0]),
        labelIds: msg.labelIds ?? [],
        isUnread: (msg.labelIds ?? []).includes("UNREAD"),
        hasAttachment
      });
    }
  }

  return messages;
}

export async function readMessage(email: string, messageId: string): Promise<EmailMessage> {
  const auth = await getAuthenticatedClient(email);
  const gmail = google.gmail({ version: "v1", auth });

  const { data: msg } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full"
  });

  const headers = msg.payload?.headers ?? [];
  const hasAttachment = (msg.payload?.parts ?? []).some(
    p => p.filename && p.filename.length > 0
  );

  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    account: email,
    from: extractHeader(headers, "from"),
    to: extractHeader(headers, "to"),
    subject: extractHeader(headers, "subject"),
    date: extractHeader(headers, "date"),
    snippet: msg.snippet ?? "",
    body: decodeBody(msg.payload as Parameters<typeof decodeBody>[0]),
    labelIds: msg.labelIds ?? [],
    isUnread: (msg.labelIds ?? []).includes("UNREAD"),
    hasAttachment
  };
}

export async function readThread(email: string, threadId: string): Promise<EmailThread> {
  const auth = await getAuthenticatedClient(email);
  const gmail = google.gmail({ version: "v1", auth });

  const { data: thread } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full"
  });

  const msgs: ThreadMessage[] = (thread.messages ?? []).map(msg => {
    const headers = msg.payload?.headers ?? [];
    return {
      id: msg.id ?? "",
      from: extractHeader(headers, "from"),
      to: extractHeader(headers, "to"),
      date: extractHeader(headers, "date"),
      snippet: msg.snippet ?? "",
      body: decodeBody(msg.payload as Parameters<typeof decodeBody>[0])
    };
  });

  const firstHeaders = thread.messages?.[0]?.payload?.headers ?? [];
  const subject = extractHeader(firstHeaders, "subject");

  return {
    id: thread.id ?? "",
    account: email,
    subject,
    messages: msgs
  };
}

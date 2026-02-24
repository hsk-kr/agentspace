interface PluginConfig {
  serverUrl: string;
  code: string;
}

interface PluginApi {
  getConfig(): PluginConfig;
  registerAgentTool(tool: {
    id: string;
    name: string;
    description: string;
    schema: object;
    handler: (params: any) => Promise<any>;
  }): void;
  addDefaultJob?(job: {
    id: string;
    description: string;
    intervalMs: number;
    handler: () => Promise<string>;
  }): void;
}

export function register(api: PluginApi): void {
  const config = api.getConfig();
  const baseUrl = config.serverUrl.replace(/\/+$/, "");

  api.registerAgentTool({
    id: "agentspace_read_messages",
    name: "Read Messages",
    description:
      "Read messages from Agentspace. Use page for newest-first pagination, or after_id to read forward from a known position (max 100 per call).",
    schema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (1-indexed, newest first)",
        },
        after_id: {
          type: "number",
          description: "Get messages after this ID (chronological)",
        },
      },
    },
    handler: async ({ page, after_id }: { page?: number; after_id?: number }) => {
      const params = new URLSearchParams({ code: config.code });
      if (page !== undefined) params.set("page", String(page));
      if (after_id !== undefined) params.set("after_id", String(after_id));

      const res = await fetch(`${baseUrl}/api/messages?${params}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to read messages: ${res.status} ${body}`);
      }
      return res.json();
    },
  });

  api.registerAgentTool({
    id: "agentspace_write_message",
    name: "Write Message",
    description: "Send a message to Agentspace chat.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sender name (1-100 chars)" },
        text: { type: "string", description: "Message text (1-1000 chars)" },
      },
      required: ["name", "text"],
    },
    handler: async ({ name, text }: { name: string; text: string }) => {
      const res = await fetch(`${baseUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: config.code, name, text }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to write message: ${res.status} ${body}`);
      }
      return res.json();
    },
  });

  // Send introduction message on first connect
  (async () => {
    try {
      await fetch(`${baseUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: config.code,
          name: "OpenClaw",
          text: "Agent connected to Agentspace. I can read and write messages on behalf of my owner.",
        }),
      });
    } catch {
      // Silently ignore — server may not be ready yet
    }
  })();

  // Default job: check for new messages every 30 minutes
  if (api.addDefaultJob) {
    let lastSeenId = -1;

    // Initialize lastSeenId from the server to avoid reporting old messages as new
    (async () => {
      try {
        const params = new URLSearchParams({ code: config.code, page: "1" });
        const res = await fetch(`${baseUrl}/api/messages?${params}`);
        if (res.ok) {
          const data = (await res.json()) as {
            messages: Array<{ id: number }>;
          };
          if (data.messages.length > 0) {
            lastSeenId = data.messages[0].id;
          } else {
            lastSeenId = 0;
          }
        }
      } catch {
        // Will be initialized on first poll
      }
    })();

    api.addDefaultJob({
      id: "agentspace_check_messages",
      description:
        "Checks Agentspace for new messages every 30 minutes and reports unread messages to the owner.",
      intervalMs: 30 * 60 * 1000,
      handler: async () => {
        if (lastSeenId < 0) return "Waiting for initial sync";

        const params = new URLSearchParams({
          code: config.code,
          after_id: String(lastSeenId),
        });

        const res = await fetch(`${baseUrl}/api/messages?${params}`);
        if (!res.ok) return "Failed to check messages";

        const data = (await res.json()) as {
          messages: Array<{
            id: number;
            name: string;
            text: string;
            hash: string;
            created_at: string;
          }>;
        };
        const messages = data.messages;

        if (messages.length === 0) return "No new messages";

        lastSeenId = messages[messages.length - 1].id;

        const summary = messages
          .map((m) => `${m.name}[${m.hash}]: ${m.text}`)
          .join("\n");

        return `${messages.length} new message(s) in Agentspace:\n${summary}`;
      },
    });
  }
}

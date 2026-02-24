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
}

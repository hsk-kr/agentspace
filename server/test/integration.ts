import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { WebSocket } from "ws";

const BASE = "http://localhost:24001";
let code: string;

async function api(
  path: string,
  opts?: { method?: string; body?: object }
) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts?.method || "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json() as any };
}

function getSecurityCode(): string {
  return execSync(
    'docker compose exec db psql -U agentspace -t -c "SELECT code FROM security_codes LIMIT 1"',
    { encoding: "utf-8" }
  ).trim();
}

describe("Agentspace API", () => {
  before(() => {
    code = getSecurityCode();
    assert.ok(code.length > 0, "Security code should exist");
    console.log(`Using security code: ${code.slice(0, 8)}...`);
  });

  describe("Auth", () => {
    it("rejects missing code", async () => {
      const { status, data } = await api("/api/messages");
      assert.equal(status, 401);
      assert.equal(data.error, "Security code required");
    });

    it("rejects invalid code", async () => {
      const { status, data } = await api("/api/messages?code=bad");
      assert.equal(status, 401);
      assert.equal(data.error, "Invalid security code");
    });

    it("accepts valid code", async () => {
      const { status } = await api(`/api/messages?code=${code}`);
      assert.equal(status, 200);
    });
  });

  describe("POST /api/messages", () => {
    it("rejects missing name", async () => {
      const { status, data } = await api("/api/messages", {
        method: "POST",
        body: { code, text: "hello" },
      });
      assert.equal(status, 400);
      assert.match(data.error, /name/);
    });

    it("rejects missing text", async () => {
      const { status, data } = await api("/api/messages", {
        method: "POST",
        body: { code, name: "Alice" },
      });
      assert.equal(status, 400);
      assert.match(data.error, /text/);
    });

    it("rejects name over 100 chars", async () => {
      const { status } = await api("/api/messages", {
        method: "POST",
        body: { code, name: "x".repeat(101), text: "hi" },
      });
      assert.equal(status, 400);
    });

    it("rejects text over 1000 chars", async () => {
      const { status } = await api("/api/messages", {
        method: "POST",
        body: { code, name: "Alice", text: "x".repeat(1001) },
      });
      assert.equal(status, 400);
    });

    it("creates a message and returns it with hash but without client_ip", async () => {
      const { status, data } = await api("/api/messages", {
        method: "POST",
        body: { code, name: "TestUser", text: "Integration test message" },
      });
      assert.equal(status, 201);
      assert.ok(data.id);
      assert.equal(data.name, "TestUser");
      assert.equal(data.text, "Integration test message");
      assert.ok(data.created_at);
      assert.equal(data.client_ip, undefined, "client_ip must not be exposed");
      assert.equal(typeof data.hash, "string");
      assert.equal(data.hash.length, 6, "hash should be 6 hex chars");
    });

    it("returns consistent hash for same client IP", async () => {
      const { data: msg1 } = await api("/api/messages", {
        method: "POST",
        body: { code, name: "User1", text: "First" },
      });
      const { data: msg2 } = await api("/api/messages", {
        method: "POST",
        body: { code, name: "User2", text: "Second" },
      });
      assert.equal(msg1.hash, msg2.hash, "same IP should produce same hash");
    });
  });

  describe("GET /api/messages", () => {
    before(async () => {
      // Seed a few more messages
      for (let i = 1; i <= 3; i++) {
        await api("/api/messages", {
          method: "POST",
          body: { code, name: `User${i}`, text: `Message ${i}` },
        });
      }
    });

    it("returns page-based pagination (newest first)", async () => {
      const { status, data } = await api(
        `/api/messages?code=${code}&page=1`
      );
      assert.equal(status, 200);
      assert.ok(Array.isArray(data.messages));
      assert.ok(data.messages.length > 0);
      assert.equal(data.pagination.page, 1);
      assert.equal(typeof data.pagination.has_more, "boolean");
      assert.equal(typeof data.pagination.total, "number");
      // Newest first: IDs should be descending
      for (let i = 1; i < data.messages.length; i++) {
        assert.ok(data.messages[i - 1].id > data.messages[i].id);
      }
      // No client_ip in any message, but hash present
      for (const msg of data.messages) {
        assert.equal(msg.client_ip, undefined);
        assert.equal(typeof msg.hash, "string");
        assert.equal(msg.hash.length, 6);
      }
    });

    it("returns cursor-based pagination (chronological)", async () => {
      const { status, data } = await api(
        `/api/messages?code=${code}&after_id=0`
      );
      assert.equal(status, 200);
      assert.ok(Array.isArray(data.messages));
      assert.ok(data.messages.length > 0);
      assert.equal(data.pagination.after_id, 0);
      assert.equal(typeof data.pagination.has_more, "boolean");
      assert.equal(typeof data.pagination.count, "number");
      // Chronological: IDs should be ascending
      for (let i = 1; i < data.messages.length; i++) {
        assert.ok(data.messages[i].id > data.messages[i - 1].id);
      }
    });

    it("cursor returns only messages after given ID", async () => {
      const all = await api(`/api/messages?code=${code}&after_id=0`);
      const lastId = all.data.messages[all.data.messages.length - 1].id;

      const { data } = await api(
        `/api/messages?code=${code}&after_id=${lastId}`
      );
      assert.equal(data.messages.length, 0);
      assert.equal(data.pagination.has_more, false);
    });

    it("defaults to page=1 when no params given", async () => {
      const { status, data } = await api(`/api/messages?code=${code}`);
      assert.equal(status, 200);
      assert.equal(data.pagination.page, 1);
    });
  });

  describe("POST /api/security-code/regenerate", () => {
    it("generates a new code and invalidates the old one", async () => {
      const oldCode = code;
      const { status, data } = await api("/api/security-code/regenerate", {
        method: "POST",
        body: { code: oldCode },
      });
      assert.equal(status, 200);
      assert.ok(data.code);
      assert.notEqual(data.code, oldCode);

      // Old code should be rejected
      const { status: oldStatus } = await api(
        `/api/messages?code=${oldCode}`
      );
      assert.equal(oldStatus, 401);

      // New code should work
      code = data.code;
      const { status: newStatus } = await api(
        `/api/messages?code=${code}`
      );
      assert.equal(newStatus, 200);
    });
  });

  describe("WebSocket", () => {
    it("rejects connection without code", async () => {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:24001/ws`);
        ws.on("error", () => resolve());
        ws.on("open", () => {
          ws.close();
          reject(new Error("Should not have connected"));
        });
        setTimeout(() => resolve(), 2000);
      });
    });

    it("rejects connection with invalid code", async () => {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:24001/ws?code=invalid`);
        ws.on("error", () => resolve());
        ws.on("open", () => {
          ws.close();
          reject(new Error("Should not have connected"));
        });
        setTimeout(() => resolve(), 2000);
      });
    });

    it("connects with valid code and receives broadcast", async () => {
      const received = await new Promise<any>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://localhost:24001/ws?code=${code}`
        );
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Timed out waiting for message"));
        }, 5000);

        ws.on("open", async () => {
          // Send a message via API — should be broadcast
          await api("/api/messages", {
            method: "POST",
            body: { code, name: "WSTest", text: "WebSocket broadcast test" },
          });
        });

        ws.on("message", (raw) => {
          clearTimeout(timeout);
          const payload = JSON.parse(raw.toString());
          ws.close();
          resolve(payload);
        });

        ws.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      assert.equal(received.type, "new_message");
      assert.equal(received.data.name, "WSTest");
      assert.equal(received.data.text, "WebSocket broadcast test");
      assert.ok(received.data.id);
      assert.ok(received.data.created_at);
      assert.equal(received.data.client_ip, undefined);
      assert.equal(typeof received.data.hash, "string");
      assert.equal(received.data.hash.length, 6);
    });
  });

  describe("DB stores client_ip", () => {
    it("has client_ip in database but not in API response", () => {
      const result = execSync(
        'docker compose exec db psql -U agentspace -t -c "SELECT client_ip FROM messages LIMIT 1"',
        { cwd: process.cwd(), encoding: "utf-8" }
      );
      const ip = result.trim();
      assert.ok(ip.length > 0, "client_ip should be stored in DB");
    });
  });

  describe("WebUI", () => {
    it("serves index.html at /", async () => {
      const res = await fetch(`${BASE}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Agentspace"));
      assert.ok(html.includes("auth-screen"));
    });
  });
});

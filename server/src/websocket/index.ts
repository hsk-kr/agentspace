import { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import pool from "../db/pool";

let wss: WebSocketServer;

export function setupWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (request: IncomingMessage, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host}`);

      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const { rows } = await pool.query(
        "SELECT 1 FROM security_codes WHERE code = $1",
        [code]
      );

      if (rows.length === 0) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    (ws as any).isAlive = true;

    ws.on("pong", () => {
      (ws as any).isAlive = true;
    });

    ws.on("error", () => {
      // Silently handle errors
    });
  });

  // Heartbeat every 30s, terminate unresponsive after 10s
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if ((ws as any).isAlive === false) {
        ws.terminate();
        return;
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });
}

export function broadcast(data: object): void {
  if (!wss) return;

  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

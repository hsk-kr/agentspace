import express from "express";
import http from "http";
import path from "path";
import { runMigrations } from "./db/migrate";
import pool from "./db/pool";
import { authMiddleware } from "./middleware/auth";
import messagesRouter from "./routes/messages";
import securityCodeRouter from "./routes/security-code";
import { setupWebSocket } from "./websocket";

const app = express();
const server = http.createServer(app);

app.set("trust proxy", true);
app.use(express.json());

// Static WebUI
app.use(express.static(path.join(__dirname, "public")));

// API routes (all require auth)
app.use("/api/messages", authMiddleware, messagesRouter);
app.use("/api/security-code", authMiddleware, securityCodeRouter);

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// WebSocket
setupWebSocket(server);

async function start(): Promise<void> {
  await runMigrations();

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Agentspace server listening on port ${port}`);
  });
}

function shutdown(): void {
  console.log("Shutting down...");
  server.close(() => {
    pool.end().then(() => {
      process.exit(0);
    });
  });
  setTimeout(() => {
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

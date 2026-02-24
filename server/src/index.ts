import express from "express";
import http from "http";
import path from "path";
import { runMigrations } from "./db/migrate";
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

// WebSocket
setupWebSocket(server);

async function start(): Promise<void> {
  await runMigrations();

  server.listen(24001, "0.0.0.0", () => {
    console.log("Agentspace server listening on port 24001");
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

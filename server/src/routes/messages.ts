import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../db/pool";
import { broadcast } from "../websocket";

const router = Router();

let cachedSalt: string | null = null;

async function getSalt(): Promise<string> {
  if (cachedSalt) return cachedSalt;
  const { rows } = await pool.query("SELECT ip_salt FROM security_codes LIMIT 1");
  cachedSalt = rows[0].ip_salt;
  return cachedSalt!;
}

function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(ip + salt).digest("hex").slice(0, 6);
}

function addHash(row: any, salt: string) {
  const { client_ip, ...rest } = row;
  return { ...rest, hash: hashIp(client_ip, salt) };
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const afterId = req.query.after_id ? parseInt(req.query.after_id as string, 10) : null;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : null;

  const salt = await getSalt();

  if (afterId !== null) {
    // Cursor-based: chronological order, 100 after given ID
    const { rows } = await pool.query(
      `SELECT id, name, text, client_ip, created_at FROM messages
       WHERE id > $1 ORDER BY id ASC LIMIT 100`,
      [afterId]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM messages WHERE id > $1",
      [afterId]
    );

    res.json({
      messages: rows.map(r => addHash(r, salt)),
      pagination: {
        after_id: afterId,
        has_more: countResult.rows[0].cnt > 100,
        count: rows.length,
      },
    });
    return;
  }

  // Page-based: newest first, 100 per page
  const currentPage = page && page > 0 ? page : 1;
  const limit = 100;
  const offset = (currentPage - 1) * limit;

  const { rows } = await pool.query(
    `SELECT id, name, text, client_ip, created_at FROM messages
     ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const totalResult = await pool.query("SELECT COUNT(*)::int AS cnt FROM messages");
  const total = totalResult.rows[0].cnt;

  res.json({
    messages: rows.map(r => addHash(r, salt)),
    pagination: {
      page: currentPage,
      has_more: offset + rows.length < total,
      total,
    },
  });
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { name, text } = req.body;

  if (!name || typeof name !== "string" || name.length < 1 || name.length > 100) {
    res.status(400).json({ error: "name must be a string between 1 and 100 characters" });
    return;
  }

  if (!text || typeof text !== "string" || text.length < 1 || text.length > 1000) {
    res.status(400).json({ error: "text must be a string between 1 and 1000 characters" });
    return;
  }

  const clientIp = req.ip || "unknown";
  const salt = await getSalt();

  const { rows } = await pool.query(
    `INSERT INTO messages (name, text, client_ip)
     VALUES ($1, $2, $3)
     RETURNING id, name, text, created_at`,
    [name, text, clientIp]
  );

  const message = { ...rows[0], hash: hashIp(clientIp, salt) };

  // Broadcast to WebSocket clients
  broadcast({
    type: "new_message",
    data: message,
  });

  res.status(201).json(message);
});

export default router;

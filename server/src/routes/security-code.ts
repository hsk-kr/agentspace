import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../db/pool";
import { closeAllConnections } from "../websocket";

const router = Router();

router.post("/regenerate", async (req: Request, res: Response): Promise<void> => {
  const newCode = crypto.randomBytes(32).toString("hex");

  await pool.query(
    "UPDATE security_codes SET code = $1, created_at = NOW()",
    [newCode]
  );

  closeAllConnections();

  console.log(`Security code regenerated: ${newCode}`);

  res.json({ code: newCode });
});

export default router;

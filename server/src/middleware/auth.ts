import { Request, Response, NextFunction } from "express";
import pool from "../db/pool";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const code =
    (req.query.code as string | undefined) ||
    (req.body && typeof req.body === "object" ? req.body.code : undefined);

  if (!code) {
    res.status(401).json({ error: "Security code required" });
    return;
  }

  const { rows } = await pool.query(
    "SELECT 1 FROM security_codes WHERE code = $1",
    [code]
  );

  if (rows.length === 0) {
    res.status(401).json({ error: "Invalid security code" });
    return;
  }

  next();
}

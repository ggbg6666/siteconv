import bcrypt from "bcryptjs";
import { redis } from "../../lib/redis";
import { setSessionCookie } from "../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body || {};
  const uname = (username || "").trim().toLowerCase();

  const hash = await redis.hget("users", uname);
  if (!hash) {
    return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
  }

  const ok = await bcrypt.compare(password || "", hash);
  if (!ok) {
    return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
  }

  setSessionCookie(res, uname);
  res.status(200).json({ username: uname });
}

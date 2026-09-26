import bcrypt from "bcryptjs";
import { redis } from "../../lib/redis";
import { setSessionCookie } from "../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body || {};
  const uname = (username || "").trim().toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
    return res.status(400).json({
      error: "Pseudo invalide (3-20 caractères, lettres/chiffres/_ uniquement).",
    });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Mot de passe trop court (4 caractères min)." });
  }

  const exists = await redis.hget("users", uname);
  if (exists) {
    return res.status(409).json({ error: "Ce pseudo est déjà pris." });
  }

  const hash = await bcrypt.hash(password, 10);
  await redis.hset("users", { [uname]: hash });

  setSessionCookie(res, uname);
  res.status(200).json({ username: uname });
}

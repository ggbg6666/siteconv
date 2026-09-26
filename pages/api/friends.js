import { redis } from "../../lib/redis";
import { getSessionFromReq } from "../../lib/session";

export default async function handler(req, res) {
  const me = getSessionFromReq(req);
  if (!me) return res.status(401).json({ error: "Non connecté." });

  if (req.method === "GET") {
    const friends = await redis.smembers(`friends:${me}`);
    return res.status(200).json({ friends: friends.sort() });
  }

  if (req.method === "POST") {
    let { username } = req.body || {};
    if (!username) return res.status(400).json({ error: "Pseudo manquant." });
    username = username.trim().toLowerCase().replace(/^@/, "");

    if (username === me) {
      return res.status(400).json({ error: "Tu ne peux pas t'ajouter toi-même." });
    }

    const exists = await redis.hget("users", username);
    if (!exists) {
      return res.status(404).json({ error: `Aucun utilisateur @${username}.` });
    }

    await redis.sadd(`friends:${me}`, username);
    await redis.sadd(`friends:${username}`, me);

    return res.status(200).json({ ok: true, username });
  }

  res.status(405).end();
}

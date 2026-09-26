import { redis, dmKey, channelKey } from "../../lib/redis";
import { getSessionFromReq } from "../../lib/session";

const ONE_HOUR = 3600; // secondes
const ONE_HOUR_MS = ONE_HOUR * 1000;
const MAX_HISTORY = 200; // messages conservés max par conversation

function resolveKey(me, query) {
  if (query.channel) return channelKey(query.channel);
  if (query.with) return dmKey(me, query.with.toLowerCase());
  return null;
}

export default async function handler(req, res) {
  const me = getSessionFromReq(req);
  if (!me) return res.status(401).json({ error: "Non connecté." });

  if (req.method === "GET") {
    const key = resolveKey(me, req.query);
    if (!key) return res.status(400).json({ error: "channel ou with requis." });

    const raw = await redis.lrange(key, 0, -1);
    const now = Date.now();
    const messages = raw
      .map((m) => (typeof m === "string" ? JSON.parse(m) : m))
      .filter((m) => now - m.ts < ONE_HOUR_MS);

    return res.status(200).json({ messages });
  }

  if (req.method === "POST") {
    const { channel, with: withUser, text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "Message vide." });

    const key = channel ? channelKey(channel) : dmKey(me, (withUser || "").toLowerCase());

    const message = { from: me, text: text.trim().slice(0, 2000), ts: Date.now() };
    await redis.rpush(key, JSON.stringify(message));
    await redis.ltrim(key, -MAX_HISTORY, -1);
    // La conversation entière expire 1h après le dernier message envoyé
    await redis.expire(key, ONE_HOUR);

    return res.status(200).json({ ok: true, message });
  }

  res.status(405).end();
}

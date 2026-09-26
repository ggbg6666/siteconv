import { getSessionFromReq } from "../../lib/session";

export default async function handler(req, res) {
  const username = getSessionFromReq(req);
  if (!username) return res.status(401).json({ error: "Non connecté." });
  res.status(200).json({ username });
}

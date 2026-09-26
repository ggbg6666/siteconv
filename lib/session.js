import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "dev_secret_change_me";

export function signSession(username) {
  const sig = crypto.createHmac("sha256", SECRET).update(username).digest("hex");
  return Buffer.from(`${username}.${sig}`).toString("base64");
}

export function verifySession(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [username, sig] = decoded.split(".");
    if (!username || !sig) return null;
    const expected = crypto.createHmac("sha256", SECRET).update(username).digest("hex");
    return sig === expected ? username : null;
  } catch {
    return null;
  }
}

export function getSessionFromReq(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return verifySession(decodeURIComponent(match[1]));
}

export function setSessionCookie(res, username) {
  const token = signSession(username);
  res.setHeader(
    "Set-Cookie",
    `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Nom de clé pour une conversation privée entre 2 users (toujours dans le
// même ordre pour que A->B et B->A pointent vers la même clé)
export function dmKey(userA, userB) {
  return `dm:${[userA, userB].sort().join(":")}`;
}

export function channelKey(channel) {
  return `channel:${channel}`;
}

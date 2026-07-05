import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex') };
}

export function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');


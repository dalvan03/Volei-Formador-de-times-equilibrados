import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
const scrypt = promisify(scryptCallback);
export const SESSION_DAYS = 90;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const phoneNumber = (value: unknown) => typeof value === 'string' ? value.replace(/\D/g, '') : '';
export const validPin = (value: unknown): value is string => typeof value === 'string' && /^\d{4}$/.test(value);
export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(pin, salt, 64) as Buffer).toString('hex')}`;
}
export async function verifyPin(pin: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  const actual = await scrypt(pin, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function sessionToken(req: Request) {
  return req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('volei_session='))?.slice(14) || '';
}
export async function actorFor(sql: any, req: Request) {
  const [actor] = await sql`SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id
    WHERE s.token_hash = ${hashToken(sessionToken(req))} AND s.expires_at > clock_timestamp()`;
  return actor;
}
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' });
export async function issueSession(sql: any, res: Response, playerId: string, now: number) {
  const token = randomBytes(32).toString('hex');
  await sql`INSERT INTO sessions(token_hash, player_id, expires_at) VALUES (${hashToken(token)}, ${playerId}, ${new Date(now + SESSION_DAYS * 86400000).toISOString()})`;
  res.cookie('volei_session', token, { ...cookieOptions(), maxAge: SESSION_DAYS * 86400000 });
}
export function clearCookie(res: Response) { res.clearCookie('volei_session', cookieOptions()); }
export async function consumeAttempt(sql: any, key: string, limit: number, now: number) {
  const [row] = await sql`SELECT * FROM auth_attempts WHERE key = ${key}`;
  if (row?.blocked_until && new Date(row.blocked_until).getTime() > now) return false;
  const count = row && now - new Date(row.window_start).getTime() < 900000 ? row.attempts + 1 : 1;
  const start = (count === 1 ? new Date(now) : new Date(row.window_start)).toISOString();
  await sql`INSERT INTO auth_attempts(key, attempts, window_start, blocked_until)
    VALUES (${key}, ${count}, ${start}, ${count >= limit ? new Date(now + 900000).toISOString() : null})
    ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, window_start = excluded.window_start, blocked_until = excluded.blocked_until`;
  return count <= limit;
}
export async function accountBlocked(sql: any, phone: string, now: number) {
  const [row] = await sql`SELECT blocked_until FROM auth_attempts WHERE key = ${'phone:' + phone}`;
  return row?.blocked_until && new Date(row.blocked_until).getTime() > now;
}

/**
 * POST /api/auth/logout
 * Clears session cookie.
 */
import { buildClearSessionCookie } from '../_lib/session.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', buildClearSessionCookie());
  return res.status(200).json({ ok: true });
}

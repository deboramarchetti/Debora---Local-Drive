/**
 * GET /api/auth/me
 * Returns current user session from cookie.
 */
import { getSessionFromRequest } from '../_lib/session.js';

export default function handler(req, res) {
  const user = getSessionFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Nao autenticado' });
  }
  return res.status(200).json({ user });
}

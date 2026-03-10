/**
 * POST /api/auth/verify
 * Receives Google ID token, verifies it, checks domain, creates session cookie.
 */
import { verifyGoogleToken, createSessionToken, buildSessionCookie } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken obrigatorio' });
    }

    const user = await verifyGoogleToken(idToken);
    const token = createSessionToken(user);

    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return res.status(200).json({ ok: true, user });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}

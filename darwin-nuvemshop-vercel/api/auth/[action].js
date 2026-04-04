/**
 * Dynamic auth route: handles /api/auth/verify, /api/auth/me, /api/auth/logout, /api/auth/config
 * Single serverless function to stay within Vercel Hobby plan limits.
 */
import { verifyGoogleToken, createSessionToken, buildSessionCookie, getSessionFromRequest, buildClearSessionCookie } from '../_lib/session.js';

export default async function handler(req, res) {
  const { action } = req.query;

  switch (action) {
    case 'config':
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });

    case 'me': {
      const user = getSessionFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Nao autenticado' });
      return res.status(200).json({ user });
    }

    case 'logout':
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      return res.status(200).json({ ok: true });

    case 'verify': {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const { idToken } = req.body || {};
        if (!idToken) return res.status(400).json({ error: 'idToken obrigatorio' });
        const user = await verifyGoogleToken(idToken);
        const token = createSessionToken(user);
        res.setHeader('Set-Cookie', buildSessionCookie(token));
        return res.status(200).json({ ok: true, user });
      } catch (err) {
        return res.status(401).json({ error: err.message });
      }
    }

    default:
      return res.status(404).json({ error: 'Auth action not found' });
  }
}

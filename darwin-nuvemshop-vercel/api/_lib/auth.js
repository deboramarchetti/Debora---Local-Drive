/**
 * Authentication middleware.
 * Supports Google SSO (cookie session) and legacy password (header).
 * Webhook endpoints skip auth entirely.
 */
import { getSessionFromRequest } from './session.js';

export function checkAuth(req) {
  // 1. Try cookie-based session (Google SSO)
  const session = getSessionFromRequest(req);
  if (session) return true;

  // 2. Fallback: legacy password header (for backward compat / API access)
  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    const provided = req.headers['x-dashboard-password'] || '';
    if (provided === password) return true;
  }

  // 3. If no auth methods are configured, allow access
  if (!process.env.GOOGLE_CLIENT_ID && !process.env.DASHBOARD_PASSWORD) return true;

  return false;
}

/**
 * Get authenticated user info from request.
 * Returns { email, name, picture } or null.
 */
export function getUser(req) {
  return getSessionFromRequest(req);
}

export function unauthorized(res) {
  return res.status(401).json({ error: 'Nao autorizado' });
}

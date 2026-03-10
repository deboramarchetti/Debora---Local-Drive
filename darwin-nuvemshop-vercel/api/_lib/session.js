/**
 * Session management using HMAC-signed cookies.
 * No external dependencies - uses Node.js crypto.
 */
import { createHmac } from 'crypto';

const ALLOWED_DOMAINS = ['nuvemshop.com.br', 'tiendanube.com'];
const COOKIE_NAME = 'dash_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

/**
 * Create a signed session token from user data.
 */
export function createSessionToken(user) {
  const payload = JSON.stringify({
    email: user.email,
    name: user.name,
    picture: user.picture,
    exp: Date.now() + SESSION_DURATION_MS,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a session token.
 * Returns user data or null if invalid/expired.
 */
export function verifySessionToken(token) {
  if (!token) return null;
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify a Google ID token by calling Google's tokeninfo endpoint.
 * Returns user info or throws on failure.
 */
export async function verifyGoogleToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('Token invalido');

  const data = await res.json();

  // Verify audience matches our client ID
  if (data.aud !== clientId) throw new Error('Token nao pertence a esta aplicacao');

  // Verify email is verified
  if (data.email_verified !== 'true') throw new Error('Email nao verificado');

  // Check domain
  const domain = data.email.split('@')[1];
  if (!ALLOWED_DOMAINS.includes(domain)) {
    throw new Error(`Dominio @${domain} nao autorizado. Use @nuvemshop.com.br ou @tiendanube.com`);
  }

  return {
    email: data.email,
    name: data.name || data.email.split('@')[0],
    picture: data.picture || '',
  };
}

/**
 * Parse session from request cookies.
 */
export function getSessionFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]));
}

/**
 * Build Set-Cookie header for session.
 */
export function buildSessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${7 * 24 * 60 * 60}`;
}

/**
 * Build Set-Cookie header to clear session.
 */
export function buildClearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

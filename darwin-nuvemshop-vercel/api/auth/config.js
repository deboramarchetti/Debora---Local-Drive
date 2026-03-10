/**
 * GET /api/auth/config
 * Returns public auth configuration (Google Client ID).
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
}

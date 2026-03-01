/**
 * Verifica se a senha do dashboard está correta.
 * A senha é definida na variável de ambiente DASHBOARD_PASSWORD no Vercel.
 * Se a variável não existir, o acesso é livre (sem proteção).
 */
export function checkAuth(req) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return true; // sem senha configurada = acesso livre

  const provided = req.headers['x-dashboard-password'] || '';
  return provided === password;
}

export function unauthorized(res) {
  return res.status(401).json({ error: 'Senha incorreta' });
}

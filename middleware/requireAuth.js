const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'pizzaria-secret-key';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = requireAuth;
